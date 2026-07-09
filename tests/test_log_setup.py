from __future__ import annotations

from unittest import mock

import pytest


class TestLogSetup:
    def test_configure_logging_basic(self):
        from bastion.log_setup import configure_logging

        with mock.patch.dict("os.environ", {}, clear=True):
            configure_logging()

    def test_configure_logging_debug_level(self):
        from bastion.log_setup import configure_logging

        with mock.patch.dict("os.environ", {"BASTION_LOG_LEVEL": "DEBUG"}, clear=True):
            configure_logging()

    def test_configure_logging_invalid_level_fallback(self):
        from bastion.log_setup import configure_logging

        with mock.patch.dict("os.environ", {"BASTION_LOG_LEVEL": "INVALID"}, clear=True):
            configure_logging()

    def test_redact_secrets_api_key(self):
        from bastion.log_setup import _redact_secrets

        event = {"api_key": "sk-abcdefghijklmnopqrstuvwxyz1234", "message": "hello"}
        result = _redact_secrets(None, None, event)
        assert result["api_key"] != "sk-abcdefghijklmnopqrstuvwxyz1234"
        assert "****" in result["api_key"]

    def test_redact_secrets_token(self):
        from bastion.log_setup import _redact_secrets

        event = {"auth_token": "secret-value-12345", "message": "test"}
        result = _redact_secrets(None, None, event)
        assert "****" in result["auth_token"]

    def test_redact_secrets_short_value(self):
        from bastion.log_setup import _redact_secrets

        event = {"api_key": "ab"}
        result = _redact_secrets(None, None, event)
        assert result["api_key"] == "****"

    def test_redact_secrets_normal_field_untouched(self):
        from bastion.log_setup import _redact_secrets

        event = {"message": "hello", "count": 42}
        result = _redact_secrets(None, None, event)
        assert result["message"] == "hello"
        assert result["count"] == 42

    def test_get_logger_basic(self):
        from bastion.log_setup import get_logger

        logger = get_logger("test-module")
        assert logger is not None
