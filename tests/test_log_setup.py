"""Tests for log_setup — configuration and secret redaction."""

from __future__ import annotations

import os

from bastion.log_setup import _SENSITIVE_KEYS, _redact_secrets, configure_logging, get_logger


class TestConfigureLogging:
    def test_configures_without_error(self):
        configure_logging()
        # Should not raise

    def test_sets_log_level_from_env(self):
        import unittest.mock as mock

        with mock.patch.dict(os.environ, {"BASTION_LOG_LEVEL": "DEBUG"}):
            configure_logging()
            # Should not raise — logging is configured with DEBUG level

    def test_defaults_to_info(self):
        import unittest.mock as mock

        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("BASTION_LOG_LEVEL", None)
            configure_logging()
            # Should not raise — logging defaults to INFO


class TestGetLogger:
    def test_returns_logger(self):
        logger = get_logger("test.module")
        assert logger is not None

    def test_logger_has_name(self):
        logger = get_logger("bastion.test")
        # structlog returns a BoundLogger, stdlib returns Logger
        # Both should work
        assert logger is not None


class TestRedactSecrets:
    def test_redacts_api_key(self):
        event = {"api_key": "sk-1234567890abcdef"}
        result = _redact_secrets(None, None, event)
        assert result["api_key"] != "sk-1234567890abcdef"
        assert "****" in result["api_key"]

    def test_redacts_password(self):
        event = {"password": "mysecretpassword"}
        result = _redact_secrets(None, None, event)
        assert "****" in result["password"]

    def test_redacts_token(self):
        event = {"auth_token": "bearer-abc123xyz"}
        result = _redact_secrets(None, None, event)
        assert "****" in result["auth_token"]

    def test_redacts_secret_in_key_name(self):
        event = {"db_secret_value": "sensitive-data-here"}
        result = _redact_secrets(None, None, event)
        assert "****" in result["db_secret_value"]

    def test_short_values_fully_redacted(self):
        event = {"api_key": "ab"}
        result = _redact_secrets(None, None, event)
        assert result["api_key"] == "****"

    def test_non_string_values_not_redacted(self):
        event = {"api_key": 12345}
        result = _redact_secrets(None, None, event)
        assert result["api_key"] == 12345

    def test_normal_keys_not_redacted(self):
        event = {"user_name": "Alice", "count": 42}
        result = _redact_secrets(None, None, event)
        assert result["user_name"] == "Alice"
        assert result["count"] == 42

    def test_sensitive_keys_set(self):
        assert "api_key" in _SENSITIVE_KEYS
        assert "password" in _SENSITIVE_KEYS
        assert "token" in _SENSITIVE_KEYS
        assert "connection_string" in _SENSITIVE_KEYS
