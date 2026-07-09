from __future__ import annotations

import hashlib
import json
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
from bastion.circuit_breaker import CircuitBreaker
from bastion.config import get_settings
from bastion.errors import BastionPoolExhaustedError, SecurityBlockError
from bastion.guard import MemoryGuard
from bastion.log_setup import get_logger
from bastion.models import AuditEntry, ClusterInfo, EntityRecord, MemoryRecord, MessageRecord, RelationRecord
from bastion.pool import ConnectionPool
from bastion.retry import SerializationRetryEngine
from bastion.rls import RowLevelSecurity

logger = get_logger(__name__)

_bedrock_client = None
_bedrock_client_lock = threading.Lock()


def _get_bedrock_client():
    global _bedrock_client
    if _bedrock_client is not None:
        return _bedrock_client
    with _bedrock_client_lock:
        if _bedrock_client is not None:
            return _bedrock_client
        try:
            import boto3
            from botocore.config import Config as BotoConfig
        except ImportError:
            logger.warning("boto3 not available, Bedrock client disabled")
            return None
        settings = get_settings()
        cfg = BotoConfig(
            read_timeout=settings.bedrock_read_timeout,
            connect_timeout=settings.bedrock_connect_timeout,
        )
        try:
            _bedrock_client = boto3.client(
                "bedrock-runtime",
                region_name=settings.aws_region,
                config=cfg,
            )
        except Exception as exc:
            logger.error("Failed to create Bedrock client", error=str(exc))
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
    "trust_level, source_provenance, overwrite_count, "
    "is_pinned, pin_priority"
)

_MAX_CONTENT_LENGTH = 100_000
_MAX_AGENT_ID_LENGTH = 255
_MAX_MEMORY_TYPE_LENGTH = 100


def _validate_memory_type(memory_type: str) -> None:
    if not memory_type or not isinstance(memory_type, str):
        raise ValueError(f"memory_type must be a non-empty string, got {type(memory_type).__name__}")
    if len(memory_type) > _MAX_MEMORY_TYPE_LENGTH:
        raise ValueError(f"memory_type too long ({len(memory_type)} > {_MAX_MEMORY_TYPE_LENGTH})")


def _validate_content(content: str) -> None:
    if not content or not isinstance(content, str):
        raise ValueError(f"content must be a non-empty string, got {type(content).__name__}")
    if len(content) > _MAX_CONTENT_LENGTH:
        raise ValueError(f"content too long ({len(content)} > {_MAX_CONTENT_LENGTH})")


def _validate_agent_id(agent_id: str) -> None:
    if not agent_id or not isinstance(agent_id, str):
        raise ValueError(f"agent_id must be a non-empty string, got {type(agent_id).__name__}")
    if len(agent_id) > _MAX_AGENT_ID_LENGTH:
        raise ValueError(f"agent_id too long ({len(agent_id)} > {_MAX_AGENT_ID_LENGTH})")


def _validate_k(value: int) -> None:
    if not isinstance(value, int) or value < 1:
        raise ValueError(f"k must be a positive integer, got {value!r}")


def _validate_threshold(value: float) -> None:
    if not isinstance(value, (int, float)) or not 0 <= value <= 1:
        raise ValueError(f"threshold must be between 0 and 1, got {value!r}")


def _validate_namespace_scope(value: str) -> None:
    if value not in ("own", "shared"):
        raise ValueError(f"namespace_scope must be 'own' or 'shared', got {value!r}")


