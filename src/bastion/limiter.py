"""Request Limiter.

Limits concurrent requests to prevent resource exhaustion.
Uses semaphore-based limiting with timeout support.
"""

from __future__ import annotations

import logging
import threading
from typing import Any

logger = logging.getLogger(__name__)


class RequestLimiter:
    """Limits concurrent requests with timeout support."""

    def __init__(
        self,
        max_concurrent: int = 10,
        max_queue: int = 100,
        timeout_seconds: int = 30,
    ):
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue
        self.timeout_seconds = timeout_seconds
        self._semaphore = threading.Semaphore(max_concurrent)
        self._queue_count = 0
        self._active_count = 0
        self._total_requests = 0
        self._total_rejected = 0
        self._total_timeout = 0
        self._lock = threading.Lock()

    def acquire(self, timeout: float | None = None) -> bool:
        """Acquire a request slot.

        Returns True if acquired, False if rejected or timed out.
        """
        with self._lock:
            self._total_requests += 1
            if self._queue_count >= self.max_queue:
                self._total_rejected += 1
                logger.warning("Request rejected: queue full (%d)", self._queue_count)
                return False
            self._queue_count += 1

        timeout = timeout or self.timeout_seconds
        acquired = self._semaphore.acquire(timeout=timeout)

        with self._lock:
            self._queue_count -= 1
            if acquired:
                self._active_count += 1
            else:
                self._total_timeout += 1
                logger.warning("Request timed out after %.1fs", timeout)

        return acquired

    def release(self) -> None:
        """Release a request slot."""
        with self._lock:
            self._active_count = max(0, self._active_count - 1)
        self._semaphore.release()

    def get_stats(self) -> dict[str, Any]:
        """Return limiter statistics."""
        with self._lock:
            return {
                "max_concurrent": self.max_concurrent,
                "active_requests": self._active_count,
                "queue_depth": self._queue_count,
                "total_requests": self._total_requests,
                "total_rejected": self._total_rejected,
                "total_timeout": self._total_timeout,
                "utilization": round(
                    self._active_count / max(self.max_concurrent, 1) * 100, 2
                ),
            }

    def __enter__(self) -> RequestLimiter:
        """Context manager entry."""
        if not self.acquire():
            raise RuntimeError("Could not acquire request slot")
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Context manager exit."""
        self.release()
