from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from bastion.models import AuditEntry, CheckpointState, ClusterInfo, CoordinationLock, MemoryRecord

_agent_data: dict[str, list[dict[str, Any]]] = {}
_audit_log: list[dict[str, Any]] = []
_checkpoints: list[dict[str, Any]] = []
_coordination_locks: list[dict[str, Any]] = []


def _compute_hash(content: str, metadata: dict, previous_hash: str | None) -> str:
    raw = content + json.dumps(metadata, sort_keys=True) + (previous_hash or "")
    return hashlib.sha256(raw.encode()).hexdigest()


def mock_store_memory(
    agent_id: str,
    memory_type: str,
    content: str,
    metadata: dict[str, Any] | None = None,
    expires_in_seconds: int | None = None,
) -> MemoryRecord:
    if agent_id not in _agent_data:
        _agent_data[agent_id] = []

    records = _agent_data[agent_id]
    prev_hash = records[-1]["cryptographic_hash"] if records else None
    meta = metadata or {}
    crypto_hash = _compute_hash(content, meta, prev_hash)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expires_in_seconds) if expires_in_seconds else None

    record = MemoryRecord(
        memory_id=str(uuid.uuid4()),
        agent_id=agent_id,
        memory_type=memory_type,
        content=content,
        embedding=[0.0] * 1536,
        metadata=meta,
        previous_hash=prev_hash,
        cryptographic_hash=crypto_hash,
        created_at=now,
        expires_at=expires_at,
        access_count=0,
    )

    _agent_data[agent_id].append(record.to_dict())
    _audit_log.append({
        "audit_id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "workflow_id": str(uuid.uuid4()),
        "action": "memory_store",
        "details": {"memory_type": memory_type, "content_preview": content[:100]},
        "recorded_at": now.isoformat(),
    })

    return record


def mock_search_memory(
    agent_id: str,
    query: str,
    k: int = 5,
    threshold: float = 0.8,
    memory_type: str | None = None,
) -> list[MemoryRecord]:
    records = _agent_data.get(agent_id, [])
    if memory_type:
        records = [r for r in records if r["memory_type"] == memory_type]

    now = datetime.now(timezone.utc)
    valid = []
    for r in records:
        expires = r.get("expires_at")
        if expires and isinstance(expires, str):
            expires_dt = datetime.fromisoformat(expires)
            if expires_dt < now:
                continue
        valid.append(r)

    results = []
    for r in valid[-k:]:
        results.append(MemoryRecord.from_dict(r))

    return results


def mock_get_memory_at_time(agent_id: str, timestamp: str) -> list[MemoryRecord]:
    target = datetime.fromisoformat(timestamp)
    records = _agent_data.get(agent_id, [])
    results = []
    for r in records:
        created = r["created_at"]
        if isinstance(created, str):
            created = datetime.fromisoformat(created)
        if created <= target:
            results.append(MemoryRecord.from_dict(r))
    return results


def mock_get_audit(agent_id: str) -> list[AuditEntry]:
    entries = [e for e in _audit_log if e["agent_id"] == agent_id]
    result = []
    for e in entries:
        recorded_at = e["recorded_at"]
        if isinstance(recorded_at, str):
            recorded_at = datetime.fromisoformat(recorded_at)
        result.append(AuditEntry(
            audit_id=e["audit_id"],
            agent_id=e["agent_id"],
            workflow_id=e["workflow_id"],
            action=e["action"],
            details=e["details"],
            recorded_at=recorded_at,
        ))
    return result


def mock_heal(agent_id: str) -> dict[str, Any]:
    records = _agent_data.get(agent_id, [])
    before = len(records)

    now = datetime.now(timezone.utc)
    valid = []
    for r in records:
        expires = r.get("expires_at")
        if expires:
            expires_dt = datetime.fromisoformat(expires) if isinstance(expires, str) else expires
            if expires_dt < now:
                continue
        valid.append(r)

    _agent_data[agent_id] = valid
    after = len(valid)

    _audit_log.append({
        "audit_id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "workflow_id": str(uuid.uuid4()),
        "action": "heal",
        "details": {"records_before": before, "records_after": after, "pruned": before - after},
        "recorded_at": now.isoformat(),
    })

    return {
        "agent_id": agent_id, "records_before": before,
        "records_after": after, "pruned": before - after,
    }


