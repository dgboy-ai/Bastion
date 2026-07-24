from __future__ import annotations

import os
import threading
from typing import ClassVar

# Load .env.local before pydantic-settings (higher priority than .env)
try:
    from dotenv import load_dotenv
    load_dotenv(".env.local", override=False)
    load_dotenv(".env", override=False)
    # Warn if .env.local contains real credentials (security check)
    import logging
    _env_local_conn = os.environ.get("BASTION_CONN", "")
    if _env_local_conn and "localhost" not in _env_local_conn and "127.0.0.1" not in _env_local_conn:
        logging.getLogger("bastion.config").warning(
            "BASTION_CONN appears to contain a real database connection string. "
            "Ensure .env.local is in .gitignore and rotate credentials regularly."
        )
except ImportError:
    pass  # dotenv not installed — rely on OS env vars

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project constants
VERSION = "0.10.0"
PROJECT_URL = os.environ.get("BASTION_PROJECT_URL", "https://bastion-self.vercel.app")
DOCS_URL = os.environ.get("BASTION_DOCS_URL", "https://github.com/dgboy-ai/Bastion")

# Query limits
AUDIT_LIMIT = 100
ANOMALY_LIMIT = 50
SEARCH_RESULT_LIMIT = 500
DBA_SLOW_QUERY_LIMIT = 10
LOCALITY_LIMIT = 10


class BastionSettings(BaseSettings):
    """Centralized configuration for Bastion loaded from environment variables."""

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
    aws_region: str = os.environ.get("AWS_REGION", "us-east-1")
    bedrock_read_timeout: int = 10
    bedrock_connect_timeout: int = 10
    pool_min_size: int = 5
    pool_max_size: int = 20
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
    api_key: SecretStr = SecretStr("")


_settings: BastionSettings | None = None
_Settings_LOCK = threading.Lock()
_api_key_warned = False


def get_settings() -> BastionSettings:
    global _settings, _api_key_warned
    if _settings is None:
        with _Settings_LOCK:
            if _settings is None:
                _settings = BastionSettings()
                if not _api_key_warned and not _settings.api_key.get_secret_value():
                    import logging
                    logging.getLogger("bastion.config").warning(
                        "BASTION_API_KEY is not set — authentication is effectively disabled. "
                        "Set BASTION_API_KEY in your environment for production use."
                    )
                    _api_key_warned = True
    return _settings


def reset_settings() -> None:
    global _settings
    with _Settings_LOCK:
        _settings = None
