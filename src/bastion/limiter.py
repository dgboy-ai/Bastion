"""Request Limiter.

Distributed rate limiter using CockroachDB row-lock slots.
Falls back to local ``threading.Semaphore`` in BASTION_MOCK mode.
"""

from __future__ import annotations

import contextlib
import os
import random
import threading
import time
import uuid
from typing import Any

from bastion.log_setup import get_logger
from bastion.pool import ConnectionPool

logger = get_logger(__name__)


class RequestLimiter:
    """Limits concurrent requests across process/instance boundaries.

    Each slot is a row in the ``agent_limiter`` table.  Instances race to
    ``SELECT FOR UPDATE`` an available (or TTL-expired) slot during
    ``acquire()``, ensuring a hard global cap regardless of how many
    Vercel / serverless replicas are running.

    In ``BASTION_MOCK`` mode the limiter falls back to a local
    ``threading.Semaphore`` so developers can test concurrency logic
    without a live CockroachDB.
    """

    def __init__(
        self,
        max_concurrent: int = 10,
        max_queue: int = 100,
        timeout_seconds: int = 30,
        instance_id: str | None = None,
    ):
        if max_concurrent < 1:
            raise ValueError("max_concurrent must be >= 1")
        if max_queue < 0:
            raise ValueError("max_queue must be >= 0")
        if timeout_seconds < 0:
            raise ValueError("timeout_seconds must be >= 0")
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue
        self.timeout_seconds = timeout_seconds
        self._instance_id = instance_id or uuid.uuid4().hex[:16]
        self._held_slots: list[int] = []
        self._queue_count = 0
        self._active_count = 0
        self._total_requests = 0
        self._total_rejected = 0
        self._total_timeout = 0
        self._lock = threading.Lock()
        self._pending_releases: list[int] = []

        is_mock = os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")

        if is_mock:
            self._mock_mode = True
            self._semaphore = threading.Semaphore(max_concurrent)
            logger.info(
                "RequestLimiter running in MOCK mode (threading.Semaphore)",
                extra={"max_concurrent": max_concurrent},
            )
        else:
            self._mock_mode = False
            conn_str = os.environ.get("BASTION_CONN", "")
            if not conn_str:
                from bastion.config import get_settings

                conn_str = get_settings().connection_string
            self._pool = ConnectionPool(
                connection_string=conn_str,
                min_size=2,
                max_size=10,
                max_idle_seconds=timeout_seconds * 2,
            )
            conn = self._pool.acquire(timeout=10)
            try:
                self._bootstrap_table(conn)
            finally:
                self._pool.release(conn)
            logger.info(
                "RequestLimiter running in DISTRIBUTED mode (CRDB row-lock slots)",
                extra={
                    "max_concurrent": max_concurrent,
                    "instance_id": self._instance_id,
                },
            )

    def _bootstrap_table(self, conn: Any) -> None:
        """Create the ``agent_limiter`` table and pre-populate slot rows."""
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS agent_limiter (
                    slot_id      INT PRIMARY KEY,
                    instance_id  VARCHAR(128),
                    acquired_at  TIMESTAMPTZ
                )
            """)
            # Remove excess slots if max_concurrent was reduced
            cur.execute(
                "DELETE FROM agent_limiter WHERE slot_id > %s",
                (self.max_concurrent,),
            )
            for slot_id in range(1, self.max_concurrent + 1):
                cur.execute(
                    "INSERT INTO agent_limiter (slot_id, instance_id, acquired_at) "
                    "SELECT %s, NULL, NULL "
                    "WHERE NOT EXISTS ("
                    "  SELECT 1 FROM agent_limiter WHERE slot_id = %s"
                    ")",
                    (slot_id, slot_id),
                )
        conn.commit()

    # ------------------------------------------------------------------
    # acquire / release
    # ------------------------------------------------------------------

    def acquire(self, timeout: float | None = None) -> bool:
        """Acquire a request slot.

        Returns ``True`` if a slot was obtained, ``False`` if the queue
        is full or no slot became available before the deadline.
        """
        with self._lock:
            self._total_requests += 1
            if self._queue_count >= self.max_queue:
                self._total_rejected += 1
                logger.warning("Request rejected: queue full (%d)", self._queue_count)
                return False
            self._queue_count += 1

        if self._mock_mode:
            return self._mock_acquire(timeout)

        try:
            return self._db_acquire(timeout)
        except Exception:
            with self._lock:
                self._queue_count = max(0, self._queue_count - 1)
            raise

    def release(self) -> None:
        """Release a previously acquired slot.

        Safe to call even if no slot is held (no-op in that case).
        """
        if self._mock_mode:
            self._mock_release()
        else:
            self._db_release()

    # ------------------------------------------------------------------
    # mock-mode helpers
    # ------------------------------------------------------------------

    def _mock_acquire(self, timeout: float | None = None) -> bool:
        effective_timeout = self.timeout_seconds if timeout is None else timeout
        acquired = self._semaphore.acquire(timeout=effective_timeout)
        with self._lock:
            self._queue_count -= 1
            if acquired:
                self._active_count += 1
            else:
                self._total_timeout += 1
        return acquired

    def _mock_release(self) -> None:
        with self._lock:
            if self._active_count <= 0:
                return
            self._active_count -= 1
        self._semaphore.release()

    # ------------------------------------------------------------------
    # distributed-mode helpers
    # ------------------------------------------------------------------

    def _db_acquire(self, timeout: float | None = None) -> bool:
        effective_timeout = self.timeout_seconds if timeout is None else timeout
        deadline = time.time() + effective_timeout
        backoff = 0.02

        while time.time() < deadline:
            remaining = max(0.1, deadline - time.time())
            conn = self._pool.acquire(timeout=remaining)
            try:
                self._drain_pending_with_conn(conn)
                with conn.cursor() as cur:
                    # Step 1: Find and lock an available slot
                    cur.execute(
                        """
                        SELECT slot_id FROM agent_limiter
                        WHERE instance_id IS NULL
                           OR acquired_at < NOW() - CAST(%s AS INTERVAL)
                        ORDER BY slot_id
                        LIMIT 1
                        FOR UPDATE
                        """,
                        (f"{self.timeout_seconds} seconds",),
                    )
                    row = cur.fetchone()
                    if row is None:
                        conn.rollback()
                    else:
                        slot_id = row[0]
                        # Step 2: Update the locked slot
                        cur.execute(
                            "UPDATE agent_limiter SET instance_id = %s, acquired_at = NOW() WHERE slot_id = %s",
                            (self._instance_id, slot_id),
                        )
                        conn.commit()
                        with self._lock:
                            self._held_slots.append(slot_id)
                            self._active_count += 1
                            self._queue_count -= 1
                        return True
            except Exception:
                logger.warning("DB error during acquire, retrying", exc_info=True)
                conn.rollback()
            finally:
                self._pool.release(conn)

            jitter = 1 + random.random() * 0.5
            time.sleep(backoff * jitter)
            backoff = min(backoff * 1.5, 0.5)

        with self._lock:
            self._queue_count = max(0, self._queue_count - 1)
            self._total_timeout += 1
        logger.warning("Request timed out after %.1fs", effective_timeout)
        return False

    def _drain_pending_with_conn(self, conn: Any) -> None:
        with self._lock:
            if not self._pending_releases:
                return
            to_release = list(self._pending_releases)

        released_slots = []
        try:
            with conn.cursor() as cur:
                for slot in to_release:
                    cur.execute(
                        "UPDATE agent_limiter "
                        "SET instance_id = NULL, acquired_at = NULL "
                        "WHERE slot_id = %s AND instance_id = %s",
                        (slot, self._instance_id),
                    )
                    released_slots.append(slot)
            conn.commit()
        except Exception:
            logger.warning("DB error during inline release of slots: %s", to_release, exc_info=True)
            with contextlib.suppress(Exception):
                conn.rollback()

        with self._lock:
            self._pending_releases = [s for s in self._pending_releases if s not in released_slots]

    def _db_release(self) -> None:
        slot_id = None
        with self._lock:
            if not self._held_slots:
                return
            slot_id = self._held_slots.pop()
            self._active_count = max(0, self._active_count - 1)
            self._pending_releases.append(slot_id)

        # Use a fresh connection for release to avoid competing with acquires
        # Acquire with short timeout, but don't fail hard - store for background drain
        conn = None
        try:
            conn = self._pool.acquire(timeout=2)
            try:
                self._drain_pending_with_conn(conn)
            finally:
                if conn:
                    self._pool.release(conn)
        except Exception:
            logger.warning("Pool unavailable during release, slot %d stored for background release", slot_id)
            if conn:
                try:
                    self._pool.release(conn)
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # stats
    # ------------------------------------------------------------------

    def _count_occupied_slots(self) -> int:
        conn = self._pool.acquire(timeout=5)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM agent_limiter WHERE instance_id IS NOT NULL")
                row = cur.fetchone()
                return int(row[0]) if row else 0
        except Exception as exc:
            logger.warning("Failed to count occupied slots: %s", exc)
            return 0
        finally:
            self._pool.release(conn)

    def get_stats(self) -> dict[str, Any]:
        """Return a snapshot of current limiter state."""
        with self._lock:
            stats: dict[str, Any] = {
                "max_concurrent": self.max_concurrent,
                "max_queue": self.max_queue,
                "timeout_seconds": self.timeout_seconds,
                "instance_id": self._instance_id,
                "active_requests": self._active_count,
                "queue_depth": self._queue_count,
                "total_requests": self._total_requests,
                "total_rejected": self._total_rejected,
                "total_timeout": self._total_timeout,
                "distributed": not self._mock_mode,
            }

        if not self._mock_mode:
            occupied = self._count_occupied_slots()
            stats["occupied_slots"] = occupied
            stats["utilization"] = round(occupied / max(self.max_concurrent, 1) * 100, 2)
        else:
            stats["utilization"] = round(self._active_count / max(self.max_concurrent, 1) * 100, 2)
        return stats

    # ------------------------------------------------------------------
    # lifecycle
    # ------------------------------------------------------------------

    def close(self) -> None:
        """Close the underlying connection pool.

        Once called the limiter must not be used again.
        """
        if not self._mock_mode and self._pool is not None:
            self._pool.close_all()

    # ------------------------------------------------------------------
    # context manager
    # ------------------------------------------------------------------

    def __enter__(self) -> RequestLimiter:
        if not self.acquire():
            raise RuntimeError("Could not acquire request slot")
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self.release()
