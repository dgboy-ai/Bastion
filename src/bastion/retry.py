from __future__ import annotations

import random
import time
from collections.abc import Callable
from typing import Any

try:
    from opentelemetry import trace
    from opentelemetry.trace import SpanKind

    _has_otel = True
except ImportError:
    _has_otel = False

import structlog

from bastion.errors import BastionRetryExhaustedError

logger = structlog.get_logger("bastion.retry")


class SerializationRetryEngine:
    """Retries database operations on CockroachDB serialization errors with exponential backoff."""

    def __init__(
        self,
        max_retries: int = 5,
        base_delay_ms: float = 10,
        max_delay_ms: float = 2000,
        jitter_factor: float = 0.5,
    ):
        self.max_retries = max_retries
        self.base_delay_ms = base_delay_ms
        self.max_delay_ms = max_delay_ms
        self.jitter_factor = jitter_factor
        self._total_retries = 0
        self._total_successes = 0

    def execute(
        self,
        conn: Any,
        operation: Callable[[Any], Any],
        isolation: str = "serializable",
    ) -> Any:
        tracer = trace.get_tracer("bastion.retry") if _has_otel else None
        span = tracer.start_as_current_span("retry.execute", kind=SpanKind.CLIENT) if _has_otel else _null_context()
        with span:
            last_error: Exception | None = None

            for attempt in range(self.max_retries + 1):
                try:
                    with conn.cursor() as cur:
                        result = operation(cur)
                        conn.commit()
                        self._total_successes += 1
                        return result
                except Exception as e:
                    conn.rollback()
                    if not _is_serialization_error(e) or attempt == self.max_retries:
                        raise

                    last_error = e
                    self._total_retries += 1
                    delay = self._compute_delay(attempt)
                    logger.warning(
                        "serialization_retry",
                        attempt=attempt + 1,
                        max_retries=self.max_retries,
                        delay_ms=round(delay, 1),
                    )
                    time.sleep(delay / 1000)

            raise BastionRetryExhaustedError(
                f"Retry engine exhausted after {self.max_retries} attempts"
            ) from last_error

    def _compute_delay(self, attempt: int) -> float:
        base = self.base_delay_ms * float(2**attempt)
        capped = min(base, self.max_delay_ms)
        jitter = capped * self.jitter_factor * random.random()
        return capped + jitter

    def get_stats(self) -> dict[str, Any]:
        total = self._total_successes + self._total_retries
        return {
            "total_attempts": total,
            "total_retries": self._total_retries,
            "total_successes": self._total_successes,
            "retry_rate": round(self._total_retries / max(total, 1) * 100, 2),
        }


def _is_serialization_error(e: Exception) -> bool:
    estr = str(e)
    return (
        "40001" in estr
        or "serialization" in estr.lower()
        or "restart transaction" in estr.lower()
    )


class _NullContext:
    def __enter__(self):
        return None
    def __exit__(self, *args):
        pass


def _null_context():
    return _NullContext()
