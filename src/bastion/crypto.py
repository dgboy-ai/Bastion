"""Centralized cryptographic hash functions for Bastion.

Uses HMAC-SHA256 with a server secret key to prevent hash chain forgery.
An attacker with DB write access cannot forge the chain without the secret.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sys
import threading

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Server secret for HMAC — auto-generated if not set
_hmac_secret: bytes | None = None
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
    """
    global _hmac_secret
    if _hmac_secret is not None:
        return _hmac_secret
    with _hmac_lock:
        if _hmac_secret is not None:
            return _hmac_secret
        env_secret = os.environ.get("BASTION_HMAC_SECRET", "")
        if env_secret:
            decoded = env_secret.encode("utf-8")
            if len(decoded) < 16:
                raise ValueError(f"BASTION_HMAC_SECRET too short ({len(decoded)} bytes), minimum 16")
            _hmac_secret = decoded
        else:
            # Try to load from disk first
            try:
                if os.path.exists(_SECRET_FILE):
                    with open(_SECRET_FILE, "rb") as f:
                        raw = f.read()
                    _hmac_secret = _unprotect_secret(raw)
                    if len(_hmac_secret) == 32:
                        logger.info("Loaded persisted HMAC secret from %s", _SECRET_FILE)
                        if _WINDOWS and _HAS_DPAPI:
                            logger.debug("Windows HMAC secret decrypted via DPAPI")
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
            try:
                os.makedirs(_SECRET_DIR, exist_ok=True, mode=0o700)
                protected = _protect_secret(_hmac_secret)
                tmp = _SECRET_FILE + ".tmp"
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0), 0o600)
                try:
                    os.write(fd, protected)
                    os.fsync(fd)  # Ensure data is written to disk
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
    """Compute HMAC-SHA256 hash of content + metadata + previous_hash.

    Uses server secret key to prevent forgery by attackers with DB write access.
    Fields are length-prefixed to prevent boundary ambiguity attacks.
    """
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
    """Verify that content + metadata + previous_hash produces the expected hash."""
    actual = compute_hash(content, metadata, previous_hash)
    return hmac.compare_digest(actual, expected_hash)


def rotate_hmac_secret() -> bytes:
    """Generate a new HMAC secret and persist it.

    Returns the new secret. Existing hashes remain valid (they were computed
    with the old secret), but new hashes will use the new secret.
    Callers should re-hash critical data after rotation.
    """
    global _hmac_secret
    new_secret = secrets.token_bytes(32)
    with _hmac_lock:
        _hmac_secret = new_secret
        try:
            os.makedirs(_SECRET_DIR, exist_ok=True, mode=0o700)
            protected = _protect_secret(new_secret)
            tmp = _SECRET_FILE + ".tmp"
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | getattr(os, "O_BINARY", 0), 0o600)
            try:
                os.write(fd, protected)
                os.fsync(fd)
            finally:
                os.close(fd)
            os.replace(tmp, _SECRET_FILE)
            logger.info("HMAC secret rotated and persisted to %s", _SECRET_FILE)
        except Exception as exc:
            logger.error("Failed to persist rotated HMAC secret: %s", exc)
    return new_secret
