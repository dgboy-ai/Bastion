"""Tests for A2A trust anchor registry — prevents circular trust (self-signed cards).

Covers:
- TrustedKeyRegistry: strict, tofu, allowlist modes
- verify_card_signed_trusted: combined signature + trust verification
- _public_key_fingerprint: deterministic fingerprinting
- Edge cases: key rotation, revocation, env var loading
"""

from __future__ import annotations

import os

import pytest

from bastion.a2a_signing import (
    AgentCardSigner,
    TrustedKeyRegistry,
    _public_key_fingerprint,
    verify_card_signed,
    verify_card_signed_trusted,
)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_signed_card(agent_id: str = "agent-1", name: str = "Test Agent"):
    """Create a signed agent card with a fresh keypair."""
    signer = AgentCardSigner()
    card = {"name": name, "agentId": agent_id}
    return signer.sign_card(card), signer


def _make_card_with_key(signer: AgentCardSigner, agent_id: str = "agent-1"):
    """Create a signed card using a specific signer."""
    card = {"name": "Test Agent", "agentId": agent_id}
    return signer.sign_card(card)


# ── _public_key_fingerprint ───────────────────────────────────────────────────


class TestPublicKeyFingerprint:
    def test_deterministic(self):
        signer = AgentCardSigner()
        pem = signer.get_public_key_pem()
        fp1 = _public_key_fingerprint(pem)
        fp2 = _public_key_fingerprint(pem)
        assert fp1 == fp2

    def test_different_keys_different_fingerprints(self):
        s1 = AgentCardSigner()
        s2 = AgentCardSigner()
        assert _public_key_fingerprint(s1.get_public_key_pem()) != _public_key_fingerprint(s2.get_public_key_pem())

    def test_hex_format(self):
        signer = AgentCardSigner()
        fp = _public_key_fingerprint(signer.get_public_key_pem())
        assert len(fp) == 64  # SHA-256 hex
        int(fp, 16)  # should not raise


# ── verify_card_signed (basic) ───────────────────────────────────────────────


class TestVerifyCardSignedBasic:
    def test_valid_card_passes(self):
        signed, _ = _make_signed_card()
        assert verify_card_signed(signed) is True

    def test_missing_signature_fails(self):
        assert verify_card_signed({"name": "no sig"}) is False

    def test_tampered_content_fails(self):
        signed, _ = _make_signed_card()
        signed["name"] = "tampered"
        assert verify_card_signed(signed) is False

    def test_wrong_algorithm_fails(self):
        signed, _ = _make_signed_card()
        signed["signature"]["algorithm"] = "rsa"
        assert verify_card_signed(signed) is False

    def test_empty_signature_fails(self):
        assert verify_card_signed({"signature": {}}) is False

    def test_corrupted_public_key_fails(self):
        signed, _ = _make_signed_card()
        signed["signature"]["publicKeyPem"] = "not-a-pem"
        assert verify_card_signed(signed) is False


# ── TrustedKeyRegistry ────────────────────────────────────────────────────────


class TestTrustedKeyRegistry:
    def test_invalid_mode_raises(self):
        with pytest.raises(ValueError, match="Invalid trust mode"):
            TrustedKeyRegistry(mode="invalid")

    def test_strict_rejects_unknown(self):
        registry = TrustedKeyRegistry(mode="strict")
        signer = AgentCardSigner()
        pem = signer.get_public_key_pem()
        assert registry.is_trusted(pem, "agent-1") is False

    def test_strict_accepts_registered(self):
        registry = TrustedKeyRegistry(mode="strict")
        signer = AgentCardSigner()
        pem = signer.get_public_key_pem()
        fp = _public_key_fingerprint(pem)
        registry.register(fp)
        assert registry.is_trusted(pem, "agent-1") is True

    def test_tofi_trusts_first_seen(self):
        registry = TrustedKeyRegistry(mode="tofu")
        signer = AgentCardSigner()
        pem = signer.get_public_key_pem()
        assert registry.is_trusted(pem, "agent-1") is True

    def test_tofi_trusts_same_key_again(self):
        registry = TrustedKeyRegistry(mode="tofu")
        signer = AgentCardSigner()
        pem = signer.get_public_key_pem()
        registry.is_trusted(pem, "agent-1")  # first use
        assert registry.is_trusted(pem, "agent-1") is True  # second use

    def test_tofi_rejects_key_change(self):
        registry = TrustedKeyRegistry(mode="tofu")
        s1 = AgentCardSigner()
        s2 = AgentCardSigner()
        registry.is_trusted(s1.get_public_key_pem(), "agent-1")
        assert registry.is_trusted(s2.get_public_key_pem(), "agent-1") is False

    def test_tofi_different_agents_independent(self):
        registry = TrustedKeyRegistry(mode="tofu")
        s1 = AgentCardSigner()
        s2 = AgentCardSigner()
        registry.is_trusted(s1.get_public_key_pem(), "agent-1")
        assert registry.is_trusted(s2.get_public_key_pem(), "agent-2") is True

    def test_allowlist_rejects_unknown(self):
        registry = TrustedKeyRegistry(mode="allowlist")
        signer = AgentCardSigner()
        assert registry.is_trusted(signer.get_public_key_pem()) is False

    def test_allowlist_accepts_registered(self):
        registry = TrustedKeyRegistry(mode="allowlist")
        signer = AgentCardSigner()
        fp = _public_key_fingerprint(signer.get_public_key_pem())
        registry.register(fp)
        assert registry.is_trusted(signer.get_public_key_pem()) is True

    def test_register_with_agent_id(self):
        registry = TrustedKeyRegistry(mode="strict")
        signer = AgentCardSigner()
        fp = _public_key_fingerprint(signer.get_public_key_pem())
        registry.register(fp, agent_id="my-agent")
        assert registry.is_trusted(signer.get_public_key_pem(), "my-agent") is True

    def test_revoke(self):
        registry = TrustedKeyRegistry(mode="strict")
        signer = AgentCardSigner()
        fp = _public_key_fingerprint(signer.get_public_key_pem())
        registry.register(fp)
        assert registry.is_trusted(signer.get_public_key_pem()) is True
        registry.revoke(fp)
        assert registry.is_trusted(signer.get_public_key_pem()) is False

    def test_fingerprint_count(self):
        registry = TrustedKeyRegistry(mode="strict")
        assert registry.fingerprint_count == 0
        s1 = AgentCardSigner()
        s2 = AgentCardSigner()
        registry.register(_public_key_fingerprint(s1.get_public_key_pem()))
        registry.register(_public_key_fingerprint(s2.get_public_key_pem()))
        assert registry.fingerprint_count == 2

    def test_mode_property(self):
        assert TrustedKeyRegistry(mode="strict").mode == "strict"
        assert TrustedKeyRegistry(mode="tofu").mode == "tofu"
        assert TrustedKeyRegistry(mode="allowlist").mode == "allowlist"


