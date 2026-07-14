from __future__ import annotations

import hashlib
import json
import threading
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from bastion.models import (
    AuditEntry,
    CheckpointState,
    ClusterInfo,
    CoordinationLock,
    EntityRecord,
    MemoryRecord,
    MessageRecord,
    RelationRecord,
)

_agent_data: dict[str, list[dict[str, Any]]] = {}
_audit_log: list[dict[str, Any]] = []
_checkpoints: list[dict[str, Any]] = []
_coordination_locks: list[dict[str, Any]] = []
_messages: list[dict[str, Any]] = []
_namespace_map: dict[str, set[str]] = {}
_lock = threading.Lock()


def _compute_hash(content: str, metadata: dict, previous_hash: str | None) -> str:
    raw = content + json.dumps(metadata, sort_keys=True) + (previous_hash or "")
    return hashlib.sha256(raw.encode()).hexdigest()


def mock_register_namespace(agent_id: str, namespace: str):
    """Register an agent as belonging to a namespace for shared-scope search."""
    with _lock:
        if namespace not in _namespace_map:
            _namespace_map[namespace] = set()
        _namespace_map[namespace].add(agent_id)


def mock_store_memory(
    agent_id: str,
    memory_type: str,
    content: str,
    metadata: dict[str, Any] | None = None,
    expires_in_seconds: int | None = None,
    region: str | None = None,
) -> MemoryRecord:
    with _lock:
        if agent_id not in _agent_data:
            _agent_data[agent_id] = []

        records = _agent_data[agent_id]
        prev_hash = records[-1]["cryptographic_hash"] if records else None
        meta = dict(metadata) if metadata is not None else {}
        precomputed_embedding = meta.pop("_precomputed_embedding", None)
        crypto_hash = _compute_hash(content, meta, prev_hash)
        now = datetime.now(UTC)
        expires_at = now + timedelta(seconds=expires_in_seconds) if expires_in_seconds is not None else None

        record = MemoryRecord(
            memory_id=str(uuid.uuid4()),
            agent_id=agent_id,
            memory_type=memory_type,
            content=content,
            embedding=precomputed_embedding if precomputed_embedding is not None else ([0.0] * 1024),
            metadata=meta,
            previous_hash=prev_hash,
            cryptographic_hash=crypto_hash,
            created_at=now,
            expires_at=expires_at,
            access_count=0,
            importance_score=5.0,
        )

        record_dict = record.to_dict()
        record_dict["region"] = region
        _agent_data[agent_id].append(record_dict)
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
    namespace_scope: str = "own",
    region_filter: str | None = None,
) -> list[MemoryRecord]:
    with _lock:
        if namespace_scope == "shared":
            agent_ids = _namespace_map.get(agent_id, {agent_id})
            records = []
            for aid in agent_ids:
                recs = _agent_data.get(aid, [])
                records.extend(recs)
        else:
            records = _agent_data.get(agent_id, [])
        if memory_type:
            records = [r for r in records if r["memory_type"] == memory_type]
        if region_filter is not None:
            records = [r for r in records if r.get("region") == region_filter]

        now = datetime.now(UTC)
        valid = []
        for r in records:
            expires = r.get("expires_at")
            if expires:
                expires_dt = datetime.fromisoformat(expires) if isinstance(expires, str) else expires
                if expires_dt <= now:
                    continue

            created = r.get("created_at")
            if isinstance(created, str):
                created_dt = datetime.fromisoformat(created)
            elif created is None:
                created_dt = now
            else:
                created_dt = created
            hours_elapsed = (now - created_dt).total_seconds() / 3600

            importance = float(r.get("importance_score", 5.0))
            r["_decay_score"] = importance / (1.0 + 0.01 * hours_elapsed)
            valid.append(r)

        # Score by text relevance: simple word-overlap scoring to simulate semantic search
        query_words = set(query.lower().split()) if query else set()
        for r in valid:
            content_words = set(r.get("content", "").lower().split())
            if query_words:
                overlap = len(query_words & content_words)
                r["_text_score"] = overlap / max(len(query_words), 1)
            else:
                r["_text_score"] = 0.0
            # Combined score: text relevance * decay
            r["_combined_score"] = r["_text_score"] * r["_decay_score"]

        valid.sort(key=lambda x: x["_combined_score"], reverse=True)

        # Filter by threshold: remove results with zero text relevance
        if query_words:
            valid = [r for r in valid if r["_text_score"] >= threshold * 0.1]

        results = []
        for r in valid[:k]:
            results.append(MemoryRecord.from_dict(r))

        return results


