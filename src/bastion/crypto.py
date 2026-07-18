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

# Persistent secret file location
_SECRET_DIR = os.path.expanduser("~/.bastion")
_SECRET_FILE = os.path.join(_SECRET_DIR, "hmac.key")


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
            _hmac_secret = env_secret.encode()
        else:
            # Try to load from disk first
            try:
                if os.path.exists(_SECRET_FILE):
                    with open(_SECRET_FILE, "rb") as f:
                        _hmac_secret = f.read()
                    if len(_hmac_secret) == 32:
                        logger.info("Loaded persisted HMAC secret from %s", _SECRET_FILE)
                        return _hmac_secret
            except Exception as exc:
                logger.warning("Failed to load HMAC secret from disk: %s", exc)

            # Generate new secret and persist to disk
            _hmac_secret = secrets.token_bytes(32)
            try:
                os.makedirs(_SECRET_DIR, exist_ok=True, mode=0o700)
                tmp = _SECRET_FILE + ".tmp"
                fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                try:
                    os.write(fd, _hmac_secret)
                finally:
                    os.close(fd)
                os.replace(tmp, _SECRET_FILE)
                logger.warning(
                    "Generated and persisted HMAC secret to %s. "
                    "Set BASTION_HMAC_SECRET env var for production.",
                    _SECRET_FILE,
                )
            except Exception as exc:
                logger.error(
                    "Failed to persist HMAC secret to disk. "
                    "Hash chains will break on restart. Error: %s",
                    exc,
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