class TestTrustedKeyRegistryEnvVar:
    def test_loads_from_env(self, monkeypatch):
        s1 = AgentCardSigner()
        s2 = AgentCardSigner()
        fp1 = _public_key_fingerprint(s1.get_public_key_pem())
        fp2 = _public_key_fingerprint(s2.get_public_key_pem())
        monkeypatch.setenv("BASTION_A2A_TRUSTED_KEYS", f"{fp1},{fp2}")
        registry = TrustedKeyRegistry(mode="strict")
        assert registry.fingerprint_count == 2
        assert registry.is_trusted(s1.get_public_key_pem()) is True
        assert registry.is_trusted(s2.get_public_key_pem()) is True

    def test_empty_env_fine(self, monkeypatch):
        monkeypatch.delenv("BASTION_A2A_TRUSTED_KEYS", raising=False)
        registry = TrustedKeyRegistry(mode="strict")
        assert registry.fingerprint_count == 0


# ── verify_card_signed_trusted ────────────────────────────────────────────────


class TestVerifyCardSignedTrusted:
    def test_valid_card_strict_registered(self):
        signed, signer = _make_signed_card()
        registry = TrustedKeyRegistry(mode="strict")
        fp = _public_key_fingerprint(signer.get_public_key_pem())
        registry.register(fp)
        assert verify_card_signed_trusted(signed, registry) is True

    def test_self_signed_card_strict_rejected(self):
        signed, _ = _make_signed_card()
        registry = TrustedKeyRegistry(mode="strict")
        assert verify_card_signed_trusted(signed, registry) is False

    def test_self_signed_card_tofi_accepted(self):
        signed, _ = _make_signed_card()
        registry = TrustedKeyRegistry(mode="tofu")
        assert verify_card_signed_trusted(signed, registry) is True

    def test_tampered_card_rejected(self):
        signed, signer = _make_signed_card()
        registry = TrustedKeyRegistry(mode="tofu")
        signed["name"] = "tampered"
        assert verify_card_signed_trusted(signed, registry) is False

    def test_default_registry_is_tofi(self):
        signed, _ = _make_signed_card()
        # No registry passed — should default to TOFU
        assert verify_card_signed_trusted(signed) is True

    def test_key_change_rejected_tofi(self):
        s1 = AgentCardSigner()
        s2 = AgentCardSigner()
        card1 = _make_card_with_key(s1, "agent-1")
        card2 = _make_card_with_key(s2, "agent-1")
        registry = TrustedKeyRegistry(mode="tofu")
        assert verify_card_signed_trusted(card1, registry) is True
        assert verify_card_signed_trusted(card2, registry) is False

    def test_missing_agent_id_tofi(self):
        """TOFU without agent_id falls back to allowlist-only check."""
        signed, signer = _make_signed_card()
        # Remove agentId
        del signed["agentId"]
        registry = TrustedKeyRegistry(mode="tofu")
        # No agent_id means TOFU can't track by agent — falls through to allowlist
        assert verify_card_signed_trusted(signed, registry) is False

    def test_env_var_trusted_keys(self, monkeypatch):
        signed, signer = _make_signed_card()
        fp = _public_key_fingerprint(signer.get_public_key_pem())
        monkeypatch.setenv("BASTION_A2A_TRUSTED_KEYS", fp)
        registry = TrustedKeyRegistry(mode="strict")
        assert verify_card_signed_trusted(signed, registry) is True