def mock_list_all(
    agent_id: str,
    memory_type: str | None = None,
    namespace_scope: str = "own",
    region_filter: str | None = None,
) -> list[MemoryRecord]:
    with _lock:
        if namespace_scope == "shared":
            agent_ids = _namespace_map.get(agent_id, {agent_id})
            records = []
            for aid in agent_ids:
                recs = _agent_data.get(aid, [])
                records.extend(recs)
        else:
            records = _agent_data.get(agent_id, [])
    if memory_type:
        records = [r for r in records if r["memory_type"] == memory_type]
    if region_filter is not None:
        records = [r for r in records if r.get("region") == region_filter]

    now = datetime.now(UTC)
    valid = []
    for r in records:
        expires = r.get("expires_at")
        if expires:
            expires_dt = datetime.fromisoformat(expires) if isinstance(expires, str) else expires
            if expires_dt <= now:
                continue
        valid.append(r)

    return [MemoryRecord.from_dict(r) for r in valid]


def mock_reinforce(agent_id: str, memory_id: str, success: bool = True) -> dict:
    with _lock:
        records = _agent_data.get(agent_id, [])
        for r in records:
            if r.get("memory_id") == memory_id:
                base = float(r.get("importance_score", 5.0))
                boost = 0.1 + (1.0 if success else 0.0)
                new_imp = min(base + boost, 10.0)
                r["importance_score"] = new_imp
                r["access_count"] = r.get("access_count", 0) + 1
                return {
                    "status": "reinforced",
                    "memory_id": memory_id,
                    "importance_score": new_imp,
                    "delta": round(new_imp - base, 2),
                }
        return {"status": "not_found"}


def mock_pin_memory(
    agent_id: str, memory_type: str, content: str, pin_priority: int, metadata: dict | None
) -> MemoryRecord:
    record = mock_store_memory(agent_id, memory_type, content, metadata, None)
    records = _agent_data.get(agent_id, [])
    for r in records:
        if r.get("memory_id") == record.memory_id:
            r["is_pinned"] = True
            r["pin_priority"] = pin_priority
            break
    record.is_pinned = True
    record.pin_priority = pin_priority
    return record


def mock_unpin_memory(agent_id: str, memory_id: str) -> bool:
    records = _agent_data.get(agent_id, [])
    for r in records:
        if r.get("memory_id") == memory_id and r.get("is_pinned"):
            r["is_pinned"] = False
            r["pin_priority"] = 0
            return True
    return False


def mock_get_pinned(agent_id: str, min_priority: int = 1) -> list[MemoryRecord]:
    records = _agent_data.get(agent_id, [])
    result = []
    for r in records:
        if r.get("is_pinned") and r.get("pin_priority", 0) >= min_priority:
            result.append(MemoryRecord(
                memory_id=r["memory_id"],
                agent_id=r["agent_id"],
                memory_type=r["memory_type"],
                content=r["content"],
                embedding=r.get("embedding"),
                metadata=r.get("metadata"),
                previous_hash=r.get("previous_hash"),
                cryptographic_hash=r["cryptographic_hash"],
                created_at=r["created_at"],
                expires_at=r.get("expires_at"),
                access_count=r.get("access_count", 0),
                importance_score=r.get("importance_score", 5.0),
                trust_level=r.get("trust_level", 0.5),
                is_pinned=r.get("is_pinned", False),
                pin_priority=r.get("pin_priority", 0),
            ))
    result.sort(key=lambda m: m.pin_priority, reverse=True)
    return result


def mock_list_memories(
    agent_id: str, memory_type: str | None, limit: int, offset: int
) -> list[MemoryRecord]:
    with _lock:
        records = _agent_data.get(agent_id, [])
        filtered = records
        if memory_type:
            filtered = [r for r in records if r.get("memory_type") == memory_type]
        filtered.sort(key=lambda r: r.get("created_at", datetime.min.replace(tzinfo=UTC)), reverse=True)
        page = filtered[offset:offset + limit]
        return [
            MemoryRecord(
                memory_id=r["memory_id"], agent_id=r["agent_id"], memory_type=r["memory_type"],
                content=r["content"], embedding=r.get("embedding"), metadata=r.get("metadata"),
                previous_hash=r.get("previous_hash"), cryptographic_hash=r["cryptographic_hash"],
                created_at=r["created_at"], expires_at=r.get("expires_at"),
                access_count=r.get("access_count", 0), importance_score=r.get("importance_score", 5.0),
                is_pinned=r.get("is_pinned", False), pin_priority=r.get("pin_priority", 0),
            )
            for r in page
        ]


