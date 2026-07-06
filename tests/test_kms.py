"""Tests for the KMS encryption layer."""

from __future__ import annotations

from bastion.kms import EncryptedMemoryWrapper, LocalKMS
from bastion.memory import BastionMemory
from bastion.mock import reset


class TestLocalKMS:
    def setup_method(self):
        self.kms = LocalKMS(generate=True)

    def test_encrypt_decrypt_roundtrip(self):
        ct = self.kms.encrypt("hello world")
        pt = self.kms.decrypt(ct)
        assert pt == "hello world"

    def test_encrypt_with_context(self):
        ct = self.kms.encrypt("secret", {"scope": "test"})
        pt = self.kms.decrypt(ct, {"scope": "test"})
        assert pt == "secret"

    def test_wrong_context_fails(self):
        import pytest
        from cryptography.exceptions import InvalidTag
        ct = self.kms.encrypt("data", {"scope": "a"})
        with pytest.raises(InvalidTag):
            self.kms.decrypt(ct, {"scope": "b"})

    def test_key_id_format(self):
        kid = self.kms.key_id()
        assert kid.startswith("local:aes256gcm:")

    def test_custom_key(self):
        key = LocalKMS.generate_key()
        kms = LocalKMS(key=key)
        ct = kms.encrypt("test")
        pt = kms.decrypt(ct)
        assert pt == "test"

    def test_invalid_key_length(self):
        import pytest
        with pytest.raises(ValueError):
            LocalKMS(key=b"short")


class TestEncryptedMemoryWrapper:
    def setup_method(self):
        reset()
        self.kms = LocalKMS(generate=True)
        self.mem = BastionMemory("test-agent", mock=True)
        self.wrapper = EncryptedMemoryWrapper(self.mem, self.kms)

    def test_store_encrypts_content(self):
        rec = self.wrapper.store("fact", "very secret data")
        assert "secret" not in rec.content
        assert rec.metadata.get("_encrypted") is True

    def test_search_decrypts_content(self):
        self.wrapper.store("fact", "confidential planning doc")
        results = self.wrapper.search("planning", threshold=0.0, k=5)
        assert len(results) > 0
        assert "confidential" in results[0].content

    def test_delegates_unknown_attrs(self):
        assert self.wrapper.agent_id == "test-agent"
        assert self.wrapper.namespace == "test-agent"
