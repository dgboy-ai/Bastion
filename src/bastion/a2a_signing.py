"""
A2A v1.0 Signed Agent Cards — Ed25519 cryptographic identity.

Generates, loads, and verifies Ed25519 keypairs for agent card signing.
Implements the A2A v1.0 Signed Agent Card spec under the Linux Foundation's
Agentic AI Foundation.

Usage:
    # Generate a new keypair
    signer = AgentCardSigner()
    signer.save("bastion-a2a-key")

    # Sign an agent card
    card = {"name": "Bastion Agent", ...}
    signed_card = signer.sign_card(card)
"""

from __future__ import annotations

import base64
import json
import logging
import os
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
        return self._private_key.sign(data)

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
        public_key.verify(sig_value, card_json)
        return True
    except InvalidSignature:
        logger.warning("Agent card signature verification FAILED")
        return False
    except Exception as exc:
        logger.warning("Signature verification error: %s", exc)
        return False