def mock_correct_memory(
    agent_id: str, memory_id: str, new_content: str, metadata: dict | None
) -> MemoryRecord | None:
    with _lock:
        records = _agent_data.get(agent_id, [])
        for r in records:
            if r.get("memory_id") == memory_id:
                r["content"] = new_content
                if metadata:
                    r["metadata"] = {**(r.get("metadata") or {}), **metadata}
                return MemoryRecord(
                    memory_id=r["memory_id"], agent_id=r["agent_id"], memory_type=r["memory_type"],
                    content=r["content"], embedding=r.get("embedding"), metadata=r.get("metadata"),
                    previous_hash=r.get("previous_hash"), cryptographic_hash=r["cryptographic_hash"],
                    created_at=r["created_at"], expires_at=r.get("expires_at"),
                    access_count=r.get("access_count", 0), importance_score=r.get("importance_score", 5.0),
                    is_pinned=r.get("is_pinned", False), pin_priority=r.get("pin_priority", 0),
                )
        return None


def mock_memory_health(agent_id: str) -> dict:
    with _lock:
        records = _agent_data.get(agent_id, [])
        now = datetime.now(UTC)
        total = len(records)
        pinned = sum(1 for r in records if r.get("is_pinned"))
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)
        def _parse_dt(val: Any) -> datetime:
            if isinstance(val, datetime):
                return val
            if isinstance(val, str):
                return datetime.fromisoformat(val)
            return datetime.min.replace(tzinfo=UTC)
        week = sum(1 for r in records if _parse_dt(r.get("created_at")) > week_ago)
        month = sum(1 for r in records if _parse_dt(r.get("created_at")) > month_ago)
        avg_access = sum(r.get("access_count", 0) for r in records) / max(total, 1)
        avg_importance = sum(r.get("importance_score", 5.0) for r in records) / max(total, 1)
        return {
            "total_memories": total,
            "pinned_memories": pinned,
            "memories_last_7_days": week,
            "memories_last_30_days": month,
            "freshness_ratio": round(week / max(total, 1), 4),
            "avg_access_count": round(avg_access, 2),
            "avg_importance_score": round(avg_importance, 2),
        }


def mock_apply_patch(agent_id: str, memory_id: str, patch_ops: list) -> dict | None:
    try:
        import jsonpatch
    except ImportError:
        return None
    with _lock:
        records = _agent_data.get(agent_id, [])
        for r in records:
            if r.get("memory_id") == memory_id:
                current = dict(r.get("metadata") or {})
                patched = jsonpatch.apply_patch(current, patch_ops)
                r["metadata"] = patched
                return {"memory_id": memory_id, "metadata": patched}
        return None


def mock_broadcast(sender_agent_id: str, event_type: str, payload: dict | None, namespace: str) -> MessageRecord:
    record = MessageRecord(
        namespace=namespace,
        sender_agent_id=sender_agent_id,
        event_type=event_type,
        payload=payload or {},
    )
    with _lock:
        _messages.append(record.to_dict())
    return record


def mock_poll_messages(namespace: str) -> list[MessageRecord]:
    now = datetime.now(UTC)
    unread = []
    with _lock:
        for m in _messages:
            expires = m.get("expires_at")
            if expires:
                expires_dt = datetime.fromisoformat(expires) if isinstance(expires, str) else expires
                if expires_dt <= now:
                    continue
            if m.get("namespace") == namespace and not m.get("read"):
                m["read"] = True
                record_data = dict(m)
                for ts_field in ("created_at", "expires_at"):
                    if isinstance(record_data.get(ts_field), str):
                        try:
                            record_data[ts_field] = datetime.fromisoformat(record_data[ts_field])
                        except (ValueError, TypeError):
                            record_data[ts_field] = None
                unread.append(MessageRecord(**record_data))
    return unread


def mock_get_memory_by_id(agent_id: str, memory_id: str) -> MemoryRecord | None:
    with _lock:
        for rec in _agent_data.get(agent_id, []):
            if rec.get("memory_id") == memory_id:
                return MemoryRecord.from_dict(rec)
        return None


