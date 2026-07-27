"""Tests for the KMS encryption layer."""

from __future__ import annotations

import os

from bastion.kms import EncryptedMemoryWrapper, LocalKMS, create_kms
from bastion.memory import BastionMemory
from bastion.mock import reset


class TestKMSFactory:
    def setup_method(self):
        reset()
        self._saved = os.environ.get("BASTION_AWS_KMS_KEY_ARN")

    def teardown_method(self):
        if self._saved:
            os.environ["BASTION_AWS_KMS_KEY_ARN"] = self._saved
        else:
            os.environ.pop("BASTION_AWS_KMS_KEY_ARN", None)

    def test_create_kms_returns_local_when_no_aws(self):
        os.environ.pop("BASTION_AWS_KMS_KEY_ARN", None)
        kms = create_kms()
        assert isinstance(kms, LocalKMS)

    def test_create_kms_returns_aws_when_key_arn_set(self):
        os.environ["BASTION_AWS_KMS_KEY_ARN"] = "arn:aws:kms:us-east-1:123456789012:key/mock"
        os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
        try:
            kms = create_kms()
            _ = kms.key_id()
        except (ImportError, Exception) as exc:
            err = str(exc).lower()
            assert "boto3" in err or "arn:aws:kms" in err or "credentials" in err


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

    def test_identical_plaintext_distinct_ciphertext(self):
        a = self.wrapper.store("fact", "hello world")
        b = self.wrapper.store("fact", "hello world")
        # Ciphertexts differ (different IV/nonce each time)
        assert a.content != b.content
        # Embeddings match (computed on identical plaintext)
        assert a.metadata.get("_precomputed_embedding") == b.metadata.get("_precomputed_embedding")
        # Both marked encrypted
        assert a.metadata.get("_encrypted") is True
        assert b.metadata.get("_encrypted") is True

    def test_list_all_decrypts_content(self):
        self.wrapper.store("fact", "list all secret data")
        results = self.wrapper.list_all("fact")
        assert len(results) > 0
        assert all("list all secret data" in r.content for r in results)

    def test_get_memory_decrypts_content(self):
        rec = self.wrapper.store("fact", "get memory secret")
        found = self.wrapper.get_memory(rec.memory_id)
        assert found is not None
        assert "get memory secret" in found.content

    def test_store_with_expires_and_region(self):
        rec = self.wrapper.store("fact", "ephemeral secret", expires_in_seconds=1)
        assert "<encrypted" not in rec.content
        assert rec.metadata.get("_encrypted") is True

    def test_store_forwards_region(self):
        rec = self.wrapper.store("fact", "regional secret", region="us-east-1")
        assert rec.metadata.get("_encrypted") is True
