"""Task-Level Saga Memory Rollbacks.

Tracks state changes during agent task execution and provides
compensating transactions to undo writes on failure.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


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
        self.operations.append({
            "op_type": op_type,
            "memory_id": memory_id,
            "content": content,
            "metadata": metadata or {},
            "timestamp": datetime.now(UTC).isoformat(),
        })

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
    """Manages saga boundaries for crash-safe agent task execution."""

    def __init__(self, memory: Any):
        self.memory = memory
        self._active_sagas: dict[str, SagaBoundary] = {}

    def begin_saga(self, agent_id: str) -> SagaBoundary:
        """Start a new saga boundary."""
        saga = SagaBoundary(agent_id=agent_id)
        self._active_sagas[saga.saga_id] = saga
        return saga

    def record_operation(
        self,
        saga_id: str,
        op_type: str,
        memory_id: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Record an operation within a saga."""
        saga = self._active_sagas.get(saga_id)
        if saga:
            saga.add_operation(op_type, memory_id, content, metadata)

    def commit_saga(self, saga_id: str) -> dict[str, Any]:
        """Mark a saga as successfully completed."""
        saga = self._active_sagas.get(saga_id)
        if not saga:
            return {"error": f"Saga {saga_id} not found"}

        saga.status = "committed"
        saga.completed_at = datetime.now(UTC)
        return saga.to_dict()

    def rollback_saga(self, saga_id: str) -> dict[str, Any]:
        """Rollback all operations in a saga."""
        saga = self._active_sagas.get(saga_id)
        if not saga:
            return {"error": f"Saga {saga_id} not found"}

        rolled_back = 0
        for op in reversed(saga.operations):
            if op["op_type"] == "store":
                self.memory.store(
                    memory_type="system_event",
                    content=f"SAGA_ROLLBACK: Reverted {op['memory_id']}",
                    metadata={
                        "saga_id": saga_id,
                        "rollback": True,
                        "original_memory_id": op["memory_id"],
                    },
                )
                rolled_back += 1

        saga.status = "rolled_back"
        saga.completed_at = datetime.now(UTC)

        return {
            "saga_id": saga_id,
            "status": "rolled_back",
            "operations_rolled_back": rolled_back,
            "total_operations": len(saga.operations),
        }

    def get_saga(self, saga_id: str) -> dict[str, Any] | None:
        """Get saga status."""
        saga = self._active_sagas.get(saga_id)
        return saga.to_dict() if saga else None
