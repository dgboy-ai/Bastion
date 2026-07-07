from __future__ import annotations

from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


class BastionSettings(BaseSettings):
    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_prefix="BASTION_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    connection_string: str = ""
    mock: bool = False
    bedrock_model_id: str = "amazon.titan-embed-text-v2:0"
    embed_dim: int = 1024
    aws_region: str = "ap-south-1"
    bedrock_read_timeout: int = 10
    bedrock_connect_timeout: int = 10
    pool_min_size: int = 2
    pool_max_size: int = 10
    pool_max_idle_seconds: int = 300
    circuit_breaker_failure_threshold: int = 5
    circuit_breaker_recovery_timeout: int = 30
    circuit_breaker_success_threshold: int = 2
    retry_max_retries: int = 5
    retry_base_delay_ms: float = 10.0
    retry_max_delay_ms: float = 2000.0
    retry_jitter_factor: float = 0.5
    limiter_max_concurrent: int = 10
    limiter_max_queue: int = 100
    limiter_timeout_seconds: int = 30
    search_default_k: int = 5
    search_default_threshold: float = 0.8
    cache_default_threshold: float = 0.97
    decay_rate: float = 0.01
    reinforce_boost: float = 1.0
    log_level: str = "INFO"
    compliance_mode: str | None = None
    api_key: str = ""


_settings: BastionSettings | None = None


def get_settings() -> BastionSettings:
    global _settings
    if _settings is None:
        _settings = BastionSettings()
    return _settings


def reset_settings() -> None:
    global _settings
    _settings = None
