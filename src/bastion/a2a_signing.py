"""
A2A v1.0 Signed Agent Cards — Ed25519 cryptographic identity.

Generates, loads, and verifies Ed25519 keypairs for agent card signing.
Implements the A2A v1.0 Signed Agent Card spec under the Linux Foundation's
Agentic AI Foundation.

Includes a trust anchor registry to prevent circular trust (self-signed cards).
Without a trust anchor, any agent can generate a keypair, sign a card, and pass
verification.  The ``TrustedKeyRegistry`` maintains known public key fingerprints
and supports three modes:

- **strict**: Only pre-registered keys are accepted.
- **tofu** (Trust On First Use): First-seen key is registered automatically.
- **allowlist**: Keys must be in the allowlist; unknown keys are rejected.

Usage:
    # Generate a new keypair
    signer = AgentCardSigner()
    signer.save("bastion-a2a-key")

    # Sign an agent card
    card = {"name": "Bastion Agent", ...}
    signed_card = signer.sign_card(card)

    # Verify with trust check
    registry = TrustedKeyRegistry(mode="tofu")
    assert verify_card_signed_trusted(signed_card, registry)
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
from copy import deepcopy
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class AgentCardSigner:
    """Ed25519 signer for A2A v1.0 Agent Cards."""

    def __init__(self, private_key_pem: str | None = None):
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        if private_key_pem:
            self._private_key = serialization.load_pem_private_key(
                private_key_pem.encode() if isinstance(private_key_pem, str) else private_key_pem,
                password=None,
            )
        else:
            self._private_key = Ed25519PrivateKey.generate()

        self._public_key = self._private_key.public_key()
        self._public_pem = self._public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

    @classmethod
    def from_env(cls, env_var: str = "BASTION_A2A_PRIVATE_KEY") -> AgentCardSigner:
        raw = os.environ.get(env_var)
        if not raw:
            logger.info("No %s found in env, generating ephemeral Ed25519 keypair", env_var)
            return cls()
        if "PRIVATE KEY" in raw and "\n" in raw:
            return cls(raw)
        try:
            raw_bytes = base64.b64decode(raw, validate=True)
            if len(raw_bytes) == 32:
                from cryptography.hazmat.primitives import serialization
                from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

                key = Ed25519PrivateKey.from_private_bytes(raw_bytes)
                pem = key.private_bytes(
                    encoding=serialization.Encoding.PEM,
                    format=serialization.PrivateFormat.PKCS8,
                    encryption_algorithm=serialization.NoEncryption(),
                ).decode()
                return cls(pem)
            logger.warning(
                "Base64-decoded key from %s is %d bytes (expected 32 for Ed25519)",
                env_var, len(raw_bytes),
            )
        except Exception as exc:
            logger.warning(
                "Failed to parse %s as base64 Ed25519 key: %s",
                env_var, exc,
            )
        return cls(raw)

    def sign_data(self, data: bytes) -> bytes:
        """Sign arbitrary bytes with the Ed25519 private key."""
        return self._private_key.sign(data)  # type: ignore[union-attr,call-arg]

    def sign_card(self, card: dict[str, Any]) -> dict[str, Any]:
        signed = deepcopy(card)
        card_json = json.dumps(card, sort_keys=True, separators=(",", ":")).encode()
        signature = self.sign_data(card_json)
        signed["signature"] = {
            "algorithm": "ed25519",
            "value": base64.b64encode(signature).decode(),
            "publicKeyPem": self._public_pem,
            "signedFields": sorted(card.keys()),
        }
        return signed

    def rotate_key(self) -> None:
        """Generate a new Ed25519 keypair, replacing the current one."""
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

        self._private_key = Ed25519PrivateKey.generate()
        self._public_key = self._private_key.public_key()
        self._public_pem = self._public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()
        logger.info("A2A signing key rotated")

    def get_public_key_pem(self) -> str:
        return self._public_pem

    def get_public_key_base64(self) -> str:
        from cryptography.hazmat.primitives import serialization

        raw = self._public_key.public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return base64.b64encode(raw).decode()


def verify_card_signed(card: dict[str, Any]) -> bool:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import serialization

    sig_info = card.get("signature")
    if not sig_info or not isinstance(sig_info, dict):
        logger.warning("Agent card missing signature block")
        return False

    public_pem = sig_info.get("publicKeyPem", "")
    sig_value_b64 = sig_info.get("value", "")
    algorithm = sig_info.get("algorithm", "")

    if algorithm.lower() != "ed25519":
        logger.warning("Unsupported signature algorithm: %s", algorithm)
        return False

    try:
        public_key = serialization.load_pem_public_key(public_pem.encode())
    except Exception as exc:
        logger.warning("Failed to load public key: %s", exc)
        return False

    verify_card = {k: v for k, v in card.items() if k != "signature"}
    card_json = json.dumps(verify_card, sort_keys=True, separators=(",", ":")).encode()

    try:
        sig_value = base64.b64decode(sig_value_b64)
        public_key.verify(sig_value, card_json)  # type: ignore[union-attr,call-arg]
        return True
    except InvalidSignature:
        logger.warning("Agent card signature verification FAILED")
        return False
    except Exception as exc:
        logger.warning("Signature verification error: %s", exc)
        return False


def _public_key_fingerprint(public_pem: str) -> str:
    """SHA-256 fingerprint of the raw public key bytes (DER-encoded)."""
    from cryptography.hazmat.primitives import serialization

    key = serialization.load_pem_public_key(public_pem.encode())
    raw = key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return hashlib.sha256(raw).hexdigest()


class TrustedKeyRegistry:
    """Registry of trusted Ed25519 public key fingerprints for A2A cards.

    Prevents circular trust where any agent can self-sign a card and pass
    verification.  The registry maintains a set of known-good key fingerprints
    and supports three trust modes:

    - **strict**: Only pre-registered fingerprints are accepted.  Unknown keys
      are rejected.  Best for production with a known set of agents.
    - **tofu** (Trust On First Use): The first key seen for a given agent_id
      is automatically registered.  Subsequent cards from the same agent must
      use the same key.  Unknown agents are trusted on first contact.
    - **allowlist**: Keys must be in the allowlist; unknown keys are rejected.
      Same as strict, but semantically clearer.

    Initialize from environment::

        BASTION_A2A_TRUSTED_KEYS=sha256hex1,sha256hex2,...

    Thread-safe for concurrent access.
    """

    def __init__(self, mode: str = "tofu", trusted_fingerprints: set[str] | None = None):
        if mode not in ("strict", "tofu", "allowlist"):
            raise ValueError(f"Invalid trust mode: {mode!r} (expected 'strict', 'tofu', or 'allowlist')")
        self._mode = mode
        self._fingerprints: set[str] = set(trusted_fingerprints or [])
        self._agent_keys: dict[str, str] = {}  # agent_id -> fingerprint (for TOFU)
        self._lock = threading.Lock()

        # Load from environment
        env_keys = os.environ.get("BASTION_A2A_TRUSTED_KEYS", "")
        if env_keys:
            for fp in env_keys.split(","):
                fp = fp.strip()
                if fp:
                    self._fingerprints.add(fp)
            logger.info(
                "Loaded %d trusted key fingerprints from BASTION_A2A_TRUSTED_KEYS",
                len(self._fingerprints),
            )

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def fingerprint_count(self) -> int:
        with self._lock:
            return len(self._fingerprints)

    def register(self, fingerprint: str, agent_id: str | None = None) -> None:
        """Manually register a trusted key fingerprint."""
        with self._lock:
            self._fingerprints.add(fingerprint)
            if agent_id:
                self._agent_keys[agent_id] = fingerprint

    def is_trusted(self, public_pem: str, agent_id: str | None = None) -> bool:
        """Check if a public key is trusted."""
        fingerprint = _public_key_fingerprint(public_pem)

        with self._lock:
            # Check explicit allowlist first
            if fingerprint in self._fingerprints:
                return True

            # TOFU: trust first-seen key for this agent
            if self._mode == "tofu" and agent_id:
                existing = self._agent_keys.get(agent_id)
                if existing is None:
                    # First time seeing this agent — register the key
                    self._agent_keys[agent_id] = fingerprint
                    self._fingerprints.add(fingerprint)
                    logger.info("TOFU: registered new key for agent %s", agent_id)
                    return True
                # Agent seen before — must match
                if existing == fingerprint:
                    return True
                logger.warning(
                    "TOFU: key mismatch for agent %s (expected %s, got %s)",
                    agent_id, existing[:12], fingerprint[:12],
                )
                return False

            # Strict/allowlist: unknown key rejected
            logger.warning(
                "Untrusted key fingerprint %s (mode=%s, agent=%s)",
                fingerprint[:12], self._mode, agent_id or "unknown",
            )
            return False

    def revoke(self, fingerprint: str) -> bool:
        """Remove a fingerprint from the trust registry."""
        with self._lock:
            removed = self._fingerprints.discard(fingerprint)
            # Also remove from agent_keys if present
            self._agent_keys = {k: v for k, v in self._agent_keys.items() if v != fingerprint}
            return removed is not None


def verify_card_signed_trusted(
    card: dict[str, Any],
    registry: TrustedKeyRegistry | None = None,
) -> bool:
    """Verify an agent card's signature AND check the key is trusted.

    This prevents circular trust where any agent can self-sign a card.

    Args:
        card: The signed agent card (with ``signature`` block).
        registry: Trust anchor registry.  If None, creates a TOFU registry
                  (trusts first-seen keys).

    Returns:
        True if the signature is valid AND the key is trusted.
    """
    if registry is None:
        registry = TrustedKeyRegistry(mode="tofu")

    # Step 1: Verify cryptographic signature
    if not verify_card_signed(card):
        return False

    # Step 2: Check trust anchor
    sig_info = card.get("signature", {})
    public_pem = sig_info.get("publicKeyPem", "")
    agent_id = card.get("agentId") or card.get("agent_id") or card.get("name")

    if not registry.is_trusted(public_pem, agent_id):
        logger.warning(
            "Card rejected: signature valid but key not trusted (agent=%s)",
            agent_id or "unknown",
        )
        return False

    return True
