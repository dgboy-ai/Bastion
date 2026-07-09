"""Tests for BastionSettings and config management."""

from __future__ import annotations

import os

import pytest

from bastion.config import BastionSettings, get_settings, reset_settings

_BASTION_ENV_VARS = [k for k in os.environ if k.startswith("BASTION_")]


@pytest.fixture(autouse=True)
def _clear_bastion_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _BASTION_ENV_VARS:
        monkeypatch.delenv(k, raising=False)


class TestBastionSettings:
    def test_default_values(self):
        settings = BastionSettings()
        assert settings.connection_string == ""
        assert settings.mock is False
        assert settings.bedrock_model_id == "amazon.titan-embed-text-v2:0"
        assert settings.embed_dim == 1024
        assert settings.aws_region == "ap-south-1"
        assert settings.bedrock_read_timeout == 10
        assert settings.bedrock_connect_timeout == 10
        assert settings.pool_min_size == 1
        assert settings.pool_max_size == 2
        assert settings.pool_max_idle_seconds == 300
        assert settings.circuit_breaker_failure_threshold == 5
        assert settings.circuit_breaker_recovery_timeout == 30
        assert settings.circuit_breaker_success_threshold == 2
        assert settings.retry_max_retries == 5
        assert settings.retry_base_delay_ms == 10.0
        assert settings.retry_max_delay_ms == 2000.0
        assert settings.retry_jitter_factor == 0.5
        assert settings.limiter_max_concurrent == 10
        assert settings.limiter_max_queue == 100
        assert settings.limiter_timeout_seconds == 30
        assert settings.search_default_k == 5
        assert settings.search_default_threshold == 0.8
        assert settings.cache_default_threshold == 0.97
        assert settings.decay_rate == 0.01
        assert settings.reinforce_boost == 1.0
        assert settings.log_level == "INFO"
        assert settings.compliance_mode is None
        assert settings.api_key.get_secret_value() == ""

    def test_reads_from_env(self, monkeypatch):
        monkeypatch.setenv("BASTION_CONNECTION_STRING", "postgres://localhost:26257")
        monkeypatch.setenv("BASTION_MOCK", "true")
        monkeypatch.setenv("BASTION_LOG_LEVEL", "DEBUG")
        monkeypatch.setenv("BASTION_AWS_REGION", "us-west-2")
        monkeypatch.setenv("BASTION_RETRY_MAX_RETRIES", "10")

        settings = BastionSettings()
        assert settings.connection_string == "postgres://localhost:26257"
        assert settings.mock is True
        assert settings.log_level == "DEBUG"
        assert settings.aws_region == "us-west-2"
        assert settings.retry_max_retries == 10

    def test_reads_numeric_env(self, monkeypatch):
        monkeypatch.setenv("BASTION_EMBED_DIM", "512")
        monkeypatch.setenv("BASTION_POOL_MIN_SIZE", "5")
        monkeypatch.setenv("BASTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD", "3")
        monkeypatch.setenv("BASTION_RETRY_BASE_DELAY_MS", "50.0")

        settings = BastionSettings()
        assert settings.embed_dim == 512
        assert settings.pool_min_size == 5
        assert settings.circuit_breaker_failure_threshold == 3
        assert settings.retry_base_delay_ms == 50.0

    def test_reads_float_env(self, monkeypatch):
        monkeypatch.setenv("BASTION_DECAY_RATE", "0.05")
        monkeypatch.setenv("BASTION_REINFORCE_BOOST", "2.5")
        monkeypatch.setenv("BASTION_SEARCH_DEFAULT_THRESHOLD", "0.75")

        settings = BastionSettings()
        assert settings.decay_rate == 0.05
        assert settings.reinforce_boost == 2.5
        assert settings.search_default_threshold == 0.75

    def test_ignores_unknown_env(self, monkeypatch):
        monkeypatch.setenv("BASTION_UNKNOWN_KEY", "value")
        settings = BastionSettings()
        assert not hasattr(settings, "unknown_key")


class TestSettingsSingleton:
    def setup_method(self):
        reset_settings()

    def test_get_settings_returns_same_instance(self):
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2

    def test_get_settings_is_bastion_settings(self):
        s = get_settings()
        assert isinstance(s, BastionSettings)

    def test_reset_settings_clears_singleton(self):
        s1 = get_settings()
        reset_settings()
        s2 = get_settings()
        assert s1 is not s2

    def test_singleton_remembers_env(self, monkeypatch):
        reset_settings()
        monkeypatch.setenv("BASTION_LOG_LEVEL", "ERROR")
        s = get_settings()
        assert s.log_level == "ERROR"

    def test_reset_then_get_returns_fresh(self, monkeypatch):
        monkeypatch.setenv("BASTION_MOCK", "true")
        s1 = get_settings()
        assert s1.mock is True

        reset_settings()
        monkeypatch.setenv("BASTION_MOCK", "false")
        s2 = get_settings()
        assert s2.mock is False


class TestEnvVarMapping:
    @pytest.mark.parametrize("env_var,field,expected", [
        ("BASTION_CONNECTION_STRING", "connection_string", "test-conn"),
        ("BASTION_MOCK", "mock", True),
        ("BASTION_BEDROCK_MODEL_ID", "bedrock_model_id", "test-model"),
        ("BASTION_EMBED_DIM", "embed_dim", 256),
        ("BASTION_AWS_REGION", "aws_region", "eu-west-1"),
        ("BASTION_POOL_MIN_SIZE", "pool_min_size", 4),
        ("BASTION_POOL_MAX_SIZE", "pool_max_size", 20),
        ("BASTION_RETRY_MAX_RETRIES", "retry_max_retries", 3),
        ("BASTION_RETRY_BASE_DELAY_MS", "retry_base_delay_ms", 25.0),
        ("BASTION_RETRY_MAX_DELAY_MS", "retry_max_delay_ms", 5000.0),
        ("BASTION_RETRY_JITTER_FACTOR", "retry_jitter_factor", 0.75),
        ("BASTION_LOG_LEVEL", "log_level", "WARNING"),
        ("BASTION_COMPLIANCE_MODE", "compliance_mode", "eu_ai_act"),
        ("BASTION_API_KEY", "api_key", "sk-test123"),
    ])
    def test_env_maps_to_field(self, monkeypatch, env_var, field, expected):
        monkeypatch.setenv(env_var, str(expected))
        settings = BastionSettings()
        actual = getattr(settings, field)
        from pydantic import SecretStr
        if isinstance(actual, SecretStr):
            assert actual.get_secret_value() == expected
        else:
            assert actual == expected or str(actual) == str(expected)
