from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any


class MemoryRecord:
    def __init__(
        self,
        memory_id: str | None = None,
        agent_id: str = "",
        memory_type: str = "fact",
        content: str = "",
        embedding: list[float] | None = None,
        metadata: dict[str, Any] | None = None,
        previous_hash: str | None = None,
        cryptographic_hash: str = "",
        created_at: datetime | None = None,
        expires_at: datetime | None = None,
        access_count: int = 0,
    ):
        self.memory_id = memory_id or str(uuid.uuid4())
        self.agent_id = agent_id
        self.memory_type = memory_type
        self.content = content
        self.embedding = embedding or []
        self.metadata = metadata or {}
        self.previous_hash = previous_hash
        self.cryptographic_hash = cryptographic_hash
        self.created_at = created_at or datetime.now(timezone.utc)
        self.expires_at = expires_at
        self.access_count = access_count

    @classmethod
    def from_row(cls, row: tuple) -> MemoryRecord:
        return cls(
            memory_id=str(row[0]),
            agent_id=str(row[1]),
            memory_type=str(row[2]),
            content=str(row[3]),
            embedding=list(row[4]) if row[4] else [],
            metadata=dict(row[5]) if row[5] else {},
            previous_hash=str(row[6]) if row[6] else None,
            cryptographic_hash=str(row[7]),
            created_at=row[8],
            expires_at=row[9],
            access_count=int(row[10]) if row[10] else 0,
        )

    @classmethod
    def from_dict(cls, d: dict) -> MemoryRecord:
        created_at = d["created_at"]
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at)
        expires_at = d.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        return cls(
            memory_id=d["memory_id"],
            agent_id=d["agent_id"],
            memory_type=d["memory_type"],
            content=d["content"],
            embedding=list(d["embedding"]) if d["embedding"] else [],
            metadata=dict(d["metadata"]) if d["metadata"] else {},
            previous_hash=d.get("previous_hash"),
            cryptographic_hash=d["cryptographic_hash"],
            created_at=created_at,
            expires_at=expires_at,
            access_count=d.get("access_count", 0),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "agent_id": self.agent_id,
            "memory_type": self.memory_type,
            "content": self.content,
            "embedding": self.embedding,
            "metadata": self.metadata,
            "previous_hash": self.previous_hash,
            "cryptographic_hash": self.cryptographic_hash,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "access_count": self.access_count,
        }

    def __repr__(self) -> str:
        preview = self.content[:50]
        return f"MemoryRecord(agent={self.agent_id}, type={self.memory_type}, content={preview}...)"


class CheckpointState:
    def __init__(
        self,
        workflow_id: str | None = None,
        agent_id: str = "",
        step_number: int = 0,
        step_type: str = "",
        input_data: dict[str, Any] | None = None,
        output_data: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
        token_cost: float | None = None,
        status: str = "pending",
        health_score: float | None = None,
        created_at: datetime | None = None,
        completed_at: datetime | None = None,
        region: str | None = None,
    ):
        self.workflow_id = workflow_id or str(uuid.uuid4())
        self.agent_id = agent_id
        self.step_number = step_number
        self.step_type = step_type
        self.input_data = input_data or {}
        self.output_data = output_data or {}
        self.idempotency_key = idempotency_key
        self.token_cost = token_cost
        self.status = status
        self.health_score = health_score
        self.created_at = created_at or datetime.now(timezone.utc)
        self.completed_at = completed_at
        self.region = region

    def to_dict(self) -> dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "agent_id": self.agent_id,
            "step_number": self.step_number,
            "step_type": self.step_type,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "idempotency_key": self.idempotency_key,
            "token_cost": self.token_cost,
            "status": self.status,
            "health_score": self.health_score,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "region": self.region,
        }


class AuditEntry:
    def __init__(
        self,
        audit_id: str | None = None,
        agent_id: str = "",
        workflow_id: str = "",
        action: str = "",
        details: dict[str, Any] | None = None,
        recorded_at: datetime | None = None,
    ):
        self.audit_id = audit_id or str(uuid.uuid4())
        self.agent_id = agent_id
        self.workflow_id = workflow_id
        self.action = action
        self.details = details or {}
        self.recorded_at = recorded_at or datetime.now(timezone.utc)

    def to_dict(self) -> dict[str, Any]:
        return {
            "audit_id": self.audit_id,
            "agent_id": self.agent_id,
            "workflow_id": self.workflow_id,
            "action": self.action,
            "details": self.details,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }


class ClusterInfo:
    def __init__(
        self,
        cluster_id: str = "",
        connection_string: str = "",
        admin_url: str = "",
        region: str = "us-east1",
        status: str = "created",
    ):
        self.cluster_id = cluster_id
        self.connection_string = connection_string
        self.admin_url = admin_url
        self.region = region
        self.status = status

    def to_dict(self) -> dict[str, Any]:
        return {
            "cluster_id": self.cluster_id,
            "connection_string": self.connection_string,
            "admin_url": self.admin_url,
            "region": self.region,
            "status": self.status,
        }


class CoordinationLock:
    def __init__(
        self,
        lock_id: str | None = None,
        agent_id: str = "",
        resource: str = "",
        lock_type: str = "shared",
        acquired_at: datetime | None = None,
        expires_at: datetime | None = None,
        payload: dict[str, Any] | None = None,
    ):
        self.lock_id = lock_id or str(uuid.uuid4())
        self.agent_id = agent_id
        self.resource = resource
        self.lock_type = lock_type
        self.acquired_at = acquired_at or datetime.now(timezone.utc)
        self.expires_at = expires_at
        self.payload = payload or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "lock_id": self.lock_id,
            "agent_id": self.agent_id,
            "resource": self.resource,
            "lock_type": self.lock_type,
            "acquired_at": self.acquired_at.isoformat() if self.acquired_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "payload": self.payload,
        }
