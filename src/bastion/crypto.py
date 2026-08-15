"""Centralized cryptographic hash functions for Bastion.

Uses HMAC-SHA256 with a server secret key to prevent hash chain forgery.
An attacker with DB write access cannot forge the chain without the secret.

Production mode: AWS KMS asymmetric signing (ECDSA-P256).
Private key never leaves AWS KMS — cannot be stolen even if app server compromised.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sys
import threading

from bastion.log_setup import get_logger

# Import KMS signing for production mode
try:
    from bastion.kms_signing import compute_hash as kms_compute_hash
    from bastion.kms_signing import verify_hash as kms_verify_hash
    from bastion.kms_signing import _SIGNING_MODE
    _HAS_KMS = True
except ImportError:
    _HAS_KMS = False

logger = get_logger(__name__)

# Server secret for HMAC — auto-generated if not set
# Supports key rotation: _hmac_secrets is a dict of version -> secret
# _hmac_secret is the current active secret (latest version)
_hmac_secrets: dict[int, bytes] = {}
_hmac_secret: bytes | None = None
_hmac_current_version: int = 0
_hmac_lock = threading.Lock()

# Persistent secret file location
_SECRET_DIR = os.path.expanduser("~/.bastion")
_SECRET_FILE = os.path.join(_SECRET_DIR, "hmac.key")

# ── Platform-specific secret protection ──────────────────────────────────────
_WINDOWS = sys.platform == "win32"

if _WINDOWS:
    try:
        import win32crypt as _win32crypt

        _HAS_DPAPI = True
    except ImportError:
        _HAS_DPAPI = False
        logger.warning("win32crypt not available — HMAC secret stored in plaintext on Windows")
else:
    _HAS_DPAPI = False

_DPAPI_HEADER = b"BASTION_DPAPI_v1\x00"


def _protect_secret(data: bytes) -> bytes:
    """Encrypt data at rest using platform-appropriate mechanism.

    Windows: DPAPI (CryptProtectData) — ciphertext tied to user account.
    Linux/macOS: returns data as-is (file permissions 0o600 provide isolation).
    """
    if not _WINDOWS or not _HAS_DPAPI:
        return data
    try:
        encrypted = _win32crypt.CryptProtectData(data, "bastion-hmac", None, None, None)
        return _DPAPI_HEADER + encrypted
    except Exception as exc:
        logger.error("DPAPI protect failed, falling back to plaintext: %s", exc)
        return data


def _unprotect_secret(data: bytes) -> bytes:
    """Decrypt data that was protected by _protect_secret.

    Returns plaintext bytes. If the data was not DPAPI-encrypted (e.g. from
    a previous plaintext write), returns it as-is for backward compatibility.
    """
    if not _WINDOWS or not _HAS_DPAPI:
        return data
    if data.startswith(_DPAPI_HEADER):
        try:
            _, plaintext = _win32crypt.CryptUnprotectData(data[len(_DPAPI_HEADER) :], None, None, None)
            return plaintext
        except Exception as exc:
            logger.error("DPAPI unprotect failed, reading raw: %s", exc)
            return data
    return data


def _get_hmac_secret() -> bytes:
    """Get or generate the HMAC secret key.

    Persistence strategy:
    1. Use BASTION_HMAC_SECRET env var if set
    2. Load from ~/.bastion/hmac.key if it exists
    3. Generate new secret and persist to disk

    Supports key rotation: maintains a dict of version -> secret.
    """
    global _hmac_secret, _hmac_secrets, _hmac_current_version
    if _hmac_secret is not None:
        return _hmac_secret
    with _hmac_lock:
        if _hmac_secret is not None:
            return _hmac_secret
        env_secret = os.environ.get("BASTION_HMAC_SECRET", "")
        if env_secret:
            decoded = env_secret.encode("utf-8")
            # If the env value is a 64-char hex string, it's the hex form of a
            # 32-byte secret (same as ~/.bastion/hmac.key). Decode it so every
            # process derives the identical canonical key regardless of whether
            # the secret came from the env var or the key file.
            if len(decoded) == 64:
                try:
                    decoded = bytes.fromhex(env_secret)
                except ValueError:
                    pass
            if len(decoded) < 16:
                raise ValueError(f"BASTION_HMAC_SECRET too short ({len(decoded)} bytes), minimum 16")
            _hmac_secret = decoded
            _hmac_secrets[1] = decoded
            _hmac_current_version = 1
        else:
            # Try to load from disk first
            try:
                if os.path.exists(_SECRET_FILE):
                    with open(_SECRET_FILE, "rb") as f:
                        raw = f.read()
                    # Check if it's the new format with version prefix
                    if raw.startswith(b"BASTION_HMAC_v1\x00"):
                        import base64
                        encoded = raw[len(b"BASTION_HMAC_v1\x00"):].decode("ascii")
                        protected = base64.b64decode(encoded)
                        # Try to unprotect (DPAPI on Windows), fall back to raw if it's already plaintext JSON
                        json_data = _unprotect_secret(protected)
                        # If unprotect returned the same data (not DPAPI), try to decode as UTF-8 directly
                        if json_data == protected:
                            # Not DPAPI-protected, decode directly
                            json_data = protected
                        try:
                            data = json.loads(json_data.decode("utf-8"))
                        except UnicodeDecodeError:
                            # If still can't decode, try one more time with unprotect
                            json_data = _unprotect_secret(protected)
                            data = json.loads(json_data.decode("utf-8"))
                        _hmac_secrets = {int(k): base64.b64decode(v) for k, v in data["secrets"].items()}
                        _hmac_current_version = data["current_version"]
                        _hmac_secret = _hmac_secrets[_hmac_current_version]
                        logger.info("Loaded HMAC secret keystore from %s (version %d)", _SECRET_FILE, _hmac_current_version)
                        return _hmac_secret
                    # Old format - single secret
                    else:
                        _hmac_secret = _unprotect_secret(raw)
                        if len(_hmac_secret) == 32:
                            _hmac_secrets[1] = _hmac_secret
                            _hmac_current_version = 1
                            logger.info("Loaded persisted HMAC secret from %s (legacy format)", _SECRET_FILE)
                            return _hmac_secret
                        # Wrong length — regenerate
                        logger.warning(
                            "HMAC secret from %s has wrong length (%d bytes, expected 32). Regenerating.",
                            _SECRET_FILE,
                            len(_hmac_secret),
                        )
            except Exception as exc:
                logger.warning("Failed to load HMAC secret from disk: %s", exc)

            # Generate new secret and persist to disk
            _hmac_secret = secrets.token_bytes(32)
            _hmac_secrets[1] = _hmac_secret
            _hmac_current_version = 1
            try:
                os.makedirs(_SECRET_DIR, exist_ok=True, mode=0o700)
                # Use base64 for binary secrets in JSON
                import base64
                data = {
                    "secrets": {k: base64.b64encode(v).decode("ascii") for k, v in _hmac_secrets.items()},
                    "current_version": _hmac_current_version,
                }
                json_data = json.dumps(data).encode("utf-8")
                protected = _protect_secret(json_data)
                # Store as base64 to handle binary DPAPI output
                encoded = base64.b64encode(protected).decode("ascii")
                tmp = _SECRET_FILE + ".tmp"
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0), 0o600)
                try:
                    os.write(fd, b"BASTION_HMAC_v1\x00" + encoded.encode("ascii"))
                    os.fsync(fd)
                finally:
                    os.close(fd)
                os.replace(tmp, _SECRET_FILE)
                if _WINDOWS and _HAS_DPAPI:
                    logger.info("Generated and persisted HMAC secret to %s (DPAPI-encrypted)", _SECRET_FILE)
                else:
                    logger.warning(
                        "Generated and persisted HMAC secret to %s. Set BASTION_HMAC_SECRET env var for production.",
                        _SECRET_FILE,
                    )
            except Exception as exc:
                logger.error(
                    "Failed to persist HMAC secret to disk. Hash chains will break on restart. Error: %s",
                    exc,
                )
        return _hmac_secret


def compute_hash(content: str, metadata: dict | None = None, previous_hash: str | None = None) -> str:
    """Compute hash chain signature.
    
    Production mode (BASTION_SIGNING_MODE=kms): AWS KMS asymmetric signing (ECDSA-P256).
    Private key never leaves AWS KMS — cannot be stolen even if app server compromised.
    
    Development mode: HMAC-SHA256 with server secret key.
    """
    # Production: KMS asymmetric signing
    if _HAS_KMS and _SIGNING_MODE == "kms":
        return kms_compute_hash(content, metadata, previous_hash)
    
    # Development: HMAC-SHA256
    meta_str = (
        ""
        if metadata is None
        else (metadata if isinstance(metadata, str) else __import__("json").dumps(metadata, sort_keys=True))
    )
    prev = previous_hash or ""
    # Length-prefix each field to prevent concatenation collision
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
    secret = _get_hmac_secret()
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def verify_hash(content: str, metadata: dict | None, previous_hash: str | None, expected_hash: str) -> bool:
    """Verify that content + metadata + previous_hash produces the expected hash.
    
    Tries all historical HMAC secrets (key rotation support) for verification.
    In KMS mode, uses KMS public key or KMS Verify API.
    """
    # Production: KMS verification
    if _HAS_KMS and _SIGNING_MODE == "kms":
        return kms_verify_hash(content, metadata, previous_hash, expected_hash)
    
    # Development: HMAC with key rotation support
    global _hmac_secrets
    # Ensure secrets are loaded
    _get_hmac_secret()
    for version, secret in _hmac_secrets.items():
        meta_str = (
            ""
            if metadata is None
            else (metadata if isinstance(metadata, str) else __import__("json").dumps(metadata, sort_keys=True))
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
        actual = hmac.new(secret, payload, hashlib.sha256).hexdigest()
        if hmac.compare_digest(actual, expected_hash):
            return True
    return False


def rotate_hmac_secret() -> bytes:
    """Generate a new HMAC secret and persist it to the keystore.

    Returns the new secret. Existing hashes remain valid (they were computed
    with the old secret, which is retained in the keystore).
    New hashes will use the new secret.
    """
    global _hmac_secret, _hmac_secrets, _hmac_current_version
    new_secret = secrets.token_bytes(32)
    with _hmac_lock:
        _hmac_current_version += 1
        _hmac_secrets[_hmac_current_version] = new_secret
        _hmac_secret = new_secret
        try:
            os.makedirs(_SECRET_DIR, exist_ok=True, mode=0o700)
            # Use base64 for binary secrets in JSON
            import base64
            data = {
                "secrets": {k: base64.b64encode(v).decode("ascii") for k, v in _hmac_secrets.items()},
                "current_version": _hmac_current_version,
            }
            json_data = json.dumps(data).encode("utf-8")
            protected = _protect_secret(json_data)
            # Store as base64 to handle binary DPAPI output
            encoded = base64.b64encode(protected).decode("ascii")
            tmp = _SECRET_FILE + ".tmp"
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0), 0o600)
            try:
                os.write(fd, b"BASTION_HMAC_v1\x00" + encoded.encode("ascii"))
                os.fsync(fd)
            finally:
                os.close(fd)
            os.replace(tmp, _SECRET_FILE)
            logger.info("HMAC secret rotated to version %d and persisted to %s", _hmac_current_version, _SECRET_FILE)
        except Exception as exc:
            logger.error("Failed to persist rotated HMAC secret: %s", exc)
    return new_secret
