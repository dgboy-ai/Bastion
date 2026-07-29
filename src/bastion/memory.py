from __future__ import annotations

import contextlib
import hashlib
import json
import math
import os
import re
import subprocess
import threading
import time
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from bastion import mock as _mock
from bastion.circuit_breaker import CircuitBreaker
from bastion.config import AUDIT_LIMIT, get_settings
from bastion.errors import BastionPoolExhaustedError, SecurityBlockError
from bastion.guard import MemoryGuard, pii_scan
from bastion.log_setup import get_logger
from bastion.models import AuditEntry, ClusterInfo, EntityRecord, MemoryRecord, MessageRecord, RelationRecord
from bastion.pool import ConnectionPool
from bastion.retry import SerializationRetryEngine
from bastion.rls import RowLevelSecurity

logger = get_logger(__name__)

# Counter and lock for tracking unauthorized guard bypass attempts
_guard_bypass_counter = 0
_guard_bypass_lock = threading.Lock()

_bedrock_client = None
_bedrock_client_lock = threading.Lock()
_local_model_lock = threading.Lock()
_local_model = None


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

_CORE_MEMORY_COLS = (
    "memory_id, agent_id, memory_type, content, embedding, "
    "metadata, previous_hash, cryptographic_hash, "
    "created_at, expires_at, access_count, importance_score, "
    "trust_level, source_provenance, overwrite_count"
)

_MAX_CONTENT_LENGTH = 100_000
_MAX_AGENT_ID_LENGTH = 255
_MAX_MEMORY_TYPE_LENGTH = 100

# Allowlisted SQL fragments for agent filtering — prevents f-string injection
_ALLOWED_AGENT_FILTERS = frozenset({"agent_id = %s", "agent_id LIKE %s"})
_ALLOWED_REGION_CLAUSES = frozenset({"", "AND crdb_region = %s"})

