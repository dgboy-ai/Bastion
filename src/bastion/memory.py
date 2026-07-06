from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import subprocess
import threading
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from bastion import mock as _mock
from bastion.models import AuditEntry, ClusterInfo, EntityRecord, MemoryRecord, MessageRecord, RelationRecord

logger = logging.getLogger(__name__)

# Bedrock embedding config
_BEDROCK_MODEL_ID = "amazon.titan-embed-text-v2:0"
_EMBED_DIM = 1024  # Titan V2 output dimension
_bedrock_client = None
_bedrock_lock = threading.Lock()


def _get_bedrock_client():
    """Lazily initialize the Bedrock runtime client (thread-safe)."""
    global _bedrock_client
    if _bedrock_client is None:
        with _bedrock_lock:
            if _bedrock_client is None:
                try:
                    import boto3
                    from botocore.config import Config as BotoConfig
                    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"))
                    _bedrock_cfg = BotoConfig(read_timeout=10, connect_timeout=10)
                    _bedrock_client = boto3.client("bedrock-runtime", region_name=region, config=_bedrock_cfg)
                except Exception:
                    logger.exception("Failed to create Bedrock client")
                    _bedrock_client = None
    return _bedrock_client


def _hash_fallback_embed(text: str) -> list[float]:
    """
    Deterministic hash-based embedding for local development / mock mode.
    Produces a unit-normalized 1024-dim vector derived from the text SHA256.
    Ensures cosine similarity is meaningful (same text = same vector).
    """
    digest = hashlib.sha256(text.encode()).digest()  # 32 bytes
    # Tile to 1024 dimensions (32 * 32 = 1024)
    raw = []
    for _ in range(32):
        for byte in digest:
            raw.append(float(byte) / 127.5 - 1.0)  # normalise to [-1, 1]
    # L2-normalise so cosine similarity works correctly
    norm = math.sqrt(sum(v * v for v in raw)) or 1.0
    return [v / norm for v in raw]

_MEMORY_COLS = (
    "memory_id, agent_id, memory_type, content, embedding, "
    "metadata, previous_hash, cryptographic_hash, "
    "created_at, expires_at, access_count, importance_score, "
    "trust_level, source_provenance, overwrite_count"
)

def _parse_payload(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str):
        try:
            parsed: Any = json.loads(raw)
            if isinstance(parsed, dict):
                return dict(parsed)
            return {"text": raw}
        except (json.JSONDecodeError, TypeError):
            return {"text": raw}
    return {}


