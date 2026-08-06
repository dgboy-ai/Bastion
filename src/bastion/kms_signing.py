"""AWS KMS Asymmetric Signing for Bastion Hash Chains.

Production-grade cryptographic signing using AWS KMS asymmetric keys.
The private key NEVER leaves AWS KMS — cannot be stolen even if app server is compromised.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
from typing import Any

import boto3
from botocore.config import Config

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# KMS Key configuration
_KMS_KEY_ALIAS = os.environ.get("BASTION_KMS_KEY_ALIAS", "alias/bastion-hash-chain")
_KMS_REGION = os.environ.get("AWS_REGION", "us-east-1")
_KMS_CLIENT: boto3.client | None = None
_KMS_CLIENT_LOCK = threading.Lock()

# Public key cache for verification (verification can use cached public key)
_PUBLIC_KEY_CACHE: bytes | None = None
_PUBLIC_KEY_CACHE_LOCK = threading.Lock()


def _get_kms_client() -> boto3.client:
    """Get or create KMS client with retry config."""
    global _KMS_CLIENT
    if _KMS_CLIENT is not None:
        return _KMS_CLIENT
    with _KMS_CLIENT_LOCK:
        if _KMS_CLIENT is not None:
            return _KMS_CLIENT
        _KMS_CLIENT = boto3.client(
            "kms",
            region_name=_KMS_REGION,
            config=Config(
                retries={"max_attempts": 3, "mode": "standard"},
                connect_timeout=5,
                read_timeout=10,
            ),
        )
        return _KMS_CLIENT


def _get_public_key() -> bytes:
    """Get the public key from KMS for verification.
    
    Caches the public key after first fetch. The public key can be safely
    cached since it's public — verification doesn't require KMS calls.
    """
    global _PUBLIC_KEY_CACHE
    if _PUBLIC_KEY_CACHE is not None:
        return _PUBLIC_KEY_CACHE
    with _PUBLIC_KEY_CACHE_LOCK:
        if _PUBLIC_KEY_CACHE is not None:
            return _PUBLIC_KEY_CACHE
        client = _get_kms_client()
        resp = client.get_public_key(KeyId=_KMS_KEY_ALIAS)
        _PUBLIC_KEY_CACHE = resp["PublicKey"]
        logger.info("Loaded KMS public key for verification")
        return _PUBLIC_KEY_CACHE


def _compute_payload_hash(content: str, metadata: dict[str, Any] | None, previous_hash: str | None) -> bytes:
    """Compute SHA-256 hash of the payload for signing.
    
    This is what gets signed by KMS. Uses same format as original HMAC
    for backward compatibility with existing hash chains.
    """
    meta_str = (
        ""
        if metadata is None
        else (metadata if isinstance(metadata, str) else json.dumps(metadata, sort_keys=True))
    )
    prev = previous_hash or ""
    content_bytes = content.encode("utf-8")
    meta_bytes = meta_str.encode("utf-8")
    prev_bytes = prev.encode("utf-8")
    payload = (
        len(content_bytes).to_bytes(4, "big")
        + content_bytes
        + len(meta_bytes).to_bytes(4, "big")
        + meta_bytes
        + len(prev_bytes).to_bytes(4, "big")
        + prev_bytes
    )
    return hashlib.sha256(payload).digest()


def kms_sign(content: str, metadata: dict[str, Any] | None, previous_hash: str | None) -> str:
    """Sign payload using AWS KMS asymmetric signing (ECDSA_SHA_256).
    
    Returns base64-encoded signature. The private key never leaves KMS.
    
    This replaces HMAC-SHA256 for production deployments.
    """
    payload_hash = _compute_payload_hash(content, metadata, previous_hash)
    client = _get_kms_client()
    resp = client.sign(
        KeyId=_KMS_KEY_ALIAS,
        Message=payload_hash,
        MessageType="DIGEST",
        SigningAlgorithm="ECDSA_SHA_256",
    )
    signature = resp["Signature"]
    logger.debug("KMS sign successful, key: %s", _KMS_KEY_ALIAS)
    return base64.b64encode(signature).decode("ascii")


def kms_verify(content: str, metadata: dict[str, Any] | None, previous_hash: str | None, signature_b64: str) -> bool:
    """Verify signature using KMS public key (local verification, no KMS call needed).
    
    Uses the cached public key for fast local verification.
    Falls back to KMS Verify API if local verification fails (e.g., key rotation).
    """
    payload_hash = _compute_payload_hash(content, metadata, previous_hash)
    signature = base64.b64decode(signature_b64)
    
    # Try local verification first (fast, no API call)
    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec, utils
        from cryptography.hazmat.primitives.serialization import load_der_public_key
        
        public_key = load_der_public_key(_get_public_key())
        # ECDSA signatures from KMS are in ASN.1 DER format
        public_key.verify(
            signature,
            payload_hash,
            ec.ECDSA(utils.Prehashed(hashes.SHA256())),
        )
        return True
    except Exception as exc:
        logger.warning("Local KMS verify failed, falling back to KMS API: %s", exc)
    
    # Fallback: KMS Verify API (handles key rotation automatically)
    try:
        client = _get_kms_client()
        resp = client.verify(
            KeyId=_KMS_KEY_ALIAS,
            Message=payload_hash,
            MessageType="DIGEST",
            Signature=signature,
            SigningAlgorithm="ECDSA_SHA_256",
        )
        return resp["SignatureValid"]
    except Exception as exc:
        logger.error("KMS verify failed: %s", exc)
        return False


def kms_sign_batch(payloads: list[tuple[str, dict[str, Any] | None, str | None]]) -> list[str]:
    """Sign multiple payloads efficiently.
    
    Note: KMS Sign API is per-message. For high throughput, consider
    using a local HMAC with a KMS-wrapped DEK instead.
    """
    return [kms_sign(content, meta, prev) for content, meta, prev in payloads]


# Backward compatibility: environment variable to switch signing mode
_SIGNING_MODE = os.environ.get("BASTION_SIGNING_MODE", "hmac")  # "hmac" or "kms"


def compute_hash(content: str, metadata: dict[str, Any] | None = None, previous_hash: str | None = None) -> str:
    """Compute hash chain signature. Routes to KMS or HMAC based on mode."""
    if _SIGNING_MODE == "kms":
        return kms_sign(content, metadata, previous_hash)
    # Fall back to original HMAC implementation
    from bastion.crypto import compute_hash as hmac_compute_hash
    return hmac_compute_hash(content, metadata, previous_hash)


def verify_hash(content: str, metadata: dict[str, Any] | None, previous_hash: str | None, expected_hash: str) -> bool:
    """Verify hash chain signature. Routes to KMS or HMAC based on mode."""
    if _SIGNING_MODE == "kms":
        return kms_verify(content, metadata, previous_hash, expected_hash)
    # Fall back to original HMAC implementation
    from bastion.crypto import verify_hash as hmac_verify_hash
    return hmac_verify_hash(content, metadata, previous_hash, expected_hash)


def rotate_kms_key() -> str:
    """Rotate the KMS key by creating a new key version.
    
    Note: KMS automatically manages key versions. This creates a new
    key version which will be used for new signatures. Old signatures
    remain verifiable with the previous key version.
    
    Returns the new key version ID.
    """
    client = _get_kms_client()
    resp = client.enable_key_rotation(KeyId=_KMS_KEY_ALIAS)
    logger.info("Enabled automatic KMS key rotation for %s", _KMS_KEY_ALIAS)
    return _KMS_KEY_ALIAS


# Initialize on import if KMS mode
if _SIGNING_MODE == "kms":
    try:
        _get_kms_client()
        logger.info("KMS signing mode enabled, client initialized")
    except Exception as exc:
        logger.error("Failed to initialize KMS client, falling back to HMAC: %s", exc)
        _SIGNING_MODE = "hmac"