from __future__ import annotations

import io
import logging
import os
import sys
from typing import Any


def _utf8_stderr() -> io.TextIOWrapper:
    """Return sys.stderr wrapped as UTF-8 (no-op if already UTF-8 or non-Windows)."""
    try:
        if hasattr(sys.stderr, "buffer") and getattr(sys.stderr, "encoding", "").lower() not in ("utf-8", "utf8"):
            return io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass
    return sys.stderr  # type: ignore[return-value]

try:
    import structlog

    HAS_STRUCTLOG = True
except ImportError:
    HAS_STRUCTLOG = False


_LOG_LEVELS = {
    "DEBUG": logging.DEBUG,
    "INFO": logging.INFO,
    "WARNING": logging.WARNING,
    "ERROR": logging.ERROR,
    "CRITICAL": logging.CRITICAL,
}


_SENSITIVE_KEYS = frozenset(
    {
        "api_key",
        "secret",
        "password",
        "token",
        "connection_string",
        "bastion_conn",
        "authorization",
        "credentials",
        "private_key",
    }
)


def _redact_secrets(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
    """Redact sensitive values from structured log output."""
    for key in list(event_dict.keys()):
        if key.lower() in _SENSITIVE_KEYS or any(s in key.lower() for s in ("secret", "key", "password", "token")):
            val = event_dict[key]
            if isinstance(val, str) and len(val) > 4:
                event_dict[key] = val[:2] + "****" + val[-2:]
            elif isinstance(val, str):
                event_dict[key] = "****"
    return event_dict


def configure_logging() -> None:
    level_name = os.environ.get("BASTION_LOG_LEVEL", "INFO").upper()
    level = _LOG_LEVELS.get(level_name, logging.INFO)

    if HAS_STRUCTLOG:
        structlog.configure(
            processors=[
                structlog.stdlib.filter_by_level,
                structlog.stdlib.add_log_level,
                structlog.stdlib.PositionalArgumentsFormatter(),
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                structlog.processors.UnicodeDecoder(),
                _redact_secrets,  # type: ignore[list-item]
                structlog.processors.JSONRenderer(),
            ],
            context_class=dict,
            logger_factory=structlog.stdlib.LoggerFactory(),
            wrapper_class=structlog.stdlib.BoundLogger,
            cache_logger_on_first_use=True,
        )
        logging.basicConfig(level=level, stream=_utf8_stderr())
    else:
        logging.basicConfig(
            level=level,
            format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            stream=_utf8_stderr(),
        )

    logging.getLogger("botocore").setLevel(logging.WARNING)
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("psycopg").setLevel(logging.WARNING)


def get_logger(name: str) -> Any:
    if HAS_STRUCTLOG:
        return structlog.get_logger(name)
    return logging.getLogger(name)
