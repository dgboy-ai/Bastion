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
import os
from abc import ABC, abstractmethod
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

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
            "No KMS key found. Set BASTION_KMS_KEY, BASTION_KMS_KEY_FILE, or pass generate=True to auto-generate a key."
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
                logger.warning("BASTION_KMS_KEY_FILE not found, will generate new key", extra={"path": key_file})

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
    """AWS KMS envelope encryption with a per-process Data Encryption Key.

    On construction, calls ``kms_client.generate_data_key()`` once to obtain a
    wrapped DEK (Data Encryption Key).  All encrypt/decrypt operations use the
    cached plaintext DEK locally (AES-256-GCM), so only **one** KMS API call is
    made per process lifetime.

    The encrypted DEK is stored alongside each ciphertext so that other processes
    (e.g. new Vercel instances) can unwrap it on first decrypt via
    ``kms_client.decrypt()`` and cache it.

    Requires ``boto3`` and the ``BASTION_AWS_KMS_KEY_ARN`` env var (or
    *key_arn* constructor argument).
    """

    def __init__(self, key_arn: str | None = None, region: str | None = None):
        if AESGCM is None:
            raise ImportError("cryptography is required; pip install bastion[kms]")

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

        # Envelope encryption: generate a single DEK at process startup
        try:
            resp = self._client.generate_data_key(
                KeyId=self._key_arn,
                KeySpec="AES_256",
            )
        except Exception as exc:
            logger.error("Failed to generate KMS data key", extra={"key_arn": self._key_arn, "error": str(exc)})
            raise RuntimeError(f"AWS KMS generate_data_key failed: {exc}") from exc

        self._dek_plaintext: bytes = resp["Plaintext"]
        self._dek_ciphertext: bytes = resp["CiphertextBlob"]
        # Cache for DEKs unwrapped by other processes: encrypted_dek -> plaintext_dek
        self._dek_cache: dict[str, bytes] = {}
        self._dek_cache[self._dek_ciphertext.hex()] = self._dek_plaintext

    def encrypt(self, plaintext: str, context: dict[str, str] | None = None) -> str:
        aesgcm = AESGCM(self._dek_plaintext)
        nonce = os.urandom(12)
        aad = self._encode_aad(context)
        ct = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), aad)
        # Format: iv(12) + len(DEK_CT)(4) + DEK_CT(var) + ciphertext+tag(var)
        payload = (
            nonce
            + len(self._dek_ciphertext).to_bytes(4, "big")
            + self._dek_ciphertext
            + ct
        )
        return base64.b64encode(payload).decode("ascii")

    def decrypt(self, ciphertext_b64: str, context: dict[str, str] | None = None) -> str:
        payload = base64.b64decode(ciphertext_b64)
        if len(payload) < 16:
            raise ValueError(
                f"ciphertext too short ({len(payload)} bytes); expected at least 16 bytes "
                "(12-byte IV + 4-byte DEK_CT length field)"
            )
        nonce = payload[:12]
        dek_ct_len = int.from_bytes(payload[12:16], "big")
        if dek_ct_len < 1 or 16 + dek_ct_len > len(payload):
            raise ValueError(
                f"Invalid DEK ciphertext length ({dek_ct_len}) for payload of {len(payload)} bytes"
            )
        dek_ct = payload[16:16 + dek_ct_len]
        ct = payload[16 + dek_ct_len:]

        dek = self._dek_cache.get(dek_ct.hex())
        if dek is None:
            try:
                resp = self._client.decrypt(CiphertextBlob=dek_ct)
            except Exception as exc:
                logger.error("KMS decrypt of DEK failed", extra={"error": str(exc)})
                raise RuntimeError(f"AWS KMS decrypt failed: {exc}") from exc
            dek = resp["Plaintext"]
            self._dek_cache[dek_ct.hex()] = dek

        aesgcm = AESGCM(dek)
        aad = self._encode_aad(context)
        try:
            plaintext = aesgcm.decrypt(nonce, ct, aad)
        except Exception as exc:
            logger.error("AES-GCM decrypt failed", extra={"error": str(exc)})
            raise
        return plaintext.decode("utf-8")

    def key_id(self) -> str:
        return self._key_arn

    @staticmethod
    def _encode_aad(context: dict[str, str] | None) -> bytes:
        if not context:
            return b""
        return json.dumps(context, sort_keys=True, separators=(",", ":")).encode("utf-8")


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


def create_kms(key_arn: str | None = None, region: str | None = None) -> KMSInterface:
    """Factory: returns an ``AwsKMS`` if ``BASTION_AWS_KMS_KEY_ARN`` is
    configured, otherwise falls back to a local AES-256-GCM key.

    Catches boto3 operational exceptions (network, credentials, disabled
    key) and falls back to ``LocalKMS`` with a warning.  Lets ``ImportError``
    and ``ValueError`` propagate so missing dependencies or misconfiguration
    are surfaced immediately.
    """
    resolved = key_arn or os.environ.get("BASTION_AWS_KMS_KEY_ARN", "")
    if resolved:
        try:
            return AwsKMS(key_arn=resolved, region=region)
        except ImportError:
            raise
        except ValueError:
            raise
        except Exception as exc:
            logger.error(
                "AwsKMS key '%s' exists but initialization FAILED — falling back to LocalKMS! "
                "Production data will be encrypted with a local key, "
                "NOT the configured AWS KMS key.",
                resolved,
                extra={"error": str(exc)},
            )
    return LocalKMS(generate=True)


