"""Circuit Breaker Pattern.

Prevents cascade failures when downstream services (embedding APIs, CRDB) are down.
Three states: CLOSED (normal), OPEN (failing fast), HALF_OPEN (testing recovery).
"""

from __future__ import annotations

import asyncio
import threading
import time
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class CircuitState(StrEnum):
    """Possible states of a circuit breaker."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Thread-safe circuit breaker with automatic recovery."""

    def __init__(
        self,
        name: str = "default",
        failure_threshold: int = 5,
        recovery_timeout: int = 30,
        success_threshold: int = 2,
        on_state_change: Callable[[str, str, str], None] | None = None,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = max(1, recovery_timeout)  # Minimum 1s to prevent oscillation
        self.success_threshold = success_threshold
        self._on_state_change = on_state_change
        self._lock = threading.RLock()  # Reentrant lock for nested calls
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: float | None = None
        self._total_calls = 0
        self._total_failures = 0
        self._total_rejected = 0
        self._half_open_semaphore = threading.Semaphore(1)  # Limit concurrent HALF_OPEN probes
        self._async_lock: asyncio.Lock | None = None  # Created lazily in async_call()

    @property
    def state(self) -> CircuitState:
        """Get current state, checking for recovery timeout."""
        state_change_callback = None
        with self._lock:
            if self._state == CircuitState.OPEN and self._last_failure_time:
                elapsed = time.time() - self._last_failure_time
                if elapsed >= self.recovery_timeout:
                    old_state = self._state.value
                    self._state = CircuitState.HALF_OPEN
                    self._success_count = 0
                    logger.info(
                        "Circuit breaker '%s' transitioning to HALF_OPEN",
                        self.name,
                    )
                    if self._on_state_change:
                        state_change_callback = (old_state, "half_open")
            current = self._state
        # Call callback outside lock to prevent blocking
        if state_change_callback:
            try:
                self._on_state_change(self.name, state_change_callback[0], state_change_callback[1])
            except Exception:
                logger.exception("on_state_change callback failed during HALF_OPEN transition")
        return current

    def call(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        """Execute function through circuit breaker."""
        with self._lock:
            self._total_calls += 1
            current_state = self.state

            if current_state == CircuitState.OPEN:
                self._total_rejected += 1
                raise CircuitBreakerOpenError(
                    f"Circuit breaker '{self.name}' is OPEN. Retry after {self.recovery_timeout}s."
                )

            # In HALF_OPEN, limit concurrent probe calls (check under lock to prevent TOCTOU)
            if current_state == CircuitState.HALF_OPEN and not self._half_open_semaphore.acquire(blocking=False):
                self._total_rejected += 1
                raise CircuitBreakerOpenError(f"Circuit breaker '{self.name}' is HALF_OPEN. Probe already in progress.")

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise

    async def async_call(self, func: Callable[..., Awaitable[Any]], *args: Any, **kwargs: Any) -> Any:
        """Execute async function through circuit breaker."""
        # Create lock lazily in the current event loop to avoid loop-binding issues
        if self._async_lock is None:
            self._async_lock = asyncio.Lock()
        async with self._async_lock:
            self._total_calls += 1
            current_state = self.state

            if current_state == CircuitState.OPEN:
                self._total_rejected += 1
                raise CircuitBreakerOpenError(
                    f"Circuit breaker '{self.name}' is OPEN. Retry after {self.recovery_timeout}s."
                )

            if current_state == CircuitState.HALF_OPEN and not self._half_open_semaphore.acquire(blocking=False):
                self._total_rejected += 1
                raise CircuitBreakerOpenError(f"Circuit breaker '{self.name}' is HALF_OPEN. Probe already in progress.")

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise

    def _on_success(self) -> None:
        """Handle successful call."""
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._half_open_semaphore.release()
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    old_state = self._state.value
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    logger.info(
                        "Circuit breaker '%s' recovered to CLOSED",
                        self.name,
                    )
                    if self._on_state_change:
                        try:
                            self._on_state_change(self.name, old_state, "closed")
                        except Exception:
                            logger.exception("on_state_change callback failed during CLOSED transition")
            else:
                self._failure_count = 0

    def _on_failure(self) -> None:
        """Handle failed call."""
        with self._lock:
            if self._state == CircuitState.HALF_OPEN:
                self._half_open_semaphore.release()
            self._failure_count += 1
            self._total_failures += 1
            self._last_failure_time = time.time()

            if self._failure_count >= self.failure_threshold:
                old_state = self._state.value
                self._state = CircuitState.OPEN
                logger.warning(
                    "Circuit breaker '%s' opened after %d failures",
                    self.name,
                    self._failure_count,
                )
                if self._on_state_change:
                    try:
                        self._on_state_change(self.name, old_state, "open")
                    except Exception:
                        logger.exception("on_state_change callback failed during OPEN transition")

    def get_stats(self) -> dict[str, Any]:
        """Return circuit breaker statistics."""
        with self._lock:
            return {
                "name": self.name,
                "state": self.state.value,
                "failure_count": self._failure_count,
                "failure_threshold": self.failure_threshold,
                "total_calls": self._total_calls,
                "total_failures": self._total_failures,
                "total_rejected": self._total_rejected,
                "recovery_timeout": self.recovery_timeout,
            }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is open."""

    pass
