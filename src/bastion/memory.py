from __future__ import annotations

import hashlib
import json
import os
import subprocess
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from bastion import mock as _mock
from bastion.models import AuditEntry, ClusterInfo, MemoryRecord

_MEMORY_COLS = (
    "memory_id, agent_id, memory_type, content, embedding, "
    "metadata, previous_hash, cryptographic_hash, "
    "created_at, expires_at, access_count"
)


class BastionMemory:
    def __init__(
        self,
        agent_id: str,
        connection_string: str | None = None,
        mock: bool | None = None,
    ):
        self.agent_id = agent_id
        self._mock = mock if mock is not None else os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")
        self._conn = None
        self._conn_str = connection_string

        if not self._mock:
            if not connection_string:
                raise ValueError("connection_string is required when mock=False")
            import psycopg
            self._conn = psycopg.connect(connection_string)

    def store(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> MemoryRecord:
        if self._mock:
            return _mock.mock_store_memory(self.agent_id, memory_type, content, metadata, expires_in_seconds)
        return self._store_real(memory_type, content, metadata, expires_in_seconds)

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
    ) -> list[MemoryRecord]:
        if self._mock:
            return _mock.mock_search_memory(self.agent_id, query, k, threshold, memory_type)
        return self._search_real(query, k, threshold, memory_type)

    def get_at_time(self, timestamp: str, agent_id: str | None = None) -> list[MemoryRecord]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_get_memory_at_time(agent_id, timestamp)
        return self._get_at_time_real(agent_id, timestamp)

    def audit(self, agent_id: str | None = None) -> list[AuditEntry]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_get_audit(agent_id)
        return self._audit_real(agent_id)

    def heal(self, agent_id: str | None = None) -> dict[str, Any]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_heal(agent_id)
        return self._heal_real(agent_id)

    def resolve_conflict(self, fact_a: str, fact_b: str, context: str | None = None) -> str:
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
        if self._mock:
            return _mock.mock_query_with_cache(self.agent_id, query, llm_callback, memory_type, threshold)
        return self._query_with_cache_real(query, llm_callback, memory_type, threshold)

    def detect_anomalies(self, agent_id: str | None = None) -> list[dict]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_detect_anomalies(agent_id)
        return self._detect_anomalies_real(agent_id)

    def diff(self, timestamp_a: str, timestamp_b: str, agent_id: str | None = None) -> dict:
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

    def close(self):
        if self._conn and not self._conn.closed:
            self._conn.close()

    def _store_real(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None,
        expires_in_seconds: int | None,
    ) -> MemoryRecord:
        prev_hash = self._get_last_hash()
        meta = metadata or {}
        crypto_hash = hashlib.sha256(
            (content + json.dumps(meta, sort_keys=True) + (prev_hash or "")).encode()
        ).hexdigest()

        embedding = self._embed(content)
        embedding_str = json.dumps(embedding)
        now = datetime.now(timezone.utc)
        expires_at = (now + timedelta(seconds=expires_in_seconds)).isoformat() if expires_in_seconds else None

        with self._conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO agent_memory
                    (agent_id, memory_type, content, embedding, metadata, previous_hash, cryptographic_hash, expires_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING memory_id, created_at
                """,
                (self.agent_id, memory_type, content, embedding_str, json.dumps(meta), prev_hash, crypto_hash,
                 expires_at),
            )
            row = cur.fetchone()
            self._conn.commit()

            workflow_id = str(uuid.uuid4())
            with self._conn.cursor() as cur2:
                cur2.execute(
                    """
                    INSERT INTO agent_audit (agent_id, workflow_id, action, details)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (self.agent_id, workflow_id, "memory_store",
                     json.dumps({"memory_type": memory_type, "content_preview": content[:100]})),
                )
                self._conn.commit()

            return MemoryRecord(
                memory_id=str(row[0]),
                agent_id=self.agent_id,
                memory_type=memory_type,
                content=content,
                embedding=embedding,
                metadata=meta,
                previous_hash=prev_hash,
                cryptographic_hash=crypto_hash,
                created_at=row[1],
            )

    def _search_real(
        self,
        query: str,
        k: int,
        threshold: float,
        memory_type: str | None,
    ) -> list[MemoryRecord]:
        query_vector = self._embed(query)
        query_vector_str = json.dumps(query_vector)
        max_distance = 1.0 - threshold

        with self._conn.cursor() as cur:
            if memory_type:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s AND memory_type = %s AND (expires_at IS NULL OR expires_at > now()) "
                    "AND embedding <=> %s::vector <= %s "
                    "ORDER BY embedding <=> %s::vector LIMIT %s",
                    (self.agent_id, memory_type, query_vector_str, max_distance, query_vector_str, k),
                )
            else:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s AND (expires_at IS NULL OR expires_at > now()) "
                    "AND embedding <=> %s::vector <= %s "
                    "ORDER BY embedding <=> %s::vector LIMIT %s",
                    (self.agent_id, query_vector_str, max_distance, query_vector_str, k),
                )
            return [MemoryRecord.from_row(r) for r in cur.fetchall()]

    def _get_at_time_real(self, agent_id: str, timestamp: str) -> list[MemoryRecord]:
        import psycopg

        conn2 = psycopg.connect(self._conn_str)
        try:
            with conn2.cursor() as cur:
                cur.execute("SET TRANSACTION AS OF SYSTEM TIME %s::TIMESTAMPTZ", (timestamp,))
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory WHERE agent_id = %s ORDER BY created_at",
                    (agent_id,),
                )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        finally:
            conn2.close()

    def _audit_real(self, agent_id: str) -> list[AuditEntry]:
        with self._conn.cursor() as cur:
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

    def _heal_real(self, agent_id: str) -> dict[str, Any]:
        with self._conn.cursor() as cur:
            cur.execute(
                "DELETE FROM agent_memory WHERE agent_id = %s AND expires_at < now()",
                (agent_id,),
            )
            self._conn.commit()
            return {"agent_id": agent_id, "pruned": cur.rowcount, "status": "healed"}

    def _resolve_conflict_real(self, fact_a: str, fact_b: str, context: str) -> str:
        import psycopg.errors

        merged = f"{fact_a}; {fact_b}"
        try:
            with self._conn.cursor() as cur:
                payload = json.dumps({
                    "fact_a": fact_a, "fact_b": fact_b, "merged": merged, "context": context,
                })
                cur.execute(
                    "INSERT INTO agent_coordination (agent_id, resource, lock_type, payload) "
                    "VALUES (%s, %s, 'exclusive', %s) RETURNING lock_id",
                    (self.agent_id, f"conflict:{hash(fact_a + fact_b)}", payload),
                )
                self._conn.commit()
            return merged
        except psycopg.errors.SerializationFailure:
            return merged

    def _get_last_hash(self) -> str | None:
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT 1",
                (self.agent_id,),
            )
            row = cur.fetchone()
            return str(row[0]) if row else None

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
        alerts = []
        with self._conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM agent_memory WHERE agent_id = %s",
                (agent_id,),
            )
            total = cur.fetchone()[0]

            cur.execute(
                "SELECT content, created_at FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT 50",
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

    def _embed(self, text: str) -> list[float]:
        return [0.0] * 1536

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