class BastionMemory:
    """Core memory engine for CockroachDB-backed agent memory.

    Provides semantic search via C-SPANN vector indexing, cryptographic hash
    chain integrity, AS OF SYSTEM TIME queries, and SERIALIZABLE coordination.
    """

    def __init__(
        self,
        agent_id: str,
        connection_string: str | None = None,
        mock: bool | None = None,
        namespace: str | None = None,
    ):
        self.agent_id = agent_id
        self.namespace = namespace or agent_id
        self._mock = mock if mock is not None else os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")
        self._conn: Any = None
        self._tt_conn: Any = None
        self._conn_str = connection_string
        if self._mock:
            _mock.mock_register_namespace(agent_id, self.namespace)

        if not self._mock:
            if not connection_string:
                raise ValueError("connection_string is required when mock=False")
            import psycopg
            self._conn = psycopg.connect(connection_string)

    @property
    def is_mock(self) -> bool:
        """Whether this instance is running in mock (in-memory) mode."""
        return self._mock

    @property
    def is_connected(self) -> bool:
        """Whether the database connection is established and alive."""
        if self._mock:
            return True
        conn = self._conn
        if conn is None or conn.closed:
            return False
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            return True
        except Exception:
            logger.exception("is_connected check failed")
            return False

    def store(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> MemoryRecord:
        """Store a memory with automatic hash chain linking.

        Embeds content via Bedrock Titan V2, inserts into C-SPANN indexed
        agent_memory table, and chains to previous memory via SHA-256 hash.
        """
        if not content:
            raise ValueError("content cannot be empty")
        if not memory_type:
            raise ValueError("memory_type cannot be empty")
        if self._mock:
            return _mock.mock_store_memory(self.agent_id, memory_type, content, metadata, expires_in_seconds)
        return self._store_real(memory_type, content, metadata, expires_in_seconds)

    def reinforce(self, memory_id: str, success: bool = True) -> dict:
        """Reinforce a memory's importance score.

        Successful reinforcement adds 1.1 to importance (0.1 access + 1.0 success).
        Failed reinforcement adds only 0.1. Score capped at 10.0.
        """
        if self._mock:
            return _mock.mock_reinforce(self.agent_id, memory_id, success)
        return self._reinforce_real(memory_id, success)

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        """Search memories using C-SPANN vector similarity with decay weighting.

        Returns memories ranked by (cosine_similarity * importance_score / time_decay).

        namespace_scope:
            "own"    — search only this agent's memories (default)
            "shared" — search all agents in the same namespace
        """
        if not query:
            raise ValueError("query cannot be empty")
        if k < 1:
            raise ValueError("k must be at least 1")
        if not 0 <= threshold <= 1:
            raise ValueError("threshold must be between 0 and 1")
        if namespace_scope not in ("own", "shared"):
            raise ValueError("namespace_scope must be 'own' or 'shared'")
        ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
        if self._mock:
            return _mock.mock_search_memory(ns_agent_id, query, k, threshold, memory_type, namespace_scope)
        return self._search_real(query, k, threshold, memory_type, namespace_scope)

    def list_all(
        self,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        """List all non-expired memories (no vector similarity, no ordering).

        This is the correct way to get all memories for analytics/reporting.
        Unlike ``search("*", ...)`` which embeds the literal string ``"*"``
        and does vector similarity, this performs a simple SQL query.

        namespace_scope:
            "own"    — list only this agent's memories (default)
            "shared" — list all agents in the same namespace
        """
        if namespace_scope not in ("own", "shared"):
            raise ValueError("namespace_scope must be 'own' or 'shared'")
        ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
        if self._mock:
            return _mock.mock_list_all(ns_agent_id, memory_type, namespace_scope)
        return self._list_all_real(memory_type, namespace_scope)

    def get_at_time(self, timestamp: str, agent_id: str | None = None) -> list[MemoryRecord]:
        """Query memory state at a specific timestamp using AS OF SYSTEM TIME."""
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_get_memory_at_time(agent_id, timestamp)
        return self._get_at_time_real(agent_id, timestamp)

    def audit(self, agent_id: str | None = None) -> list[AuditEntry]:
        """Retrieve the append-only audit log for an agent."""
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_get_audit(agent_id)
        return self._audit_real(agent_id)

    def heal(self, agent_id: str | None = None) -> dict[str, Any]:
        """Trigger memory self-healing: prune expired records and compact storage."""
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_heal(agent_id)
        return self._heal_real(agent_id)

    def resolve_conflict(self, fact_a: str, fact_b: str, context: str | None = None) -> str:
        """Resolve conflicting memories via SERIALIZABLE isolation and LLM merge."""
        if self._mock:
            return _mock.mock_resolve_conflict(fact_a, fact_b, context or "")
        return self._resolve_conflict_real(fact_a, fact_b, context or "")

    def query_with_cache(
        self,
        query: str,
        llm_callback: Callable[[str], str],
        memory_type: str = "semantic_cache",
        threshold: float = 0.97,
    ) -> tuple[str, dict]:
        """Semantic caching: return cached result if similar query exists, else call LLM."""
        if self._mock:
            return _mock.mock_query_with_cache(self.agent_id, query, llm_callback, memory_type, threshold)
        return self._query_with_cache_real(query, llm_callback, memory_type, threshold)

    def detect_anomalies(self, agent_id: str | None = None) -> list[dict]:
        """Detect memory anomalies: fact turnover, size spikes, rapid forgetting."""
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_detect_anomalies(agent_id)
        return self._detect_anomalies_real(agent_id)

    def diff(self, timestamp_a: str, timestamp_b: str, agent_id: str | None = None) -> dict:
        """Compare memory state between two timestamps, showing added and removed memories."""
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_diff(agent_id, timestamp_a, timestamp_b)
        return self._diff_real(agent_id, timestamp_a, timestamp_b)

    def provision_cluster(
        self,
        name: str,
        region: str = "us-east1",
        provider: str = "aws",
    ) -> ClusterInfo:
        """Auto-provision a CockroachDB cluster via ccloud CLI."""
        if self._mock:
            return _mock.mock_provision_cluster(name, region, provider)

        result = subprocess.run(
            ["ccloud", "cluster", "create", name, "--provider", provider, "--region", region],
            capture_output=True, text=True, check=True,
        )
        data = json.loads(result.stdout)
        return ClusterInfo(
            cluster_id=data.get("id", ""),
            connection_string=f"postgres://{data.get('sql_user')}@{data.get('sql_host')}:26257/defaultdb?sslmode=verify-full",
            admin_url=f"https://cockroachlabs.cloud/cluster/{data.get('id', name)}",
            region=region,
            status="created",
        )

    def store_with_graph(
        self,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> tuple[MemoryRecord, list[EntityRecord], list[RelationRecord]]:
        if self._mock:
            return _mock.mock_store_with_graph(self.agent_id, content, metadata, expires_in_seconds)
        return self._store_with_graph_real(content, metadata, expires_in_seconds)

    def graph_query(
        self,
        start_entity: str,
        relation_path: list[str] | None = None,
        hops: int = 2,
    ) -> list[dict[str, Any]]:
        if self._mock:
            return _mock.mock_graph_query(self.agent_id, start_entity, relation_path, hops)
        return self._graph_query_real(start_entity, relation_path, hops)

    def graph_at_time(self, timestamp: str, entity: str | None = None) -> dict[str, Any]:
        if self._mock:
            return _mock.mock_graph_at_time(self.agent_id, timestamp, entity)
        return self._graph_at_time_real(timestamp, entity)

    def graph_stats(self) -> dict[str, Any]:
        if self._mock:
            return _mock.mock_graph_stats(self.agent_id)
        return self._graph_stats_real()

    def broadcast(self, event_type: str, payload: dict | None = None, namespace: str | None = None) -> MessageRecord:
        """Send a message to all agents in a namespace."""
        ns = namespace if namespace is not None else self.namespace
        if not event_type:
            raise ValueError("event_type cannot be empty")
        if self._mock:
            return _mock.mock_broadcast(self.agent_id, event_type, payload, ns)
        return self._broadcast_real(event_type, payload, ns)

    def poll_messages(self, namespace: str | None = None) -> list[MessageRecord]:
        """Read and acknowledge all unread messages in a namespace."""
        ns = namespace if namespace is not None else self.namespace
        if self._mock:
            return _mock.mock_poll_messages(ns)
        return self._poll_messages_real(ns)

    def trust_report(self, memory_id: str) -> dict[str, Any]:
        from bastion.trust import compute_trust_score

        record = self.get_memory(memory_id)
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

    def get_memory(self, memory_id: str) -> MemoryRecord | None:
        """Retrieve a single memory by its exact ID (not semantic search).

        Returns ``None`` if not found. Uses primary-key lookup so this is
        deterministic — unlike ``search()`` which ranks by vector similarity.
        """
        if not memory_id:
            raise ValueError("memory_id cannot be empty")
        if self._mock:
            return _mock.mock_get_memory_by_id(self.agent_id, memory_id)
        return self._get_memory_by_id_real(memory_id)

    def close(self):
        try:
            if self._conn and not self._conn.closed:
                self._conn.close()
        finally:
            if self._tt_conn and not self._tt_conn.closed:
                self._tt_conn.close()

    def _store_real(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None,
        expires_in_seconds: int | None,
    ) -> MemoryRecord:
        conn = self._conn
        if conn is None:
            raise RuntimeError("store_real called without a database connection")

        prev_hash = self._get_last_hash()
        meta = metadata or {}
        crypto_hash = hashlib.sha256(
            (content + json.dumps(meta, sort_keys=True) + (prev_hash or "")).encode()
        ).hexdigest()

        embedding = self._embed(content)
        embedding_str = json.dumps(embedding)
        now = datetime.now(UTC)
        expires_dt = (now + timedelta(seconds=expires_in_seconds)) if expires_in_seconds is not None else None

        try:
            with conn.cursor() as cur:
                trust_level = int(meta.pop("_trust_level", 2))
                source_prov = str(meta.pop("_source_provenance", "agent_direct"))
                cur.execute(
                    """
                    INSERT INTO agent_memory
                        (agent_id, memory_type, content, embedding, metadata, previous_hash, cryptographic_hash,
                         expires_at, importance_score, trust_level, source_provenance)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 5.0, %s, %s)
                    RETURNING memory_id, created_at
                    """,
                    (self.agent_id, memory_type, content, embedding_str, json.dumps(meta), prev_hash, crypto_hash,
                     expires_dt.isoformat() if expires_dt else None, trust_level, source_prov),
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("INSERT RETURNING did not return a row")

                workflow_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                    (self.agent_id, workflow_id, "memory_store",
                     json.dumps({"memory_type": memory_type, "content_preview": content[:100]})),
                )
                conn.commit()

                row_map = row._mapping if hasattr(row, '_mapping') else {"memory_id": row[0], "created_at": row[1]}
                result = MemoryRecord(
                    memory_id=str(row_map["memory_id"]),
                    agent_id=self.agent_id,
                    memory_type=memory_type,
                    content=content,
                    embedding=embedding,
                    metadata=meta,
                    previous_hash=prev_hash,
                    cryptographic_hash=crypto_hash,
                    created_at=row_map["created_at"],
                    expires_at=expires_dt,
                    importance_score=5.0,
                    trust_level=trust_level,
                    source_provenance=source_prov,
                )
                return result
        except Exception:
            conn.rollback()
            logger.exception("store failed, rolled back transaction")
            raise

    def _search_real(
        self,
        query: str,
        k: int,
        threshold: float,
        memory_type: str | None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("search_real called without a database connection")

        query_vector = self._embed(query)
        query_vector_str = json.dumps(query_vector)
        decay_rate = 0.01

        agent_filter = "agent_id LIKE %s"
        agent_param = f"{self.namespace}:%" if namespace_scope == "shared" else self.agent_id

        try:
            with conn.cursor() as cur:
                if memory_type:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS}, "
                        "(1.0 - (embedding <=> %s::vector)) * importance_score / "
                        "(1.0 + %s * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score "
                        "FROM agent_memory "
                        f"WHERE {agent_filter} AND memory_type = %s AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY decay_score DESC LIMIT %s",
                        (query_vector_str, decay_rate, agent_param, memory_type, k),
                    )
                else:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS}, "
                        "(1.0 - (embedding <=> %s::vector)) * importance_score / "
                        "(1.0 + %s * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score "
                        "FROM agent_memory "
                        f"WHERE {agent_filter} AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY decay_score DESC LIMIT %s",
                        (query_vector_str, decay_rate, agent_param, k),
                    )
                rows = cur.fetchall()
                results = []
                for r in rows:
                    decay = float(r[-1])
                    if decay >= threshold:
                        results.append(MemoryRecord.from_row(r[:-1]))
                return results[:k]
        except Exception:
            logger.exception("Search query failed", extra={"agent_id": self.agent_id, "query": query[:100]})
            return []

    def _list_all_real(
        self,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("_list_all_real called without a database connection")
        agent_filter = "agent_id LIKE %s" if namespace_scope == "shared" else "agent_id = %s"
        agent_param = f"{self.namespace}:%" if namespace_scope == "shared" else self.agent_id
        try:
            with conn.cursor() as cur:
                if memory_type:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"WHERE {agent_filter} AND memory_type = %s AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY created_at DESC",
                        (agent_param, memory_type),
                    )
                else:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"WHERE {agent_filter} AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY created_at DESC",
                        (agent_param,),
                    )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        except Exception:
            logger.exception("list_all query failed", extra={"agent_id": self.agent_id})
            return []

    def _get_memory_by_id_real(self, memory_id: str) -> MemoryRecord | None:
        conn = self._conn
        if conn is None:
            raise RuntimeError("get_memory_by_id_real called without a database connection")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory WHERE memory_id = %s",
                    (memory_id,),
                )
                row = cur.fetchone()
                if row is None:
                    return None
                return MemoryRecord.from_row(row)
        except Exception:
            logger.exception("get_memory_by_id failed", extra={"memory_id": memory_id})
            return None

    def _get_at_time_real(self, agent_id: str, timestamp: str) -> list[MemoryRecord]:
        conn_str = self._conn_str
        if conn_str is None:
            raise RuntimeError("get_at_time_real called without a database connection")

        if self._tt_conn is None or self._tt_conn.closed:
            import psycopg
            self._tt_conn = psycopg.connect(conn_str)
        with self._tt_conn.cursor() as cur:
            cur.execute("SET TRANSACTION AS OF SYSTEM TIME %s::TIMESTAMPTZ", (timestamp,))
            cur.execute(
                f"SELECT {_MEMORY_COLS} FROM agent_memory WHERE agent_id = %s ORDER BY created_at",
                (agent_id,),
            )
            return [MemoryRecord.from_row(r) for r in cur.fetchall()]

    def _audit_real(self, agent_id: str) -> list[AuditEntry]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("audit_real called without a database connection")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT audit_id, agent_id, workflow_id, action, details, recorded_at
                    FROM agent_audit
                    WHERE agent_id = %s
                    ORDER BY recorded_at DESC
                    LIMIT 100
                    """,
                    (agent_id,),
                )
                results = []
                for r in cur.fetchall():
                    results.append(AuditEntry(
                        audit_id=str(r[0]),
                        agent_id=str(r[1]),
                        workflow_id=str(r[2]),
                        action=str(r[3]),
                        details=dict(r[4]) if r[4] else {},
                        recorded_at=r[5],
                    ))
                return results
        except Exception:
            logger.exception("audit query failed", extra={"agent_id": agent_id})
            return []

    def _heal_real(self, agent_id: str) -> dict[str, Any]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("heal_real called without a database connection")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM agent_memory WHERE agent_id = %s AND expires_at <= now()",
                    (agent_id,),
                )
                conn.commit()
                return {"agent_id": agent_id, "pruned": cur.rowcount, "status": "healed"}
        except Exception:
            logger.exception("heal query failed", extra={"agent_id": agent_id})
            return {"agent_id": agent_id, "pruned": 0, "status": "error"}

    def _resolve_conflict_real(self, fact_a: str, fact_b: str, context: str) -> str:
        conn = self._conn
        if conn is None:
            raise RuntimeError("resolve_conflict_real called without a database connection")

        merged = f"{fact_a}; {fact_b}"
        try:
            with conn.cursor() as cur:
                payload = json.dumps({
                    "fact_a": fact_a, "fact_b": fact_b, "merged": merged, "context": context,
                })
                lock_resource = (
                    f"conflict:{int(hashlib.sha256((fact_a + fact_b).encode()).hexdigest(), 16)}"
                )
                cur.execute(
                    "INSERT INTO agent_coordination (agent_id, resource, lock_type, payload) "
                    "VALUES (%s, %s, 'exclusive', %s) RETURNING lock_id",
                    (self.agent_id, lock_resource, payload),
                )
                conn.commit()
            return merged
        except Exception:
            logger.exception("resolve_conflict failed, returning naive merge")
            return merged

    def _get_last_hash(self) -> str | None:
        conn = self._conn
        if conn is None:
            raise RuntimeError("get_last_hash called without a database connection")
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT 1",
                    (self.agent_id,),
                )
                row = cur.fetchone()
                return str(row[0]) if row else None
        except Exception:
            logger.exception("get_last_hash query failed")
            return None

    def _query_with_cache_real(
        self,
        query: str,
        llm_callback: Callable[[str], str],
        memory_type: str,
        threshold: float,
    ) -> tuple[str, dict]:
        results = self._search_real(query, k=1, threshold=threshold, memory_type=memory_type)
        if results:
            return results[0].content, {"cache": "hit", "memory_id": results[0].memory_id}
        response = llm_callback(query)
        self._store_real(memory_type, response, {"query": query, "from_cache": False}, None)
        return response, {"cache": "miss"}

    def _detect_anomalies_real(self, agent_id: str) -> list[dict]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("detect_anomalies_real called without a database connection")
        alerts = []
        try:
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
                    "SELECT content, created_at FROM agent_memory "
                    "WHERE agent_id = %s ORDER BY created_at DESC LIMIT 50",
                    (agent_id,),
                )
                rows = cur.fetchall()

            contents = [r[0] for r in rows]
            if len(contents) != len(set(contents)):
                alerts.append({
                    "type": "fact_turnover",
                    "severity": "medium",
                    "detail": "Duplicate content detected in recent memory",
                    "agent_id": agent_id,
                })

            if total > 100:
                alerts.append({
                    "type": "size_spike",
                    "severity": "info",
                    "detail": f"Memory count ({total}) exceeds 100 records",
                    "agent_id": agent_id,
                })
        except Exception:
            logger.exception("Anomaly detection query failed", extra={"agent_id": agent_id})

        return alerts

    def _diff_real(self, agent_id: str, timestamp_a: str, timestamp_b: str) -> dict:
        state_a = self._get_at_time_real(agent_id, timestamp_a)
        state_b = self._get_at_time_real(agent_id, timestamp_b)
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

    def _reinforce_real(self, memory_id: str, success: bool) -> dict:
        conn = self._conn
        if conn is None:
            raise RuntimeError("reinforce_real called without a database connection")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT importance_score, access_count FROM agent_memory "
                "WHERE memory_id = %s AND agent_id = %s",
                (memory_id, self.agent_id),
            )
            row = cur.fetchone()
            if not row:
                return {"status": "not_found"}

            base_imp = float(row[0]) or 5.0
            boost = 0.1  # small reinforcement for access
            if success:
                boost += 1.0  # positive outcome reinforcement
            new_imp = min(base_imp + boost, 10.0)

            cur.execute(
                "UPDATE agent_memory SET importance_score = %s, access_count = access_count + 1 "
                "WHERE memory_id = %s AND agent_id = %s",
                (new_imp, memory_id, self.agent_id),
            )
            conn.commit()
            return {
                "status": "reinforced",
                "memory_id": memory_id,
                "importance_score": new_imp,
                "delta": round(new_imp - base_imp, 2),
            }

    def _extract_triples(self, text: str) -> list[tuple[str, str, str, str, float]]:
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
        for pattern, rel_type, kind in patterns:
            for match in re.finditer(pattern, text, re.IGNORECASE):
                src, tgt = match.group(1).lower(), match.group(2).lower()
                triples.append((src, tgt, rel_type, kind, 1.0))
        return triples

    def _store_with_graph_real(
        self,
        content: str,
        metadata: dict[str, Any] | None,
        expires_in_seconds: int | None,
    ) -> tuple[MemoryRecord, list[EntityRecord], list[RelationRecord]]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("store_with_graph_real called without a database connection")
        record = self._store_real("fact", content, metadata, expires_in_seconds)
        triples = self._extract_triples(content)
        created_entities: list[EntityRecord] = []
        created_relations: list[RelationRecord] = []

        for src_name, tgt_name, rel_type, kind, confidence in triples:
            if kind == "entity_type":
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO agent_entities (agent_id, entity_type, name, valid_from) "
                        "VALUES (%s, %s, %s, now())",
                        (self.agent_id, tgt_name, src_name),
                    )
                    conn.commit()
            else:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO agent_entities (agent_id, entity_type, name, valid_from) "
                        "VALUES (%s, 'person', %s, now()) "
                        "ON CONFLICT DO NOTHING RETURNING entity_id",
                        (self.agent_id, src_name),
                    )
                    src_row = cur.fetchone()
                    eid_src = str(src_row[0]) if src_row else self._ensure_entity_id(cur, src_name)

                    cur.execute(
                        "INSERT INTO agent_entities (agent_id, entity_type, name, valid_from) "
                        "VALUES (%s, 'concept', %s, now()) "
                        "ON CONFLICT DO NOTHING RETURNING entity_id",
                        (self.agent_id, tgt_name),
                    )
                    tgt_row = cur.fetchone()
                    eid_tgt = str(tgt_row[0]) if tgt_row else self._ensure_entity_id(cur, tgt_name)

                    cur.execute(
                        "INSERT INTO agent_relations (agent_id, source_entity_id, target_entity_id, "
                        "relation_type, confidence, source_memory_id) VALUES (%s, %s, %s, %s, %s, %s) "
                        "RETURNING relation_id",
                        (self.agent_id, eid_src, eid_tgt, rel_type, confidence, record.memory_id),
                    )
                    conn.commit()

        with conn.cursor() as cur:
            cur.execute(
                "SELECT entity_id, agent_id, entity_type, name, attributes, valid_from, valid_until, created_at "
                "FROM agent_entities WHERE agent_id = %s ORDER BY created_at DESC",
                (self.agent_id,),
            )
            for r in cur.fetchall():
                created_entities.append(EntityRecord.from_row(r))

        return record, created_entities, created_relations

    def _ensure_entity_id(self, cur, name: str) -> str:
        cur.execute("SELECT entity_id FROM agent_entities WHERE agent_id = %s AND name = %s", (self.agent_id, name))
        row = cur.fetchone()
        if row is None:
            logger.warning("Entity not found after upsert", extra={"agent_id": self.agent_id, "name": name})
            return ""
        return str(row[0])

    def _graph_query_real(
        self,
        start_entity: str,
        relation_path: list[str] | None,
        hops: int,
    ) -> list[dict[str, Any]]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("graph_query_real called without a database connection")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT entity_id FROM agent_entities WHERE agent_id = %s AND name = %s LIMIT 1",
                (self.agent_id, start_entity),
            )
            row = cur.fetchone()
            if not row:
                return []
            start_id = str(row[0])

            found: list[dict[str, Any]] = []
            visited: set[str] = set()
            queue: list[tuple[str, int]] = [(start_id, 0)]

            while queue:
                eid, depth = queue.pop(0)
                if depth >= hops or eid in visited:
                    continue
                visited.add(eid)

                rel_type_filter = ""
                params: list[Any] = [eid]
                if relation_path:
                    placeholders = ", ".join(f"${i+2}" for i in range(len(relation_path)))
                    rel_type_filter = f"AND r.relation_type IN ({placeholders})"
                    params.extend(relation_path)

                cur.execute(
                    f"SELECT r.relation_type, r.confidence, r.source_memory_id, "
                    f"e.name AS target_name, e.entity_id AS target_id "
                    f"FROM agent_relations r JOIN agent_entities e ON r.target_entity_id = e.entity_id "
                    f"WHERE r.source_entity_id = $1 {rel_type_filter}",
                    params,
                )
                for rel_row in cur.fetchall():
                    found.append({
                        "source": start_entity,
                        "target": str(rel_row[3]),
                        "relation": str(rel_row[0]),
                        "confidence": float(rel_row[1]),
                        "depth": depth + 1,
                    })
                    queue.append((str(rel_row[4]), depth + 1))
            return found

    def _graph_at_time_real(self, timestamp: str, entity: str | None) -> dict[str, Any]:
        conn_str = self._conn_str
        if conn_str is None:
            raise RuntimeError("graph_at_time_real called without a database connection")
        import psycopg

        if self._tt_conn is None or self._tt_conn.closed:
            self._tt_conn = psycopg.connect(conn_str)
        with self._tt_conn.cursor() as cur:
            cur.execute("SET TRANSACTION AS OF SYSTEM TIME %s::TIMESTAMPTZ", (timestamp,))

            if entity:
                cur.execute(
                    "SELECT entity_id, agent_id, entity_type, name, attributes, "
                    "valid_from, valid_until, created_at "
                    "FROM agent_entities WHERE agent_id = %s AND name = %s",
                    (self.agent_id, entity),
                )
            else:
                cur.execute(
                    "SELECT entity_id, agent_id, entity_type, name, attributes, "
                    "valid_from, valid_until, created_at "
                    "FROM agent_entities WHERE agent_id = %s",
                    (self.agent_id,),
                )
            entities = [EntityRecord.from_row(r).to_dict() for r in cur.fetchall()]

            entity_ids = tuple(e["entity_id"] for e in entities)
            if entity_ids:
                cur.execute(
                    "SELECT r.relation_id, r.agent_id, r.source_entity_id, r.target_entity_id, "
                    "r.relation_type, r.confidence, r.valid_from, r.valid_until, r.source_memory_id, r.created_at "
                    "FROM agent_relations r WHERE r.source_entity_id IN %s OR r.target_entity_id IN %s",
                    (entity_ids, entity_ids),
                )
                relations = [dict(zip(
                    ["relation_id", "agent_id", "source_entity_id", "target_entity_id",
                     "relation_type", "confidence", "valid_from", "valid_until",
                     "source_memory_id", "created_at"], r, strict=True,
                )) for r in cur.fetchall()]
            else:
                relations = []

            return {"agent_id": self.agent_id, "timestamp": timestamp,
                    "entities": entities, "relations": relations}

    def _graph_stats_real(self) -> dict[str, Any]:
        conn = self._conn
        if conn is None:
            raise RuntimeError("graph_stats_real called without a database connection")
        with conn.cursor() as cur:
            entity_row = cur.execute(
                "SELECT COUNT(*) FROM agent_entities WHERE agent_id = %s", (self.agent_id,)
            ).fetchone()
            if entity_row is None:
                logger.error("COUNT query for entities returned no row")
                raise RuntimeError("COUNT query for entities did not return a row")
            entity_count = entity_row[0]

            relation_row = cur.execute(
                "SELECT COUNT(*) FROM agent_relations r "
                "JOIN agent_entities e ON r.source_entity_id = e.entity_id WHERE e.agent_id = %s",
                (self.agent_id,),
            ).fetchone()
            if relation_row is None:
                logger.error("COUNT query for relations returned no row")
                raise RuntimeError("COUNT query for relations did not return a row")
            relation_count = relation_row[0]

            cur.execute(
                "SELECT DISTINCT entity_type FROM agent_entities WHERE agent_id = %s ORDER BY entity_type",
                (self.agent_id,),
            )
            entity_types = [r[0] for r in cur.fetchall()]

            orphans_row = cur.execute(
                "SELECT COUNT(*) FROM agent_entities e WHERE e.agent_id = %s "
                "AND NOT EXISTS (SELECT 1 FROM agent_relations r "
                "WHERE r.source_entity_id = e.entity_id OR r.target_entity_id = e.entity_id)",
                (self.agent_id,),
            ).fetchone()
            if orphans_row is None:
                logger.error("COUNT query for orphans returned no row")
                raise RuntimeError("COUNT query for orphans did not return a row")
            orphans = orphans_row[0]

            return {"entities": entity_count, "relations": relation_count,
                    "orphans": orphans, "entity_types": entity_types}

    def _broadcast_real(self, event_type: str, payload: dict | None, namespace: str) -> MessageRecord:
        conn = self._conn
        if conn is None or conn.closed:
            raise RuntimeError("Connection is not open")
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO agent_messages (namespace, sender_agent_id, event_type, payload) "
                "VALUES (%s, %s, %s, %s) RETURNING message_id, created_at",
                (namespace, self.agent_id, event_type, json.dumps(payload or {})),
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("INSERT RETURNING did not return a row")
            conn.commit()
            row_map = row._mapping if hasattr(row, '_mapping') else {"message_id": row[0], "created_at": row[1]}
            return MessageRecord(
                message_id=str(row_map["message_id"]),
                namespace=namespace,
                sender_agent_id=self.agent_id,
                event_type=event_type,
                payload=payload,
                created_at=row_map["created_at"],
            )

    def _poll_messages_real(self, namespace: str) -> list[MessageRecord]:
        conn = self._conn
        if conn is None or conn.closed:
            raise RuntimeError("Connection is not open")
        with conn.cursor() as cur:
            cur.execute(
                "SELECT message_id, namespace, sender_agent_id, event_type, payload, "
                "created_at, expires_at, read FROM agent_messages "
                "WHERE namespace = %s AND read = FALSE AND (expires_at IS NULL OR expires_at > now()) "
                "ORDER BY created_at ASC "
                "FOR UPDATE SKIP LOCKED",
                (namespace,),
            )
            rows = cur.fetchall()
            if rows:
                cur.execute(
                    "UPDATE agent_messages SET read = TRUE "
                    "WHERE message_id = ANY(%s)",
                    (tuple(r[0] for r in rows),),
                )
            conn.commit()
            results = []
            for r in rows:
                payload_raw = r[4]
                results.append(MessageRecord(
                    message_id=str(r[0]),
                    namespace=str(r[1]),
                    sender_agent_id=str(r[2]),
                    event_type=str(r[3]),
                    payload=_parse_payload(payload_raw),
                    created_at=r[5],
                    expires_at=r[6],
                    read=bool(r[7]),
                ))
            return results

    def _embed(self, text: str) -> list[float]:
        """
        Generate a 1024-dim embedding using AWS Bedrock Titan Embed Text V2.
        Retries up to 3 times with exponential backoff on ThrottlingException.
        Falls back to a deterministic hash-based vector if Bedrock is unavailable
        (no AWS credentials, network error, or BASTION_MOCK mode).
        """
        import random
        import time

        client = _get_bedrock_client()
        if client is None:
            return _hash_fallback_embed(text)

        body = json.dumps({"inputText": text, "dimensions": _EMBED_DIM, "normalize": True})
        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                response = client.invoke_model(
                    modelId=_BEDROCK_MODEL_ID,
                    body=body,
                    contentType="application/json",
                    accept="application/json",
                )
                result: Any = json.loads(response["body"].read())
                embedding: list[float] = result["embedding"]
                return embedding
            except Exception as exc:
                exc_name = type(exc).__name__
                # Retry on throttling / service unavailable with exponential backoff + jitter
                if attempt < max_retries and exc_name in ("ThrottlingException", "ServiceUnavailableException"):
                    sleep_secs = (2 ** attempt) + random.uniform(0, 1)
                    logger.warning(
                        "Bedrock throttled (attempt %d/%d), retrying in %.1fs",
                        attempt + 1, max_retries, sleep_secs,
                    )
                    time.sleep(sleep_secs)
                    continue
                logger.exception("Bedrock embedding failed after %d attempts, falling back to hash", attempt + 1)
                return _hash_fallback_embed(text)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