def mock_delete_memory(agent_id: str, memory_id: str) -> bool:
    with _lock:
        records = _agent_data.get(agent_id, [])
        for i, rec in enumerate(records):
            if rec.get("memory_id") == memory_id:
                records.pop(i)
                _audit_log.append({
                    "audit_id": str(uuid.uuid4()),
                    "agent_id": agent_id,
                    "workflow_id": str(uuid.uuid4()),
                    "action": "memory_delete",
                    "recorded_at": datetime.now(UTC).isoformat(),
                    "details": json.dumps({"memory_id": memory_id}),
                })
                return True
        return False


def _parse_relative_timestamp(timestamp: str) -> datetime:
    """Parse relative timestamps like '5 minutes ago', '2 hours ago', '1 day ago'."""
    import re
    ts = timestamp.strip().lower()
    # Handle relative timestamps
    match = re.match(r"(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago", ts)
    if match:
        amount = int(match.group(1))
        unit = match.group(2)
        now = datetime.now(UTC)
        if unit == "second":
            return now - timedelta(seconds=amount)
        elif unit == "minute":
            return now - timedelta(minutes=amount)
        elif unit == "hour":
            return now - timedelta(hours=amount)
        elif unit == "day":
            return now - timedelta(days=amount)
        elif unit == "week":
            return now - timedelta(weeks=amount)
        elif unit == "month":
            return now - timedelta(days=amount * 30)
    # Handle "now"
    if ts == "now":
        return datetime.now(UTC)
    # Handle "just now"
    if ts == "just now":
        return datetime.now(UTC)
    # Fall back to ISO format
    return datetime.fromisoformat(timestamp)


def mock_get_memory_at_time(agent_id: str, timestamp: str) -> list[MemoryRecord]:
    target = _parse_relative_timestamp(timestamp)
    with _lock:
        records = _agent_data.get(agent_id, [])
        results = []
        for r in records:
            created = r["created_at"]
            if isinstance(created, str):
                created = datetime.fromisoformat(created)
            if created <= target:
                results.append(MemoryRecord.from_dict(r))
        return results


def mock_store_audit(agent_id: str, action: str, details: dict[str, Any] | str) -> None:
    with _lock:
        _audit_log.append({
            "audit_id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "workflow_id": str(uuid.uuid4()),
        "action": action,
        "recorded_at": datetime.now(UTC).isoformat(),
        "details": details if isinstance(details, str) else json.dumps(details),
    })


def mock_get_audit(agent_id: str) -> list[AuditEntry]:
    with _lock:
        entries = [e for e in _audit_log if e["agent_id"] == agent_id]
        result = []
        for e in entries:
            recorded_at = e["recorded_at"]
            if isinstance(recorded_at, str):
                recorded_at = datetime.fromisoformat(recorded_at)
            details = e["details"]
            if isinstance(details, str):
                details = json.loads(details)
            result.append(AuditEntry(
                audit_id=e["audit_id"],
                agent_id=e["agent_id"],
                workflow_id=e["workflow_id"],
                action=e["action"],
                details=details,
                recorded_at=recorded_at,
            ))
        return result


def mock_heal(agent_id: str) -> dict[str, Any]:
    with _lock:
        records = _agent_data.get(agent_id, [])
        before = len(records)

        now = datetime.now(UTC)
        valid = []
        for r in records:
            expires = r.get("expires_at")
            if expires:
                expires_dt = datetime.fromisoformat(expires) if isinstance(expires, str) else expires
                if expires_dt <= now:
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


def mock_provision_cluster(name: str, region: str = "us-east1", provider: str = "aws") -> ClusterInfo:
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
    threshold: float = 0.97,
) -> tuple[str, dict]:
    with _lock:
        records = _agent_data.get(agent_id, [])
        for r in reversed(records):
            if r.get("memory_type") == memory_type and r.get("metadata", {}).get("query") == query:
                return r["content"], {"cache": "hit", "memory_id": r["memory_id"]}
    response = llm_callback(query)
    mock_store_memory(agent_id, memory_type, response, {"query": query})
    return response, {"cache": "miss"}


def mock_detect_anomalies(agent_id: str) -> list[dict]:
    with _lock:
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

    with _lock:
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


_entities: dict[str, list[dict[str, Any]]] = {}
_relations: list[dict[str, Any]] = []


