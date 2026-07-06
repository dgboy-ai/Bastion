"""Jittered Serializable Retry Engine.

Catches CockroachDB 40001 serialization failures and retries
with exponential backoff + randomized jitter. Critical for
multi-agent concurrent writes under SERIALIZABLE isolation.
"""

from __future__ import annotations

import logging
import random
import time
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)


class SerializationRetryEngine:
    """Wraps database writes in automatic retry loops for 40001 errors.
    
    Usage:
        engine = SerializationRetryEngine(max_retries=5, base_delay_ms=10)
        result = engine.execute(conn, lambda cur: cur.execute("INSERT ..."))
    """

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
        """Execute operation with automatic retry on serialization failure.
        
        Args:
            conn: Database connection
            operation: Callable that takes a cursor and performs the operation
            isolation: Transaction isolation level
            
        Returns:
            Result of the operation
        """
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                with conn.cursor() as cur:
                    result = operation(cur)
                    conn.commit()
                    self._total_successes += 1
                    return result
            except Exception as e:
                conn.rollback()
                error_str = str(e)
                is_serialization = (
                    "40001" in error_str
                    or "serialization" in error_str.lower()
                    or "restart transaction" in error_str.lower()
                )

                if not is_serialization or attempt == self.max_retries:
                    raise

                last_error = e
                self._total_retries += 1

                delay = self._compute_delay(attempt)
                logger.warning(
                    "Serialization failure (attempt %d/%d), retrying in %.1fms",
                    attempt + 1,
                    self.max_retries,
                    delay,
                )
                time.sleep(delay / 1000)

        raise last_error or RuntimeError("Retry engine exhausted")

    def _compute_delay(self, attempt: int) -> float:
        """Exponential backoff with jitter."""
        base = self.base_delay_ms * (2 ** attempt)
        capped = min(base, self.max_delay_ms)
        jitter = capped * self.jitter_factor * random.random()
        return capped + jitter

    def get_stats(self) -> dict[str, Any]:
        """Return retry statistics."""
        total = self._total_successes + self._total_retries
        return {
            "total_attempts": total,
            "total_retries": self._total_retries,
            "total_successes": self._total_successes,
            "retry_rate": round(self._total_retries / max(total, 1) * 100, 2),
        }
