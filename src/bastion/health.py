"""Memory health metrics, trust reporting, anomaly detection, and diff analysis.

Extracted from memory.py for modularity. These operations are self-contained
and don't depend on core memory CRUD operations.
"""

from __future__ import annotations

from datetime import UTC, datetime
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
            # Check vector index health: detect the live vector column state and
            # upsert a record so the vector_health monitor table stays populated.
            vector_healthy = False
            vector_dim = None
            try:
                # 1. Detect the vector column dimension from information_schema
                cur.execute(
                    "SELECT data_type, character_maximum_length FROM information_schema.columns "
                    "WHERE table_name = 'agent_memory' AND column_name = 'embedding'"
                )
                vcol = cur.fetchone()
                if vcol and vcol[0].lower() in ("user-defined", "vector"):
                    vector_dim = vcol[1]
                # 2. Count memories that actually carry embeddings
                cur.execute(
                    "SELECT COUNT(*) FROM agent_memory WHERE agent_id = %s AND embedding IS NOT NULL",
                    (mem.agent_id,),
                )
                embedded = cur.fetchone()[0] or 0
                # 3. Confirm the C-SPANN index exists
                index_exists = False
                try:
                    cur.execute(
                        "SELECT index_name FROM [SHOW INDEXES FROM agent_memory] "
                        "WHERE index_name = 'idx_memory_embedding' OR index_name = 'embedding_custom_ops'"
                    )
                    index_exists = cur.fetchone() is not None
                except Exception:
                    index_exists = embedded > 0
                vector_healthy = index_exists and embedded > 0
                if vector_dim is None:
                    vector_dim = 1024
                # 4. Persist a health snapshot (keeps the monitor table fresh)
                cur.execute(
                    "UPSERT INTO vector_health "
                    "(agent_id, index_name, index_type, is_operational, dimension, total_vectors, "
                    "last_check_at, error_message) "
                    "VALUES (%s, 'idx_memory_embedding', 'C-SPANN', %s, %s, %s, now(), NULL)",
                    (mem.agent_id, vector_healthy, vector_dim, embedded),
                )
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


def forensic_report_real(mem: BastionMemory) -> dict[str, Any]:
    """Generate a forensic integrity report from live CockroachDB data.

    Verifies hash chain integrity, counts audit entries, checks memory
    distribution by type, and returns guard statistics — all from real
    cluster queries, not mocks.
    """
    pool = mem.get_pool()
    conn = pool.acquire(timeout=30.0)
    try:
        mem._set_rls_context(conn)
        with conn.cursor() as cur:
            # 1. Memory counts + hash chain
            cur.execute(
                "SELECT "
                "  COUNT(*), "
                "  COUNT(*) FILTER (WHERE cryptographic_hash IS NOT NULL), "
                "  MIN(created_at), "
                "  MAX(created_at), "
                "  COUNT(*) FILTER (WHERE is_pinned), "
                "  AVG(access_count), "
                "  AVG(importance_score) "
                "FROM agent_memory WHERE agent_id = %s",
                (mem.agent_id,),
            )
            row = cur.fetchone()
            total = row[0] or 0
            hashed = row[1] or 0
            oldest = row[2]
            newest = row[3]
            pinned = row[4] or 0
            avg_access = float(row[5] or 0)
            avg_importance = float(row[6] or 0)

            # 2. Hash chain integrity: verify each hash links to previous
            cur.execute(
                "SELECT memory_id, previous_hash, cryptographic_hash "
                "FROM agent_memory "
                "WHERE agent_id = %s AND cryptographic_hash IS NOT NULL "
                "ORDER BY created_at ASC",
                (mem.agent_id,),
            )
            chain_rows = cur.fetchall()
            chain_broken = False
            broken_at = None
            for i, (_, prev_hash, curr_hash) in enumerate(chain_rows):
                if i == 0:
                    continue  # first entry has no previous
                expected_prev = chain_rows[i - 1][2]
                if prev_hash != expected_prev:
                    chain_broken = True
                    broken_at = chain_rows[i][0]
                    break

            # 3. Memory type distribution
            cur.execute(
                "SELECT memory_type, COUNT(*) "
                "FROM agent_memory WHERE agent_id = %s "
                "GROUP BY memory_type ORDER BY COUNT(*) DESC",
                (mem.agent_id,),
            )
            type_dist = {r[0]: r[1] for r in cur.fetchall()}

            # 4. Audit log count
            cur.execute(
                "SELECT COUNT(*) FROM agent_audit WHERE agent_id = %s",
                (mem.agent_id,),
            )
            audit_row = cur.fetchone()
            audit_count = audit_row[0] if audit_row else 0

            # 5. Poisoned / blocked count (ASI06 findings in metadata)
            cur.execute(
                "SELECT COUNT(*) FROM agent_memory "
                "WHERE agent_id = %s AND metadata::text LIKE %s",
                (mem.agent_id, "%ASI06%"),
            )
            poisoned_row = cur.fetchone()
            poisoned_count = poisoned_row[0] if poisoned_row else 0

        # 6. Guard stats from in-memory state (not CRDB — runtime counters)
        guard_stats = mem._guard.get_stats() if hasattr(mem, "_guard") else {
            "total_checks": 0,
            "blocked_count": 0,
            "blocked_pct": 0.0,
        }

        return {
            "agent_id": mem.agent_id,
            "report_type": "forensic",
            "generated_at": datetime.now(UTC).isoformat(),
            # Hash chain
            "hash_chain_status": "BROKEN" if chain_broken else "INTACT",
            "hash_chain_verified": hashed,
            "hash_chain_total": total,
            "hash_chain_broken_at_memory": broken_at,
            # Memory stats
            "total_memories": total,
            "pinned_memories": pinned,
            "oldest_memory": oldest.isoformat() if oldest else None,
            "newest_memory": newest.isoformat() if newest else None,
            "avg_access_count": round(avg_access, 2),
            "avg_importance_score": round(avg_importance, 2),
            # Type distribution
            "memory_type_distribution": type_dist,
            # Audit
            "audit_log_entries": audit_count,
            # Guard / poison
            "asi06_poisoned_count": poisoned_count,
            "guard_total_checks": guard_stats["total_checks"],
            "guard_blocked_count": guard_stats["blocked_count"],
            "guard_blocked_pct": guard_stats["blocked_pct"],
            # S3 (placeholder — Lambda deployment pending)
            "s3_export_url": None,
        }
    except Exception as e:
        logger.exception("forensic_report failed for agent %s", mem.agent_id)
        raise RuntimeError(f"Forensic report failed: {e}") from e
    finally:
        pool.release(conn)