def _extract_triples(text: str) -> list[tuple[str, str, str, str, float]]:
    triples: list[tuple[str, str, str, str, float]] = []
    patterns = [
        (r"(\w+)\s+is\s+a\s+(\w+)", "is_a", "entity_type"),
        (r"(\w+)\s+is\s+(\w+(?:\s+\w+){0,3})", "is", "attribute"),
        (r"(\w+)\s+loves\s+(\w+)", "loves", "relation"),
        (r"(\w+)\s+likes\s+(\w+)", "likes", "relation"),
        (r"(\w+)\s+uses\s+(\w+)", "uses", "relation"),
        (r"(\w+)\s+builds\s+(\w+)", "builds", "relation"),
        (r"(\w+)\s+works\s+on\s+(\w+)", "works_on", "relation"),
        (r"(\w+)\s+created\s+(\w+)", "created", "relation"),
        (r"(\w+)\s+owns\s+(\w+)", "owns", "relation"),
        (r"(\w+)\s+manages\s+(\w+)", "manages", "relation"),
        (r"(\w+)\s+reports\s+to\s+(\w+)", "reports_to", "relation"),
        (r"(\w+)\s+belongs\s+to\s+(\w+)", "belongs_to", "relation"),
    ]
    import re
    for pattern, rel_type, kind in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            src, tgt = match.group(1).lower(), match.group(2).lower()
            triples.append((src, tgt, rel_type, kind, 1.0))
    return triples


def _ensure_entity(agent_id: str, name: str, entity_type: str = "concept") -> str:
    with _lock:
        if agent_id not in _entities:
            _entities[agent_id] = []
        for e in _entities[agent_id]:
            if e["name"] == name:
                return str(e["entity_id"])
        eid = str(uuid.uuid4())
        _entities[agent_id].append({
            "entity_id": eid,
            "agent_id": agent_id,
            "entity_type": entity_type,
            "name": name,
            "attributes": {},
            "valid_from": datetime.now(UTC).isoformat(),
            "valid_until": None,
            "created_at": datetime.now(UTC).isoformat(),
        })
        return eid


def mock_store_with_graph(
    agent_id: str,
    content: str,
    metadata: dict[str, Any] | None = None,
    expires_in_seconds: int | None = None,
) -> tuple[MemoryRecord, list[EntityRecord], list[RelationRecord]]:
    record = mock_store_memory(agent_id, "fact", content, metadata, expires_in_seconds)
    triples = _extract_triples(content)
    created_entities: list[EntityRecord] = []
    created_relations: list[RelationRecord] = []

    with _lock:
        for src_name, tgt_name, rel_type, kind, confidence in triples:
            if kind == "entity_type":
                _ensure_entity(agent_id, src_name, tgt_name)  # entity created, relation deferred
            else:
                eid_src = _ensure_entity(agent_id, src_name, "person" if kind == "relation" else "concept")
                eid_tgt = _ensure_entity(agent_id, tgt_name, "concept")
                rel = RelationRecord(
                    agent_id=agent_id,
                    source_entity_id=eid_src,
                    target_entity_id=eid_tgt,
                    relation_type=rel_type,
                    confidence=confidence,
                    source_memory_id=record.memory_id,
                )
                _relations.append(rel.to_dict())
                created_relations.append(rel)

        for eid_dict in _entities.get(agent_id, []):
            created_entities.append(EntityRecord.from_row(dict(eid_dict)))

    deduped = {e.entity_id: e for e in created_entities}
    return record, list(deduped.values()), created_relations


def mock_graph_query(
    agent_id: str,
    start_entity: str,
    relation_path: list[str] | None = None,
    hops: int = 2,
) -> list[dict[str, Any]]:
    with _lock:
        # Build lookup with lowercase keys for case-insensitive matching
        entities = {e["name"].lower(): e for e in _entities.get(agent_id, [])}
        start = entities.get(start_entity.lower())
        if not start:
            return []

        found: list[dict[str, Any]] = []
        visited: set[str] = set()
        queue: list[tuple[str, int]] = [(start["entity_id"], 0)]

        while queue:
            eid, depth = queue.pop(0)
            if depth >= hops or eid in visited:
                continue
            visited.add(eid)

            for rel in _relations:
                if rel["source_entity_id"] != eid:
                    continue
                if relation_path and rel["relation_type"] not in relation_path:
                    continue
                target = None
                for e in _entities.get(agent_id, []):
                    if e["entity_id"] == rel["target_entity_id"]:
                        target = e
                        break
                if target:
                    found.append({
                        "source": start_entity,
                        "target": target["name"],
                        "relation": rel["relation_type"],
                        "confidence": rel["confidence"],
                        "depth": depth + 1,
                    })
                    queue.append((target["entity_id"], depth + 1))
        return found