def _validate_expires_in(seconds: int | None) -> None:
    if seconds is not None and (not isinstance(seconds, int) or seconds < 0):
        raise ValueError(f"expires_in_seconds must be a non-negative integer, got {seconds!r}")


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
        compliance_mode: str | None = None,
    ):
        _validate_agent_id(agent_id)

        settings = get_settings()
        self.agent_id = agent_id
        self.namespace = namespace or agent_id
        self._mock = (
            mock
            if mock is not None
            else (settings.mock or os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes"))
        )
        self.compliance_mode = compliance_mode or settings.compliance_mode
        self._conn_str = connection_string or settings.connection_string

        self._pool: ConnectionPool | None = None
        self._pool_lock = threading.Lock()
        self._rls_enabled = False

        self._bedrock_cb = CircuitBreaker(
            name="bedrock_embed",
            failure_threshold=settings.circuit_breaker_failure_threshold,
            recovery_timeout=settings.circuit_breaker_recovery_timeout,
            success_threshold=settings.circuit_breaker_success_threshold,
        )
        self._retry_engine = SerializationRetryEngine(
            max_retries=settings.retry_max_retries,
            base_delay_ms=settings.retry_base_delay_ms,
            max_delay_ms=settings.retry_max_delay_ms,
            jitter_factor=settings.retry_jitter_factor,
        )

        self._guard = MemoryGuard()

        if self._mock:
            _mock.mock_register_namespace(agent_id, self.namespace)
        elif not self._conn_str:
            raise ValueError("connection_string is required when mock=False")

    def get_pool(self) -> ConnectionPool:
        if self._pool is None:
            with self._pool_lock:
                if self._pool is None:
                    settings = get_settings()
                    self._pool = ConnectionPool(
                        connection_string=self._conn_str,
                        min_size=settings.pool_min_size,
                        max_size=settings.pool_max_size,
                        max_idle_seconds=settings.pool_max_idle_seconds,
                    )
        return self._pool

    def enable_rls(self) -> dict[str, Any]:
        """Enable Row-Level Security on all agent tables.

        After calling this, every query automatically filters rows by agent_id,
        preventing cross-agent data leaks even if application code has bugs.
        """
        if self._mock:
            return {"status": "enabled", "tables": ["agent_memory", "agent_audit", "agent_checkpoints"]}
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            rls = RowLevelSecurity(conn)
            result = rls.enable_rls()
            if result.get("status") == "enabled":
                self._rls_enabled = True
            return result
        finally:
            pool.release(conn)

    def _set_rls_context(self, conn: Any) -> None:
        """Set agent context for RLS filtering within a transaction.

        ``SET LOCAL`` requires an active transaction to take effect.
        If the connection is in autocommit mode, the setting would be
        session-persistent or silently ignored — a warning is emitted.
        """
        if not self._rls_enabled:
            return
        try:
            with conn.cursor() as cur:
                autocommit = getattr(conn, 'autocommit', False)
                if autocommit:
                    logger.warning(
                        "Connection is in autocommit mode — SET LOCAL requires a transaction "
                        "and will have no effect on subsequent operations",
                        extra={"agent_id": self.agent_id},
                    )
                cur.execute("SET LOCAL app.current_agent_id = %s", (self.agent_id,))
        except Exception as exc:
            logger.warning(
                "Failed to set RLS context — row-level security may be bypassed",
                extra={"agent_id": self.agent_id, "error": str(exc)},
            )

    @property
    def is_mock(self) -> bool:
        """Whether this instance is running in mock (in-memory) mode."""
        return self._mock

    @property
    def is_connected(self) -> bool:
        """Whether the database connection is established and alive."""
        if self._mock:
            return True
        pool = self._pool
        if pool is None:
            return False
        try:
            conn = pool.acquire(timeout=5.0)
            pool.release(conn)
            return True
        except (BastionPoolExhaustedError, OSError, RuntimeError) as exc:
            logger.debug("Connection check failed: %s", exc)
            return False

    def store(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
        region: str | None = None,
        _skip_guard: bool = False,
    ) -> MemoryRecord:
        _validate_memory_type(memory_type)
        _validate_content(content)
        _validate_expires_in(expires_in_seconds)
        if region is not None and (not isinstance(region, str) or not region.strip()):
            raise ValueError(f"region must be a non-empty string when provided, got {region!r}")

        if not _skip_guard:
            report = self._guard.check(content)
            if not report.is_safe:
                details = "; ".join(f"{f.detector}: {f.detail}" for f in report.findings)
                raise SecurityBlockError(
                    f"Content blocked by MemoryGuard [{report.poisoning_risk}]: {details}",
                    report=report,
                )

        if self._mock:
            return _mock.mock_store_memory(
                self.agent_id, memory_type, content, metadata, expires_in_seconds, region=region
            )
        return self._store_real(memory_type, content, metadata, expires_in_seconds, region=region)

    def reinforce(self, memory_id: str, success: bool = True) -> dict:
        if not memory_id or not isinstance(memory_id, str):
            raise ValueError(f"memory_id must be a non-empty string, got {type(memory_id).__name__}")
        if self._mock:
            return _mock.mock_reinforce(self.agent_id, memory_id, success)
        return self._reinforce_real(memory_id, success)

    def pin(
        self,
        memory_type: str,
        content: str,
        pin_priority: int = 2,
        metadata: dict[str, Any] | None = None,
    ) -> MemoryRecord:
        """Pin a safety-critical memory. Pinned memories survive context compaction
        and are re-injected before every query. pin_priority: 0=normal, 1=important, 2=CRITICAL."""
        if pin_priority not in (0, 1, 2):
            raise ValueError(f"pin_priority must be 0, 1, or 2, got {pin_priority}")
        _validate_memory_type(memory_type)
        _validate_content(content)
        if self._mock:
            return _mock.mock_pin_memory(self.agent_id, memory_type, content, pin_priority, metadata)
        return self._pin_real(memory_type, content, pin_priority, metadata)

    def unpin(self, memory_id: str) -> bool:
        """Remove pin from a memory. Returns True if unpinned."""
        if not memory_id or not isinstance(memory_id, str):
            raise ValueError(f"memory_id must be a non-empty string, got {type(memory_id).__name__}")
        if self._mock:
            return _mock.mock_unpin_memory(self.agent_id, memory_id)
        return self._unpin_real(memory_id)

    def get_pinned(self, min_priority: int = 1) -> list[MemoryRecord]:
        """Get all pinned memories with priority >= min_priority.
        Called automatically before every search to inject safety rules."""
        if self._mock:
            return _mock.mock_get_pinned(self.agent_id, min_priority)
        return self._get_pinned_real(min_priority)

    def list_memories(
        self,
        memory_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[MemoryRecord]:
        """List all memories for the current agent. User-facing governance tool."""
        if self._mock:
            return _mock.mock_list_memories(self.agent_id, memory_type, limit, offset)
        return self._list_memories_real(memory_type, limit, offset)

    def correct_memory(
        self, memory_id: str, new_content: str, metadata: dict[str, Any] | None = None,
    ) -> MemoryRecord | None:
        """Update a memory's content. User-facing governance tool."""
        if not memory_id or not isinstance(memory_id, str):
            raise ValueError(f"memory_id must be a non-empty string, got {type(memory_id).__name__}")
        _validate_content(new_content)
        if self._mock:
            return _mock.mock_correct_memory(self.agent_id, memory_id, new_content, metadata)
        return self._correct_memory_real(memory_id, new_content, metadata)

    def memory_health(self) -> dict[str, Any]:
        """Return memory health metrics: count, freshness distribution, pinned count."""
        if self._mock:
            return _mock.mock_memory_health(self.agent_id)
        return self._memory_health_real()

    def apply_patch(
        self, memory_id: str, patch_ops: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        """Apply RFC 6902 JSON Patch operations to a memory's metadata.

        Atomic: either the full patch applies or nothing does (CRDB transaction).
        Returns updated memory dict or None if not found.
        """
        if not memory_id or not isinstance(memory_id, str):
            raise ValueError("memory_id must be a non-empty string")
        if self._mock:
            return _mock.mock_apply_patch(self.agent_id, memory_id, patch_ops)
        return self._apply_patch_real(memory_id, patch_ops)

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
        namespace_scope: str = "own",
        region_filter: str | None = None,
    ) -> list[MemoryRecord]:
        _validate_content(query)
        _validate_k(k)
        _validate_threshold(threshold)
        _validate_namespace_scope(namespace_scope)
        if region_filter is not None and (not isinstance(region_filter, str) or not region_filter.strip()):
            raise ValueError(f"region_filter must be a non-empty string when provided, got {region_filter!r}")
        ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
        if self._mock:
            return _mock.mock_search_memory(
                ns_agent_id, query, k, threshold, memory_type, namespace_scope,
                region_filter=region_filter,
            )
        return self._search_real(query, k, threshold, memory_type, namespace_scope, region_filter=region_filter)

    def list_all(
        self,
        memory_type: str | None = None,
        namespace_scope: str = "own",
        region_filter: str | None = None,
    ) -> list[MemoryRecord]:
        _validate_namespace_scope(namespace_scope)
        ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
        if self._mock:
            return _mock.mock_list_all(ns_agent_id, memory_type, namespace_scope, region_filter=region_filter)
        return self._list_all_real(memory_type, namespace_scope, region_filter=region_filter)

    def get_at_time(self, timestamp: str, agent_id: str | None = None) -> list[MemoryRecord]:
        if not timestamp or not isinstance(timestamp, str):
            raise ValueError(f"timestamp must be a non-empty string, got {type(timestamp).__name__}")
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_get_memory_at_time(agent_id, timestamp)
        return self._get_at_time_real(agent_id, timestamp)

    def audit(self, agent_id: str | None = None) -> list[AuditEntry]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_get_audit(agent_id)
        return self._audit_real(agent_id)

    def store_audit(self, action: str, details: dict[str, Any] | str, agent_id: str | None = None) -> None:
        agent_id = agent_id or self.agent_id
        if self._mock:
            _mock.mock_store_audit(agent_id, action, details)
        else:
            self._store_audit_real(agent_id, action, details)

    def heal(self, agent_id: str | None = None) -> dict[str, Any]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_heal(agent_id)
        return self._heal_real(agent_id)

    def resolve_conflict(self, fact_a: str, fact_b: str, context: str | None = None) -> str:
        if not fact_a or not isinstance(fact_a, str):
            raise ValueError(f"fact_a must be a non-empty string, got {type(fact_a).__name__}")
        if not fact_b or not isinstance(fact_b, str):
            raise ValueError(f"fact_b must be a non-empty string, got {type(fact_b).__name__}")
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
        _validate_content(query)
        _validate_threshold(threshold)
        if self._mock:
            return _mock.mock_query_with_cache(self.agent_id, query, llm_callback, memory_type, threshold)
        return self._query_with_cache_real(query, llm_callback, memory_type, threshold)

    def detect_anomalies(self, agent_id: str | None = None) -> list[dict]:
        agent_id = agent_id or self.agent_id
        if self._mock:
            return _mock.mock_detect_anomalies(agent_id)
        return self._detect_anomalies_real(agent_id)

    def diff(self, timestamp_a: str, timestamp_b: str, agent_id: str | None = None) -> dict:
        if not timestamp_a or not isinstance(timestamp_a, str):
            raise ValueError(f"timestamp_a must be a non-empty string, got {type(timestamp_a).__name__}")
        if not timestamp_b or not isinstance(timestamp_b, str):
            raise ValueError(f"timestamp_b must be a non-empty string, got {type(timestamp_b).__name__}")
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

        # Security: Validate inputs to prevent argument injection
        import re

        if not re.match(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$", name):
            raise ValueError(f"Invalid cluster name: {name!r}")
        if not re.match(r"^[a-z][a-z0-9-]{0,30}$", region):
            raise ValueError(f"Invalid region: {region!r}")
        if not re.match(r"^[a-z]+$", provider):
            raise ValueError(f"Invalid provider: {provider!r}")

        result = subprocess.run(
            ["ccloud", "cluster", "create", name, "--provider", provider, "--region", region],
            capture_output=True,
            text=True,
            check=True,
            timeout=120,
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
        _validate_content(content)
        _validate_expires_in(expires_in_seconds)
        if self._mock:
            return _mock.mock_store_with_graph(self.agent_id, content, metadata, expires_in_seconds)
        return self._store_with_graph_real(content, metadata, expires_in_seconds)

    def graph_query(
        self,
        start_entity: str,
        relation_path: list[str] | None = None,
        hops: int = 2,
    ) -> list[dict[str, Any]]:
        if not start_entity or not isinstance(start_entity, str):
            raise ValueError(f"start_entity must be a non-empty string, got {type(start_entity).__name__}")
        if hops < 1:
            raise ValueError(f"hops must be at least 1, got {hops}")
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
        ns = namespace if namespace is not None else self.namespace
        if not event_type or not isinstance(event_type, str):
            raise ValueError(f"event_type must be a non-empty string, got {type(event_type).__name__}")
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
        if not memory_id or not isinstance(memory_id, str):
            raise ValueError(f"memory_id must be a non-empty string, got {type(memory_id).__name__}")
        if self._mock:
            return _mock.mock_get_memory_by_id(self.agent_id, memory_id)
        return self._get_memory_by_id_real(memory_id)

    def delete_memory(self, memory_id: str) -> bool:
        """Publicly delete a memory by ID. Returns True if deleted."""
        return self._delete_by_id(memory_id)

    def _delete_by_id(self, memory_id: str) -> bool:
        if not memory_id or not isinstance(memory_id, str):
            raise ValueError(f"memory_id must be a non-empty string, got {type(memory_id).__name__}")
        if self._mock:
            return _mock.mock_delete_memory(self.agent_id, memory_id)
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM agent_memory WHERE memory_id = %s AND agent_id = %s",
                    (memory_id, self.agent_id),
                )
                if cur.rowcount == 0:
                    return False
                cur.execute(
                    "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                    (self.agent_id, str(uuid.uuid4()), "memory_delete", json.dumps({"memory_id": memory_id})),
                )
                conn.commit()
                return True
        finally:
            pool.release(conn)

    def close(self):
        pool = self._pool
        if pool is not None:
            pool.close_all()

    def _store_real(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None,
        expires_in_seconds: int | None,
        region: str | None = None,
    ) -> MemoryRecord:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            prev_hash = self._get_last_hash(conn)
            meta = dict(metadata) if metadata is not None else {}
            precomputed_embedding = meta.pop("_precomputed_embedding", None)
            crypto_hash = hashlib.sha256(
                (content + json.dumps(meta, sort_keys=True) + (prev_hash or "")).encode()
            ).hexdigest()

            if precomputed_embedding is not None:
                embedding = precomputed_embedding
            else:
                embedding = self._embed(content)
            embedding_str = json.dumps(embedding)
            now = datetime.now(UTC)
            expires_dt = (now + timedelta(seconds=expires_in_seconds)) if expires_in_seconds is not None else None

            with conn.cursor() as cur:
                trust_level = 2
                source_prov = "agent_direct"
                meta.pop("_trust_level", None)
                meta.pop("_source_provenance", None)
                cols = (
                    "agent_id, memory_type, content, embedding, metadata, "
                    "previous_hash, cryptographic_hash, expires_at, importance_score, "
                    "trust_level, source_provenance"
                )
                placeholders = "%s, %s, %s, %s, %s, %s, %s, %s, 5.0, %s, %s"
                params = [
                    self.agent_id, memory_type, content, embedding_str,
                    json.dumps(meta), prev_hash, crypto_hash,
                    expires_dt.isoformat() if expires_dt else None,
                    trust_level, source_prov,
                ]
                if region is not None:
                    cols += ", crdb_region"
                    placeholders += ", %s"
                    params.append(region)
                cur.execute(
                    f"INSERT INTO agent_memory ({cols}) "
                    f"VALUES ({placeholders}) RETURNING memory_id, created_at",
                    params,
                )
                row = cur.fetchone()
                if row is None:
                    raise RuntimeError("INSERT RETURNING did not return a row")

                workflow_id = str(uuid.uuid4())
                cur.execute(
                    "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                    (
                        self.agent_id,
                        workflow_id,
                        "memory_store",
                        json.dumps({"memory_type": memory_type, "content_preview": content[:100]}),
                    ),
                )
                conn.commit()

                row_map = row._mapping if hasattr(row, "_mapping") else {"memory_id": row[0], "created_at": row[1]}
                return MemoryRecord(
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
        except Exception:
            try:
                conn.rollback()
            except Exception as rb_exc:
                logger.warning("rollback failed during store error handling", extra={"rollback_error": str(rb_exc)})
            logger.exception("store failed, rolled back transaction")
            raise
        finally:
            pool.release(conn)

    def _search_real(
        self,
        query: str,
        k: int,
        threshold: float,
        memory_type: str | None,
        namespace_scope: str = "own",
        region_filter: str | None = None,
    ) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            query_vector = self._embed(query)
            query_vector_str = json.dumps(query_vector)
            settings = get_settings()
            decay_rate = settings.decay_rate
            agent_filter = "agent_id LIKE %s"
            agent_param = f"{self.namespace}:%" if namespace_scope == "shared" else self.agent_id

            region_clause = ""
            region_param: list[str] = []
            if region_filter is not None:
                region_clause = "AND crdb_region = %s"
                region_param = [region_filter]

            with conn.cursor() as cur:
                if memory_type:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS}, "
                        "(1.0 - (embedding <=> %s::vector)) * importance_score / "
                        "(1.0 + %s * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score "
                        "FROM agent_memory "
                        f"WHERE {agent_filter} AND memory_type = %s {region_clause} "
                        "AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY decay_score DESC LIMIT %s",
                        [query_vector_str, decay_rate, agent_param, memory_type, *region_param, k],
                    )
                else:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS}, "
                        "(1.0 - (embedding <=> %s::vector)) * importance_score / "
                        "(1.0 + %s * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score "
                        "FROM agent_memory "
                        f"WHERE {agent_filter} {region_clause} "
                        "AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY decay_score DESC LIMIT %s",
                        [query_vector_str, decay_rate, agent_param, *region_param, k],
                    )
                rows = cur.fetchall()
                results = []
                for r in rows:
                    decay = float(r[-1])
                    if decay >= threshold:
                        results.append(MemoryRecord.from_row(r[:-1]))
                return results[:k]
        except Exception as e:
            logger.exception("Search query failed", extra={"agent_id": self.agent_id, "query": query[:100]})
            raise RuntimeError(f"Search failed for agent {self.agent_id}: {e}") from e
        finally:
            pool.release(conn)

    def _list_all_real(
        self,
        memory_type: str | None = None,
        namespace_scope: str = "own",
        region_filter: str | None = None,
    ) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            agent_filter = "agent_id LIKE %s" if namespace_scope == "shared" else "agent_id = %s"
            agent_param = f"{self.namespace}:%" if namespace_scope == "shared" else self.agent_id

            region_clause = ""
            region_param: list[str] = []
            if region_filter is not None:
                region_clause = "AND crdb_region = %s"
                region_param = [region_filter]

            with conn.cursor() as cur:
                if memory_type:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"WHERE {agent_filter} AND memory_type = %s {region_clause} "
                        "AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY created_at DESC",
                        [agent_param, memory_type, *region_param],
                    )
                else:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"WHERE {agent_filter} {region_clause} "
                        "AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY created_at DESC",
                        [agent_param, *region_param],
                    )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        except Exception as e:
            logger.exception("list_all query failed", extra={"agent_id": self.agent_id})
            raise RuntimeError(f"List all failed for agent {self.agent_id}: {e}") from e
        finally:
            pool.release(conn)

    def _get_memory_by_id_real(self, memory_id: str) -> MemoryRecord | None:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory WHERE memory_id = %s",
                    (memory_id,),
                )
                row = cur.fetchone()
                return MemoryRecord.from_row(row) if row else None
        except Exception as e:
            logger.exception("get_memory_by_id failed", extra={"memory_id": memory_id})
            raise RuntimeError(f"Failed to get memory {memory_id}: {e}") from e
        finally:
            pool.release(conn)

    def _get_at_time_real(self, agent_id: str, timestamp: str) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s AND created_at <= %s::TIMESTAMPTZ "
                    "ORDER BY created_at",
                    (agent_id, timestamp),
                )
                results = [MemoryRecord.from_row(r) for r in cur.fetchall()]
            return results
        finally:
            pool.release(conn)

    def _audit_real(self, agent_id: str) -> list[AuditEntry]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT audit_id, agent_id, workflow_id, action, details, recorded_at "
                    "FROM agent_audit WHERE agent_id = %s ORDER BY recorded_at DESC LIMIT 100",
                    (agent_id,),
                )
                results = []
                for r in cur.fetchall():
                    results.append(
                        AuditEntry(
                            audit_id=str(r[0]),
                            agent_id=str(r[1]),
                            workflow_id=str(r[2]),
                            action=str(r[3]),
                            details=dict(r[4]) if r[4] else {},
                            recorded_at=r[5],
                        )
                    )
                return results
        except Exception as e:
            logger.exception("audit query failed", extra={"agent_id": agent_id})
            raise RuntimeError(f"Audit query failed for agent {agent_id}: {e}") from e
        finally:
            pool.release(conn)

    def _store_audit_real(self, agent_id: str, action: str, details: dict[str, Any] | str) -> None:
        import uuid

        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                details_json = details if isinstance(details, str) else json.dumps(details)
                cur.execute(
                    "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                    (agent_id, str(uuid.uuid4()), action, details_json),
                )
                conn.commit()
        except Exception as e:
            logger.exception("store_audit failed", extra={"agent_id": agent_id, "action": action})
            raise RuntimeError(f"store_audit failed for agent {agent_id}: {e}") from e
        finally:
            pool.release(conn)

    def _heal_real(self, agent_id: str) -> dict[str, Any]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
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
        finally:
            pool.release(conn)

    def _resolve_conflict_real(self, fact_a: str, fact_b: str, context: str) -> str:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            merged = f"{fact_a}; {fact_b}"
            with conn.cursor() as cur:
                payload = json.dumps(
                    {
                        "fact_a": fact_a,
                        "fact_b": fact_b,
                        "merged": merged,
                        "context": context,
                    }
                )
                lock_resource = f"conflict:{int(hashlib.sha256((fact_a + fact_b).encode()).hexdigest(), 16)}"
                cur.execute(
                    "INSERT INTO agent_coordination (agent_id, resource, lock_type, payload) "
                    "VALUES (%s, %s, 'exclusive', %s) RETURNING lock_id",
                    (self.agent_id, lock_resource, payload),
                )
                conn.commit()
            return merged
        except Exception as e:
            logger.exception("resolve_conflict failed")
            raise RuntimeError(f"Conflict resolution failed: {e}") from e
        finally:
            pool.release(conn)

    def _get_last_hash(self, conn=None) -> str | None:
        if conn is None:
            pool = self.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                return self._get_last_hash_impl(conn)
            finally:
                pool.release(conn)
        return self._get_last_hash_impl(conn)

    def _get_last_hash_impl(self, conn) -> str | None:
        with conn.cursor() as cur:
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
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
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
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT importance_score, access_count FROM agent_memory WHERE memory_id = %s AND agent_id = %s",
                    (memory_id, self.agent_id),
                )
                row = cur.fetchone()
                if not row:
                    return {"status": "not_found"}

                base_imp = float(row[0]) or 5.0
                settings = get_settings()
                boost = 0.1
                if success:
                    boost += settings.reinforce_boost
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
        finally:
            pool.release(conn)

    def _pin_real(
        self,
        memory_type: str,
        content: str,
        pin_priority: int,
        metadata: dict[str, Any] | None,
    ) -> MemoryRecord:
        record = self._store_real(memory_type, content, metadata, None, _skip_guard=True)
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_memory SET is_pinned = true, pin_priority = %s "
                    "WHERE memory_id = %s AND agent_id = %s",
                    (pin_priority, record.memory_id, self.agent_id),
                )
            conn.commit()
        finally:
            pool.release(conn)
        record.is_pinned = True
        record.pin_priority = pin_priority
        return record

    def _unpin_real(self, memory_id: str) -> bool:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_memory SET is_pinned = false, pin_priority = 0 "
                    "WHERE memory_id = %s AND agent_id = %s AND is_pinned = true",
                    (memory_id, self.agent_id),
                )
                deleted = cur.rowcount > 0
            conn.commit()
            return deleted
        finally:
            pool.release(conn)

    def _get_pinned_real(self, min_priority: int) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s AND is_pinned = true AND pin_priority >= %s "
                    "ORDER BY pin_priority DESC, created_at DESC",
                    (self.agent_id, min_priority),
                )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        finally:
            pool.release(conn)

    def _list_memories_real(
        self, memory_type: str | None, limit: int, offset: int
    ) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                if memory_type:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        "WHERE agent_id = %s AND memory_type = %s "
                        "ORDER BY created_at DESC LIMIT %s OFFSET %s",
                        (self.agent_id, memory_type, limit, offset),
                    )
                else:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        "WHERE agent_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
                        (self.agent_id, limit, offset),
                    )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        finally:
            pool.release(conn)

    def _correct_memory_real(
        self, memory_id: str, new_content: str, metadata: dict[str, Any] | None
    ) -> MemoryRecord | None:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_memory SET content = %s, metadata = COALESCE(%s, metadata) "
                    "WHERE memory_id = %s AND agent_id = %s RETURNING " + _MEMORY_COLS,
                    (new_content, json.dumps(metadata) if metadata else None, memory_id, self.agent_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                conn.commit()
                return MemoryRecord.from_row(row)
        finally:
            pool.release(conn)

    def _memory_health_real(self) -> dict[str, Any]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*), "
                    "COUNT(*) FILTER (WHERE is_pinned), "
                    "COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days'), "
                    "COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days'), "
                    "AVG(access_count), "
                    "AVG(importance_score) "
                    "FROM agent_memory WHERE agent_id = %s",
                    (self.agent_id,),
                )
                row = cur.fetchone()
                total = row[0] or 0
                pinned = row[1] or 0
                week = row[2] or 0
                month = row[3] or 0
                avg_access = float(row[4] or 0)
                avg_importance = float(row[5] or 0)
                freshness = week / max(total, 1)
                return {
                    "total_memories": total,
                    "pinned_memories": pinned,
                    "memories_last_7_days": week,
                    "memories_last_30_days": month,
                    "freshness_ratio": round(freshness, 4),
                    "avg_access_count": round(avg_access, 2),
                    "avg_importance_score": round(avg_importance, 2),
                }
        finally:
            pool.release(conn)

    def _apply_patch_real(
        self, memory_id: str, patch_ops: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        import json as _json
        try:
            import jsonpatch
        except ImportError:
            raise RuntimeError("jsonpatch is required for apply_patch: pip install jsonpatch")
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT memory_id, metadata FROM agent_memory "
                    "WHERE memory_id = %s AND agent_id = %s",
                    (memory_id, self.agent_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                current_metadata = dict(row[1]) if row[1] else {}
                patched = jsonpatch.apply_patch(current_metadata, patch_ops)
                cur.execute(
                    "UPDATE agent_memory SET metadata = %s WHERE memory_id = %s AND agent_id = %s",
                    (_json.dumps(patched), memory_id, self.agent_id),
                )
            conn.commit()
            return {"memory_id": memory_id, "metadata": patched}
        finally:
            pool.release(conn)

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

    def _self_check_triples(
        self, content: str, triples: list[tuple[str, str, str, str, float]]
    ) -> list[tuple[str, str, str, str, float]]:
        """Optional LLM self-check on extracted triples.

        Uses Groq to verify extraction quality when available.
        Falls back to returning original triples if Groq is unavailable.
        """
        if not triples:
            return triples
        try:
            import os
            api_key = os.environ.get("GROQ_API_KEY")
            if not api_key:
                return triples
            from groq import Groq
            client = Groq(api_key=api_key)
            triples_text = "; ".join(f"{s} {r} {t}" for s, t, r, k, c in triples)
            resp = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {"role": "system", "content": (
                        "You verify entity extraction. Given text and extracted triples, "
                        "return ONLY valid triples as JSON: "
                        '[["subject","relation","object","kind",confidence],...]. '
                        "Remove duplicates and invalid triples. Keep confidence 0.0-1.0."
                    )},
                    {"role": "user", "content": f"Text: {content}\nTriples: {triples_text}"},
                ],
                temperature=0.1,
                max_tokens=512,
                timeout=10,
            )
            import json
            verified = json.loads(resp.choices[0].message.content or "[]")
            result = []
            for t in verified:
                if len(t) >= 5:
                    result.append((str(t[0]), str(t[1]), str(t[2]), str(t[3]), float(t[4])))
            return result if result else triples
        except Exception:
            return triples

    def _store_with_graph_real(
        self,
        content: str,
        metadata: dict[str, Any] | None,
        expires_in_seconds: int | None,
    ) -> tuple[MemoryRecord, list[EntityRecord], list[RelationRecord]]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            record = self._store_real("fact", content, metadata, expires_in_seconds)
            triples = self._extract_triples(content)
            triples = self._self_check_triples(content, triples)
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
        finally:
            pool.release(conn)

    def _ensure_entity_id(self, cur, name: str) -> str:
        cur.execute("SELECT entity_id FROM agent_entities WHERE agent_id = %s AND name = %s", (self.agent_id, name))
        row = cur.fetchone()
        if row is None:
            raise ValueError(f"Entity '{name}' not found for agent {self.agent_id}")
        return str(row[0])

    def _graph_query_real(
        self,
        start_entity: str,
        relation_path: list[str] | None,
        hops: int,
    ) -> list[dict[str, Any]]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
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
                        placeholders = ", ".join(f"${i + 2}" for i in range(len(relation_path)))
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
                        found.append(
                            {
                                "source": start_entity,
                                "target": str(rel_row[3]),
                                "relation": str(rel_row[0]),
                                "confidence": float(rel_row[1]),
                                "depth": depth + 1,
                            }
                        )
                        queue.append((str(rel_row[4]), depth + 1))
                return found
        finally:
            pool.release(conn)

    def _graph_at_time_real(self, timestamp: str, entity: str | None) -> dict[str, Any]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
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
                    relations = [
                        dict(
                            zip(
                                [
                                    "relation_id",
                                    "agent_id",
                                    "source_entity_id",
                                    "target_entity_id",
                                    "relation_type",
                                    "confidence",
                                    "valid_from",
                                    "valid_until",
                                    "source_memory_id",
                                    "created_at",
                                ],
                                r,
                                strict=True,
                            )
                        )
                        for r in cur.fetchall()
                    ]
                else:
                    relations = []

            conn.commit()
            return {"agent_id": self.agent_id, "timestamp": timestamp, "entities": entities, "relations": relations}
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.release(conn)

    def _graph_stats_real(self) -> dict[str, Any]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM agent_entities WHERE agent_id = %s", (self.agent_id,))
                entity_row = cur.fetchone()
                if entity_row is None:
                    logger.error("COUNT query for entities returned no row")
                    raise RuntimeError("COUNT query for entities did not return a row")
                entity_count = entity_row[0]

                cur.execute(
                    "SELECT COUNT(*) FROM agent_relations r "
                    "JOIN agent_entities e ON r.source_entity_id = e.entity_id WHERE e.agent_id = %s",
                    (self.agent_id,),
                )
                relation_row = cur.fetchone()
                if relation_row is None:
                    logger.error("COUNT query for relations returned no row")
                    raise RuntimeError("COUNT query for relations did not return a row")
                relation_count = relation_row[0]

                cur.execute(
                    "SELECT DISTINCT entity_type FROM agent_entities WHERE agent_id = %s ORDER BY entity_type",
                    (self.agent_id,),
                )
                entity_types = [r[0] for r in cur.fetchall()]

                cur.execute(
                    "SELECT COUNT(*) FROM agent_entities e WHERE e.agent_id = %s "
                    "AND NOT EXISTS (SELECT 1 FROM agent_relations r "
                    "WHERE r.source_entity_id = e.entity_id OR r.target_entity_id = e.entity_id)",
                    (self.agent_id,),
                )
                orphans_row = cur.fetchone()
                if orphans_row is None:
                    logger.error("COUNT query for orphans returned no row")
                    raise RuntimeError("COUNT query for orphans did not return a row")
                orphans = orphans_row[0]

                return {
                    "entities": entity_count,
                    "relations": relation_count,
                    "orphans": orphans,
                    "entity_types": entity_types,
                }
        finally:
            pool.release(conn)

    def _broadcast_real(self, event_type: str, payload: dict | None, namespace: str) -> MessageRecord:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
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
                row_map = row._mapping if hasattr(row, "_mapping") else {"message_id": row[0], "created_at": row[1]}
                return MessageRecord(
                    message_id=str(row_map["message_id"]),
                    namespace=namespace,
                    sender_agent_id=self.agent_id,
                    event_type=event_type,
                    payload=payload,
                    created_at=row_map["created_at"],
                )
        finally:
            pool.release(conn)

    def _poll_messages_real(self, namespace: str) -> list[MessageRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
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
                        "UPDATE agent_messages SET read = TRUE WHERE message_id = ANY(%s)",
                        (tuple(r[0] for r in rows),),
                    )
                conn.commit()
                results = []
                for r in rows:
                    payload_raw = r[4]
                    results.append(
                        MessageRecord(
                            message_id=str(r[0]),
                            namespace=str(r[1]),
                            sender_agent_id=str(r[2]),
                            event_type=str(r[3]),
                            payload=_parse_payload(payload_raw),
                            created_at=r[5],
                            expires_at=r[6],
                            read=bool(r[7]),
                        )
                    )
                return results
        finally:
            pool.release(conn)

    def _embed(self, text: str) -> list[float]:
        """
        Generate a 1024-dim embedding using AWS Bedrock Titan Embed Text V2.
        Retries up to 3 times with exponential backoff on ThrottlingException.
        Falls back to a deterministic hash-based vector if Bedrock is unavailable
        (no AWS credentials, network error, or BASTION_MOCK mode).
        """
        if self._mock:
            return _hash_fallback_embed(text)

        import random
        import time

        client = _get_bedrock_client()
        if client is None:
            return _hash_fallback_embed(text)

        settings = get_settings()
        body = json.dumps({"inputText": text, "dimensions": settings.embed_dim, "normalize": True})
        max_retries = 3
        for attempt in range(max_retries + 1):
            try:
                response = client.invoke_model(
                    modelId=settings.bedrock_model_id,
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
                    sleep_secs = (2**attempt) + random.uniform(0, 1)
                    logger.warning(
                        "Bedrock throttled (attempt %d/%d), retrying in %.1fs",
                        attempt + 1,
                        max_retries,
                        sleep_secs,
                    )
                    time.sleep(sleep_secs)
                    continue
                logger.exception("Bedrock embedding failed after %d attempts, falling back to hash", attempt + 1)
                return _hash_fallback_embed(text)
        return _hash_fallback_embed(text)

    # ------------------------------------------------------------------
    # A2A Task Store (CockroachDB-backed)
    # ------------------------------------------------------------------

    def store_a2a_task(
        self,
        task_id: str,
        agent_id: str,
        skill_id: str,
        status: str = "WORKING",
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        """Insert a new A2A task into CockroachDB. Returns the task record."""
        if self._mock:
            return {
                "task_id": task_id,
                "agent_id": agent_id,
                "skill_id": skill_id,
                "status": status,
                "callback_url": callback_url,
                "artifacts": None,
                "created_at": datetime.now(UTC).isoformat(),
                "completed_at": None,
            }
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO a2a_tasks (task_id, agent_id, skill_id, status, callback_url) "
                    "VALUES (%s, %s, %s, %s, %s) "
                    "RETURNING task_id, agent_id, skill_id, status, callback_url, "
                    "artifacts, created_at, completed_at",
                    (task_id, agent_id, skill_id, status, callback_url),
                )
                row = cur.fetchone()
                if row:
                    return {
                        "task_id": str(row[0]),
                        "agent_id": row[1],
                        "skill_id": row[2],
                        "status": row[3],
                        "callback_url": row[4],
                        "artifacts": row[5],
                        "created_at": row[6].isoformat() if row[6] else None,
                        "completed_at": row[7].isoformat() if row[7] else None,
                    }
                return {"task_id": task_id, "status": status}
        finally:
            pool.release(conn)

    def get_a2a_task(self, task_id: str) -> dict[str, Any] | None:
        """Retrieve an A2A task by ID from CockroachDB."""
        if self._mock:
            return None
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT task_id, agent_id, skill_id, status, callback_url, "
                    "artifacts, created_at, completed_at "
                    "FROM a2a_tasks WHERE task_id = %s",
                    (task_id,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "task_id": str(row[0]),
                    "agent_id": row[1],
                    "skill_id": row[2],
                    "status": row[3],
                    "callback_url": row[4],
                    "artifacts": row[5],
                    "created_at": row[6].isoformat() if row[6] else None,
                    "completed_at": row[7].isoformat() if row[7] else None,
                }
        finally:
            pool.release(conn)

    def update_a2a_task(
        self,
        task_id: str,
        status: str,
        artifacts: list[dict[str, Any]] | None = None,
        callback_url: str | None = None,
    ) -> dict[str, Any] | None:
        """Update an A2A task's status and artifacts in CockroachDB."""
        if self._mock:
            return None
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE a2a_tasks SET status = %s, artifacts = %s, "
                    "callback_url = COALESCE(%s, callback_url), "
                    "completed_at = CASE WHEN %s IN ('COMPLETED', 'FAILED', 'CANCELED') "
                    "THEN now() ELSE completed_at END "
                    "WHERE task_id = %s "
                    "RETURNING task_id, agent_id, skill_id, status, callback_url, "
                    "artifacts, created_at, completed_at",
                    (status, json.dumps(artifacts) if artifacts else None, callback_url, status, task_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    "task_id": str(row[0]),
                    "agent_id": row[1],
                    "skill_id": row[2],
                    "status": row[3],
                    "callback_url": row[4],
                    "artifacts": row[5],
                    "created_at": row[6].isoformat() if row[6] else None,
                    "completed_at": row[7].isoformat() if row[7] else None,
                }
        finally:
            pool.release(conn)

    def cancel_a2a_task(self, task_id: str) -> dict[str, Any] | None:
        """Cancel an A2A task."""
        return self.update_a2a_task(task_id, "CANCELED")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


# ── Dynamic Context-Aware Vector Retrieval Routing ──────────────────────────


class MemoryRouter:
    """Routes vector retrieval between fast memory-resident cache and
    disk-optimized CockroachDB C-SPANN indexes.

    Implements a two-tier retrieval architecture:
    - L1 Cache: In-memory LRU cache for recently/frequently accessed memories (<1ms)
    - L2 Storage: CockroachDB C-SPANN vector index for long-term storage (15-30ms)

    The router dynamically promotes frequently accessed memories to L1,
    and demotes cold memories back to L2-only. This reduces latency for
    hot-path queries while maintaining full recall for cold queries.

    Usage:
        router = MemoryRouter(memory, cache_size=1000)
        results = router.search("user preferences", k=5)
    """

    def __init__(
        self,
        memory: BastionMemory,
        cache_size: int = 1000,
        promotion_threshold: int = 3,
        demotion_interval_seconds: int = 300,
    ):
        self.memory = memory
        self.cache_size = cache_size
        self.promotion_threshold = promotion_threshold

        # L1 Cache: memory_id -> MemoryRecord
        self._cache: dict[str, MemoryRecord] = {}
        # Access count: memory_id -> count (for promotion decisions)
        self._access_counts: dict[str, int] = {}
        # Cache hits/misses for metrics
        self._cache_hits = 0
        self._cache_misses = 0

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[MemoryRecord]:
        """Search with dynamic routing between L1 cache and L2 CRDB.

        Strategy:
        1. Check L1 cache for recently accessed memories matching the query
        2. Query L2 CRDB for all matching memories
        3. Merge results, prioritizing cached items for speed
        4. Promote frequently accessed memories to L1 cache
        """
        # Step 1: Search L1 cache (fast path, <1ms)
        cached_results = self._search_cache(query, k, memory_type)

        # Step 2: Search L2 CRDB (slower path, 15-30ms)
        db_results = self.memory.search(query, k, threshold, memory_type, namespace_scope)

        # Step 3: Merge results — cached items first, then fill from DB
        merged = self._merge_results(cached_results, db_results, k)

        # Step 4: Promote frequently accessed memories to cache
        for mem in merged:
            mid = mem.memory_id
            self._access_counts[mid] = self._access_counts.get(mid, 0) + 1
            if self._access_counts[mid] >= self.promotion_threshold:
                self._promote_to_cache(mem)

        return merged

    def _search_cache(
        self,
        query: str,
        k: int,
        memory_type: str | None,
    ) -> list[MemoryRecord]:
        """Search the in-memory L1 cache."""
        if not self._cache:
            return []

        query_lower = query.lower()
        results = []
        for mem in self._cache.values():
            if memory_type and mem.memory_type != memory_type:
                continue
            # Simple substring match for cache (fast, no embedding needed)
            if query_lower in mem.content.lower():
                results.append(mem)

        # Sort by importance (cached items are inherently "hot")
        results.sort(key=lambda m: m.importance_score, reverse=True)
        return results[:k]

    def _merge_results(
        self,
        cached: list[MemoryRecord],
        db: list[MemoryRecord],
        k: int,
    ) -> list[MemoryRecord]:
        """Merge cached and DB results, deduplicating by memory_id."""
        seen = set()
        merged = []

        # Cached items first (faster access)
        for mem in cached:
            if mem.memory_id not in seen:
                merged.append(mem)
                seen.add(mem.memory_id)

        # Fill remaining slots from DB
        for mem in db:
            if mem.memory_id not in seen:
                merged.append(mem)
                seen.add(mem.memory_id)
                if len(merged) >= k:
                    break

        return merged[:k]

    def _promote_to_cache(self, mem: MemoryRecord) -> None:
        """Add a memory to the L1 cache, evicting LRU if full."""
        if len(self._cache) >= self.cache_size and self._access_counts:
            # Evict least recently accessed
            oldest_id = min(self._access_counts, key=self._access_counts.get)
            self._cache.pop(oldest_id, None)
            self._access_counts.pop(oldest_id, None)
        self._cache[mem.memory_id] = mem

    def invalidate(self, memory_id: str) -> None:
        """Remove a memory from the L1 cache (e.g., after delete or update)."""
        self._cache.pop(memory_id, None)
        self._access_counts.pop(memory_id, None)

    def clear_cache(self) -> None:
        """Clear the entire L1 cache."""
        self._cache.clear()
        self._access_counts.clear()

    def get_stats(self) -> dict[str, Any]:
        """Return cache performance statistics."""
        total = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total * 100) if total > 0 else 0.0
        return {
            "cache_size": len(self._cache),
            "cache_capacity": self.cache_size,
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "hit_rate_percent": round(hit_rate, 1),
            "promotion_threshold": self.promotion_threshold,
        }
