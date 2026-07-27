"""Task-Level Saga Memory Rollbacks.

Tracks state changes during agent task execution and provides
compensating transactions to undo writes on failure.
"""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class SagaBoundary:
    """Tracks a group of related memory operations for rollback."""

    def __init__(self, saga_id: str | None = None, agent_id: str = ""):
        self.saga_id = saga_id or str(uuid.uuid4())
        self.agent_id = agent_id
        self.operations: list[dict[str, Any]] = []
        self.status = "active"
        self.created_at = datetime.now(UTC)
        self.completed_at: datetime | None = None

    def add_operation(
        self,
        op_type: str,
        memory_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.operations.append(
            {
                "op_type": op_type,
                "memory_id": memory_id,
                "content": content,
                "metadata": metadata or {},
                "timestamp": datetime.now(UTC).isoformat(),
            }
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "saga_id": self.saga_id,
            "agent_id": self.agent_id,
            "status": self.status,
            "operations": self.operations,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }


class SagaMemoryManager:
    """Manages saga boundaries for crash-safe agent task execution.

    Persists saga state to CockroachDB for crash recovery.
    Falls back to in-memory dict in mock mode.
    """

    def __init__(self, memory: Any):
        self.memory = memory
        self._lock = threading.Lock()
        self._active_sagas: dict[str, SagaBoundary] = {}
        self._table_checked = False

    def _ensure_table(self) -> None:
        if self._table_checked:
            return
        if self.memory._mock:
            self._table_checked = True
            return
        pool = self.memory.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS saga_states (
                        saga_id      UUID PRIMARY KEY,
                        agent_id     VARCHAR(128) NOT NULL,
                        status       VARCHAR(32) NOT NULL DEFAULT 'active',
                        operations   JSONB NOT NULL DEFAULT '[]'::JSONB,
                        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
                        completed_at TIMESTAMPTZ
                    )
                """)
            conn.commit()
            self._table_checked = True
        finally:
            pool.release(conn)

    def begin_saga(self, agent_id: str) -> SagaBoundary:
        """Start a new saga boundary and persist to database."""
        saga = SagaBoundary(agent_id=agent_id)
        self._ensure_table()

        if not self.memory._mock:
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO saga_states (saga_id, agent_id, status, operations) "
                        "VALUES (%s, %s, 'active', '[]'::JSONB)",
                        (saga.saga_id, agent_id),
                    )
                conn.commit()
            except Exception:
                logger.exception("Failed to persist saga begin for %s", saga.saga_id)
                raise
            finally:
                pool.release(conn)
        else:
            with self._lock:
                self._active_sagas[saga.saga_id] = saga

        self.memory.store(
            memory_type="system_event",
            content=f"SAGA_BEGIN: {saga.saga_id}",
            metadata={"saga_id": saga.saga_id, "agent_id": agent_id, "event": "begin"},
        )
        return saga

    def record_operation(
        self,
        saga_id: str,
        op_type: str,
        memory_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Record an operation within a saga.

        Raises ValueError if saga not found.
        """
        op = {
            "op_type": op_type,
            "memory_id": memory_id,
            "content": content,
            "metadata": metadata or {},
            "timestamp": datetime.now(UTC).isoformat(),
        }

        if not self.memory._mock:
            self._ensure_table()
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE saga_states SET operations = operations || %s::JSONB WHERE saga_id = %s",
                        (json.dumps([op]), saga_id),
                    )
                    if cur.rowcount == 0:
                        raise ValueError(f"Saga {saga_id} not found")
                conn.commit()
            finally:
                pool.release(conn)
        else:
            with self._lock:
                saga = self._active_sagas.get(saga_id)
                if not saga:
                    raise ValueError(f"Saga {saga_id} not found")
            saga.add_operation(op_type, memory_id, content, metadata)

    def commit_saga(self, saga_id: str) -> dict[str, Any]:
        """Mark a saga as successfully completed and persist.

        Raises ValueError if saga not found.
        """
        if not self.memory._mock:
            self._ensure_table()
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE saga_states SET status = 'committed', completed_at = now() "
                        "WHERE saga_id = %s AND status = 'active'",
                        (saga_id,),
                    )
                    if cur.rowcount == 0:
                        raise ValueError(f"Saga {saga_id} not found or already completed")
                    cur.execute(
                        "SELECT saga_id, agent_id, status, operations, created_at, completed_at "
                        "FROM saga_states WHERE saga_id = %s",
                        (saga_id,),
                    )
                    row = cur.fetchone()
                conn.commit()

                result = self._row_to_dict(row) if row else {"saga_id": saga_id, "status": "committed"}
                self.memory.store(
                    memory_type="system_event",
                    content=f"SAGA_COMMIT: {saga_id}",
                    metadata={
                        "saga_id": saga_id,
                        "event": "commit",
                        "operations": len(result.get("operations", [])),
                    },
                )
                return result
            finally:
                pool.release(conn)
        else:
            with self._lock:
                saga = self._active_sagas.get(saga_id)
                if not saga:
                    raise ValueError(f"Saga {saga_id} not found")
                saga.status = "committed"
                saga.completed_at = datetime.now(UTC)
                result = saga.to_dict()
                del self._active_sagas[saga_id]

            self.memory.store(
                memory_type="system_event",
                content=f"SAGA_COMMIT: {saga_id}",
                metadata={
                    "saga_id": saga_id,
                    "event": "commit",
                    "operations": len(result.get("operations", [])),
                },
            )
            return result

    def rollback_saga(self, saga_id: str) -> dict[str, Any]:
        """Rollback all operations in a saga and persist.

        Raises ValueError if saga not found.
        """
        operations: list[dict[str, Any]] = []

        if not self.memory._mock:
            self._ensure_table()
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT operations FROM saga_states WHERE saga_id = %s AND status = 'active' FOR UPDATE",
                        (saga_id,),
                    )
                    row = cur.fetchone()
                    if not row:
                        raise ValueError(f"Saga {saga_id} not found or already completed")

                    raw_ops = row[0] if hasattr(row, "_mapping") else row[0]
                    if isinstance(raw_ops, str):
                        operations = json.loads(raw_ops)
                    else:
                        operations = list(raw_ops) if raw_ops else []

                    rolled_back = 0
                    for op in reversed(operations):
                        if op["op_type"] == "store":
                            mid = op.get("memory_id")
                            if mid:
                                cur.execute(
                                    "DELETE FROM agent_memory WHERE memory_id = %s AND agent_id = %s",
                                    (mid, self.memory.agent_id),
                                )
                                rolled_back += cur.rowcount
                    cur.execute(
                        "UPDATE saga_states SET status = 'rolled_back', completed_at = now() "
                        "WHERE saga_id = %s AND status = 'active'",
                        (saga_id,),
                    )
                    if cur.rowcount == 0:
                        raise ValueError(f"Saga {saga_id} not found or already completed")
                conn.commit()
            finally:
                pool.release(conn)
        else:
            with self._lock:
                saga = self._active_sagas.get(saga_id)
                if not saga:
                    raise ValueError(f"Saga {saga_id} not found")
                operations = list(saga.operations)
                rolled_back = self._execute_rollback_ops(operations)
                saga.status = "rolled_back"
                saga.completed_at = datetime.now(UTC)
                del self._active_sagas[saga_id]

        return {
            "saga_id": saga_id,
            "status": "rolled_back",
            "operations_rolled_back": rolled_back,
            "total_operations": len(operations),
        }

    def _execute_rollback_ops(self, operations: list[dict[str, Any]]) -> int:
        rolled_back = 0
        for op in reversed(operations):
            if op["op_type"] == "store":
                mid = op.get("memory_id")
                if mid:
                    self.memory.delete_memory(mid)
                rolled_back += 1
        return rolled_back

    def get_saga(self, saga_id: str) -> dict[str, Any] | None:
        """Get saga status."""
        if not self.memory._mock:
            self._ensure_table()
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT saga_id, agent_id, status, operations, created_at, completed_at "
                        "FROM saga_states WHERE saga_id = %s",
                        (saga_id,),
                    )
                    row = cur.fetchone()
                return self._row_to_dict(row) if row else None
            finally:
                pool.release(conn)
        else:
            with self._lock:
                saga = self._active_sagas.get(saga_id)
            return saga.to_dict() if saga else None

    def recover_orphaned_sagas(self) -> int:
        """Mark stale active sagas as failed for crash recovery.

        Sagas stuck in 'active' status for more than 1 hour are considered
        orphaned (crash during execution) and marked as failed.
        Returns the number of recovered sagas.
        """
        if self.memory._mock:
            return 0
        self._ensure_table()
        pool = self.memory.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE saga_states SET status = 'failed', completed_at = now() "
                    "WHERE status = 'active' AND created_at < now() - INTERVAL '1 hour' "
                    "RETURNING saga_id",
                )
                recovered = [row[0] for row in cur.fetchall()]
            conn.commit()
            if recovered:
                logger.warning("Recovered %d orphaned sagas", len(recovered))
            return len(recovered)
        finally:
            pool.release(conn)

    @staticmethod
    def _row_to_dict(row: Any) -> dict[str, Any]:
        rm = (
            row._mapping
            if hasattr(row, "_mapping")
            else {
                "saga_id": row[0],
                "agent_id": row[1],
                "status": row[2],
                "operations": row[3],
                "created_at": row[4],
                "completed_at": row[5],
            }
        )
        raw_ops = rm["operations"]
        if isinstance(raw_ops, str):
            operations = json.loads(raw_ops)
        else:
            operations = list(raw_ops) if raw_ops else []
        return {
            "saga_id": str(rm["saga_id"]),
            "agent_id": str(rm["agent_id"]),
            "status": str(rm["status"]),
            "operations": operations,
            "created_at": rm["created_at"].isoformat()
            if hasattr(rm["created_at"], "isoformat")
            else str(rm["created_at"]),
            "completed_at": rm["completed_at"].isoformat()
            if hasattr(rm["completed_at"], "isoformat") and rm["completed_at"] is not None
            else None,
        }
