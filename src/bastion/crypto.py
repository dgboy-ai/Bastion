"""Centralized cryptographic hash functions for Bastion.

Uses HMAC-SHA256 with a server secret key to prevent hash chain forgery.
An attacker with DB write access cannot forge the chain without the secret.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Server secret for HMAC — auto-generated if not set
_hmac_secret: bytes | None = None
_hmac_lock = threading.Lock()


def _get_hmac_secret() -> bytes:
    """Get or generate the HMAC secret key."""
    global _hmac_secret
    if _hmac_secret is not None:
        return _hmac_secret
    with _hmac_lock:
        if _hmac_secret is not None:
            return _hmac_secret
        env_secret = os.environ.get("BASTION_HMAC_SECRET", "")
        if env_secret:
            _hmac_secret = env_secret.encode()
        else:
            # Auto-generate a random secret (32 bytes = 256 bits)
            _hmac_secret = secrets.token_bytes(32)
            logger.warning(
                "Auto-generated HMAC secret. Set BASTION_HMAC_SECRET for persistent hash chains."
            )
        return _hmac_secret


def compute_hash(content: str, metadata: dict | None = None, previous_hash: str | None = None) -> str:
    """Compute HMAC-SHA256 hash of content + metadata + previous_hash.
    
    Uses server secret key to prevent forgery by attackers with DB write access.
    """
    meta_str = "" if metadata is None else (
        metadata if isinstance(metadata, str) else
        __import__("json").dumps(metadata, sort_keys=True)
    )
    payload = content + meta_str + (previous_hash or "")
    secret = _get_hmac_secret()
    return hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()


def verify_hash(content: str, metadata: dict | None, previous_hash: str | None, expected_hash: str) -> bool:
    """Verify that content + metadata + previous_hash produces the expected hash."""
    actual = compute_hash(content, metadata, previous_hash)
    return hmac.compare_digest(actual, expected_hash)
