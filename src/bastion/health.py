"""Memory health metrics, trust reporting, anomaly detection, and diff analysis.

Extracted from memory.py for modularity. These operations are self-contained
and don't depend on core memory CRUD operations.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from bastion.config import ANOMALY_LIMIT
from bastion.log_setup import get_logger

if TYPE_CHECKING:
    from bastion.memory import BastionMemory

logger = get_logger(__name__)


def memory_health_real(mem: BastionMemory) -> dict[str, Any]:
    """Return memory health metrics: count, freshness distribution, pinned count."""
    pool = mem.get_pool()
    conn = pool.acquire(timeout=30.0)
    try:
        mem._set_rls_context(conn)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*), "
                "COUNT(*) FILTER (WHERE is_pinned), "
                "COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days'), "
                "COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days'), "
                "AVG(access_count), "
                "AVG(importance_score) "
                "FROM agent_memory WHERE agent_id = %s",
                (mem.agent_id,),
            )
            row = cur.fetchone()
            total = row[0] or 0
            pinned = row[1] or 0
            week = row[2] or 0
            month = row[3] or 0
            avg_access = float(row[4] or 0)
            avg_importance = float(row[5] or 0)
            freshness = week / max(total, 1)
            # Check vector index health: verify C-SPANN index exists and is operational
            vector_healthy = False
            vector_dim = None
            try:
                cur.execute(
                    "SELECT index_type, is_operational, dimension "
                    "FROM vector_health WHERE agent_id = %s ORDER BY last_check_at DESC LIMIT 1",
                    (mem.agent_id,),
                )
                vh_row = cur.fetchone()
                if vh_row:
                    vector_healthy = vh_row[1]
                    vector_dim = vh_row[2]
                else:
                    # Fallback: check if the vector index exists via SHOW INDEXES
                    cur.execute(
                        "SELECT index_type FROM vector_health "
                        "WHERE index_name = 'idx_memory_embedding' ORDER BY last_check_at DESC LIMIT 1"
                    )
                    index_row = cur.fetchone()
                    if index_row:
                        vector_healthy = True
            except Exception:
                logger.debug("Vector health check skipped (table/index may not exist)")
            return {
                "total_memories": total,
                "pinned_memories": pinned,
                "memories_last_7_days": week,
                "memories_last_30_days": month,
                "freshness_ratio": round(freshness, 4),
                "avg_access_count": round(avg_access, 2),
                "avg_importance_score": round(avg_importance, 2),
                "vector_index_healthy": vector_healthy,
                "vector_index_dimension": vector_dim,
                "embedding_degraded": getattr(mem, "_embedding_degraded", False),
            }
    finally:
        pool.release(conn)


def trust_report_real(mem: BastionMemory, memory_id: str) -> dict[str, Any]:
    """Compute trust score for a specific memory."""
    from bastion.trust import compute_trust_score

    record = mem.get_memory(memory_id)
    if record is None:
        return {"memory_id": memory_id, "error": "not_found"}
    report = compute_trust_score(
        memory_id=record.memory_id,
        content=record.content,
        metadata=record.metadata,
        previous_hash=record.previous_hash,
        cryptographic_hash=record.cryptographic_hash,
        trust_level=getattr(record, "trust_level", 2),
        source_provenance=getattr(record, "source_provenance", "agent_direct"),
        overwrite_count=getattr(record, "overwrite_count", 0),
        created_at=record.created_at,
        last_accessed_at=None,
    )
    return {
        "memory_id": report.memory_id,
        "trust_score": report.trust_score,
        "trust_level": report.trust_level,
        "hash_chain_intact": report.hash_chain_intact,
        "conflict_rate": report.conflict_rate,
        "age_penalty": report.age_penalty,
        "source_provenance": report.source_provenance,
        "poisoning_risk": report.poisoning_risk,
        "flags": report.flags,
    }


def detect_anomalies_real(mem: BastionMemory, agent_id: str) -> list[dict]:
    """Detect anomalies in agent memory patterns."""
    pool = mem.get_pool()
    conn = pool.acquire(timeout=30.0)
    try:
        mem._set_rls_context(conn)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM agent_memory WHERE agent_id = %s",
                (agent_id,),
            )
            total_row = cur.fetchone()
            if total_row is None:
                raise RuntimeError("COUNT query for memories did not return a row")
            total = total_row[0]

            cur.execute(
                "SELECT content, created_at FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT %s",
                (agent_id, ANOMALY_LIMIT),
            )
            rows = cur.fetchall()

        contents = [r[0] for r in rows]
        alerts = []
        if len(contents) != len(set(contents)):
            alerts.append(
                {
                    "type": "fact_turnover",
                    "severity": "medium",
                    "detail": "Duplicate content detected in recent memory",
                    "agent_id": agent_id,
                }
            )

        if total > 100:
            alerts.append(
                {
                    "type": "size_spike",
                    "severity": "info",
                    "detail": f"Memory count ({total}) exceeds 100 records",
                    "agent_id": agent_id,
                }
            )
        return alerts
    except Exception as e:
        logger.exception("Anomaly detection query failed", extra={"agent_id": agent_id})
        raise RuntimeError(f"Anomaly detection failed for agent {agent_id}: {e}") from e
    finally:
        pool.release(conn)


def diff_real(mem: BastionMemory, agent_id: str, timestamp_a: str, timestamp_b: str) -> dict:
    """Compare memory state at two points in time."""

    state_a = mem.get_at_time(timestamp_a, agent_id)
    state_b = mem.get_at_time(timestamp_b, agent_id)
    hashes_a = {r.cryptographic_hash for r in state_a}
    hashes_b = {r.cryptographic_hash for r in state_b}
    return {
        "agent_id": agent_id,
        "timestamp_a": timestamp_a,
        "timestamp_b": timestamp_b,
        "added": [r.to_dict() for r in state_b if r.cryptographic_hash not in hashes_a],
        "removed": [r.to_dict() for r in state_a if r.cryptographic_hash not in hashes_b],
        "count_a": len(state_a),
        "count_b": len(state_b),
    }
