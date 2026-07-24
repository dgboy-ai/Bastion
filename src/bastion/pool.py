"""Connection Pool Manager.

Manages a pool of database connections for high-throughput scenarios.
Prevents connection exhaustion under concurrent agent workloads.
"""

from __future__ import annotations

import asyncio
import contextlib
import os
import threading
import time
from collections import deque
from typing import Any

try:
    import structlog
    structlog_logger = structlog.get_logger("bastion.pool")
except ImportError:
    structlog = None  # type: ignore[assignment]
    structlog_logger = None  # type: ignore[assignment]

from bastion.errors import BastionPoolExhaustedError
from bastion.log_setup import get_logger

logger = get_logger(__name__)


class ConnectionPool:
    """Thread-safe connection pool with health checks and idle reaping."""

    def __init__(
        self,
        connection_string: str,
        min_size: int = 2,
        max_size: int = 10,
        max_idle_seconds: int = 300,
        max_per_consumer: int = 0,
    ):
        if max_size < min_size:
            raise ValueError("max_size must be >= min_size")
        if max_size <= 0:
            raise ValueError("max_size must be > 0")
        # Per-consumer quota: 0 = no limit
        self._max_per_consumer = max_per_consumer
        self._consumer_counts: dict[str, int] = {}
        self._consumer_lock = threading.Lock()

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
        """Create a new database connection with statement timeout."""
        import psycopg
        # Add connect_timeout if not already in the connection string
        conn_str = self.connection_string
        if "connect_timeout" not in conn_str:
            sep = "&" if "?" in conn_str else "?"
            conn_str = f"{conn_str}{sep}connect_timeout=10"
        conn = psycopg.connect(conn_str)
        # Set statement timeout to prevent long-running queries from hanging
        try:
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = '30s'")
        except Exception:
            pass  # Some drivers/servers may not support this
        return conn

    def _is_healthy(self, conn: Any) -> bool:
        """Check if connection is alive."""
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            return True
        except Exception as exc:
            logger.warning("Connection health check failed: %s", exc)
            return False

    def acquire(self, timeout: float = 30.0) -> Any:
        """Acquire a connection from the pool.

        Args:
            timeout: Maximum seconds to wait for a connection.

        Returns:
            A database connection.

        Raises:
            BastionPoolExhaustedError: If no connection available within timeout.
        """
        deadline = time.time() + timeout

        while True:
            conn_to_check = None
            conn_last_used = 0.0
            with self._lock:
                while self._pool:
                    conn_to_check, conn_last_used = self._pool.popleft()
                    break

            if conn_to_check is not None:
                # Only run full health check if connection has been idle > threshold
                # Configurable via BASTION_POOL_IDLE_CHECK_SECONDS (default 30s)
                idle_threshold = int(os.environ.get("BASTION_POOL_IDLE_CHECK_SECONDS", "30"))
                idle_seconds = time.time() - conn_last_used
                if idle_seconds < idle_threshold or self._is_healthy(conn_to_check):
                    with self._lock:
                        self._total_reused += 1
                    return conn_to_check
                else:
                    with contextlib.suppress(Exception):
                        conn_to_check.close()
                    with self._lock:
                        self._total_expired += 1
                        if self._total_created > 0:
                            self._total_created -= 1
                    conn_to_check = None
                    continue

            create_conn = False
            with self._lock:
                if self._total_created < self.max_size:
                    self._total_created += 1  # reserve atomically
                    create_conn = True

            if create_conn:
                try:
                    conn = self._create_connection()
                    return conn
                except Exception:
                    with self._lock:
                        self._total_created -= 1  # rollback on failure
                    logger.warning("Failed to create connection")
                    raise

            if time.time() >= deadline:
                with self._lock:
                    self._total_rejected += 1
                raise BastionPoolExhaustedError(
                    f"Connection pool exhausted after {timeout}s"
                )

            time.sleep(0.01)

    def release(self, conn: Any) -> None:
        """Release a connection back to the pool.
        
        If RESET ALL fails or the connection is in an error state,
        the connection is closed instead of returned to the pool
        to prevent leaking stale session state.
        
        Tracks released connections to prevent double-release corruption.
        """
        # Guard against double-release — track which connections are in the pool
        with self._lock:
            if conn in [c for c, _ in self._pool]:
                logger.warning("Double-release detected for connection %s — discarding", id(conn))
                return

        reset_ok = False
        try:
            with conn.cursor() as cur:
                # Rollback any open transaction before resetting session state
                try:
                    cur.execute("ROLLBACK")
                except Exception:
                    pass  # No transaction open, that's fine
                cur.execute("RESET ALL")
            reset_ok = True
        except Exception:
            logger.debug("RESET ALL failed during release — discarding connection")

        # Check if connection is in error state
        is_healthy = True
        try:
            # Use public API where available; fall back to attribute check
            if hasattr(conn, 'is_closed') and callable(conn.is_closed):
                is_healthy = not conn.is_closed()
            elif hasattr(conn, 'closed'):
                is_healthy = not getattr(conn, 'closed', False)
            # If neither method available, assume healthy (will be caught on next use)
        except Exception:
            pass

        if not reset_ok or not is_healthy:
            # Discard connection to prevent leaking stale state
            with contextlib.suppress(Exception):
                conn.close()
            with self._lock:
                self._total_expired += 1
            return

        with self._lock:
            if len(self._pool) < self.max_size:
                self._pool.append((conn, time.time()))
            else:
                with contextlib.suppress(Exception):
                    conn.close()
                self._total_expired += 1

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


