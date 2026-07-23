"""Tests for crypto.py — HMAC secret persistence and Windows warning paths.

Covers:
- _get_hmac_secret: env var, disk persistence, generation
- compute_hash / verify_hash: HMAC-SHA256 with length-prefix collision prevention
- Windows warning: logger fires when reading/writing on win32
"""

from __future__ import annotations

import hashlib
import hmac
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

from bastion import crypto


# ── _get_hmac_secret ──────────────────────────────────────────────────────────


class TestGetHmacSecret:
    def setup_method(self):
        crypto._hmac_secret = None

    def test_env_var_used_when_set(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "a" * 32)
        secret = crypto._get_hmac_secret()
        assert secret == b"a" * 32

    def test_env_var_minimum_length(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "short")
        with pytest.raises(ValueError, match="too short"):
            crypto._get_hmac_secret()

    def test_env_var_exact_minimum(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "a" * 16)
        secret = crypto._get_hmac_secret()
        assert secret == b"a" * 16

    def test_cached_after_first_call(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "b" * 32)
        s1 = crypto._get_hmac_secret()
        s2 = crypto._get_hmac_secret()
        assert s1 is s2

    def test_generates_secret_when_no_env(self, monkeypatch, tmp_path):
        monkeypatch.delenv("BASTION_HMAC_SECRET", raising=False)
        monkeypatch.setattr(crypto, "_SECRET_DIR", str(tmp_path))
        monkeypatch.setattr(crypto, "_SECRET_FILE", str(tmp_path / "hmac.key"))
        secret = crypto._get_hmac_secret()
        assert len(secret) == 32
        # File should exist on disk
        assert (tmp_path / "hmac.key").exists()

    def test_loads_from_disk(self, monkeypatch, tmp_path):
        monkeypatch.delenv("BASTION_HMAC_SECRET", raising=False)
        key_file = tmp_path / "hmac.key"
        persisted = os.urandom(32)
        key_file.write_bytes(persisted)
        monkeypatch.setattr(crypto, "_SECRET_DIR", str(tmp_path))
        monkeypatch.setattr(crypto, "_SECRET_FILE", str(key_file))
        secret = crypto._get_hmac_secret()
        assert secret == persisted


# ── compute_hash / verify_hash ────────────────────────────────────────────────


class TestComputeHash:
    def setup_method(self):
        crypto._hmac_secret = None

    def test_deterministic(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h1 = crypto.compute_hash("hello")
        h2 = crypto.compute_hash("hello")
        assert h1 == h2

    def test_different_content_different_hash(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        assert crypto.compute_hash("a") != crypto.compute_hash("b")

    def test_different_secret_different_hash(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "secret-one-32-bytes-long!!!!")
        h1 = crypto.compute_hash("hello")
        crypto._hmac_secret = None
        monkeypatch.setenv("BASTION_HMAC_SECRET", "secret-two-32-bytes-long!!!!")
        h2 = crypto.compute_hash("hello")
        assert h1 != h2

    def test_metadata_affects_hash(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h1 = crypto.compute_hash("hello", metadata={"k": "v"})
        h2 = crypto.compute_hash("hello", metadata={"k": "v2"})
        assert h1 != h2

    def test_previous_hash_affects_hash(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h1 = crypto.compute_hash("hello", previous_hash="aaa")
        h2 = crypto.compute_hash("hello", previous_hash="bbb")
        assert h1 != h2

    def test_length_prefix_prevents_collision(self, monkeypatch):
        """Verify that length-prefixing prevents content|metadata boundary attacks."""
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        # These would collide without length-prefixing:
        # content="ab", metadata="cd" vs content="a", metadata="bcd"
        h1 = crypto.compute_hash("ab", metadata="cd")
        h2 = crypto.compute_hash("a", metadata="bcd")
        assert h1 != h2

    def test_hex_output(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h = crypto.compute_hash("test")
        assert len(h) == 64
        int(h, 16)  # valid hex


class TestVerifyHash:
    def setup_method(self):
        crypto._hmac_secret = None

    def test_valid_hash_passes(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h = crypto.compute_hash("content", metadata={"k": "v"}, previous_hash="prev")
        assert crypto.verify_hash("content", {"k": "v"}, "prev", h) is True

    def test_tampered_content_fails(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h = crypto.compute_hash("original")
        assert crypto.verify_hash("tampered", None, None, h) is False

    def test_tampered_hash_fails(self, monkeypatch):
        monkeypatch.setenv("BASTION_HMAC_SECRET", "test-secret-key-32bytes!!!!!")
        h = crypto.compute_hash("content")
        assert crypto.verify_hash("content", None, None, "0" * 64) is False


# ── Windows warning ───────────────────────────────────────────────────────────


class TestWindowsWarning:
    def setup_method(self):
        crypto._hmac_secret = None

    def test_windows_write_warning(self, monkeypatch, tmp_path, capsys):
        """On Windows, writing the HMAC secret file should log a warning."""
        monkeypatch.delenv("BASTION_HMAC_SECRET", raising=False)
        monkeypatch.setattr(crypto, "_SECRET_DIR", str(tmp_path))
        monkeypatch.setattr(crypto, "_SECRET_FILE", str(tmp_path / "hmac.key"))
        monkeypatch.setattr(sys, "platform", "win32")
        crypto._get_hmac_secret()
        output = capsys.readouterr().out
        assert "Windows" in output and "NTFS" in output

    def test_windows_read_warning(self, monkeypatch, tmp_path, capsys):
        """On Windows, reading the HMAC secret file from disk should log a warning."""
        monkeypatch.delenv("BASTION_HMAC_SECRET", raising=False)
        key_file = tmp_path / "hmac.key"
        key_file.write_bytes(os.urandom(32))
        monkeypatch.setattr(crypto, "_SECRET_DIR", str(tmp_path))
        monkeypatch.setattr(crypto, "_SECRET_FILE", str(key_file))
        monkeypatch.setattr(sys, "platform", "win32")
        crypto._get_hmac_secret()
        output = capsys.readouterr().out
        assert "Windows" in output and "disk" in output

    def test_non_windows_no_warning(self, monkeypatch, tmp_path, capsys):
        """On non-Windows, no platform warning should appear."""
        monkeypatch.delenv("BASTION_HMAC_SECRET", raising=False)
        monkeypatch.setattr(crypto, "_SECRET_DIR", str(tmp_path))
        monkeypatch.setattr(crypto, "_SECRET_FILE", str(tmp_path / "hmac.key"))
        monkeypatch.setattr(sys, "platform", "linux")
        crypto._get_hmac_secret()
        output = capsys.readouterr().out
        assert "Windows" not in output
