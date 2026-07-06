"""
KMSEncryptionLayer — Pluggable encryption for Bastion memory content.

Provides:
- ``LocalKMS`` — AES-256-GCM with local key management (key file or env var).
- ``AwsKMS`` — AWS KMS integration via ``boto3``.
- ``GcpKMS`` — GCP Cloud KMS integration via ``google-cloud-kms``.

Usage::

    from bastion.kms import LocalKMS, EncryptedMemoryWrapper

    kms = LocalKMS()
    wrapper = EncryptedMemoryWrapper(kms)

    # Store encrypted
    record = wrapper.store("fact", "my secret content")

    # Search decrypts on retrieval
    results = wrapper.search("secret")
"""

from __future__ import annotations

import base64
import json
import logging
import os
from abc import ABC, abstractmethod
from typing import Any

logger = logging.getLogger(__name__)

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:
    AESGCM = None  # type: ignore


# ---------------------------------------------------------------------------
# Abstract KMS interface
# ---------------------------------------------------------------------------

class KMSInterface(ABC):
    """Pluggable key-management / encryption interface."""

    @abstractmethod
    def encrypt(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        """Encrypt *plaintext* and return a portable base64-encoded ciphertext.

        *context* is AAD (additional authenticated data) bound to the ciphertext
        so that decryption fails if the wrong context is provided.
        """

    @abstractmethod
    def decrypt(self, ciphertext_b64: str, context: dict[str, str] | None = None) -> str:
        """Decrypt *ciphertext_b64* (base64) back to plaintext."""

    @abstractmethod
    def key_id(self) -> str:
        """Return a human-readable identifier for the active key (for audit)."""


# ---------------------------------------------------------------------------
# Local AES-256-GCM implementation
# ---------------------------------------------------------------------------

class LocalKMS(KMSInterface):
    """AES-256-GCM encryption with a locally managed 256-bit key.

    The key is loaded from (first match wins):
      1. ``BASTION_KMS_KEY`` env var (hex-encoded, 64 hex chars)
      2. ``BASTION_KMS_KEY_FILE`` env var (file path, hex-encoded)
      3. Auto-generated at ``~/.bastion/kms.key`` (created on first use)

    .. caution::
       This is **not** suitable for production at scale — the key lives on
       the local filesystem.  Use ``AwsKMS`` or ``GcpKMS`` for production.
    """

    def __init__(self, key: bytes | None = None, generate: bool = False):
        if AESGCM is None:
            raise ImportError("cryptography is required; pip install bastion[kms]")

        if key is not None:
            self._key = self._validate_key(key)
        elif generate or os.environ.get("BASTION_KMS_GENERATE", "").lower() in ("1", "true", "yes"):
            self._key = self._load_or_generate_key()
        else:
            self._key = self._load_key_only()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def encrypt(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        aesgcm = AESGCM(self._key)
        nonce = os.urandom(12)
        aad = self._encode_aad(context)
        ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
        # Encode as base64: version(1) + nonce(12) + ciphertext+tag
        payload = b"\x01" + nonce + ct
        return base64.b64encode(payload).decode("ascii")

    def decrypt(self, ciphertext_b64: str, context: dict[str, str] | None = None) -> str:
        aesgcm = AESGCM(self._key)
        payload = base64.b64decode(ciphertext_b64)

        version = payload[0]
        if version != 1:
            raise ValueError(f"Unsupported ciphertext version: {version}")

        nonce = payload[1:13]
        ct = payload[13:]
        aad = self._encode_aad(context)

        plaintext = aesgcm.decrypt(nonce, ct, aad)
        return plaintext.decode("utf-8")

    def key_id(self) -> str:
        return f"local:aes256gcm:{self._key[:4].hex()}..."

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_key(key: bytes) -> bytes:
        if len(key) != 32:
            raise ValueError(f"AES-256 requires a 32-byte key, got {len(key)}")
        return key

    @staticmethod
    def _encode_aad(context: dict[str, str] | None) -> bytes:
        if not context:
            return b""
        return json.dumps(context, sort_keys=True, separators=(",", ":")).encode("utf-8")

    @classmethod
    def generate_key(cls) -> bytes:
        return AESGCM.generate_key(bit_length=256)

    def _load_key_only(self) -> bytes:
        env_key = os.environ.get("BASTION_KMS_KEY")
        if env_key:
            try:
                return bytes.fromhex(env_key)
            except ValueError as exc:
                raise ValueError("BASTION_KMS_KEY must be a 64-char hex string") from exc
        key_file = os.environ.get("BASTION_KMS_KEY_FILE")
        if key_file:
            try:
                with open(key_file) as f:
                    return bytes.fromhex(f.read().strip())
            except FileNotFoundError:
                logger.warning("BASTION_KMS_KEY_FILE not found", extra={"path": key_file})
            except ValueError as exc:
                raise ValueError(f"Key file {key_file} does not contain valid hex") from exc
        key_dir = os.path.expanduser("~/.bastion")
        key_path = os.path.join(key_dir, "kms.key")
        try:
            with open(key_path) as f:
                return bytes.fromhex(f.read().strip())
        except FileNotFoundError:
            pass
        except ValueError as exc:
            raise ValueError(f"Key file {key_path} is corrupt (not valid hex)") from exc
        raise ValueError(
            "No KMS key found. Set BASTION_KMS_KEY, BASTION_KMS_KEY_FILE, "
            "or pass generate=True to auto-generate a key."
        )

    def _load_or_generate_key(self) -> bytes:
        env_key = os.environ.get("BASTION_KMS_KEY")
        if env_key:
            try:
                return bytes.fromhex(env_key)
            except ValueError as exc:
                raise ValueError("BASTION_KMS_KEY must be a 64-char hex string") from exc

        key_file = os.environ.get("BASTION_KMS_KEY_FILE")
        if key_file:
            try:
                with open(key_file) as f:
                    return bytes.fromhex(f.read().strip())
            except FileNotFoundError:
                logger.warning("BASTION_KMS_KEY_FILE not found, will generate new key",
                               extra={"path": key_file})

        key_dir = os.path.expanduser("~/.bastion")
        os.makedirs(key_dir, exist_ok=True)
        key_path = os.path.join(key_dir, "kms.key")
        try:
            with open(key_path) as f:
                return bytes.fromhex(f.read().strip())
        except FileNotFoundError:
            pass
        except ValueError:
            logger.warning("Corrupt KMS key file, generating new key", extra={"path": key_path})
            os.remove(key_path)

        key = self.generate_key()
        tmp = key_path + ".tmp"
        try:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(key.hex())
            os.replace(tmp, key_path)
        except OSError as exc:
            logger.error("Failed to persist KMS key", extra={"path": key_path, "error": str(exc)})
        logger.info("Generated new KMS key at %s", key_path)
        return key


# ---------------------------------------------------------------------------
# AWS KMS wrapper
# ---------------------------------------------------------------------------

class AwsKMS(KMSInterface):
    """AWS KMS-backed encryption.

    Requires ``boto3`` and the ``BASTION_AWS_KMS_KEY_ARN`` env var (or
    *key_arn* constructor argument).
    """

    def __init__(self, key_arn: str | None = None, region: str | None = None):
        try:
            import boto3
            from botocore.config import Config
        except ImportError:
            raise ImportError("boto3 is required; pip install boto3")

        self._key_arn = key_arn or os.environ.get("BASTION_AWS_KMS_KEY_ARN", "")
        if not self._key_arn:
            raise ValueError("AWS KMS key ARN is required (BASTION_AWS_KMS_KEY_ARN)")

        kwargs = {}
        if region:
            kwargs["region_name"] = region
        kwargs["config"] = Config(
            retries={"max_attempts": 3, "mode": "standard"},
            connect_timeout=5,
            read_timeout=10,
        )
        self._client = boto3.client("kms", **kwargs)

    def encrypt(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        resp = self._client.encrypt(
            KeyId=self._key_arn,
            Plaintext=plaintext.encode("utf-8"),
            EncryptionContext=context or {},
        )
        return base64.b64encode(resp["CiphertextBlob"]).decode("ascii")

    def decrypt(self, ciphertext_b64: str, context: dict[str, str] | None = None) -> str:
        resp = self._client.decrypt(
            CiphertextBlob=base64.b64decode(ciphertext_b64),
            EncryptionContext=context or {},
        )
        plaintext_bytes: bytes = resp["Plaintext"]
        return plaintext_bytes.decode("utf-8")

    def key_id(self) -> str:
        return self._key_arn


# ---------------------------------------------------------------------------
# GCP Cloud KMS wrapper
# ---------------------------------------------------------------------------

class GcpKMS(KMSInterface):
    """GCP Cloud KMS-backed encryption.

    Requires ``google-cloud-kms``, a credentials file / ADC, and the env var
    ``BASTION_GCP_KMS_RESOURCE`` (or *resource_name* param), e.g.::

        projects/my-proj/locations/global/keyRings/my-ring/cryptoKeys/my-key
    """

    def __init__(self, resource_name: str | None = None):
        try:
            from google.cloud import kms as gcp_kms
        except ImportError:
            raise ImportError("google-cloud-kms is required; pip install google-cloud-kms")

        self._resource = resource_name or os.environ.get("BASTION_GCP_KMS_RESOURCE", "")
        if not self._resource:
            raise ValueError("GCP KMS resource name is required (BASTION_GCP_KMS_RESOURCE)")

        self._client = gcp_kms.KeyManagementServiceClient()

    def encrypt(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        resp = self._client.encrypt(
            request={
                "name": self._resource,
                "plaintext": plaintext.encode("utf-8"),
                "additional_authenticated_data": json.dumps(context or {}).encode("utf-8"),
            },
            timeout=30.0,
        )
        return base64.b64encode(resp.ciphertext).decode("ascii")

    def decrypt(self, ciphertext_b64: str, context: dict[str, str] | None = None) -> str:
        resp = self._client.decrypt(
            request={
                "name": self._resource,
                "ciphertext": base64.b64decode(ciphertext_b64),
                "additional_authenticated_data": json.dumps(context or {}).encode("utf-8"),
            },
            timeout=30.0,
        )
        plaintext_bytes: bytes = resp.plaintext
        return plaintext_bytes.decode("utf-8")

    def key_id(self) -> str:
        return self._resource


# ---------------------------------------------------------------------------
# EncryptedMemoryWrapper — wraps BastionMemory with transparent encryption
# ---------------------------------------------------------------------------

class EncryptedMemoryWrapper:
    """Transparently encrypts/decrypts memory content via a ``KMSInterface``.

    All content stored through this wrapper is encrypted at rest.
    The embedding (used for search) is computed *after* encryption
    so the ciphertext is indexed — semantic similarity search over
    encrypted content will **not** work meaningfully.  Search results
    will be ranked by ciphertext similarity, which is unrelated to
    plaintext semantics. Use keyword / metadata fallback filters for
    retrieval of encrypted content.

    For searchable encryption, consider using deterministic tags in
    metadata rather than relying on vector similarity over ciphertext.
    """

    def __init__(self, memory: Any, kms: KMSInterface):
        self._memory = memory
        self._kms = kms

    def store(self, memory_type: str, content: str, metadata: dict | None = None) -> Any:
        ctx = {"agent_id": self._memory.agent_id}
        encrypted = self._kms.encrypt(content, ctx)
        meta = {**(metadata or {}), "_encrypted": True, "_key_id": self._kms.key_id()}
        return self._memory.store(memory_type, encrypted, meta)

    def search(self, query: str, **kwargs: Any) -> list:
        ctx = {"agent_id": self._memory.agent_id}
        results: list = self._memory.search(query, **kwargs)
        for r in results:
            if getattr(r, "metadata", {}).get("_encrypted"):
                try:
                    r.content = self._kms.decrypt(r.content, ctx)
                except Exception:
                    logger.exception("KMS decrypt failed on search result",
                                     extra={"memory_id": getattr(r, "memory_id", "")})
                    r.content = "<encrypted:decryption_failed>"
        return results

    def get_at_time(self, timestamp: str, agent_id: str | None = None) -> list:
        ctx = {"agent_id": agent_id or self._memory.agent_id}
        results: list = self._memory.get_at_time(timestamp, agent_id)
        for r in results:
            if getattr(r, "metadata", {}).get("_encrypted"):
                try:
                    r.content = self._kms.decrypt(r.content, ctx)
                except Exception:
                    logger.exception("KMS decrypt failed on time-travel result",
                                     extra={"memory_id": getattr(r, "memory_id", "")})
                    r.content = "<encrypted:decryption_failed>"
        return results

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(f"'{type(self).__name__}' has no attribute '{name}'")
        try:
            return getattr(self._memory, name)
        except AttributeError:
            raise AttributeError(
                f"'{type(self).__name__}' object has no attribute '{name}'"
            )