def mock_resolve_conflict(fact_a: str, fact_b: str, context: str) -> str:
    return f"Merged: {fact_a} and {fact_b}"


def mock_provision_cluster(name: str, region: str = "us-east1", provider: str = "aws") -> ClusterInfo:  # noqa: ARG001
    return ClusterInfo(
        cluster_id=f"bastion-{name}-{uuid.uuid4().hex[:8]}",
        connection_string=(
            f"postgres://mock:{uuid.uuid4().hex}@{name}.cockroachlabs.cloud:26257/defaultdb"
            "?sslmode=verify-full"
        ),
        admin_url=f"https://cockroachlabs.cloud/cluster/{name}",
        region=region,
        status="created",
    )


def mock_store_checkpoint(
    agent_id: str,
    step_number: int,
    step_type: str,
    input_data: dict[str, Any] | None = None,
    output_data: dict[str, Any] | None = None,
) -> CheckpointState:
    cp = CheckpointState(
        workflow_id=str(uuid.uuid4()),
        agent_id=agent_id,
        step_number=step_number,
        step_type=step_type,
        input_data=input_data or {},
        output_data=output_data or {},
        status="completed",
    )
    _checkpoints.append(cp.to_dict())
    return cp


def mock_acquire_lock(agent_id: str, resource: str, lock_type: str = "shared") -> CoordinationLock:
    lock = CoordinationLock(
        agent_id=agent_id,
        resource=resource,
        lock_type=lock_type,
    )
    _coordination_locks.append(lock.to_dict())
    return lock


def mock_release_lock(resource: str, agent_id: str) -> bool:
    global _coordination_locks
    before = len(_coordination_locks)
    _coordination_locks = [
        lock for lock in _coordination_locks
        if not (lock["resource"] == resource and lock["agent_id"] == agent_id)
    ]
    return len(_coordination_locks) < before


def mock_query_with_cache(
    agent_id: str,
    query: str,
    llm_callback: Callable[[str], str],
    memory_type: str = "semantic_cache",
    threshold: float = 0.97,  # noqa: ARG001
) -> tuple[str, dict]:
    records = _agent_data.get(agent_id, [])
    for r in reversed(records):
        if r.get("memory_type") == memory_type and r.get("metadata", {}).get("query") == query:
            return r["content"], {"cache": "hit", "memory_id": r["memory_id"]}
    response = llm_callback(query)
    mock_store_memory(agent_id, memory_type, response, {"query": query})
    return response, {"cache": "miss"}


def mock_detect_anomalies(agent_id: str) -> list[dict]:
    alerts = []
    records = _agent_data.get(agent_id, [])
    contents = [r["content"] for r in records]
    if len(contents) != len(set(contents)):
        alerts.append({
            "type": "fact_turnover",
            "severity": "medium",
            "detail": "Duplicate content detected in recent memory",
            "agent_id": agent_id,
        })
    if len(records) > 10:
        alerts.append({
            "type": "size_spike",
            "severity": "info",
            "detail": f"Memory count ({len(records)}) exceeds 10 records",
            "agent_id": agent_id,
        })
    return alerts


def mock_diff(agent_id: str, timestamp_a: str, timestamp_b: str) -> dict:
    def records_at(ts: str) -> list[dict]:
        target = datetime.fromisoformat(ts)
        result = []
        for r in _agent_data.get(agent_id, []):
            created = r["created_at"]
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            if created <= target:
                result.append(r)
        return result

    state_a = records_at(timestamp_a)
    state_b = records_at(timestamp_b)
    hashes_a = {r["cryptographic_hash"] for r in state_a}
    hashes_b = {r["cryptographic_hash"] for r in state_b}
    return {
        "agent_id": agent_id,
        "timestamp_a": timestamp_a,
        "timestamp_b": timestamp_b,
        "added": [r for r in state_b if r["cryptographic_hash"] not in hashes_a],
        "removed": [r for r in state_a if r["cryptographic_hash"] not in hashes_b],
        "count_a": len(state_a),
        "count_b": len(state_b),
    }


def reset():
    _agent_data.clear()
    _audit_log.clear()
    _checkpoints.clear()
    _coordination_locks.clear()