class AsyncConnectionPool:
    """Async connection pool using asyncpg.

    Wraps asyncpg connection pool with structured logging and stats.
    """

    def __init__(
        self,
        dsn: str,
        min_size: int = 2,
        max_size: int = 10,
        max_idle_seconds: int = 300,
        command_timeout: int = 30,
    ):
        self.dsn = dsn
        self.min_size = min_size
        self.max_size = max_size
        self.max_idle_seconds = max_idle_seconds
        self.command_timeout = command_timeout
        self._pool: Any = None
        self._total_acquired = 0
        self._total_released = 0

    async def start(self) -> None:
        import asyncpg
        self._pool = await asyncpg.create_pool(
            dsn=self.dsn,
            min_size=self.min_size,
            max_size=self.max_size,
            max_inactive_connection_lifetime=self.max_idle_seconds,
            command_timeout=self.command_timeout,
        )
        if structlog_logger is not None:
            structlog_logger.info("async_pool_started", min_size=self.min_size, max_size=self.max_size)

    async def acquire(self, timeout: float = 30.0) -> Any:  # noqa: ASYNC109
        if self._pool is None:
            raise BastionPoolExhaustedError("Pool not started. Call start() first.")
        conn = await asyncio.wait_for(self._pool.acquire(), timeout=timeout)
        self._total_acquired += 1
        return conn

    async def release(self, conn: Any) -> None:
        if self._pool is None:
            return
        reset_ok = False
        try:
            await conn.execute("RESET ALL")
            reset_ok = True
        except Exception:
            logger.debug("RESET ALL failed during async release — discarding connection")

        # Check if connection is closed
        is_healthy = True
        try:
            is_closed_val = getattr(conn, 'is_closed', None)
            closed_val = getattr(conn, 'closed', None)
            if is_closed_val is True or closed_val is True:
                is_healthy = False
        except Exception:
            pass

        if not reset_ok or not is_healthy:
            # Discard connection
            try:
                await conn.close()
            except Exception:
                pass
            return

        await self._pool.release(conn)
        self._total_released += 1

    async def close(self) -> None:
        if self._pool is None:
            return
        await self._pool.close()
        self._pool = None
        if structlog_logger is not None:
            structlog_logger.info("async_pool_closed")

    async def execute(self, query: str, *args: Any, timeout: float | None = None) -> Any:  # noqa: ASYNC109
        conn = await self.acquire(timeout=timeout or 30)
        try:
            return await conn.execute(query, *args)
        finally:
            await self.release(conn)

    async def fetch(self, query: str, *args: Any, timeout: float | None = None) -> list[Any]:  # noqa: ASYNC109
        conn = await self.acquire(timeout=timeout or 30)
        try:
            result: list[Any] = await conn.fetch(query, *args)
            return result
        finally:
            await self.release(conn)

    async def fetchrow(self, query: str, *args: Any, timeout: float | None = None) -> Any | None:  # noqa: ASYNC109
        conn = await self.acquire(timeout=timeout or 30)
        try:
            return await conn.fetchrow(query, *args)
        finally:
            await self.release(conn)

    async def fetchval(self, query: str, *args: Any, timeout: float | None = None) -> Any:  # noqa: ASYNC109
        conn = await self.acquire(timeout=timeout or 30)
        try:
            return await conn.fetchval(query, *args)
        finally:
            await self.release(conn)

    def get_stats(self) -> dict[str, Any]:
        return {
            "min_size": self.min_size,
            "max_size": self.max_size,
            "total_acquired": self._total_acquired,
            "total_released": self._total_released,
            "pool_open": self._pool is not None and not self._pool._closed,
        }