class EncryptedMemoryWrapper:
    """Transparently encrypts/decrypts memory content via a ``KMSInterface``.

    Uses the zero-knowledge pattern: computes the embedding on plaintext
    *before* encrypting, so semantic vector search works correctly on
    encrypted content.

    Usage::

        from bastion.kms import EncryptedMemoryWrapper

        wrapper = EncryptedMemoryWrapper(memory)  # auto-detects KMS

        record = wrapper.store("fact", "secret content")
        results = wrapper.search("secret")
    """

    def __init__(self, memory: Any, kms: KMSInterface | None = None, region: str | None = None):
        self._memory = memory
        self._kms = kms or create_kms(region=region)

    # Encryption overhead (base64 expansion ~33% + headers):
    # AwsKMS: 12(IV) + 4(DEK_CT_len) + ~1KB(DEK_CT) + 16(tag) -> raw ~= content*1.0 + 1048
    # LocalKMS: 1(version) + 12(IV) + 16(tag) -> raw ~= content*1.0 + 29
    # After base64: raw * 4/3
    # Worst case margin: plaintext must stay under ~73KB when limit is 100KB
    _ENCRYPTION_OVERHEAD_BYTES = 2048  # safe upper bound for all KMS implementations

    def store(
        self,
        memory_type: str,
        content: str,
        metadata: dict | None = None,
        expires_in_seconds: int | None = None,
        region: str | None = None,
    ) -> Any:
        from bastion.memory import _MAX_CONTENT_LENGTH

        if not content or not isinstance(content, str):
            raise ValueError(f"content must be a non-empty string, got {type(content).__name__}")

        estimated_encoded = len(content) * 4 // 3 + self._ENCRYPTION_OVERHEAD_BYTES
        if estimated_encoded > _MAX_CONTENT_LENGTH:
            raise ValueError(
                f"content too long for encryption ({len(content)} chars -> ~{estimated_encoded} bytes "
                f"encoded, limit {_MAX_CONTENT_LENGTH})"
            )

        ctx = {"agent_id": self._memory.agent_id}
        embed_fn = getattr(self._memory, "_embed", None)
        embedding = None
        if embed_fn is not None:
            try:
                embedding = embed_fn(content)
            except Exception:
                logger.warning("Embedding computation failed, continuing without precomputed embedding")
                embedding = None
        encrypted = self._kms.encrypt(content, ctx)
        meta = {
            **(metadata or {}),
            "_encrypted": True,
            "_key_id": self._kms.key_id(),
        }
        if embedding is not None:
            meta["_precomputed_embedding"] = embedding
        return self._memory.store(memory_type, encrypted, meta, expires_in_seconds, region, _skip_guard=True)

    def search(self, query: str, **kwargs: Any) -> list:
        ctx = {"agent_id": self._memory.agent_id}
        results: list = self._memory.search(query, **kwargs)
        for r in results:
            if getattr(r, "metadata", {}).get("_encrypted"):
                try:
                    r.content = self._kms.decrypt(r.content, ctx)
                except Exception:
                    logger.exception(
                        "KMS decrypt failed on search result", extra={"memory_id": getattr(r, "memory_id", "")}
                    )
                    r.content = "<encrypted:decryption_failed>"
        return results

    def list_all(
        self,
        memory_type: str | None = None,
        namespace_scope: str = "own",
        region_filter: str | None = None,
    ) -> list:
        ctx = {"agent_id": self._memory.agent_id}
        results: list = self._memory.list_all(memory_type, namespace_scope, region_filter=region_filter)
        for r in results:
            if getattr(r, "metadata", {}).get("_encrypted"):
                try:
                    r.content = self._kms.decrypt(r.content, ctx)
                except Exception:
                    logger.exception(
                        "KMS decrypt failed on list_all result", extra={"memory_id": getattr(r, "memory_id", "")}
                    )
                    r.content = "<encrypted:decryption_failed>"
        return results

    def get_memory(self, memory_id: str) -> Any | None:
        r = self._memory.get_memory(memory_id)
        if r is not None and getattr(r, "metadata", {}).get("_encrypted"):
            ctx = {"agent_id": self._memory.agent_id}
            try:
                r.content = self._kms.decrypt(r.content, ctx)
            except Exception:
                logger.exception(
                    "KMS decrypt failed on get_memory result", extra={"memory_id": memory_id}
                )
                r.content = "<encrypted:decryption_failed>"
        return r

    def get_at_time(self, timestamp: str, agent_id: str | None = None) -> list:
        ctx = {"agent_id": agent_id or self._memory.agent_id}
        results: list = self._memory.get_at_time(timestamp, agent_id)
        for r in results:
            if getattr(r, "metadata", {}).get("_encrypted"):
                try:
                    r.content = self._kms.decrypt(r.content, ctx)
                except Exception:
                    logger.exception(
                        "KMS decrypt failed on time-travel result", extra={"memory_id": getattr(r, "memory_id", "")}
                    )
                    r.content = "<encrypted:decryption_failed>"
        return results

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(f"'{type(self).__name__}' has no attribute '{name}'")
        try:
            return getattr(self._memory, name)
        except AttributeError:
            raise AttributeError(f"'{type(self).__name__}' object has no attribute '{name}'")
