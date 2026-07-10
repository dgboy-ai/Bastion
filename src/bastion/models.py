from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from pydantic import BaseModel, Field


class MemoryRecord(BaseModel):
    memory_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    memory_type: str = "fact"
    content: str = ""
    embedding: list[float] = []
    metadata: dict[str, Any] = {}
    previous_hash: str | None = None
    cryptographic_hash: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None
    access_count: int = 0
    importance_score: float = 5.0
    trust_level: int = 2
    source_provenance: str = "agent_direct"
    overwrite_count: int = 0
    is_pinned: bool = False
    pin_priority: int = 0

    @property
    def freshness_score(self) -> float:
        """1.0 = fresh, 0.0 = stale. Combines age + access frequency."""
        now = datetime.now(UTC)
        created = self.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        days_old = (now - created).days
        age_factor = math.exp(-0.01 * days_old)
        access_factor = min(self.access_count / 10, 1.0)
        return round((age_factor * 0.6) + (access_factor * 0.4), 4)

    @classmethod
    def from_dict(cls, d: dict) -> MemoryRecord:
        known = {k: v for k, v in d.items() if k in _MEMORY_FIELDS}
        created_at = known.get("created_at")
        if isinstance(created_at, str):
            known["created_at"] = datetime.fromisoformat(created_at)
        expires_at = known.get("expires_at")
        if isinstance(expires_at, str):
            known["expires_at"] = datetime.fromisoformat(expires_at)
        embedding = known.get("embedding")
        if isinstance(embedding, str):
            known["embedding"] = _parse_embedding(embedding)
        return cls(**known)

    @classmethod
    def from_row(cls, row: tuple | dict) -> MemoryRecord:
        if isinstance(row, dict):
            return cls(**row)
        if hasattr(row, "_mapping"):
            vals = row._mapping
        else:
            vals = dict(zip(_MEMORY_FIELDS, row, strict=True))
        raw_created = vals.get("created_at")
        return cls(
            memory_id=str(vals.get("memory_id", "")),
            agent_id=str(vals.get("agent_id", "")),
            memory_type=str(vals.get("memory_type", "fact")),
            content=str(vals.get("content", "")),
            embedding=_parse_embedding(vals.get("embedding")),
            metadata=dict(vals["metadata"]) if vals.get("metadata") else {},
            previous_hash=str(vals["previous_hash"]) if vals.get("previous_hash") is not None else None,
            cryptographic_hash=str(vals.get("cryptographic_hash", "")),
            created_at=_ensure_dt(raw_created),
            expires_at=vals.get("expires_at"),
            access_count=int(vals.get("access_count", 0)) if vals.get("access_count") is not None else 0,
            importance_score=float(vals.get("importance_score", 5.0))
            if vals.get("importance_score") is not None
            else 5.0,
            trust_level=int(vals.get("trust_level", 2)) if vals.get("trust_level") is not None else 2,
            source_provenance=str(vals.get("source_provenance", "agent_direct")),
            overwrite_count=int(vals.get("overwrite_count", 0)) if vals.get("overwrite_count") is not None else 0,
        )

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class CheckpointState(BaseModel):
    workflow_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    step_number: int = 0
    step_type: str = ""
    input_data: dict[str, Any] = {}
    output_data: dict[str, Any] = {}
    idempotency_key: str | None = None
    token_cost: float | None = None
    status: str = "pending"
    health_score: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None
    region: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class AuditEntry(BaseModel):
    audit_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    workflow_id: str = ""
    action: str = ""
    details: dict[str, Any] = {}
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class ClusterInfo(BaseModel):
    cluster_id: str = ""
    connection_string: str = ""
    admin_url: str = ""
    region: str = "us-east1"
    status: str = "created"

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class EntityRecord(BaseModel):
    entity_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    entity_type: str = "concept"
    name: str = ""
    attributes: dict[str, Any] = {}
    valid_from: datetime = Field(default_factory=lambda: datetime.now(UTC))
    valid_until: datetime | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def from_row(cls, row: tuple | dict) -> EntityRecord:
        if isinstance(row, dict):
            return cls(**row)
        if hasattr(row, "_mapping"):
            vals = row._mapping
        else:
            vals = dict(zip(_ENTITY_FIELDS, row, strict=True))
        return cls(
            entity_id=str(vals.get("entity_id", "")),
            agent_id=str(vals.get("agent_id", "")),
            entity_type=str(vals.get("entity_type", "concept")),
            name=str(vals.get("name", "")),
            attributes=dict(vals["attributes"]) if vals.get("attributes") else {},
            valid_from=_ensure_dt(vals.get("valid_from")),
            valid_until=vals.get("valid_until"),
            created_at=_ensure_dt(vals.get("created_at")),
        )

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class RelationRecord(BaseModel):
    relation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    source_entity_id: str = ""
    target_entity_id: str = ""
    relation_type: str = ""
    confidence: float = 1.0
    valid_from: datetime = Field(default_factory=lambda: datetime.now(UTC))
    valid_until: datetime | None = None
    source_memory_id: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class CoordinationLock(BaseModel):
    lock_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    resource: str = ""
    lock_type: str = "shared"
    acquired_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime | None = None
    payload: dict[str, Any] = {}

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class MessageRecord(BaseModel):
    message_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    namespace: str = ""
    sender_agent_id: str = ""
    event_type: str = ""
    payload: dict[str, Any] = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime = Field(default_factory=lambda: datetime.now(UTC) + timedelta(hours=1))
    read: bool = False

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


_MEMORY_FIELDS = list(MemoryRecord.model_fields.keys())

_ENTITY_FIELDS = [
    "entity_id", "agent_id", "entity_type", "name",
    "attributes", "valid_from", "valid_until", "created_at",
]


def _parse_embedding(raw: Any) -> list[float]:
    if raw is None:
        return []
    if isinstance(raw, str):
        import json
        return json.loads(raw)
    return list(raw)


def _ensure_dt(val: Any) -> datetime:
    if val is None:
        return datetime.now(UTC)
    if isinstance(val, str):
        return datetime.fromisoformat(val)
    return val