def mock_graph_at_time(agent_id: str, timestamp: str, entity: str | None = None) -> dict[str, Any]:
    target = datetime.fromisoformat(timestamp)
    ents = _entities.get(agent_id, [])
    if entity:
        ents = [e for e in ents if e["name"] == entity]
    valid_entities = []
    for e in ents:
        vf = datetime.fromisoformat(e["valid_from"]) if isinstance(e["valid_from"], str) else e["valid_from"]
        vu_raw = e.get("valid_until")
        vu = datetime.fromisoformat(vu_raw) if isinstance(vu_raw, str) and vu_raw else None
        if vf <= target and (vu is None or vu > target):
            valid_entities.append(e)
    return {
        "agent_id": agent_id,
        "timestamp": timestamp,
        "entities": valid_entities,
        "relations": [
            r for r in _relations
            if any(e["entity_id"] == r["source_entity_id"] for e in valid_entities)
        ],
    }


def mock_graph_stats(agent_id: str) -> dict[str, Any]:
    ents = _entities.get(agent_id, [])
    {e["entity_id"] for e in ents}
    connected = {r["source_entity_id"] for r in _relations} | {r["target_entity_id"] for r in _relations}
    orphans = [e for e in ents if e["entity_id"] not in connected]
    return {
        "entities": len(ents),
        "relations": len(_relations),
        "orphans": len(orphans),
        "entity_types": list({e["entity_type"] for e in ents}),
    }


def mock_detect_contradictions(agent_id: str, memory_id: str) -> dict:
    """Simulate contradiction detection in mock mode."""
    return {
        "new_memory_id": memory_id,
        "scanned_count": 0,
        "contradictions_found": 0,
        "auto_invalidated": 0,
        "manual_review_needed": 0,
        "contradictions": [],
        "scan_duration_ms": 1,
    }


def mock_observations(agent_id: str) -> dict:
    """Simulate observation detection in mock mode."""
    return {
        "agent_id": agent_id,
        "total_memories_scanned": 0,
        "observations": [],
        "detected_at": datetime.now(UTC).isoformat(),
    }


def mock_ltm_check_reuse(agent_id: str, query: str, threshold: float) -> dict | None:
    """Simulate LTM Gateway reuse check in mock mode."""
    memories = mock_search_memory(agent_id, query, k=5, threshold=threshold)
    for mem in memories:
        meta = mem.metadata or {}
        if meta.get("analysis_result") or meta.get("workflow_output"):
            similarity = min(1.0, mem.importance_score / 10.0)
            if similarity >= threshold:
                return {
                    "memory_id": mem.memory_id,
                    "content": mem.content,
                    "similarity": round(similarity, 4),
                    "cached_at": mem.created_at.isoformat() if mem.created_at else "",
                    "reuse_count": mem.access_count,
                    "tokens_saved": max(1, len(mem.content or "") // 4) * 3,
                    "metadata": meta,
                }
    return None


def mock_dream(agent_id: str) -> dict:
    """Simulate dreaming consolidation in mock mode."""
    from datetime import UTC, datetime, timedelta
    memories = mock_list_all(agent_id, memory_type=None, namespace_scope="own")
    cutoff = datetime.now(UTC) - timedelta(hours=24)
    recent = [
        m for m in memories
        if m.created_at and (
            m.created_at.replace(tzinfo=UTC) if m.created_at.tzinfo is None
            else m.created_at
        ) >= cutoff
    ]
    return {
        "agent_id": agent_id,
        "memories_reviewed": len(recent),
        "memories_consolidated": 0,
        "memories_promoted": 0,
        "memories_pruned": 0,
        "patterns_found": 0,
        "lessons_extracted": [],
        "duration_ms": 12,
        "status": "complete",
    }


def reset():
    with _lock:
        _agent_data.clear()
        _audit_log.clear()
        _checkpoints.clear()
        _coordination_locks.clear()
        _entities.clear()
        _relations.clear()
        _messages.clear()
        _namespace_map.clear()