# TTL configuration per memory type (seconds)
# Short-term memories expire quickly, forensic records never expire
_MEMORY_TTL_SECONDS: dict[str, int | None] = {
    "episodic": 86400,  # 24 hours — conversation history
    "conversation": 86400,  # 24 hours — chat messages
    "session": 3600,  # 1 hour — working memory
    "task": 604800,  # 7 days — task state
    "fact": None,  # Never expires — long-term knowledge
    "semantic": None,  # Never expires — semantic memory
    "procedural": None,  # Never expires — workflow patterns
    "preference": None,  # Never expires — user preferences
    "learned": None,  # Never expires — learned behaviors
    "system_event": None,  # Never expires — system events
    "security": None,  # Never expires — security records
    "thought_node": None,  # Never expires — reasoning traces
    "saga": None,  # Never expires — transaction logs
}


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
    if value > 10_000:
        raise ValueError(f"k too large ({value} > 10000) — reduce to prevent OOM")


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
        self._embedding_degraded = False

        # Sub-modules for extracted concerns
        from bastion.a2a_tasks import A2ATaskStore
        from bastion.knowledge_graph import KnowledgeGraph
        from bastion.messaging import MessageBroker

        self._a2a_store = A2ATaskStore(agent_id, self.get_pool, lambda: self._mock, self._set_rls_context)
        self._broker = MessageBroker(agent_id, self.get_pool, lambda: self._mock)
        self._kg = KnowledgeGraph(agent_id, self.get_pool, self._set_rls_context)

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
        if not self._rls_enabled:
            return
        was_autocommit = getattr(conn, "autocommit", False)
        try:
            if was_autocommit:
                conn.autocommit = False
                logger.debug(
                    "Auto-started transaction for RLS context (was autocommit)",
                    extra={"agent_id": self.agent_id},
                )
            self._refresh_rls_context(conn)
        except Exception as exc:
            if was_autocommit:
                conn.autocommit = True
            if self._mock:
                logger.debug("RLS context not set (mock mode)", extra={"agent_id": self.agent_id})
            else:
                logger.error(
                    "Failed to set RLS context — agent data isolation may be compromised",
                    extra={"agent_id": self.agent_id, "error": str(exc)},
                )
                raise RuntimeError(
                    f"RLS context setup failed for agent '{self.agent_id}'. Agent data isolation cannot be guaranteed."
                ) from exc

    def _refresh_rls_context(self, conn: Any) -> None:
        """Re-set RLS context after a transaction commit (SET LOCAL is scoped to the transaction)."""
        if not self._rls_enabled:
            return
        try:
            with conn.cursor() as cur:
                cur.execute("SET LOCAL app.current_agent_id = %s", (self.agent_id,))
        except Exception as exc:
            if not self._mock:
                logger.error(
                    "Failed to refresh RLS context — agent data isolation may be compromised",
                    extra={"agent_id": self.agent_id, "error": str(exc)},
                )

    def _retry_write(self, conn: Any, operation: Callable[[Any], Any]) -> Any:
        try:
            result = self._retry_engine.execute(conn, operation, isolation="serializable")
            conn.commit()
            return result
        except Exception:
            conn.rollback()
            raise

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
        _guard_bypass_token: Any = None,
        _detect_contradictions: bool = False,
    ) -> MemoryRecord:
        _validate_memory_type(memory_type)
        _validate_content(content)

        # Apply default TTL based on memory type if not explicitly set
        if expires_in_seconds is None and memory_type in _MEMORY_TTL_SECONDS:
            expires_in_seconds = _MEMORY_TTL_SECONDS[memory_type]

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
            # PII scan: detect and redact sensitive data before storage
            redacted_content, pii_types = pii_scan(content)
            if pii_types:
                logger.warning(
                    "PII detected in memory content — storing with redacted copy",
                    agent_id=self.agent_id,
                    pii_types=pii_types,
                )
                content = redacted_content
        else:
            global _guard_bypass_counter
            if not _guard_bypass_token:
                with _guard_bypass_lock:
                    _guard_bypass_counter += 1
                import traceback

                logger.warning(
                    "Guard bypass without token — possible unauthorized bypass",
                    agent_id=self.agent_id,
                    memory_type=memory_type,
                    content_preview=content[:80] if content else "",
                    bypass_count=_guard_bypass_counter,
                    stack="\n".join(traceback.format_stack()[-4:-1]),
                )
            else:
                logger.info(
                    "Guard bypassed via _skip_guard=True (authorized internal caller)",
                    agent_id=self.agent_id,
                    memory_type=memory_type,
                )

        if self._mock:
            record = _mock.mock_store_memory(
                self.agent_id, memory_type, content, metadata, expires_in_seconds, region=region
            )
        else:
            record = self._store_real(memory_type, content, metadata, expires_in_seconds, region=region)

        # Auto-detect contradictions if enabled
        if _detect_contradictions and record is not None:
            try:
                from bastion.contradiction import ContradictionDetector

                detector = ContradictionDetector(self)
                detector.scan_after_store(record)
            except Exception as exc:
                logger.debug("Contradiction detection skipped: %s", exc)

        return record

    def store_batch(
        self,
        memories: list[dict[str, Any]],
    ) -> list[MemoryRecord]:
        """Store multiple memories atomically within a single SERIALIZABLE transaction.

        Each memory dict must have at least ``content`` and ``memory_type`` keys.
        Optional keys: ``metadata``, ``expires_in_seconds``.

        Uses a single connection to batch all inserts, reducing round-trips.
        Guard checks run on each memory before insertion; if any fails, all fail.
        """
        if not memories:
            return []
        if len(memories) > 100:
            raise ValueError("Batch size limited to 100 memories")

        records: list[MemoryRecord] = []
        for entry in memories:
            if not isinstance(entry, dict):
                raise ValueError(f"Each memory must be a dict, got {type(entry).__name__}")
            content = entry.get("content", "")
            memory_type = entry.get("memory_type", "fact")
            metadata = entry.get("metadata")
            expires_in = entry.get("expires_in_seconds")
            _validate_memory_type(memory_type)
            _validate_content(content)
            _validate_expires_in(expires_in if expires_in is not None else None)
            report = self._guard.check(content)
            if not report.is_safe:
                details = "; ".join(f"{f.detector}: {f.detail}" for f in report.findings)
                raise SecurityBlockError(
                    f"Batch memory blocked by MemoryGuard [{report.poisoning_risk}]: {details}",
                    report=report,
                )

        if self._mock:
            for entry in memories:
                rec = _mock.mock_store_memory(
                    self.agent_id,
                    entry.get("memory_type", "fact"),
                    entry.get("content", ""),
                    entry.get("metadata"),
                    entry.get("expires_in_seconds"),
                )
                records.append(rec)
            return records

        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0, consumer_id="store_batch")
        try:
            self._set_rls_context(conn)
            last_prev_hash: str | None = None

            def _batch_insert_all(cur: Any) -> list[MemoryRecord]:
                nonlocal last_prev_hash
                batch_records: list[MemoryRecord] = []
                for entry in memories:
                    memory_type = entry.get("memory_type", "fact")
                    content = entry.get("content", "")
                    metadata = entry.get("metadata")
                    expires_in = entry.get("expires_in_seconds")

                    meta = dict(metadata) if metadata else {}
                    precomputed = meta.pop("_precomputed_embedding", None)
                    embedding = precomputed if precomputed is not None else self._embed(content)

                    embedding_str = json.dumps(embedding)
                    now = datetime.now(UTC)
                    expires_dt = (now + timedelta(seconds=expires_in)) if expires_in is not None else None

                    if last_prev_hash is None:
                        cur.execute(
                            "SELECT cryptographic_hash FROM agent_memory "
                            "WHERE agent_id = %s ORDER BY created_at DESC LIMIT 1",
                            (self.agent_id,),
                        )
                        prev_row = cur.fetchone()
                        prev_hash = prev_row[0] if prev_row else None
                    else:
                        prev_hash = last_prev_hash
                    from bastion.crypto import compute_hash

                    crypto_hash = compute_hash(content, meta, prev_hash)
                    last_prev_hash = crypto_hash
                    cur.execute(
                        "INSERT INTO agent_memory (agent_id, memory_type, content, embedding, metadata, "
                        "previous_hash, cryptographic_hash, expires_at, importance_score, trust_level, "
                        "source_provenance) "
                        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 5.0, 2, 'agent_direct') "
                        "RETURNING memory_id, created_at",
                        (
                            self.agent_id,
                            memory_type,
                            content,
                            embedding_str,
                            json.dumps(meta),
                            prev_hash,
                            crypto_hash,
                            expires_dt.isoformat() if expires_dt else None,
                        ),
                    )
                    row = cur.fetchone()
                    if row is None:
                        raise RuntimeError("Batch INSERT RETURNING did not return a row")
                    row_map = row._mapping if hasattr(row, "_mapping") else {"memory_id": row[0], "created_at": row[1]}
                    batch_records.append(
                        MemoryRecord(
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
                            trust_level=2,
                            source_provenance="agent_direct",
                        )
                    )
                return batch_records

            records = self._retry_engine.execute(conn, _batch_insert_all, isolation="serializable")
            conn.commit()
            return records
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.release(conn)

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
        # Run security guard — pinned memories are most dangerous to leave unguarded
        report = self._guard.check(content, metadata=metadata)
        if not report.is_safe:
            from bastion.errors import SecurityBlockError

            raise SecurityBlockError(
                f"Content blocked by security guard: {report.findings}",
                report=report,
            )
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
        cursor: str | None = None,
    ) -> list[MemoryRecord]:
        """List all memories for the current agent with cursor-based pagination.

        Args:
            memory_type: Optional filter by memory type.
            limit: Maximum items to return (fetches +1 internally to detect next page).
            cursor: Base64-encoded created_at ISO timestamp from the previous page.

        Returns:
            List of MemoryRecord, may include an extra item to indicate has_more.
        """
        if self._mock:
            return _mock.mock_list_memories(self.agent_id, memory_type, limit, cursor or "0")
        return self._list_memories_real(memory_type, limit, cursor)

    def correct_memory(
        self,
        memory_id: str,
        new_content: str,
        metadata: dict[str, Any] | None = None,
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
        from bastion.health import memory_health_real

        return memory_health_real(self)

    def apply_patch(
        self,
        memory_id: str,
        patch_ops: list[dict[str, Any]],
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
        threshold: float | None = None,
        memory_type: str | None = None,
        namespace_scope: str = "own",
        region_filter: str | None = None,
    ) -> list[MemoryRecord]:
        # Use lower default threshold for mock mode (mock embeddings are less discriminative)
        if threshold is None:
            threshold = 0.3 if self._mock else 0.8
        _validate_content(query)
        _validate_k(k)
        _validate_threshold(threshold)
        _validate_namespace_scope(namespace_scope)
        if region_filter is not None and (not isinstance(region_filter, str) or not region_filter.strip()):
            raise ValueError(f"region_filter must be a non-empty string when provided, got {region_filter!r}")
        ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
        if self._mock:
            return _mock.mock_search_memory(
                ns_agent_id,
                query,
                k,
                threshold,
                memory_type,
                namespace_scope,
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
        target = agent_id or self.agent_id
        if target != self.agent_id:
            raise PermissionError("Cannot query memories for another agent")
        agent_id = target
        if self._mock:
            return _mock.mock_get_memory_at_time(agent_id, timestamp)
        return self._get_at_time_real(agent_id, timestamp)

    def audit(self, agent_id: str | None = None) -> list[AuditEntry]:
        target = agent_id or self.agent_id
        if target != self.agent_id:
            raise PermissionError("Cannot query memories for another agent")
        agent_id = target
        if self._mock:
            return _mock.mock_get_audit(agent_id)
        return self._audit_real(agent_id)

    def store_audit(self, action: str, details: dict[str, Any] | str, agent_id: str | None = None) -> None:
        target = agent_id or self.agent_id
        if target != self.agent_id:
            raise PermissionError("Cannot query memories for another agent")
        agent_id = target
        if self._mock:
            _mock.mock_store_audit(agent_id, action, details)
        else:
            self._store_audit_real(agent_id, action, details)

    def heal(self, agent_id: str | None = None, background_verify: bool = False) -> dict[str, Any]:
        target = agent_id or self.agent_id
        if target != self.agent_id:
            raise PermissionError("Cannot query memories for another agent")
        agent_id = target
        if self._mock:
            return _mock.mock_heal(agent_id)
        result = self._heal_real(agent_id)
        if background_verify:
            result["background_verify"] = self._flag_needs_verification(agent_id)
        return result

    def _flag_needs_verification(self, agent_id: str) -> dict[str, Any]:
        """Mark all memories for this agent as needs_verification.
        CDC changefeed or a background worker picks these up for async hash recheck.
        """
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            def _op(cur):
                cur.execute(
                    "UPDATE agent_memory SET needs_verification = true "
                    "WHERE agent_id = %s AND cryptographic_hash IS NOT NULL",
                    (agent_id,),
                )
                return {"flagged_for_verification": cur.rowcount}
            return self._retry_write(conn, _op)
        finally:
            pool.release(conn)

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
        target = agent_id or self.agent_id
        if target != self.agent_id:
            raise PermissionError("Cannot query memories for another agent")
        agent_id = target
        if self._mock:
            return _mock.mock_detect_anomalies(agent_id)
        from bastion.health import detect_anomalies_real

        return detect_anomalies_real(self, agent_id)

    def diff(self, timestamp_a: str, timestamp_b: str, agent_id: str | None = None) -> dict:
        if not timestamp_a or not isinstance(timestamp_a, str):
            raise ValueError(f"timestamp_a must be a non-empty string, got {type(timestamp_a).__name__}")
        if not timestamp_b or not isinstance(timestamp_b, str):
            raise ValueError(f"timestamp_b must be a non-empty string, got {type(timestamp_b).__name__}")
        target = agent_id or self.agent_id
        if target != self.agent_id:
            raise PermissionError("Cannot query memories for another agent")
        agent_id = target
        if self._mock:
            return _mock.mock_diff(agent_id, timestamp_a, timestamp_b)
        from bastion.health import diff_real

        return diff_real(self, agent_id, timestamp_a, timestamp_b)

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
        # Run security guard before storing — same as store()
        report = self._guard.check(content, metadata=metadata)
        if not report.is_safe:
            raise SecurityBlockError(
                f"Content blocked by security guard: {report.findings}",
                report=report,
            )
        if self._mock:
            return _mock.mock_store_with_graph(self.agent_id, content, metadata, expires_in_seconds)
        # Store the memory record first
        record = self._store_real("fact", content, metadata, expires_in_seconds)
        # Extract triples and create entities/relations via KG
        triples = self._extract_triples(content)
        created_entities, created_relations = self._kg.store_with_graph(
            record.memory_id,
            content,
            triples,
        )
        return record, created_entities, created_relations

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
        return self._kg.graph_query(start_entity, relation_path, hops)

    def graph_at_time(self, timestamp: str, entity: str | None = None) -> dict[str, Any]:
        if self._mock:
            return _mock.mock_graph_at_time(self.agent_id, timestamp, entity)
        return self._kg.graph_at_time(timestamp, entity)

    def graph_stats(self) -> dict[str, Any]:
        if self._mock:
            return _mock.mock_graph_stats(self.agent_id)
        return self._kg.graph_stats()

    def broadcast(self, event_type: str, payload: dict | None = None, namespace: str | None = None) -> MessageRecord:
        ns = namespace if namespace is not None else self.namespace
        if not event_type or not isinstance(event_type, str):
            raise ValueError(f"event_type must be a non-empty string, got {type(event_type).__name__}")
        if self._mock:
            return _mock.mock_broadcast(self.agent_id, event_type, payload, ns)
        return self._broker.broadcast(event_type, payload, ns)

    def poll_messages(self, namespace: str | None = None) -> list[MessageRecord]:
        """Read and acknowledge all unread messages in a namespace."""
        ns = namespace if namespace is not None else self.namespace
        if self._mock:
            return _mock.mock_poll_messages(ns)
        return self._broker.consume(ns)

    def trust_report(self, memory_id: str) -> dict[str, Any]:
        from bastion.health import trust_report_real

        return trust_report_real(self, memory_id)

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
        try:
            self._set_rls_context(conn)
            def _op(cur):
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
                return True
            return self._retry_write(conn, _op)
        finally:
            pool.release(conn)

    def close(self):
        pool = self._pool
        if pool is not None:
            pool.close_all()
            self._pool = None

    def _store_real(
        self,
        memory_type: str,
        content: str,
        metadata: dict[str, Any] | None,
        expires_in_seconds: int | None,
        region: str | None = None,
        conn: Any = None,
    ) -> MemoryRecord:
        pool = self.get_pool()

        # Generate embedding BEFORE acquiring connection (slow network call)
        meta = dict(metadata) if metadata is not None else {}
        precomputed_embedding = meta.pop("_precomputed_embedding", None)
        if precomputed_embedding is not None:
            embedding = precomputed_embedding
        else:
            embedding = self._embed(content)

        # Use provided connection for atomic multi-operation transactions
        if conn is None:
            conn = pool.acquire(timeout=30.0)
            should_release = True
        else:
            should_release = False
        embedding_str = json.dumps(embedding)
        now = datetime.now(UTC)
        expires_dt = (now + timedelta(seconds=expires_in_seconds)) if expires_in_seconds is not None else None
        trust_level = 2
        source_prov = "agent_direct"
        meta.pop("_trust_level", None)
        meta.pop("_source_provenance", None)

        def _insert_operation(cur: Any) -> tuple:
            """The DB operation to execute with retry on serialization errors."""
            # Read prev_hash inside the transaction for consistency
            cur.execute(
                "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT 1",
                (self.agent_id,),
            )
            prev_row = cur.fetchone()
            prev_hash = prev_row[0] if prev_row else None

            from bastion.crypto import compute_hash

            crypto_hash = compute_hash(content, meta, prev_hash)

            cols = (
                "agent_id, memory_type, content, embedding, metadata, "
                "previous_hash, cryptographic_hash, expires_at, importance_score, "
                "trust_level, source_provenance"
            )
            placeholders = "%s, %s, %s, %s, %s, %s, %s, %s, 5.0, %s, %s"
            params = [
                self.agent_id,
                memory_type,
                content,
                embedding_str,
                json.dumps(meta),
                prev_hash,
                crypto_hash,
                expires_dt.isoformat() if expires_dt else None,
                trust_level,
                source_prov,
            ]
            if region is not None:
                cols += ", crdb_region"
                placeholders += ", %s"
                params.append(region)
            cur.execute(
                f"INSERT INTO agent_memory ({cols}) VALUES ({placeholders}) RETURNING memory_id, created_at",
                params,
            )
            row = cur.fetchone()
            if row is None:
                raise RuntimeError("INSERT RETURNING did not return a row")

            memory_id_str = str(row[0])
            workflow_id = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                (
                    self.agent_id,
                    workflow_id,
                    "memory_store",
                    json.dumps({
                        "memory_id": memory_id_str,
                        "memory_type": memory_type,
                        "content_preview": pii_scan(content[:200])[0],
                        "hash": crypto_hash,
                        "previous_hash": prev_hash
                    }),
                ),
            )
            return (row, prev_hash, crypto_hash)

        try:
            if should_release:
                self._set_rls_context(conn)
            # Use retry engine with SERIALIZABLE isolation for hash chain integrity
            row, prev_hash, crypto_hash = self._retry_engine.execute(conn, _insert_operation, isolation="serializable")

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
        except Exception as exc:
            logger.exception("store_real failed", extra={"agent_id": self.agent_id, "error": str(exc)})
            raise
        finally:
            if should_release:
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
        try:
            self._set_rls_context(conn)
            using_hash_embeddings = self._mock or os.environ.get("BASTION_EMBED_FALLBACK")
            if not using_hash_embeddings and self._bedrock_cb.state.value != "open":
                try:
                    import importlib

                    using_hash_embeddings = not importlib.util.find_spec("sentence_transformers")
                except ImportError:
                    using_hash_embeddings = True

            if using_hash_embeddings:
                ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
                result = self._search_keyword_fallback(
                    query, k, threshold, memory_type, ns_agent_id, _existing_conn=conn
                )
                return result

            query_vector = self._embed(query)
            query_vector_str = json.dumps(query_vector)
            settings = get_settings()
            decay_rate = settings.decay_rate
            agent_filter = "agent_id LIKE %s" if namespace_scope == "shared" else "agent_id = %s"
            if agent_filter not in _ALLOWED_AGENT_FILTERS:
                raise ValueError(f"Unexpected agent_filter: {agent_filter}")
            agent_param = f"{self.namespace}:%" if namespace_scope == "shared" else self.agent_id

            region_clause = ""
            region_param: list[str] = []
            if region_filter is not None:
                region_clause = "AND crdb_region = %s"
                if region_clause not in _ALLOWED_REGION_CLAUSES:
                    raise ValueError(f"Unexpected region_clause: {region_clause}")
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

                if not results:
                    ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
                    keyword_results = self._search_keyword_fallback(
                        query, k, 0.0, memory_type, ns_agent_id, _existing_conn=conn
                    )
                    if keyword_results:
                        return keyword_results

                return results[:k]
        except Exception as e:
            if any(s in str(e).lower() for s in ("embedding", "vector", "does not exist", "c-spann")):
                logger.warning(
                    "Vector search failed, degrading to keyword search: %s",
                    str(e)[:200],
                    extra={"agent_id": self.agent_id, "query": query[:100]},
                )
                ns_agent_id = self.namespace if namespace_scope == "shared" else self.agent_id
                return self._search_keyword_fallback(query, k, threshold, memory_type, ns_agent_id, _existing_conn=conn)
            if "does not exist" in str(e).lower():
                logger.warning(
                    "Schema may be missing columns. Run: "
                    "ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS is_pinned BOOL DEFAULT FALSE; "
                    "ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS pin_priority INT DEFAULT 0;",
                    extra={"agent_id": self.agent_id},
                )
            logger.exception("Search query failed", extra={"agent_id": self.agent_id, "query": query[:100]})
            raise RuntimeError(f"Search failed for agent {self.agent_id}") from e
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
        try:
            self._set_rls_context(conn)
            agent_filter = "agent_id LIKE %s" if namespace_scope == "shared" else "agent_id = %s"
            if agent_filter not in _ALLOWED_AGENT_FILTERS:
                raise ValueError(f"Unexpected agent_filter: {agent_filter}")
            agent_param = f"{self.namespace}:%" if namespace_scope == "shared" else self.agent_id

            region_clause = ""
            region_param: list[str] = []
            if region_filter is not None:
                region_clause = "AND crdb_region = %s"
                if region_clause not in _ALLOWED_REGION_CLAUSES:
                    raise ValueError(f"Unexpected region_clause: {region_clause}")
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
            # If schema is missing newer columns, log a helpful migration message
            if "does not exist" in str(e).lower():
                logger.warning(
                    "Schema may be missing columns. Run: "
                    "ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS is_pinned BOOL DEFAULT FALSE; "
                    "ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS pin_priority INT DEFAULT 0;",
                    extra={"agent_id": self.agent_id},
                )
            logger.exception("list_all query failed", extra={"agent_id": self.agent_id})
            raise RuntimeError(f"List all failed for agent {self.agent_id}") from e
        finally:
            pool.release(conn)

    def list_recent(self, hours: int = 24, limit: int = 200) -> list[MemoryRecord]:
        """Fetch memories created within the last N hours — SQL-filtered, not O(n)."""
        if self._mock:
            return [m for m in _mock.mock_list_all(self.agent_id) if hasattr(m, "created_at") and m.created_at][:limit]
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s "
                    "AND created_at >= now() - (%s || ' hours')::INTERVAL "
                    "AND (expires_at IS NULL OR expires_at > now()) "
                    "ORDER BY created_at DESC LIMIT %s",
                    (self.agent_id, str(hours), limit),
                )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        except Exception as e:
            logger.warning("list_recent failed: %s", e)
            return []
        finally:
            pool.release(conn)

    def list_pinned(self) -> list[MemoryRecord]:
        """Fetch pinned memories — SQL-filtered."""
        if self._mock:
            return [m for m in _mock.mock_list_all(self.agent_id) if getattr(m, "is_pinned", False)]
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s AND is_pinned = TRUE "
                    "AND (expires_at IS NULL OR expires_at > now()) "
                    "ORDER BY pin_priority DESC",
                    (self.agent_id,),
                )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        except Exception as e:
            logger.warning("list_pinned failed: %s", e)
            return []
        finally:
            pool.release(conn)

    def list_by_importance(
        self,
        min_importance: float = 0.0,
        memory_type: str | None = None,
        limit: int = 200,
        exclude_ids: set[str] | None = None,
    ) -> list[MemoryRecord]:
        """Fetch memories above an importance threshold — SQL-filtered."""
        if self._mock:
            results = [
                m
                for m in _mock.mock_list_all(self.agent_id, memory_type)
                if (getattr(m, "importance_score", 0) or 0) >= min_importance
            ]
            if exclude_ids:
                results = [m for m in results if m.memory_id not in exclude_ids]
            return results[:limit]
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            type_clause = ""
            params: list = [self.agent_id, min_importance]
            if memory_type:
                type_clause = "AND memory_type = %s"
                params.append(memory_type)
            params.append(limit)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    f"WHERE agent_id = %s AND importance_score >= %s {type_clause} "
                    "AND (expires_at IS NULL OR expires_at > now()) "
                    "ORDER BY importance_score DESC LIMIT %s",
                    params,
                )
                results = [MemoryRecord.from_row(r) for r in cur.fetchall()]
            if exclude_ids:
                results = [m for m in results if m.memory_id not in exclude_ids]
            return results
        except Exception as e:
            logger.warning("list_by_importance failed: %s", e)
            return []
        finally:
            pool.release(conn)

    def keyword_search(self, keyword: str, limit: int = 50) -> list[MemoryRecord]:
        """SQL ILIKE keyword search — replaces in-memory word overlap in router.py."""
        if self._mock:
            kw = keyword.lower()
            return [m for m in _mock.mock_list_all(self.agent_id) if kw in (m.content or "").lower()][:limit]
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT {_MEMORY_COLS} FROM agent_memory "
                    "WHERE agent_id = %s "
                    "AND content ILIKE %s "
                    "AND (expires_at IS NULL OR expires_at > now()) "
                    "ORDER BY importance_score DESC, created_at DESC LIMIT %s",
                    (self.agent_id, f"%{keyword}%", limit),
                )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        except Exception as e:
            logger.warning("keyword_search failed: %s", e)
            return []
        finally:
            pool.release(conn)

    def count_by_agent(self) -> int:
        """Count memories for this agent — single aggregate query."""
        if self._mock:
            return len(_mock.mock_list_all(self.agent_id))
        pool = self.get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM agent_memory "
                    "WHERE agent_id = %s AND (expires_at IS NULL OR expires_at > now())",
                    (self.agent_id,),
                )
                row = cur.fetchone()
                return row[0] if row else 0
        except Exception:
            return 0
        finally:
            pool.release(conn)

    def _get_memory_by_id_real(self, memory_id: str) -> MemoryRecord | None:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                cur.execute(
                    (
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        "WHERE memory_id = %s AND agent_id = %s "
                        "AND (expires_at IS NULL OR expires_at > now())"
                    ),
                    (memory_id, self.agent_id),
                )
                row = cur.fetchone()
                return MemoryRecord.from_row(row) if row else None
        except Exception as e:
            logger.exception("get_memory_by_id failed", extra={"memory_id": memory_id})
            raise RuntimeError("Failed to get memory") from e
        finally:
            pool.release(conn)

    def _get_at_time_real(self, agent_id: str, timestamp: str) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=10)
        try:
            self._set_rls_context(conn)
            abs_timestamp = self._parse_timestamp(timestamp)

            # Use statement-level AS OF SYSTEM TIME (CockroachDB requires LITERAL timestamp).
            # abs_timestamp is validated by _parse_timestamp — safe for interpolation.
            # Add 1s buffer for MVCC clock skew (application timestamps are slightly
            # before CockroachDB MVCC commit timestamps).
            try:
                from datetime import timedelta
                parsed_dt = datetime.fromisoformat(abs_timestamp.replace("Z", "+00:00"))
                adjusted_ts = (parsed_dt + timedelta(seconds=1)).isoformat()
                safe_ts = adjusted_ts.replace("'", "''")
                with conn.cursor() as cur:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"AS OF SYSTEM TIME '{safe_ts}' "
                        "WHERE agent_id = %s ORDER BY created_at",
                        (agent_id,),
                    )
                    results = [MemoryRecord.from_row(r) for r in cur.fetchall()]
                    with contextlib.suppress(Exception):
                        conn.commit()
                    return results
            except Exception as primary_exc:
                logger.debug("AS OF SYSTEM TIME failed, using fallback: %s", primary_exc)
                with contextlib.suppress(Exception):
                    conn.rollback()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            f"SELECT {_MEMORY_COLS} FROM agent_memory "
                            "WHERE agent_id = %s AND created_at <= %s::TIMESTAMPTZ "
                            "ORDER BY created_at",
                            (agent_id, abs_timestamp),
                        )
                        return [MemoryRecord.from_row(r) for r in cur.fetchall()]
                except Exception as fallback_exc:
                    logger.warning("Time-travel fallback also failed: %s", fallback_exc)
                    return []
        finally:
            pool.release(conn)

    def _parse_timestamp(self, timestamp: str) -> str:
        """Convert relative timestamps to absolute ISO format for CockroachDB."""
        ts = timestamp.strip().lower()
        now = datetime.now(UTC)

        # Handle "now" or "just now"
        if ts in ("now", "just now"):
            return now.isoformat()

        # Handle relative timestamps like "5 minutes ago", "2 hours ago"
        match = re.match(r"(\d+)\s+(second|minute|hour|day|week|month)s?\s+ago", ts)
        if match:
            amount = int(match.group(1))
            unit = match.group(2)
            if unit == "second":
                dt = now - timedelta(seconds=amount)
            elif unit == "minute":
                dt = now - timedelta(minutes=amount)
            elif unit == "hour":
                dt = now - timedelta(hours=amount)
            elif unit == "day":
                dt = now - timedelta(days=amount)
            elif unit == "week":
                dt = now - timedelta(weeks=amount)
            elif unit == "month":
                dt = now - timedelta(days=amount * 30)
            else:
                dt = now
            return dt.isoformat()

        # Already absolute timestamp — validate it's not in the future
        try:
            parsed_dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            if parsed_dt.tzinfo is None:
                parsed_dt = parsed_dt.replace(tzinfo=UTC)
            if parsed_dt > now + timedelta(minutes=5):  # Allow 5min clock skew
                raise ValueError("Timestamp cannot be in the future")
        except ValueError as e:
            if "future" in str(e):
                raise
            # If it's not a valid ISO timestamp, let CockroachDB handle the error
            pass
        return timestamp

    def _audit_real(self, agent_id: str) -> list[AuditEntry]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT audit_id, agent_id, workflow_id, action, details, recorded_at "
                    "FROM agent_audit WHERE agent_id = %s ORDER BY recorded_at DESC LIMIT %s",
                    (agent_id, AUDIT_LIMIT),
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
            raise RuntimeError("Audit query failed") from e
        finally:
            pool.release(conn)

    def _store_audit_real(self, agent_id: str, action: str, details: dict[str, Any] | str) -> None:
        import uuid

        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            def _op(cur):
                details_json = details if isinstance(details, str) else json.dumps(details)
                cur.execute(
                    "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                    (agent_id, str(uuid.uuid4()), action, details_json),
                )
            self._retry_write(conn, _op)
        except Exception as e:
            logger.exception("store_audit failed", extra={"agent_id": agent_id, "action": action})
            raise RuntimeError("store_audit failed") from e
        finally:
            pool.release(conn)

    def _heal_real(self, agent_id: str) -> dict[str, Any]:
        import uuid as _uuid

        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            from bastion.crypto import compute_hash

            def _op(cur):
                pruned = 0
                resealed = 0
                cur.execute(
                    "DELETE FROM agent_memory WHERE agent_id = %s AND expires_at <= now()",
                    (agent_id,),
                )
                pruned = cur.rowcount
                cur.execute(
                    "SELECT memory_id, content, metadata, previous_hash "
                    "FROM agent_memory WHERE agent_id = %s AND cryptographic_hash IS NULL "
                    "ORDER BY created_at ASC",
                    (agent_id,),
                )
                broken = cur.fetchall()
                for mid, content, metadata, prev_hash in broken:
                    meta_dict = dict(metadata) if metadata else {}
                    new_hash = compute_hash(content, meta_dict, prev_hash)
                    cur.execute(
                        "UPDATE agent_memory SET cryptographic_hash = %s WHERE memory_id = %s",
                        (new_hash, mid),
                    )
                    resealed += 1
                    cur.execute(
                        "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
                        (
                            agent_id, str(_uuid.uuid4()), "heal_hash_reseal",
                            json.dumps({"memory_id": mid, "content_snippet": (content or "")[:200]}),
                        ),
                    )
                    logger.warning(
                        "Hash chain repair: resealed memory %s for agent %s — may indicate tampering",
                        mid,
                        agent_id,
                    )
                return {
                    "agent_id": agent_id,
                    "pruned": pruned,
                    "resealed": resealed,
                    "status": "healed",
                }
            return self._retry_write(conn, _op)
        except Exception:
            logger.exception("heal query failed", extra={"agent_id": agent_id})
            return {"agent_id": agent_id, "pruned": 0, "resealed": 0, "status": "error"}
        finally:
            pool.release(conn)

    def _resolve_conflict_real(self, fact_a: str, fact_b: str, context: str) -> str:
        max_retries = 50
        for attempt in range(max_retries):
            pool = self.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                self._set_rls_context(conn)
                with conn.cursor() as cur:
                    lock_resource = f"conflict:{hashlib.sha256((fact_a + fact_b).encode()).hexdigest()[:16]}"
                    cur.execute(
                        "INSERT INTO agent_coordination (agent_id, resource, lock_type, payload) "
                        "VALUES (%s, %s, 'exclusive', %s) "
                        "ON CONFLICT (agent_id, resource) DO NOTHING "
                        "RETURNING lock_id",
                        (self.agent_id, lock_resource, json.dumps({"status": "acquired"})),
                    )
                    lock_row = cur.fetchone()
                    lock_id = lock_row[0] if lock_row else None
                    if not lock_id:
                        conn.rollback()
                        continue

                conn.commit()
                self._refresh_rls_context(conn)

                try:
                    merged = self._smart_merge(fact_a, fact_b, context)
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE agent_coordination SET payload = %s WHERE lock_id = %s AND agent_id = %s",
                            (
                                json.dumps({"fact_a": fact_a, "fact_b": fact_b, "merged": merged, "context": context}),
                                lock_id,
                                self.agent_id,
                            ),
                        )
                        conn.commit()
                    return merged
                finally:
                    if lock_id:
                        try:
                            with conn.cursor() as cur:
                                cur.execute("DELETE FROM agent_coordination WHERE lock_id = %s AND agent_id = %s", (lock_id, self.agent_id))
                                conn.commit()
                        except Exception:
                            logger.warning("Failed to release coordination lock %s", lock_id)
            except Exception as e:
                logger.exception("resolve_conflict failed")
                raise RuntimeError("Conflict resolution failed") from e
            finally:
                pool.release(conn)
            time.sleep(0.5)

        raise RuntimeError("Conflict resolution timed out after %d retries" % max_retries)

    def _smart_merge(self, fact_a: str, fact_b: str, context: str) -> str:
        """Merge two conflicting facts using LLM (Groq) or heuristic fallback.

        The LLM merge produces a coherent statement that preserves information
        from both facts. Falls back to a heuristic merge when LLM is unavailable.
        """
        # Try Groq LLM merge first
        try:
            from bastion.groq_callback import groq_merge

            merged = groq_merge([fact_a, fact_b], context or "conflict_resolution")
            if merged and merged != fact_a:
                return merged
        except Exception:
            logger.debug("Groq merge unavailable, using heuristic fallback")

        # Heuristic fallback: combine with structured format
        # If facts share most words, pick the longer/more detailed one
        words_a = set(fact_a.lower().split())
        words_b = set(fact_b.lower().split())
        overlap = len(words_a & words_b) / max(1, len(words_a | words_b))

        if overlap > 0.7:
            # Very similar — keep the longer/more detailed one
            return fact_a if len(fact_a) >= len(fact_b) else fact_b
        elif overlap > 0.3:
            # Partially similar — combine with separator
            return f"{fact_a}. Additionally: {fact_b}"
        else:
            # Very different — keep both with context
            return f"{fact_a} | {fact_b}"

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
        guard_report = self._guard.check(response)
        if guard_report.is_safe:
            self._store_real(memory_type, response, {"query": query, "from_cache": False}, None)
        else:
            logger.warning("LLM response blocked by guard — not caching")
        return response, {"cache": "miss"}

    def _reinforce_real(self, memory_id: str, success: bool) -> dict:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            def _op(cur):
                cur.execute(
                    "SELECT importance_score, access_count FROM agent_memory WHERE memory_id = %s AND agent_id = %s",
                    (memory_id, self.agent_id),
                )
                row = cur.fetchone()
                if not row:
                    return {"status": "not_found"}
                base_imp = float(row[0]) or 5.0
                settings = get_settings()
                if success:
                    boost = 0.1 + settings.reinforce_boost
                else:
                    boost = -0.5
                new_imp = max(0.0, min(base_imp + boost, 10.0))
                cur.execute(
                    "UPDATE agent_memory SET importance_score = %s, access_count = access_count + 1 "
                    "WHERE memory_id = %s AND agent_id = %s",
                    (new_imp, memory_id, self.agent_id),
                )
                return {
                    "status": "reinforced",
                    "memory_id": memory_id,
                    "importance_score": new_imp,
                    "delta": round(new_imp - base_imp, 2),
                }
            return self._retry_write(conn, _op)
        finally:
            pool.release(conn)

    def _pin_real(
        self,
        memory_type: str,
        content: str,
        pin_priority: int,
        metadata: dict[str, Any] | None,
    ) -> MemoryRecord:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            record = self._store_real(memory_type, content, metadata, None, conn=conn)
            self._refresh_rls_context(conn)
            def _pin_op(cur):
                cur.execute(
                    "UPDATE agent_memory SET is_pinned = true, pin_priority = %s "
                    "WHERE memory_id = %s AND agent_id = %s",
                    (pin_priority, record.memory_id, self.agent_id),
                )
            self._retry_write(conn, _pin_op)
            record.is_pinned = True
            record.pin_priority = pin_priority
            return record
        finally:
            pool.release(conn)

    def _unpin_real(self, memory_id: str) -> bool:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            def _op(cur):
                cur.execute(
                    "UPDATE agent_memory SET is_pinned = false, pin_priority = 0 "
                    "WHERE memory_id = %s AND agent_id = %s AND is_pinned = true",
                    (memory_id, self.agent_id),
                )
                return cur.rowcount > 0
            return self._retry_write(conn, _op)
        finally:
            pool.release(conn)

    def _get_pinned_real(self, min_priority: int) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
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

    def _list_memories_real(self, memory_type: str | None, limit: int, cursor: str | None = None) -> list[MemoryRecord]:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0, consumer_id="list_memories")
        fetch_limit = limit + 1  # Fetch +1 to detect if there are more pages
        try:
            self._set_rls_context(conn)
            with conn.cursor() as cur:
                if cursor:
                    if memory_type:
                        cur.execute(
                            f"SELECT {_MEMORY_COLS} FROM agent_memory "
                            "WHERE agent_id = %s AND memory_type = %s AND created_at < %s::TIMESTAMPTZ "
                            "ORDER BY created_at DESC LIMIT %s",
                            (self.agent_id, memory_type, cursor, fetch_limit),
                        )
                    else:
                        cur.execute(
                            f"SELECT {_MEMORY_COLS} FROM agent_memory "
                            "WHERE agent_id = %s AND created_at < %s::TIMESTAMPTZ "
                            "ORDER BY created_at DESC LIMIT %s",
                            (self.agent_id, cursor, fetch_limit),
                        )
                else:
                    if memory_type:
                        cur.execute(
                            f"SELECT {_MEMORY_COLS} FROM agent_memory "
                            "WHERE agent_id = %s AND memory_type = %s "
                            "ORDER BY created_at DESC LIMIT %s",
                            (self.agent_id, memory_type, fetch_limit),
                        )
                    else:
                        cur.execute(
                            f"SELECT {_MEMORY_COLS} FROM agent_memory "
                            "WHERE agent_id = %s ORDER BY created_at DESC LIMIT %s",
                            (self.agent_id, fetch_limit),
                        )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        finally:
            pool.release(conn)

    def _correct_memory_real(
        self, memory_id: str, new_content: str, metadata: dict[str, Any] | None
    ) -> MemoryRecord | None:
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            from bastion.crypto import compute_hash

            def _op(cur):
                cur.execute(
                    "SELECT previous_hash FROM agent_memory WHERE memory_id = %s AND agent_id = %s",
                    (memory_id, self.agent_id),
                )
                prev_row = cur.fetchone()
                prev_hash = prev_row[0] if prev_row else None
                new_hash = compute_hash(new_content, metadata, prev_hash)
                cur.execute(
                    "UPDATE agent_memory SET content = %s, metadata = COALESCE(%s, metadata), "
                    "cryptographic_hash = %s "
                    "WHERE memory_id = %s AND agent_id = %s RETURNING " + _MEMORY_COLS,
                    (new_content, json.dumps(metadata) if metadata else None, new_hash, memory_id, self.agent_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                cur.execute(
                    "UPDATE agent_memory SET cryptographic_hash = NULL "
                    "WHERE agent_id = %s AND created_at > (SELECT created_at FROM agent_memory "
                    "WHERE memory_id = %s)",
                    (self.agent_id, memory_id),
                )
                downstream_count = cur.rowcount
                logger.warning(
                    "Memory corrected — downstream hash chain invalidated for %d records at memory_id=%s. "
                    "Run 'memory_heal' to reseal.",
                    downstream_count,
                    memory_id,
                )
                return MemoryRecord.from_row(row)
            return self._retry_write(conn, _op)
        finally:
            pool.release(conn)

    def _apply_patch_real(
        self,
        memory_id: str,
        patch_ops: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        import json as _json

        try:
            import jsonpatch
        except ImportError:
            raise RuntimeError("jsonpatch is required for apply_patch: pip install jsonpatch")
        pool = self.get_pool()
        conn = pool.acquire(timeout=30.0)
        try:
            self._set_rls_context(conn)
            def _op(cur):
                cur.execute(
                    "SELECT memory_id, metadata FROM agent_memory WHERE memory_id = %s AND agent_id = %s",
                    (memory_id, self.agent_id),
                )
                row = cur.fetchone()
                if not row:
                    return None
                current_metadata = dict(row[1]) if row[1] else {}
                fixed_ops = []
                for op in patch_ops:
                    if op.get("op") == "replace":
                        path_parts = op["path"].strip("/").split("/")
                        target = current_metadata
                        key_exists = True
                        for part in path_parts:
                            if isinstance(target, dict) and part in target:
                                target = target[part]
                            else:
                                key_exists = False
                                break
                        if not key_exists:
                            fixed_ops.append({**op, "op": "add"})
                        else:
                            fixed_ops.append(op)
                    else:
                        fixed_ops.append(op)
                patched = jsonpatch.apply_patch(current_metadata, fixed_ops)
                cur.execute(
                    "UPDATE agent_memory SET metadata = %s WHERE memory_id = %s AND agent_id = %s",
                    (_json.dumps(patched), memory_id, self.agent_id),
                )
                return {"memory_id": memory_id, "metadata": patched}
            return self._retry_write(conn, _op)
        finally:
            pool.release(conn)

    def _extract_triples(self, text: str) -> list[tuple[str, str, str, str, float]]:
        from bastion.knowledge_graph import extract_triples

        return extract_triples(text)

    def _embed(self, text: str) -> list[float]:
        """
        Generate an embedding using one of:
        1. AWS Bedrock Titan V2 (1024-dim) — production
        2. all-MiniLM-L6-v2 (384-dim) — local, no API key
        3. Hash-based fallback (1024-dim) — deterministic fallback
        """
        if self._mock:
            return _hash_fallback_embed(text)

        # If fallback is forced, skip all remote/local models — use hash directly
        if os.environ.get("BASTION_EMBED_FALLBACK"):
            logger.warning("Embedding fallback forced via BASTION_EMBED_FALLBACK — vector search quality degraded")
            self._embedding_degraded = True
            return _hash_fallback_embed(text)

        # Try Bedrock first
        try:
            bedrock_result = self._embed_bedrock(text)
            if bedrock_result is not None:
                return bedrock_result
        except Exception:
            logger.debug("Bedrock embedding unavailable, trying local fallback")

        # Try all-MiniLM (local, no API key needed)
        try:
            return self._embed_local(text)
        except Exception:
            logger.debug("Local embedding unavailable, using hash fallback")

        # Final fallback: hash-based
        logger.warning("Embedding fallback activated — all remote/local models unavailable. Search quality degraded.")
        self._embedding_degraded = True
        return _hash_fallback_embed(text)

    def _embed_bedrock(self, text: str) -> list[float] | None:
        """Try Bedrock embedding. Returns None if unavailable."""
        import random
        import time

        if self._bedrock_cb.state.value == "open":
            return None

        client = _get_bedrock_client()
        if client is None:
            return None

        settings = get_settings()
        body = json.dumps({"inputText": text, "dimensions": settings.embed_dim, "normalize": True})
        max_retries = min(settings.retry_max_retries, 2)  # Limit retries for demo

        def _invoke():
            response = client.invoke_model(
                modelId=settings.bedrock_model_id,
                body=body,
                contentType="application/json",
                accept="application/json",
            )
            result: Any = json.loads(response["body"].read())
            return result["embedding"]

        for attempt in range(max_retries + 1):
            try:
                return self._bedrock_cb.call(_invoke)
            except Exception as exc:
                exc_name = type(exc).__name__
                if attempt < max_retries and exc_name in ("ThrottlingException", "ServiceUnavailableException"):
                    time.sleep((2**attempt) + random.uniform(0, 1))
                    continue
                return None
        return None

    def _embed_local(self, text: str) -> list[float]:
        """Use all-MiniLM-L6-v2 for local embeddings (384-dim).

        If the local model dimension doesn't match the target, falls back to
        hash-based embedding rather than zero-padding (which degrades search quality).
        """
        global _local_model
        if _local_model is None:
            with _local_model_lock:
                if _local_model is None:
                    try:
                        from sentence_transformers import SentenceTransformer

                        _local_model = SentenceTransformer("all-MiniLM-L6-v2")
                    except ImportError:
                        raise RuntimeError("sentence-transformers not installed")
        embedding = _local_model.encode(text).tolist()
        settings = get_settings()
        target_dim = settings.embed_dim
        # If dimensions don't match, use hash fallback instead of zero-padding
        if len(embedding) != target_dim:
            return _hash_fallback_embed(text)
        return embedding

    def _search_keyword_fallback(
        self,
        query: str,
        k: int,
        threshold: float,
        memory_type: str | None,
        agent_id: str,
        _existing_conn: Any = None,
    ) -> list[MemoryRecord]:
        """Keyword-based fallback search when vector search degrades completely.

        If *_existing_conn* is provided, it is used instead of acquiring
        a new connection from the pool. This avoids dual-connection hold
        when called from ``_search_real`` fallback paths.
        """
        pool = self.get_pool()
        conn = _existing_conn or pool.acquire(timeout=30.0)
        try:
            if not _existing_conn:
                self._set_rls_context(conn)
            # Use ILIKE for fuzzy keyword matching as degraded-mode fallback
            keywords = [w.strip() for w in query.lower().split() if len(w.strip()) > 2]
            if not keywords:
                return []
            like_conditions = " OR ".join(["content ILIKE %s"] * len(keywords))
            like_params = [f"%{kw}%" for kw in keywords]
            with conn.cursor() as cur:
                if memory_type:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"WHERE agent_id = %s AND memory_type = %s "
                        f"AND ({like_conditions}) "
                        "AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY importance_score DESC LIMIT %s",
                        (agent_id, memory_type, *like_params, k),
                    )
                else:
                    cur.execute(
                        f"SELECT {_MEMORY_COLS} FROM agent_memory "
                        f"WHERE agent_id = %s AND ({like_conditions}) "
                        "AND (expires_at IS NULL OR expires_at > now()) "
                        "ORDER BY importance_score DESC LIMIT %s",
                        (agent_id, *like_params, k),
                    )
                return [MemoryRecord.from_row(r) for r in cur.fetchall()]
        except Exception as exc:
            logger.warning("Keyword fallback search failed: %s", exc)
            return []
        finally:
            if not _existing_conn:
                pool.release(conn)

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
        runtime_metadata: dict[str, Any] | None = None,
        parent_task_id: str | None = None,
        priority: int = 0,
    ) -> dict[str, Any]:
        """Insert a new A2A task into CockroachDB. Returns the task record."""
        return self._a2a_store.store_task(
            task_id, agent_id, skill_id, status, callback_url,
            runtime_metadata, parent_task_id, priority,
        )

    def get_a2a_task(self, task_id: str) -> dict[str, Any] | None:
        """Retrieve an A2A task by ID from CockroachDB."""
        return self._a2a_store.get_task(task_id)

    def update_a2a_task(
        self,
        task_id: str | None = None,
        status: str | None = None,
        artifacts: list[dict[str, Any]] | None = None,
        callback_url: str | None = None,
        runtime_metadata: dict[str, Any] | None = None,
        error_message: str | None = None,
        retry_count: int | None = None,
        cleanup_stale: bool = False,
        stale_timeout: int = 3600,
    ) -> dict[str, Any] | None:
        """Update an A2A task's status and artifacts in CockroachDB.

        When cleanup_stale=True, marks all non-terminal tasks older than
        stale_timeout seconds as FAILED (orphans from client disconnects).
        """
        if cleanup_stale:
            return self._cleanup_stale_tasks(stale_timeout)
        return self._a2a_store.update_task(
            task_id, status, artifacts, callback_url,
            runtime_metadata, error_message, retry_count,
        )

    def _cleanup_stale_tasks(self, stale_timeout: int = 3600) -> int:
        """Mark stale non-terminal A2A tasks as FAILED. Returns count."""
        if self._mock:
            return 0
        pool = self.get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            self._set_rls_context(conn)
            def _op(cur):
                cur.execute(
                    "UPDATE a2a_tasks SET status = 'FAILED', updated_at = now() "
                    "WHERE agent_id = %s "
                    "AND status IN ('SUBMITTED', 'WORKING') "
                    "AND created_at < now() - make_interval(secs => %s) "
                    "RETURNING task_id",
                    (self.agent_id, stale_timeout),
                )
                cleaned = [row[0] for row in cur.fetchall()]
                if cleaned:
                    logger.warning("Cleaned up %d orphaned A2A tasks", len(cleaned))
                return len(cleaned)
            return self._retry_write(conn, _op)
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


# Re-export MemoryRouter for backwards compatibility
# (extracted to cache_router.py but kept here for import stability)
from bastion.cache_router import MemoryRouter  # noqa: E402, F401
