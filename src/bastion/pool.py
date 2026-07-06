"""Connection Pool Manager.

Manages a pool of database connections for high-throughput scenarios.
Prevents connection exhaustion under concurrent agent workloads.
"""

from __future__ import annotations

import contextlib
import logging
import threading
import time
from collections import deque
from typing import Any

logger = logging.getLogger(__name__)


class ConnectionPool:
    """Thread-safe connection pool with health checks and idle reaping."""

    def __init__(
        self,
        connection_string: str,
        min_size: int = 2,
        max_size: int = 10,
        max_idle_seconds: int = 300,
    ):
        if max_size < min_size:
            raise ValueError("max_size must be >= min_size")
        if max_size <= 0:
            raise ValueError("max_size must be > 0")

        self.connection_string = connection_string
        self.min_size = min_size
        self.max_size = max_size
        self.max_idle_seconds = max_idle_seconds
        self._pool: deque[tuple[Any, float]] = deque()  # (conn, last_used_time)
        self._lock = threading.Lock()
        self._total_created = 0
        self._total_reused = 0
        self._total_expired = 0
        self._total_rejected = 0
        self._reaper_thread: threading.Thread | None = None
        self._stop_reaper = threading.Event()

        if max_idle_seconds > 0:
            self._start_reaper()

    def _start_reaper(self) -> None:
        """Start background reaper for idle connections."""
        def reaper():
            while not self._stop_reaper.is_set():
                self._stop_reaper.wait(timeout=self.max_idle_seconds / 2)
                self._reap_idle_connections()

        self._reaper_thread = threading.Thread(target=reaper, daemon=True)
        self._reaper_thread.start()

    def _reap_idle_connections(self) -> None:
        """Close connections that have been idle too long."""
        now = time.time()
        with self._lock:
            while self._pool:
                conn, last_used = self._pool[0]
                if now - last_used > self.max_idle_seconds:
                    self._pool.popleft()
                    with contextlib.suppress(Exception):
                        conn.close()
                    self._total_expired += 1
                    self._total_created -= 1
                else:
                    break

    def _create_connection(self) -> Any:
        """Create a new database connection."""
        import psycopg
        conn = psycopg.connect(self.connection_string)
        return conn

    def _is_healthy(self, conn: Any) -> bool:
        """Check if connection is alive."""
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            return True
        except Exception:
            return False

    def acquire(self, timeout: float = 30.0) -> Any:
        """Acquire a connection from the pool.
        
        Args:
            timeout: Maximum seconds to wait for a connection.
            
        Returns:
            A database connection.
            
        Raises:
            ConnectionPoolExhaustedError: If no connection available within timeout.
        """
        deadline = time.time() + timeout

        while True:
            conn_to_check = None
            with self._lock:
                while self._pool:
                    conn_to_check, _ = self._pool.popleft()
                    break

            if conn_to_check is not None:
                if self._is_healthy(conn_to_check):
                    with self._lock:
                        self._total_reused += 1
                    return conn_to_check
                else:
                    with contextlib.suppress(Exception):
                        conn_to_check.close()
                    with self._lock:
                        self._total_expired += 1
                    conn_to_check = None
                    continue

            create_conn = False
            with self._lock:
                if self._total_created < self.max_size:
                    create_conn = True

            if create_conn:
                try:
                    conn = self._create_connection()
                    with self._lock:
                        self._total_created += 1
                    return conn
                except Exception:
                    logger.warning("Failed to create connection")
                    raise

            if time.time() >= deadline:
                with self._lock:
                    self._total_rejected += 1
                raise ConnectionPoolExhaustedError(
                    f"Connection pool exhausted after {timeout}s"
                )

            time.sleep(0.01)

    def release(self, conn: Any) -> None:
        """Release a connection back to the pool."""
        with self._lock:
            if len(self._pool) < self.max_size:
                self._pool.append((conn, time.time()))
            else:
                with contextlib.suppress(Exception):
                    conn.close()

    def get_stats(self) -> dict[str, Any]:
        """Return pool statistics."""
        with self._lock:
            return {
                "pool_size": len(self._pool),
                "min_size": self.min_size,
                "max_size": self.max_size,
                "total_created": self._total_created,
                "total_reused": self._total_reused,
                "total_expired": self._total_expired,
                "reuse_rate": round(
                    self._total_reused / max(self._total_created + self._total_reused, 1) * 100, 2
                ),
            }

    def close_all(self) -> None:
        """Close all connections in the pool."""
        self._stop_reaper.set()
        with self._lock:
            while self._pool:
                conn, _ = self._pool.popleft()
                with contextlib.suppress(Exception):
                    conn.close()


class ConnectionPoolExhaustedError(Exception):
    """Raised when connection pool is exhausted."""
    pass
