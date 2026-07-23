"""
Bastion MCP Server — Production-Grade MCP Protocol Implementation

Provides tools, resources, and prompts for AI agents to interact with
their persistent memory layer backed by CockroachDB + AWS Bedrock.

Tools:     memory_search, memory_store, memory_timetravel, memory_audit,
           memory_heal, memory_delete, resolve_conflict, a2a_bridge
Resources: bastion://schema, bastion://config, bastion://stats,
           bastion://memory/{memory_id}
Prompts:   analyze_memory, conflict_analysis, audit_review

Supports stdio (local) and Streamable HTTP (remote) transports.
Authentication via API key or OAuth 2.1 (authorization code + PKCE).
Rate limiting for HTTP transport.
ASGI thread-pool offloading for non-blocking database operations.
"""

from __future__ import annotations

import asyncio
import atexit
import contextlib
import json
import logging
import os
import sys
import threading
import time
import uuid
from typing import Any

import anyio
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl, AnyUrl

from bastion.auth_provider import BastionOAuthProvider, is_oauth_enabled
from bastion.config import VERSION
from bastion.errors import SecurityBlockError
from bastion.limiter import RequestLimiter
from bastion.mcp_scanner import scan_tool_manifest
from bastion.memory import BastionMemory
from bastion.pool import ConnectionPool
from bastion.provenance import compute_provenance
from bastion.spend_manager import SpendManager

# Hard caps for production safety
MAX_K = 100
MAX_STORE_BYTES = 100_000

logger = logging.getLogger("bastion-mcp")


async def _report_progress(ctx: Context, progress: float, total: float, message: str | None = None) -> None:
    with contextlib.suppress(ValueError):
        await ctx.report_progress(progress, total, message)


async def _notify_resource_updated(ctx: Context, uri: str) -> None:
    with contextlib.suppress(ValueError):
        await ctx.session.send_resource_updated(AnyUrl(uri))


_SHARED_POOL: ConnectionPool | None = None
_SHARED_MEMORY: BastionMemory | None = None
_API_KEYS: set[str] | None = None
_RATE_LIMITER: RequestLimiter | None = None
_SPEND_MANAGER: SpendManager | None = None
_LIMITER_INSTANCE_ID: str = uuid.uuid4().hex[:16]
_INIT_LOCK = threading.Lock()

# -- Metrics state (Prometheus format) --
_metrics_requests_total: dict[tuple[str, str, int], int] = {}
_metrics_durations: dict[tuple[str, str], list[float]] = {}
_metrics_rate_limit_hits: int = 0
_metrics_start_time: float = time.monotonic()


def _get_shared_memory() -> BastionMemory:
    """Return the shared memory instance used by HTTP health routes."""
    if _SHARED_MEMORY is not None:
        return _SHARED_MEMORY
    # Fallback: create a lightweight memory instance for health checks
    conn = os.environ.get("BASTION_CONN", "")
    is_mock = not conn
    return BastionMemory("_healthcheck", connection_string=conn, mock=is_mock)


def close_shared_pool() -> None:
    global _SHARED_POOL, _SHARED_MEMORY
    pool = _SHARED_POOL
    _SHARED_POOL = None
    _SHARED_MEMORY = None
    if pool is not None:
        try:
            pool.close_all()
        except Exception:
            logger.exception("Error closing shared connection pool")


def _load_api_keys() -> set[str]:
    global _API_KEYS
    if _API_KEYS is None:
        with _INIT_LOCK:
            if _API_KEYS is None:
                # Accept both BASTION_MCP_API_KEYS (comma-separated) and BASTION_API_KEY (single)
                raw_multi = os.environ.get("BASTION_MCP_API_KEYS", "")
                raw_single = os.environ.get("BASTION_API_KEY", "")
                keys: set[str] = set()
                if raw_multi:
                    keys = {k.strip() for k in raw_multi.split(",") if k.strip()}
                if raw_single and raw_single not in keys:
                    keys.add(raw_single.strip())
                _API_KEYS = keys
                if not _API_KEYS:
                    logger.warning(
                        "No API keys configured — MCP server is running without authentication. "
                        "Set BASTION_MCP_API_KEYS or BASTION_API_KEY."
                    )
    return _API_KEYS


def _check_auth(headers: dict[str, str]) -> bool:
    import secrets as _secrets

    keys = _load_api_keys()
    if not keys:
        # No API keys configured — deny all requests
        logger.warning("No API keys configured — MCP server is locked down")
        return False
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    provided = ""
    if auth.startswith("Bearer "):
        provided = auth.removeprefix("Bearer ").strip()
    else:
        provided = auth
    if not provided:
        return False
    # Constant-time comparison to prevent timing attacks
    return any(_secrets.compare_digest(provided, k) for k in keys)


def _get_spend_manager() -> SpendManager:
    global _SPEND_MANAGER
    if _SPEND_MANAGER is None:
        with _INIT_LOCK:
            if _SPEND_MANAGER is None:
                conn = os.environ.get("BASTION_CONN", "")
                _SPEND_MANAGER = SpendManager(
                    connection_string=conn,
                    mock=not conn,
                )
    return _SPEND_MANAGER


def _get_limiter() -> RequestLimiter:
    global _RATE_LIMITER
    if _RATE_LIMITER is None:
        with _INIT_LOCK:
            if _RATE_LIMITER is None:
                _RATE_LIMITER = RequestLimiter(
                    max_concurrent=int(os.environ.get("BASTION_MCP_MAX_CONCURRENT", "20")),
                    max_queue=int(os.environ.get("BASTION_MCP_MAX_QUEUE", "200")),
                    timeout_seconds=int(os.environ.get("BASTION_MCP_TIMEOUT", "60")),
                    instance_id=_LIMITER_INSTANCE_ID,
                )
    return _RATE_LIMITER


def _build_a2a_card(agent_id: str) -> dict:
    return {
        "name": f"Bastion/{agent_id}",
        "version": VERSION,
        "agent_id": agent_id,
        "capabilities": {
            "memory_store": True,
            "memory_search": True,
            "memory_audit": True,
            "time_travel": True,
            "knowledge_graph": True,
            "conflict_resolution": True,
            "streaming": False,
            "push_notifications": False,
        },
        "well_known_url": "/.well-known/agent-card.json",
        "protocol": "a2a",
        "provider": {"organization": "Bastion", "url": "https://github.com/dgboy-ai/Bastion"},
    }


def create_server(
    connection_string: str | None = None,
    mock: bool | None = None,
    oauth_enabled: bool | None = None,
    stateless: bool = False,
    multi_tenant: bool = False,
) -> FastMCP:
    conn = connection_string or os.environ.get("BASTION_CONN", "")
    is_mock = mock if mock is not None else (not conn)
    _shared = BastionMemory("mcp-agent", connection_string=conn, mock=is_mock)

    # Store shared memory globally for health check routes (thread-safe)
    global _SHARED_MEMORY, _SHARED_POOL
    with _INIT_LOCK:
        _SHARED_MEMORY = _shared

    if (stateless or multi_tenant) and not is_mock:
        if _SHARED_POOL is None:
            with _INIT_LOCK:
                if _SHARED_POOL is None:
                    _SHARED_POOL = _shared.get_pool()

    def _resolve_memory(ctx: Context | None = None) -> BastionMemory:
        if not multi_tenant and not stateless:
            return _shared
        agent_id = "mcp-agent"
        if multi_tenant and ctx is not None:
            agent_id = ctx.client_id or "mcp-agent"
        mem = BastionMemory(agent_id, connection_string=conn, mock=is_mock)
        if _SHARED_POOL:
            mem._pool = _SHARED_POOL
        # Set application name for query tracing in CockroachDB
        request_id = getattr(ctx, "request_id", None) if ctx else None
        if request_id and not is_mock:
            try:
                pool = mem.get_pool()
                conn_obj = pool.acquire(timeout=5.0)
                try:
                    with conn_obj.cursor() as cur:
                        safe_name = ''.join(c for c in agent_id[:32] if c.isalnum() or c in '-_')
                        cur.execute("SET application_name = %s", (f"mcp-{safe_name}",))
                finally:
                    pool.release(conn_obj)
            except Exception:
                pass  # Non-critical — don't fail the request
        return mem

    use_oauth = oauth_enabled if oauth_enabled is not None else is_oauth_enabled()

    # Ed25519 signer for Agent Card signing
    from bastion.a2a_signing import AgentCardSigner
    _mcp_card_signer = AgentCardSigner.from_env("BASTION_A2A_PRIVATE_KEY")

    kwargs: dict[str, Any] = dict(
        name="Bastion Memory",
        instructions=(
            "Agentic memory layer backed by CockroachDB with SHA-256 hash chain "
            "integrity, C-SPANN vector indexing, AS OF SYSTEM TIME queries, "
            "and SERIALIZABLE conflict resolution."
        ),
        debug=False,
        log_level="INFO",
        stateless_http=False,
    )

    if use_oauth:
        oauth_client_id = os.environ.get("BASTION_MCP_OAUTH_CLIENT_ID") or "bastion-client"
        oauth_secret = os.environ.get("BASTION_MCP_OAUTH_CLIENT_SECRET")
        oauth_redirect = os.environ.get("BASTION_MCP_OAUTH_REDIRECT_URI") or "http://localhost:3000/callback"
        provider = BastionOAuthProvider(
            client_id=oauth_client_id,
            client_secret=oauth_secret,
            redirect_uri=oauth_redirect,
        )
        issuer = os.environ.get("BASTION_MCP_ISSUER_URL", "http://localhost:9997")
        kwargs["auth_server_provider"] = provider
        kwargs["auth"] = AuthSettings(
            issuer_url=AnyHttpUrl(issuer),
            resource_server_url=AnyHttpUrl(f"{issuer.rstrip('/')}/mcp"),
            required_scopes=None,
        )

    mcp = FastMCP(**kwargs)

    # ── Resources ──────────────────────────────────────────────────────────

    @mcp.resource(
        "bastion://schema",
        title="Database Schema",
        description="CockroachDB table schemas, indexes, and CDC changefeed metadata.",
    )
    async def get_schema() -> str:
        return json.dumps(
            {
                "tables": {
                    "memory_records": {
                        "columns": {
                            "memory_id": "UUID PRIMARY KEY",
                            "agent_id": "STRING(255) NOT NULL",
                            "memory_type": "STRING(50) NOT NULL",
                            "content": "TEXT NOT NULL",
                            "embedding": "VECTOR(1024)",
                            "metadata": "JSONB",
                            "previous_hash": "STRING(64)",
                            "cryptographic_hash": "STRING(64) NOT NULL",
                            "created_at": "TIMESTAMPTZ NOT NULL DEFAULT now()",
                            "expires_at": "TIMESTAMPTZ",
                            "access_count": "INT DEFAULT 0",
                            "importance_score": "FLOAT DEFAULT 0.0",
                            "trust_level": "FLOAT DEFAULT 0.5",
                            "source_provenance": "STRING",
                            "overwrite_count": "INT DEFAULT 0",
                        },
                        "indexes": [
                            "PRIMARY KEY (memory_id)",
                            "INVERTED INDEX idx_gin_metadata (metadata)",
                            "INDEX idx_agent_type (agent_id, memory_type)",
                            "INDEX idx_crdt_cursor (agent_id, created_at DESC)",
                        ],
                    },
                    "audit_log": {
                        "columns": {
                            "audit_id": "UUID PRIMARY KEY",
                            "agent_id": "STRING(255) NOT NULL",
                            "workflow_id": "UUID",
                            "action": "STRING(100) NOT NULL",
                            "details": "JSONB",
                            "recorded_at": "TIMESTAMPTZ NOT NULL DEFAULT now()",
                        },
                        "indexes": [
                            "PRIMARY KEY (audit_id)",
                            "INDEX idx_audit_agent (agent_id, recorded_at DESC)",
                        ],
                    },
                },
                "changefeeds": ["BASTION_CDC"],
                "vector_index": "C-SPANN (embedding, cocktailr_embedding_idx)",
            },
            indent=2,
        )

    @mcp.resource(
        "bastion://config",
        title="Server Configuration",
        description="Active Bastion configuration: compliance mode, guard settings, pool limits.",
    )
    async def get_config() -> str:
        from bastion.config import get_settings

        mem = _resolve_memory()
        s = get_settings()
        return json.dumps(
            {
                "mock": mem._mock,
                "compliance_mode": mem.compliance_mode,
                "agent_id": mem.agent_id,
                "namespace": mem.namespace,
                "bedrock_model_id": s.bedrock_model_id,
                "embed_dim": s.embed_dim,
                "aws_region": s.aws_region,
                "pool_min_size": s.pool_min_size,
                "pool_max_size": s.pool_max_size,
                "search_default_k": s.search_default_k,
                "search_default_threshold": s.search_default_threshold,
                "decay_rate": s.decay_rate,
            },
            indent=2,
            default=str,
        )

    @mcp.resource(
        "bastion://stats",
        title="Memory Statistics",
        description="Live counts, cache hit ratios, and health metrics for the memory store.",
    )
    async def get_stats() -> str:
        limiter = _get_limiter()
        return json.dumps(
            {
                "rate_limiter": limiter.get_stats(),
                "tools_available": [
                    "memory_search",
                    "memory_store",
                    "memory_timetravel",
                    "memory_audit",
                    "memory_heal",
                    "memory_delete",
                    "resolve_conflict",
                    "a2a_bridge",
                    "ltm_check_reuse",
                    "ltm_store_analysis",
                    "ltm_invalidate",
                    "dream",
                    "dream_history",
                    "detect_contradictions",
                    "scan_all_contradictions",
                    "detect_observations",
                    "multi_signal_search",
                ],
            },
            indent=2,
            default=str,
        )

    @mcp.resource(
        "bastion://memory/{memory_id}",
        title="Memory by ID",
        description="Retrieve a single memory record by its memory_id.",
    )
    async def get_memory(memory_id: str) -> str:
        mem = _resolve_memory()
        result = await anyio.to_thread.run_sync(mem.get_memory, memory_id)
        if result is None:
            return json.dumps({"error": f"Memory {memory_id} not found"})
        return json.dumps(result.to_dict(), indent=2, default=str)

    # ── Prompts ────────────────────────────────────────────────────────────

    @mcp.prompt(
        "analyze_memory",
        title="Analyze Memory",
        description="Directs the agent to scan memory for patterns, anomalies, and trends.",
    )
    def analyze_memory() -> str:
        return (
            "You are analyzing agent memory from CockroachDB. Review the following:\n"
            "1. Recent memories by type (fact, task, preference, learned, procedure)\n"
            "2. Semantic clusters using C-SPANN vector similarity\n"
            "3. Memories nearing expiry for potential reinforcement\n"
            "4. Hash chain integrity (SHA-256 audit trail)\n"
            "Provide a structured analysis with memory count, top clusters, "
            "and recommended reinforcement actions."
        )

    @mcp.prompt(
        "conflict_analysis",
        title="Conflict Analysis",
        description="Configures the agent to compare two conflicting memory inputs and propose a resolution.",
    )
    def conflict_analysis() -> str:
        return (
            "Two conflicting facts were detected. Compare them using:\n"
            "1. Source provenance and trust levels\n"
            "2. Timestamp freshness\n"
            "3. Importance scores\n"
            "4. Surrounding context\n"
            "Propose a merged fact that preserves information from both sources "
            "where possible."
        )

    @mcp.prompt(
        "audit_review",
        title="Audit Review",
        description="Leads the agent through checking the SHA-256 hash chain ledger for anomalies.",
    )
    def audit_review() -> str:
        return (
            "Review the append-only audit trail for:\n"
            "1. Broken hash chain links (tampering evidence)\n"
            "2. Unusual access patterns (rapid writes, bulk deletes)\n"
            "3. Compliance with data retention policies\n"
            "4. GDPR right-to-forget compliance records\n"
            "Report any anomalies found with severity levels."
        )

    # ── Tools ──────────────────────────────────────────────────────────────

    @mcp.tool(
        name="memory_search",
        title="Search Agent Memories",
        description=(
            "Search agent memories using C-SPANN vector similarity search with "
            "cognitive decay weighting. Supports cursor-based pagination for "
            "large result sets. Returns memories ranked by relevance and importance. "
            "Uses CockroachDB's distributed vector index for "
            "sub-linear similarity search."
        ),
        annotations=ToolAnnotations(
            title="Search Agent Memories",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_search(
        ctx: Context,
        query: str,
        k: int = 5,
        threshold: float | None = None,
        memory_type: str | None = None,
        cursor: str | None = None,
    ) -> str:
        if k < 1:
            return json.dumps({"error": "k must be >= 1"})
        k = min(k, MAX_K)
        if threshold is not None and not 0.0 <= threshold <= 1.0:
            return json.dumps({"error": "threshold must be between 0.0 and 1.0"})
        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})
        mem = _resolve_memory(ctx)
        agent_id = ctx.client_id or "mcp-agent"
        spend = _get_spend_manager()
        check = spend.check_and_increment(agent_id, "search", 1)
        if not check["allowed"]:
            return json.dumps({"error": f"Search budget exhausted: {check['reason']}",
                               "remaining": check["remaining"], "suspended": check["suspended"]})
        # Use lower default threshold for mock mode (mock embeddings are less discriminative)
        if threshold is None:
            threshold = 0.3 if mem.is_mock else 0.8
        internal_k = max(k, 200)
        results = await anyio.to_thread.run_sync(
            mem.search,
            query,
            internal_k,
            threshold,
            memory_type,
        )

        offset = 0
        if cursor:
            try:
                import base64

                offset = int(base64.b64decode(cursor).decode())
            except Exception:
                logger.warning("Invalid cursor, resetting to offset 0", exc_info=True)
                offset = 0

        page = results[offset : offset + k]
        next_cursor = None
        if offset + k < len(results):
            import base64

            next_cursor = base64.b64encode(str(offset + k).encode()).decode()

        return json.dumps(
            {
                "results": [r.to_dict() for r in page],
                "next_cursor": next_cursor,
                "total": len(results),
            },
            indent=2,
            default=str,
        )

    @mcp.tool(
        name="memory_store",
        title="Store Agent Memory",
        description=(
            "Store a memory with automatic SHA-256 hash chain integrity. "
            "Content is embedded via AWS Bedrock Titan V2 and indexed in "
            "CockroachDB's C-SPANN distributed vector index."
        ),
        annotations=ToolAnnotations(
            title="Store Agent Memory",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def memory_store(
        ctx: Context,
        content: str,
        memory_type: str = "fact",
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
        source_type: str = "agent_direct",
        source_url: str | None = None,
    ) -> str:
        valid_types = {
            "fact", "task", "preference", "learned", "procedure", "session", "instruction",
            "episodic", "semantic", "procedural", "system_event", "security",
            "thought_node", "saga", "conversation", "user_message", "agent_response",
            "error_log", "checkpoint", "observation", "contradiction", "dream",
        }
        if memory_type not in valid_types:
            return json.dumps({"error": f"Invalid memory_type: {memory_type}. Must be one of: {sorted(valid_types)}"})
        if not content or not content.strip():
            return json.dumps({"error": "content must be a non-empty string"})
        if len(content.encode("utf-8")) > MAX_STORE_BYTES:
            return json.dumps({"error": f"content exceeds maximum size of {MAX_STORE_BYTES} bytes"})

        agent_id = ctx.client_id or "mcp-agent"
        spend = _get_spend_manager()
        check = spend.check_and_increment(agent_id, "store", 1)
        if not check["allowed"]:
            return json.dumps({"error": f"Store budget exhausted: {check['reason']}",
                               "remaining": check["remaining"], "suspended": check["suspended"]})

        mem = _resolve_memory(ctx)
        meta = dict(metadata or {})

        provenance = compute_provenance(
            source_type=source_type,
            source_url=source_url,
            content=content,
        )
        meta["_provenance"] = provenance

        try:
            record = await anyio.to_thread.run_sync(
                mem.store,
                memory_type,
                content,
                meta,
                expires_in_seconds,
            )
        except SecurityBlockError as exc:
            logger.warning("Memory store blocked by guard: %s", exc)
            report = getattr(exc, "report", None)
            result = {
                "error": "security_block",
                "detail": "Content blocked by security guard",
                "is_safe": False,
            }
            if report:
                result["findings"] = [
                    {"detector": f.detector, "threat_type": f.threat_type, "severity": f.severity, "detail": f.detail}
                    for f in report.findings
                ]
                result["trust_score"] = report.trust_score
                result["poisoning_risk"] = report.poisoning_risk
            return json.dumps(result, indent=2)
        except Exception:
            logger.exception("memory_store failed")
            return json.dumps({"error": "Store operation failed — check server logs for details"})
        await _notify_resource_updated(ctx, "bastion://stats")
        await _notify_resource_updated(ctx, f"bastion://memory/{record.memory_id}")
        return json.dumps(record.to_dict(), indent=2, default=str)

    @mcp.tool(
        name="memory_timetravel",
        title="Time Travel Query",
        description=("Query agent memory state at any past timestamp using CockroachDB's AS OF SYSTEM TIME."),
        annotations=ToolAnnotations(
            title="Time Travel Query",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_timetravel(
        ctx: Context,
        timestamp: str,
        agent_id: str | None = None,
    ) -> str:
        if not timestamp or not timestamp.strip():
            return json.dumps({"error": "timestamp is required"})
        # Validate timestamp format (ISO 8601 or relative like "5 minutes ago")
        import re
        ts = timestamp.strip()
        valid_iso = bool(re.match(r"\d{4}-\d{2}-\d{2}", ts))
        valid_relative = bool(re.match(r"\d+\s+\w+\s+ago|now|just now", ts, re.I))
        if not valid_iso and not valid_relative:
            return json.dumps({"error": "Invalid timestamp format. Use ISO 8601 (2026-01-01T00:00:00Z) or relative (5 minutes ago, now)"})
        mem = _resolve_memory(ctx)
        try:
            results = await anyio.to_thread.run_sync(
                mem.get_at_time,
                timestamp,
                agent_id,
            )
            return json.dumps([r.to_dict() for r in results], indent=2, default=str)
        except Exception:
            logger.exception("memory_timetravel failed")
            return json.dumps({"error": "Time travel query failed — check server logs"})

    @mcp.tool(
        name="memory_audit",
        title="Memory Audit Log",
        description="Retrieve the append-only, hash-chained audit log for an agent.",
        annotations=ToolAnnotations(
            title="Memory Audit Log",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_audit(ctx: Context, agent_id: str | None = None) -> str:
        mem = _resolve_memory(ctx)
        try:
            entries = await anyio.to_thread.run_sync(mem.audit, agent_id)
            return json.dumps([e.to_dict() for e in entries], indent=2, default=str)
        except Exception:
            logger.exception("memory_audit failed")
            return json.dumps({"error": "Audit query failed — check server logs"})

    @mcp.tool(
        name="memory_heal",
        title="Memory Self-Healing",
        description=(
            "Trigger CDC-triggered self-healing: removes expired memories, detects anomalies, compacts storage."
        ),
        annotations=ToolAnnotations(
            title="Memory Self-Healing",
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=False,
            openWorldHint=False,
        ),
    )
    async def memory_heal(ctx: Context, agent_id: str | None = None) -> str:
        mem = _resolve_memory(ctx)
        try:
            await _report_progress(ctx, 0, 2, "Pruning expired memories...")
            result = await anyio.to_thread.run_sync(mem.heal, agent_id)
            await _report_progress(ctx, 2, 2, "Self-heal complete")
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(result, indent=2, default=str)
        except Exception:
            logger.exception("memory_heal failed")
            return json.dumps({"error": "Self-heal failed — check server logs"})

    @mcp.tool(
        name="memory_delete",
        title="Delete Memory",
        description=(
            "Delete a single memory by ID. Requires confirmation flag. Uses CockroachDB SERIALIZABLE isolation."
        ),
        annotations=ToolAnnotations(
            title="Delete Memory",
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_delete(ctx: Context, memory_id: str, confirmed: bool = False) -> str:
        if not confirmed:
            return json.dumps({"error": "Deletion requires confirmed=true"})
        if not memory_id:
            return json.dumps({"error": "memory_id is required"})
        try:
            mem = _resolve_memory(ctx)
            await anyio.to_thread.run_sync(mem._delete_by_id, memory_id)
            await _notify_resource_updated(ctx, "bastion://stats")
            await _notify_resource_updated(ctx, f"bastion://memory/{memory_id}")
            return json.dumps({"deleted": memory_id, "status": "ok"}, indent=2)
        except Exception:
            logger.exception("memory_delete failed")
            return json.dumps({"error": "Delete operation failed — check server logs"})

    @mcp.tool(
        name="memory_pin",
        title="Pin Safety-Critical Memory",
        description=(
            "Pin a safety-critical memory that survives context compaction. "
            "Pinned memories are re-injected before every query. "
            "pin_priority: 0=normal, 1=important, 2=CRITICAL."
        ),
        annotations=ToolAnnotations(
            title="Pin Safety-Critical Memory",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def memory_pin(
        ctx: Context,
        content: str,
        memory_type: str = "safety_rule",
        pin_priority: int = 2,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        if not content or not content.strip():
            return json.dumps({"error": "content is required"})
        if pin_priority not in (0, 1, 2):
            return json.dumps({"error": "pin_priority must be 0 (normal), 1 (important), or 2 (CRITICAL)"})
        valid_types = {"fact", "task", "preference", "learned", "procedure", "safety_rule", "instruction"}
        if memory_type not in valid_types:
            return json.dumps({"error": f"Invalid memory_type: {memory_type}. Must be one of: {valid_types}"})
        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(
                mem.pin, memory_type, content, pin_priority, metadata,
            )
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(record.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("memory_pin failed")
            return json.dumps({"error": "Pin failed — check server logs"})

    @mcp.tool(
        name="memory_get_pinned",
        title="Get Pinned Memories",
        description=(
            "Retrieve all pinned memories with priority >= min_priority. "
            "Called automatically before every search to inject safety rules."
        ),
        annotations=ToolAnnotations(
            title="Get Pinned Memories",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_get_pinned(
        ctx: Context,
        min_priority: int = 1,
    ) -> str:
        mem = _resolve_memory(ctx)
        try:
            results = await anyio.to_thread.run_sync(mem.get_pinned, min_priority)
            return json.dumps([r.to_dict() for r in results], indent=2, default=str)
        except Exception:
            logger.exception("memory_get_pinned failed")
            return json.dumps({"error": "Get pinned failed — check server logs"})

    @mcp.tool(
        name="memory_list",
        title="List Agent Memories",
        description=(
            "List all memories for the current agent. Supports filtering by type "
            "and pagination. User-facing governance tool."
        ),
        annotations=ToolAnnotations(
            title="List Agent Memories",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_list(
        ctx: Context,
        memory_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> str:
        # Bounds checking
        if limit < 1 or limit > 500:
            return json.dumps({"error": "limit must be between 1 and 500"})
        if offset < 0:
            return json.dumps({"error": "offset must be >= 0"})
        mem = _resolve_memory(ctx)
        try:
            results = await anyio.to_thread.run_sync(mem.list_memories, memory_type, limit, offset)
            return json.dumps([r.to_dict() for r in results], indent=2, default=str)
        except Exception:
            logger.exception("memory_list failed")
            return json.dumps({"error": "List failed — check server logs"})

    @mcp.tool(
        name="memory_correct",
        title="Correct Memory Content",
        description=(
            "Update a memory's content. User-facing governance tool for "
            "correcting stored information."
        ),
        annotations=ToolAnnotations(
            title="Correct Memory Content",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def memory_correct(
        ctx: Context,
        memory_id: str,
        new_content: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        if not memory_id:
            return json.dumps({"error": "memory_id is required"})
        if not new_content:
            return json.dumps({"error": "new_content is required"})
        if len(new_content) > _MAX_CONTENT_LENGTH:
            return json.dumps({"error": f"Content too large (max {_MAX_CONTENT_LENGTH} chars)"})
        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(mem.correct_memory, memory_id, new_content, metadata)
            if record is None:
                return json.dumps({"error": f"Memory {memory_id} not found"})
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(record.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("memory_correct failed")
            return json.dumps({"error": "Correct failed — check server logs"})

    @mcp.tool(
        name="memory_health",
        title="Memory Health Metrics",
        description=(
            "Return memory health metrics: total count, pinned count, "
            "freshness ratio, average access/importance scores."
        ),
        annotations=ToolAnnotations(
            title="Memory Health Metrics",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_health(ctx: Context) -> str:
        try:
            mem = _resolve_memory(ctx)
            health = await anyio.to_thread.run_sync(mem.memory_health)
            return json.dumps(health, indent=2, default=str)
        except Exception:
            logger.exception("memory_health failed")
            return json.dumps({"error": "Health check failed — check server logs"})

    @mcp.tool(
        name="memory_apply_patch",
        title="Apply JSON Patch to Memory",
        description=(
            "Apply RFC 6902 JSON Patch operations to a memory's metadata. "
            "Atomic: either the full patch applies or nothing does. "
            "Schema-validated: result must conform to the memory metadata schema."
        ),
        annotations=ToolAnnotations(
            title="Apply JSON Patch to Memory",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def memory_apply_patch(
        ctx: Context,
        memory_id: str,
        patch_ops: list[dict[str, Any]],
    ) -> str:
        if not memory_id:
            return json.dumps({"error": "memory_id is required"})
        if not patch_ops:
            return json.dumps({"error": "patch_ops is required"})
        mem = _resolve_memory(ctx)
        try:
            result = await anyio.to_thread.run_sync(mem.apply_patch, memory_id, patch_ops)
            if result is None:
                return json.dumps({"error": f"Memory {memory_id} not found"})
            await _notify_resource_updated(ctx, f"bastion://memory/{memory_id}")
            return json.dumps(result, indent=2, default=str)
        except Exception:
            logger.exception("memory_apply_patch failed")
            return json.dumps({"error": "Patch failed — check server logs"})

    @mcp.tool(
        name="resolve_conflict",
        title="Resolve Memory Conflict",
        description=("Resolve conflicting memories from multiple agents using SERIALIZABLE isolation."),
        annotations=ToolAnnotations(
            title="Resolve Memory Conflict",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=False,
        ),
    )
    async def resolve_conflict(
        ctx: Context,
        fact_a: str,
        fact_b: str,
        context: str | None = None,
    ) -> str:
        if not fact_a or not fact_b:
            return json.dumps({"error": "Both fact_a and fact_b are required"})
        mem = _resolve_memory(ctx)
        try:
            await _report_progress(ctx, 0, 3, "Analyzing conflicting facts...")
            await _report_progress(ctx, 1, 3, "Acquiring SERIALIZABLE lock...")
            merged = await anyio.to_thread.run_sync(
                mem.resolve_conflict,
                fact_a,
                fact_b,
                context,
            )
            await _report_progress(ctx, 3, 3, "Conflict resolved")
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps({"merged": merged}, indent=2, default=str)
        except Exception:
            logger.exception("resolve_conflict failed")
            return json.dumps({"error": "Conflict resolution failed — check server logs"})

    @mcp.tool(
        name="ltm_check_reuse",
        title="LTM Gateway — Check Memory Reuse",
        description=(
            "Before running an expensive workflow, check if a similar analysis "
            "already exists in long-term memory. Uses C-SPANN vector similarity "
            "search to find cached results above a configurable threshold. "
            "Returns the cached analysis if found, or None if the workflow "
            "should be run fresh. This is the core pattern for avoiding "
            "redundant LLM computation."
        ),
        annotations=ToolAnnotations(
            title="LTM Gateway — Check Memory Reuse",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def ltm_check_reuse(
        ctx: Context,
        query: str,
        threshold: float = 0.80,
        analysis_type: str | None = None,
    ) -> str:
        from bastion.ltm_gateway import LTMMemoryGateway

        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})
        if not 0.0 <= threshold <= 1.0:
            return json.dumps({"error": "threshold must be between 0.0 and 1.0"})

        mem = _resolve_memory(ctx)
        try:
            gateway = LTMMemoryGateway(mem, reuse_threshold=threshold)
            result = await anyio.to_thread.run_sync(
                gateway.check_reuse, query, threshold, analysis_type,
            )
            if result is None:
                return json.dumps({
                    "reuse_found": False,
                    "query": query[:200],
                    "threshold": threshold,
                    "recommendation": "run_workflow",
                }, indent=2)
            return json.dumps({
                "reuse_found": True,
                **result.to_dict(),
            }, indent=2, default=str)
        except Exception:
            logger.exception("ltm_check_reuse failed")
            return json.dumps({"error": "LTM check failed — check server logs"})

    @mcp.tool(
        name="ltm_store_analysis",
        title="LTM Gateway — Store Analysis Result",
        description=(
            "Store a completed agent analysis result in memory for future reuse "
            "by the LTM Gateway. Tag it with analysis_type (analysis, research, "
            "summary, report, etc.) and optionally include token usage for cost tracking."
        ),
        annotations=ToolAnnotations(
            title="LTM Gateway — Store Analysis Result",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def ltm_store_analysis(
        ctx: Context,
        query: str,
        result: str,
        analysis_type: str = "analysis",
        metadata: dict[str, Any] | None = None,
        tokens_used: int | None = None,
    ) -> str:
        from bastion.ltm_gateway import LTMMemoryGateway

        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})
        if not result or not result.strip():
            return json.dumps({"error": "result must be a non-empty string"})
        if len(query) > _MAX_CONTENT_LENGTH:
            return json.dumps({"error": f"query too large (max {_MAX_CONTENT_LENGTH} chars)"})
        if len(result) > _MAX_CONTENT_LENGTH:
            return json.dumps({"error": f"result too large (max {_MAX_CONTENT_LENGTH} chars)"})

        mem = _resolve_memory(ctx)
        try:
            gateway = LTMMemoryGateway(mem)
            store_result = await anyio.to_thread.run_sync(
                gateway.store_analysis, query, result, analysis_type, metadata, tokens_used,
            )
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(store_result.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("ltm_store_analysis failed")
            return json.dumps({"error": "LTM store failed — check server logs"})

    @mcp.tool(
        name="ltm_invalidate",
        title="LTM Gateway — Invalidate Stale Analyses",
        description=(
            "Mark cached agent analyses for a query as stale when new information "
            "arrives that contradicts them. Preserves audit trail but tags "
            "memory results for re-computation."
        ),
        annotations=ToolAnnotations(
            title="LTM Gateway — Invalidate Stale Analyses",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=False,
        ),
    )
    async def ltm_invalidate(
        ctx: Context,
        query: str,
        reason: str = "outdated",
    ) -> str:
        from bastion.ltm_gateway import LTMMemoryGateway

        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})

        mem = _resolve_memory(ctx)
        try:
            gateway = LTMMemoryGateway(mem)
            result = await anyio.to_thread.run_sync(gateway.invalidate, query, reason)
            return json.dumps(result, indent=2, default=str)
        except Exception:
            logger.exception("ltm_invalidate failed")
            return json.dumps({"error": "LTM invalidate failed — check server logs"})

    @mcp.tool(
        name="detect_contradictions",
        title="Detect Memory Contradictions",
        description=(
            "Scan existing memories for contradictions against a newly stored "
            "memory. Detects negation contradictions (X is true vs X is not true), "
            "temporal contradictions (old fact vs updated fact), and semantic "
            "contradictions (similar content, different claims). Auto-supersedes "
            "high-confidence contradictions."
        ),
        annotations=ToolAnnotations(
            title="Detect Memory Contradictions",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def detect_contradictions(
        ctx: Context,
        memory_id: str,
    ) -> str:
        from bastion.contradiction import ContradictionDetector

        if not memory_id:
            return json.dumps({"error": "memory_id is required"})

        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(mem.get_memory, memory_id)
            if record is None:
                return json.dumps({"error": f"Memory {memory_id} not found"})

            detector = ContradictionDetector(mem)
            result = await anyio.to_thread.run_sync(detector.scan_after_store, record)
            return json.dumps(result.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("detect_contradictions failed")
            return json.dumps({"error": "Contradiction detection failed — check server logs"})

    @mcp.tool(
        name="scan_all_contradictions",
        title="Batch Contradiction Scan",
        description=(
            "Scan ALL agent memories for existing contradictions. Useful for "
            "initial setup or periodic maintenance. Returns all detected "
            "contradictions across the entire memory store."
        ),
        annotations=ToolAnnotations(
            title="Batch Contradiction Scan",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def scan_all_contradictions(ctx: Context) -> str:
        from bastion.contradiction import ContradictionDetector

        mem = _resolve_memory(ctx)
        try:
            detector = ContradictionDetector(mem)
            results = await anyio.to_thread.run_sync(detector.scan_all)
            # Limit results to prevent DoS from large memory stores
            results = results[:100]
            return json.dumps(
                [r.to_dict() for r in results],
                indent=2,
                default=str,
            )
        except Exception:
            logger.exception("scan_all_contradictions failed")
            return json.dumps({"error": "Batch contradiction scan failed — check server logs"})

    @mcp.tool(
        name="dream",
        title="Sleep-Time Memory Consolidation",
        description=(
            "Trigger a dreaming/consolidation cycle: reviews recent episodic "
            "memories, extracts patterns and lessons, consolidates duplicates, "
            "promotes high-value episodic memories to semantic knowledge, and "
            "prunes low-value memories. All actions are logged in the audit "
            "trail. Run this during agent idle time for autonomous learning."
        ),
        annotations=ToolAnnotations(
            title="Sleep-Time Memory Consolidation",
            readOnlyHint=False,
            destructiveHint=True,
            idempotentHint=False,
            openWorldHint=False,
        ),
    )
    async def dream(ctx: Context, lookback_hours: int = 24) -> str:
        from bastion.dreaming import MemoryDreamer

        if lookback_hours < 1 or lookback_hours > 168:
            return json.dumps({"error": "lookback_hours must be between 1 and 168"})

        try:
            mem = _resolve_memory(ctx)
            dreamer = MemoryDreamer(mem, lookback_hours=lookback_hours)
            await _report_progress(ctx, 0, 4, "Starting dream cycle...")
            journal = await anyio.to_thread.run_sync(dreamer.dream)
            await _report_progress(ctx, 4, 4, "Dream cycle complete")
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(journal.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("dream failed")
            return json.dumps({"error": "Dream consolidation failed — check server logs"})

    @mcp.tool(
        name="dream_history",
        title="Dream History",
        description=(
            "Retrieve past dreaming/consolidation sessions from the agent memory "
            "audit trail. Shows what was consolidated, promoted, and pruned in each cycle."
        ),
        annotations=ToolAnnotations(
            title="Dream History",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def dream_history(ctx: Context) -> str:
        from bastion.dreaming import MemoryDreamer

        try:
            mem = _resolve_memory(ctx)
            dreamer = MemoryDreamer(mem)
            history = await anyio.to_thread.run_sync(dreamer.get_dream_history)
            return json.dumps(history, indent=2, default=str)
        except Exception:
            logger.exception("dream_history failed")
            return json.dumps({"error": "Dream history failed — check server logs"})

    @mcp.tool(
        name="detect_observations",
        title="Detect Meta-Patterns in Agent Memory",
        description=(
            "Scan all agent memories to detect recurring themes, entity "
            "co-occurrences, temporal trends, and entity clusters. Surfaces "
            "global patterns beyond individual facts."
        ),
        annotations=ToolAnnotations(
            title="Detect Meta-Patterns in Agent Memory",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def detect_observations(ctx: Context) -> str:
        from bastion.observations import ObservationDetector

        mem = _resolve_memory(ctx)
        try:
            detector = ObservationDetector(mem)
            report = await anyio.to_thread.run_sync(detector.detect)
            # Limit observations to prevent DoS from large memory stores
            report.observations = report.observations[:100]
            return json.dumps(report.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("detect_observations failed")
            return json.dumps({"error": "Observation detection failed — check server logs"})

    @mcp.tool(
        name="multi_signal_search",
        title="Multi-Signal Memory Retrieval",
        description=(
            "Search agent memories using multi-signal fusion: vector cosine "
            "similarity + BM25 keyword matching + entity matching + temporal "
            "recency scoring. Combines 4 signals with configurable weights "
            "for more accurate recall than pure vector search alone."
        ),
        annotations=ToolAnnotations(
            title="Multi-Signal Memory Retrieval",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def multi_signal_search(
        ctx: Context,
        query: str,
        k: int = 10,
        threshold: float = 0.3,
        memory_type: str | None = None,
    ) -> str:
        from bastion.retrieval import MultiSignalRetriever

        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})
        if k < 1 or k > 500:
            return json.dumps({"error": "k must be between 1 and 500"})
        if not 0.0 <= threshold <= 1.0:
            return json.dumps({"error": "threshold must be between 0.0 and 1.0"})

        try:
            mem = _resolve_memory(ctx)
            retriever = MultiSignalRetriever(mem)
            results = await anyio.to_thread.run_sync(
                retriever.search, query, k, threshold, memory_type,
            )
            return json.dumps(
                {
                    "results": [r.to_dict() for r in results],
                    "total": len(results),
                    "signals": ["vector", "keyword", "entity", "temporal"],
                },
                indent=2,
                default=str,
            )
        except Exception:
            logger.exception("multi_signal_search failed")
            return json.dumps({"error": "Search failed — check server logs"})

    @mcp.tool(
        name="context_pack",
        title="Context Budget Packer",
        description=(
            "Pack the most relevant memories into a token budget for LLM "
            "context injection. Prioritizes pinned memories, high-importance "
            "facts, and query-relevant content. Returns packed memories with "
            "token counts and utilization metrics."
        ),
        annotations=ToolAnnotations(
            title="Context Budget Packer",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def context_pack(
        ctx: Context,
        budget_tokens: int = 4000,
        query: str | None = None,
    ) -> str:
        if budget_tokens < 1:
            return json.dumps({"error": "budget_tokens must be >= 1"})
        from bastion.context_budget import ContextBudgetManager

        mem = _resolve_memory(ctx)
        try:
            packer = ContextBudgetManager(mem)
            result = await anyio.to_thread.run_sync(
                packer.pack, budget_tokens, query,
            )
            return json.dumps(result.to_dict(), indent=2, default=str)
        except Exception:
            logger.exception("context_pack failed")
            return json.dumps({"error": "Context packing failed — check server logs"})

    @mcp.tool(
        name="agent_schema",
        title="Agent Schema Query",
        description=(
            "Query the agent's own database schema via MCP. Returns table "
            "structures, indexes, and column definitions. Enables agents to "
            "understand and reason about their own storage layer."
        ),
        annotations=ToolAnnotations(
            title="Agent Schema Query",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def agent_schema(
        ctx: Context,
        table: str | None = None,
    ) -> str:
        mem = _resolve_memory(ctx)
        schema: dict[str, Any] = {}
        if mem._mock:
            mock_tables = {
                "agent_memory": {
                    "columns": [
                        {"name": "memory_id", "type": "UUID", "nullable": False},
                        {"name": "agent_id", "type": "STRING(255)", "nullable": False},
                        {"name": "memory_type", "type": "STRING(50)", "nullable": False},
                        {"name": "content", "type": "TEXT", "nullable": False},
                        {"name": "embedding", "type": "VECTOR(1024)", "nullable": True},
                        {"name": "metadata", "type": "JSONB", "nullable": True},
                        {"name": "created_at", "type": "TIMESTAMPTZ", "nullable": False},
                        {"name": "importance_score", "type": "FLOAT", "nullable": True},
                        {"name": "trust_level", "type": "FLOAT", "nullable": True},
                    ]
                },
                "agent_audit": {
                    "columns": [
                        {"name": "audit_id", "type": "UUID", "nullable": False},
                        {"name": "agent_id", "type": "STRING(255)", "nullable": False},
                        {"name": "action", "type": "STRING(100)", "nullable": False},
                        {"name": "details", "type": "JSONB", "nullable": True},
                        {"name": "recorded_at", "type": "TIMESTAMPTZ", "nullable": False},
                    ]
                },
                "agent_entities": {
                    "columns": [
                        {"name": "entity_id", "type": "UUID", "nullable": False},
                        {"name": "agent_id", "type": "STRING(255)", "nullable": False},
                        {"name": "entity_type", "type": "STRING(50)", "nullable": False},
                        {"name": "name", "type": "STRING(255)", "nullable": False},
                        {"name": "attributes", "type": "JSONB", "nullable": True},
                    ]
                },
                "agent_relations": {
                    "columns": [
                        {"name": "relation_id", "type": "UUID", "nullable": False},
                        {"name": "source_entity_id", "type": "UUID", "nullable": False},
                        {"name": "target_entity_id", "type": "UUID", "nullable": False},
                        {"name": "relation_type", "type": "STRING(100)", "nullable": False},
                    ]
                },
            }
            if table:
                table_info = mock_tables.get(table)
                if table_info is None:
                    schema = {"error": f"Table '{table}' not found"}
                else:
                    schema = {"table": table, "columns": table_info["columns"]}
            else:
                tables_dict = {
                    name: {"columns": [c["name"] for c in t["columns"]]}
                    for name, t in mock_tables.items()
                }
                schema = {"tables": tables_dict}
        else:
            try:
                pool = mem.get_pool()
                conn = pool.acquire(timeout=10.0)
                try:
                    with conn.cursor() as cur:
                        if table:
                            cur.execute(
                                "SELECT column_name, data_type, is_nullable "
                                "FROM information_schema.columns "
                                "WHERE table_name = %s ORDER BY ordinal_position",
                                (table,),
                            )
                            rows = cur.fetchall()
                            schema = {"table": table, "columns": [
                                {"name": r[0], "type": r[1], "nullable": r[2] == "YES"}
                                for r in rows
                            ]}
                        else:
                            cur.execute(
                                "SELECT table_name FROM information_schema.tables "
                                "WHERE table_schema = 'public' ORDER BY table_name"
                            )
                            tables = [r[0] for r in cur.fetchall()]
                            schema = {"tables": tables}
                finally:
                    pool.release(conn)
            except Exception:
                logger.exception("agent_schema failed")
                schema = {"error": "Schema query failed — check server logs"}

        return json.dumps(schema, indent=2, default=str)

    @mcp.tool(
        name="a2a_bridge",
        title="A2A Agent Bridge",
        description=(
            "A2A protocol bridge: discover agent cards or forward requests to A2A servers. "
            "Without parameters: returns the signed Agent Card for this server. "
            "With a2a_url + skill: forwards a skill execution request to the target A2A server "
            "and returns the result. Enables cross-protocol MCP→A2A communication."
        ),
        annotations=ToolAnnotations(
            title="A2A Agent Bridge",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=True,
        ),
    )
    async def a2a_bridge(
        agent_id: str = "bastion-agent",
        a2a_url: str | None = None,
        skill: str | None = None,
        skill_params: dict[str, Any] | None = None,
        timeout_seconds: int = 60,
    ) -> str:
        # Discovery mode: return signed Agent Card
        if not a2a_url or not skill:
            card = _build_a2a_card(agent_id)
            signed = _mcp_card_signer.sign_card(card)
            return json.dumps(signed, indent=2, default=str)

        # Forwarding mode: send request to A2A server
        import ipaddress

        # SSRF protection: validate target URL (resolves DNS to prevent rebinding)
        from urllib.parse import urlparse

        import httpx
        try:
            parsed = urlparse(a2a_url)
            if parsed.scheme not in ("http", "https"):
                return json.dumps({"error": "Only http/https URLs allowed"})
            hostname = parsed.hostname or ""
            if not hostname:
                return json.dumps({"error": "Invalid URL: no hostname"})
            blocked = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal")
            if hostname.lower() in blocked or hostname.endswith((".local", ".internal", ".localhost")):
                return json.dumps({"error": "Internal/private URLs are blocked (SSRF protection)"})
            # Resolve DNS and check resolved IPs (prevents rebinding attacks)
            import socket
            try:
                resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
                for _, _, _, _, sockaddr in resolved:
                    resolved_ip = ipaddress.ip_address(sockaddr[0])
                    if resolved_ip.is_private or resolved_ip.is_loopback or resolved_ip.is_link_local or resolved_ip.is_reserved or resolved_ip.is_multicast:
                        return json.dumps({"error": "Private/internal IP addresses are blocked (SSRF protection)"})
            except (socket.gaierror, OSError):
                return json.dumps({"error": "DNS resolution failed — URL blocked"})
        except Exception:
            return json.dumps({"error": "Invalid URL format"})

        target_url = f"{a2a_url.rstrip('/')}/"
        payload = {
            "jsonrpc": "2.0",
            "id": uuid.uuid4().hex,
            "method": "SendMessage",
            "params": {
                "message": {
                    "role": 1,
                    "parts": [{"text": ""}],
                    "metadata": {"skill": skill, "params": skill_params or {}},
                },
                "configuration": {"return_immediately": True},
            },
        }
        headers = {"A2A-Version": "1.0", "Content-Type": "application/json"}
        # NOTE: Do NOT forward the server's own API key to external A2A servers.
        # The target server should have its own auth configured.

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(target_url, json=payload, headers=headers)
                resp.raise_for_status()
                body = resp.json()
                if "error" in body:
                    return json.dumps({"error": body["error"], "source": "a2a_bridge"}, indent=2)
                result = body.get("result", {})
                status = result.get("status", {}).get("state", "UNKNOWN")
                artifacts = result.get("artifacts", [])
                if artifacts:
                    text = artifacts[0]["parts"][0]["text"]
                    return json.dumps({
                        "status": status,
                        "task_id": result.get("id"),
                        "result": json.loads(text) if text else None,
                        "bridge": {"from": "mcp", "to": a2a_url, "skill": skill},
                    }, indent=2, default=str)
                return json.dumps({
                    "status": status,
                    "task_id": result.get("id"),
                    "bridge": {"from": "mcp", "to": a2a_url, "skill": skill},
                }, indent=2, default=str)
        except httpx.TimeoutException:
            return json.dumps({"error": f"A2A bridge timeout after {timeout_seconds}s", "source": "a2a_bridge"})
        except Exception:
            logger.exception("A2A bridge failed")
            return json.dumps({"error": "A2A bridge failed — check server logs", "source": "a2a_bridge"})

    # ── Well-Known Endpoints (MCP Registry + A2A) ─────────────────────────

    @mcp.custom_route("/.well-known/mcp-server.json", methods=["GET"])
    async def server_card_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        tools_list = [
            {
                "name": "memory_search",
                "description": "C-SPANN vector search with decay-weighted scoring and cursor-based pagination",
                "read_only": True,
            },
            {
                "name": "memory_store",
                "description": "SHA-256 hash-chained memory storage with AWS Bedrock Titan V2 embeddings",
                "read_only": False,
            },
            {
                "name": "memory_timetravel",
                "description": "Point-in-time queries via CockroachDB AS OF SYSTEM TIME",
                "read_only": True,
            },
            {
                "name": "memory_audit",
                "description": "Append-only immutable audit log with cryptographic hash chain",
                "read_only": True,
            },
            {
                "name": "memory_heal",
                "description": "CDC-triggered self-healing: prune expired, detect anomalies, compact",
                "read_only": False,
                "destructive": True,
            },
            {
                "name": "memory_delete",
                "description": "Delete a memory by ID with confirmation flag",
                "read_only": False,
                "destructive": True,
            },
            {
                "name": "resolve_conflict",
                "description": "Multi-agent conflict resolution with SERIALIZABLE isolation",
                "read_only": False,
            },
            {
                "name": "a2a_bridge",
                "description": "A2A Agent Card for inter-agent discovery",
                "read_only": True,
            },
            {
                "name": "memory_pin",
                "description": "Pin safety-critical memories that survive context compaction",
                "read_only": False,
            },
            {
                "name": "memory_get_pinned",
                "description": "Get all pinned memories for safety rule injection",
                "read_only": True,
            },
            {
                "name": "memory_list",
                "description": "List all memories with filtering and pagination",
                "read_only": True,
            },
            {
                "name": "memory_correct",
                "description": "Update a memory's content for governance",
                "read_only": False,
            },
            {
                "name": "memory_health",
                "description": "Memory health metrics: count, freshness, pinned",
                "read_only": True,
            },
            {
                "name": "memory_apply_patch",
                "description": "Apply RFC 6902 JSON Patch to memory metadata",
                "read_only": False,
            },
            {
                "name": "ltm_check_reuse",
                "description": "LTM Gateway: check if a similar analysis exists before running expensive workflows",
                "read_only": True,
            },
            {
                "name": "ltm_store_analysis",
                "description": "LTM Gateway: store completed analysis results for future reuse",
                "read_only": False,
            },
            {
                "name": "ltm_invalidate",
                "description": "LTM Gateway: mark cached analyses as stale when new info arrives",
                "read_only": False,
            },
            {
                "name": "dream",
                "description": "Sleep-time memory consolidation: review, consolidate, promote, and prune memories",
                "read_only": False,
                "destructive": True,
            },
            {
                "name": "dream_history",
                "description": "View past dreaming/consolidation sessions from audit trail",
                "read_only": True,
            },
            {
                "name": "detect_contradictions",
                "description": "Auto-detect contradictions between new and existing memories",
                "read_only": False,
            },
            {
                "name": "scan_all_contradictions",
                "description": "Batch scan all agent memories for existing contradictions",
                "read_only": True,
            },
            {
                "name": "detect_observations",
                "description": "Detect recurring themes, co-occurrences, and meta-patterns across memories",
                "read_only": True,
            },
            {
                "name": "multi_signal_search",
                "description": "Multi-signal retrieval: vector + BM25 keyword + entity + temporal fusion",
                "read_only": True,
            },
            {
                "name": "context_pack",
                "description": "Pack memories into token budget for LLM context injection",
                "read_only": True,
            },
            {
                "name": "agent_schema",
                "description": "Query agent's own database schema via MCP",
                "read_only": True,
            },
        ]
        card = {
            "schemaVersion": "v1",
            "name": "Bastion Memory",
            "version": VERSION,
            "description": (
                "Agentic memory layer backed by CockroachDB with SHA-256 hash chain"
                " integrity, C-SPANN vector indexing, AS OF SYSTEM TIME queries,"
                " and SERIALIZABLE conflict resolution."
            ),
            "tools": tools_list,
            "resources": [
                {"uri": "bastion://schema", "description": "CockroachDB table schemas, indexes, and CDC metadata"},
                {"uri": "bastion://config", "description": "Active server configuration"},
                {"uri": "bastion://stats", "description": "Live memory counts and rate limiter stats"},
                {"uri": "bastion://memory/{memory_id}", "description": "Single memory record by ID"},
            ],
            "prompts": [
                {"name": "analyze_memory", "description": "Scan memory for patterns, anomalies, and trends"},
                {
                    "name": "conflict_analysis",
                    "description": "Compare conflicting memory inputs and propose resolution",
                },
                {"name": "audit_review", "description": "Check SHA-256 hash chain ledger for anomalies"},
            ],
            "capabilities": {
                "streamable_http": True,
                "stdio": True,
                "resources": True,
                "prompts": True,
                "tool_annotations": True,
                "pagination": True,
                "resource_subscriptions": True,
                "stateless": stateless,
                "multi_tenant": multi_tenant,
                "a2a": True,
            },
            "auth": {
                "type": "oauth" if use_oauth else ("api_key" if _load_api_keys() else "none"),
                "header": "Authorization: Bearer <key>" if not use_oauth else "Authorization: Bearer <token>",
                "oauth_issuer": (
                    os.environ.get("BASTION_MCP_ISSUER_URL", "https://localhost:9997") if use_oauth else None
                ),
            },
            "transport": {
                "stdio": {"command": "python -m bastion.mcp_server"},
                "http": {"url": "/mcp", "default_port": 9997},
            },
            "provider": {
                "organization": "Bastion",
                "url": "https://github.com/dgboy-ai/Bastion",
            },
        }
        return JSONResponse(card)

    @mcp.custom_route("/.well-known/agent-card.json", methods=["GET"])
    async def agent_card_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        card = _build_a2a_card("bastion-agent")
        signed = _mcp_card_signer.sign_card(card)
        return JSONResponse(signed)

    @mcp.custom_route("/.well-known/public-key.pem", methods=["GET"])
    async def public_key_route(request: Any) -> Any:
        from starlette.responses import Response

        return Response(
            content=_mcp_card_signer.get_public_key_pem(),
            media_type="application/x-pem-file",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # ── Custom HTTP routes (healthz, metrics) ─────────────────────────────

    @mcp.custom_route("/healthz", methods=["GET"])
    async def healthz_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        # Count registered tools dynamically
        tool_count = len(mcp._tool_manager._tools) if hasattr(mcp, "_tool_manager") else 0
        return JSONResponse(
            {
                "status": "ok",
                "service": "bastion-mcp",
                "version": VERSION,
                "tools": tool_count,
            }
        )

    @mcp.custom_route("/readyz", methods=["GET"])
    async def readyz_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        mem = _get_shared_memory()
        connected = await anyio.to_thread.run_sync(lambda: mem.is_connected)
        if connected:
            return JSONResponse({"status": "ok"})
        return JSONResponse({"status": "not ready"}, status_code=503)

    @mcp.custom_route("/metrics", methods=["GET"])
    async def metrics_route(request: Any) -> Any:
        from starlette.responses import Response

        try:
            limiter = _get_limiter()
            limiter_stats = limiter.get_stats()
        except Exception:
            limiter_stats = {"current": 0, "queued": 0, "max_concurrent": 20}

        lines = [
            "# HELP bastion_mcp_requests_total Total MCP HTTP requests by method, path, and status",
            "# TYPE bastion_mcp_requests_total counter",
        ]
        for (method, path, status), count in sorted(_metrics_requests_total.items()):
            lines.append(f'bastion_mcp_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')
        lines.append("")
        lines.append("# HELP bastion_mcp_request_duration_seconds Request duration percentiles (sampled last 500 per path)")
        lines.append("# TYPE bastion_mcp_request_duration_seconds summary")
        for (method, path), durations in sorted(_metrics_durations.items()):
            if not durations:
                continue
            dur_sorted = sorted(durations)
            n = len(dur_sorted)
            for p, label in [(50, "0.5"), (90, "0.9"), (95, "0.95"), (99, "0.99")]:
                idx = min(int(n * p / 100), n - 1)
                lines.append(f'bastion_mcp_request_duration_seconds{{method="{method}",path="{path}",quantile="{label}"}} {dur_sorted[idx]:.6f}')
            lines.append(f'bastion_mcp_request_duration_seconds_sum{{method="{method}",path="{path}"}} {sum(durations):.6f}')
            lines.append(f'bastion_mcp_request_duration_seconds_count{{method="{method}",path="{path}"}} {n}')
        lines.append("")
        lines.append("# HELP bastion_mcp_rate_limit_hits_total Total rate-limited requests")
        lines.append("# TYPE bastion_mcp_rate_limit_hits_total counter")
        lines.append(f"bastion_mcp_rate_limit_hits_total {_metrics_rate_limit_hits}")
        lines.append("")
        lines.append("# HELP bastion_mcp_tools_total Number of registered MCP tools")
        lines.append("# TYPE bastion_mcp_tools_total gauge")
        tool_count = len(mcp._tool_manager._tools) if hasattr(mcp, "_tool_manager") else 0
        lines.append(f"bastion_mcp_tools_total {tool_count}")
        lines.append("")
        lines.append("# HELP bastion_mcp_resources_total Number of registered MCP resources and resource templates")
        lines.append("# TYPE bastion_mcp_resources_total gauge")
        resource_count = len(mcp._resource_manager.list_resources()) if hasattr(mcp, "_resource_manager") else 0
        template_count = len(mcp._resource_manager.list_templates()) if hasattr(mcp, "_resource_manager") else 0
        lines.append(f"bastion_mcp_resources_total {resource_count + template_count}")
        lines.append("")
        lines.append("# HELP bastion_mcp_prompts_total Number of registered MCP prompts")
        lines.append("# TYPE bastion_mcp_prompts_total gauge")
        prompt_count = len(mcp._prompt_manager.list_prompts()) if hasattr(mcp, "_prompt_manager") else 0
        lines.append(f"bastion_mcp_prompts_total {prompt_count}")
        lines.append("")
        lines.append("# HELP bastion_mcp_limiter_current Current concurrent requests")
        lines.append("# TYPE bastion_mcp_limiter_current gauge")
        lines.append(f"bastion_mcp_limiter_current {limiter_stats.get('current', 0)}")
        lines.append("")
        lines.append("# HELP bastion_mcp_limiter_queued Current queued requests")
        lines.append("# TYPE bastion_mcp_limiter_queued gauge")
        lines.append(f"bastion_mcp_limiter_queued {limiter_stats.get('queued', 0)}")
        lines.append("")
        lines.append("# HELP bastion_mcp_up Server uptime in seconds")
        lines.append("# TYPE bastion_mcp_up gauge")
        lines.append(f"bastion_mcp_up {time.monotonic() - _metrics_start_time:.0f}")
        lines.append("")
        return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    # ── RFC 7009 Token Revocation Endpoint ─────────────────────────────────

    @mcp.custom_route("/oauth/revoke", methods=["POST"])
    async def oauth_revoke_route(request: Any) -> Any:
        """RFC 7009 — Token Revocation endpoint.

        Accepts: application/x-www-form-urlencoded or application/json
        Body: token=<value>&token_type_hint=access|refresh
        Returns: 200 OK (empty body per RFC 7009) on success.
        """
        from starlette.responses import JSONResponse, Response

        try:
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                body = await request.json()
                token_value = body.get("token", "")
                token_type_hint = body.get("token_type_hint", "access")
            else:
                form_data = await request.form()
                token_value = form_data.get("token", "")
                token_type_hint = form_data.get("token_type_hint", "access")

            if not token_value:
                return JSONResponse({"error": "missing 'token' parameter"}, status_code=400)

            # Auth check: require valid API key or OAuth token
            if not _check_auth(dict(request.headers)):
                return JSONResponse({"error": "Unauthorized"}, status_code=401)

            provider = None
            if hasattr(mcp, "_auth_server_provider") and mcp._auth_server_provider:
                provider = mcp._auth_server_provider

            if provider and hasattr(provider, "revoke_token_by_value"):
                await provider.revoke_token_by_value(token_value, token_type_hint)
            else:
                logger.warning("No OAuth provider configured — revocation not available")

            # RFC 7009: always return 200, even if token was not found
            return Response(status_code=200)
        except Exception:
            logger.exception("Token revocation failed")
            return JSONResponse({"error": "revocation failed"}, status_code=500)

    @mcp.custom_route("/oauth/introspect", methods=["POST"])
    async def oauth_introspect_route(request: Any) -> Any:
        """RFC 7662 — Token Introspection endpoint.

        Accepts: application/x-www-form-urlencoded or application/json
        Body: token=<value>
        Returns: JSON with active status, scopes, and role.
        """
        from starlette.responses import JSONResponse

        try:
            content_type = request.headers.get("content-type", "")
            if "application/json" in content_type:
                body = await request.json()
                token_value = body.get("token", "")
            else:
                form_data = await request.form()
                token_value = form_data.get("token", "")

            if not token_value:
                return JSONResponse({"error": "missing 'token' parameter"}, status_code=400)

            # Auth check
            if not _check_auth(dict(request.headers)):
                return JSONResponse({"error": "Unauthorized"}, status_code=401)

            provider = None
            if hasattr(mcp, "_auth_server_provider") and mcp._auth_server_provider:
                provider = mcp._auth_server_provider

            if provider and hasattr(provider, "is_token_revoked"):
                if await provider.is_token_revoked(token_value):
                    return JSONResponse({"active": False})
            if provider and hasattr(provider, "load_access_token"):
                token_obj = await provider.load_access_token(token_value)
                if token_obj:
                    from bastion.auth_provider import resolve_role_from_scopes
                    return JSONResponse({
                        "active": True,
                        "scope": " ".join(token_obj.scopes or []),
                        "client_id": token_obj.client_id,
                        "role": resolve_role_from_scopes(token_obj.scopes),
                        "expires_in": (token_obj.expires_at - int(time.time())) if token_obj.expires_at else None,
                    })

            return JSONResponse({"active": False})
        except Exception:
            logger.exception("Token introspection failed")
            return JSONResponse({"active": False})

    mcp._bastion_memory = _shared  # type: ignore[attr-defined]

    # MCP tool manifest scanner: scan all tool descriptions for malicious patterns
    scan_enabled = os.environ.get("BASTION_MCP_SCAN_TOOLS", "true").lower() in ("true", "1", "yes")
    if scan_enabled and not is_mock:
        tool_defs = {
            "memory_search": "Search agent memories using C-SPANN vector similarity search",
            "memory_store": "Store a memory with automatic SHA-256 hash chain integrity",
            "memory_timetravel": "Query agent memory state at any past timestamp",
            "memory_audit": "Retrieve the append-only hash-chain audit log",
            "memory_heal": "CDC-triggered self-healing",
            "memory_delete": "Delete a single memory by ID",
            "resolve_conflict": "Resolve conflicting memories",
            "a2a_bridge": "Retrieve the A2A Agent Card",
            "dream": "Sleep-time memory consolidation",
            "detect_contradictions": "Scan existing memories for contradictions",
            "multi_signal_search": "4-signal fusion search",
            "context_pack": "Pack memories into a token budget",
        }
        for tool_name, tool_desc in tool_defs.items():
            findings = scan_tool_manifest(tool_desc, tool_name)
            if findings:
                logger.warning(
                    "MCP tool manifest flagged during startup",
                    extra={"tool": tool_name, "findings": findings},
                )

    return mcp


def _make_http_app(mcp: FastMCP) -> Any:
    """Wrap the FastMCP Streamable HTTP app with auth, rate limiting, CORS, and PKCE capture."""
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.middleware.cors import CORSMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    inner = mcp.streamable_http_app()

    # CORS — allow browser-based MCP clients
    allowed_origins = os.environ.get("CORS_ALLOW_ORIGINS", "").split(",")
    allowed_origins = [o.strip() for o in allowed_origins if o.strip()]
    if allowed_origins:
        inner = CORSMiddleware(
            inner,
            allow_origins=allowed_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        )
    else:
        # No origins configured — block all cross-origin requests (secure default)
        inner = CORSMiddleware(
            inner,
            allow_origins=[],
            allow_credentials=False,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        )

    oauth_active = mcp.settings.auth is not None
    skip_paths = frozenset(
        {
            "/healthz",
            "/.well-known/mcp-server.json",
            "/.well-known/agent-card.json",
        }
    )

    _MAX_REQUEST_BYTES = 1_048_576  # 1MB limit for MCP requests
    _REQUEST_TIMEOUT_SECONDS = int(os.environ.get("BASTION_MCP_TIMEOUT", "60"))

    # Brute-force protection state
    _brute_cache: dict[str, tuple[int, float, float | None]] = {}
    _brute_cache_lock = threading.Lock()
    _brute_max_failures = 10
    _brute_window_seconds = 600
    _brute_lockout_seconds = 300

    def _check_brute_force(client_ip: str) -> bool:
        now = time.time()
        with _brute_cache_lock:
            # Periodic cleanup: evict entries older than window + lockout
            if len(_brute_cache) > 1000:
                max_age = _brute_window_seconds + _brute_lockout_seconds
                expired = [k for k, v in _brute_cache.items() if now - v[1] > max_age]
                for k in expired:
                    _brute_cache.pop(k, None)

            entry = _brute_cache.get(client_ip)
            if entry:
                count, window_start, locked_until = entry
                if locked_until and now < locked_until:
                    return True
                if now - window_start > _brute_window_seconds:
                    _brute_cache[client_ip] = (0, now, None)
                    entry = (0, now, None)
                count = entry[0]
                if count >= _brute_max_failures:
                    return True
        return False

    def _record_brute_failure(client_ip: str) -> None:
        now = time.time()
        with _brute_cache_lock:
            entry = _brute_cache.get(client_ip)
            if entry:
                count, window_start, _ = entry
                if now - window_start > _brute_window_seconds:
                    count = 0
                    window_start = now
                count += 1
                locked_until = now + _brute_lockout_seconds if count >= _brute_max_failures else None
                _brute_cache[client_ip] = (count, window_start, locked_until)
            else:
                _brute_cache[client_ip] = (1, now, None)

    def _clear_brute_failures(client_ip: str) -> None:
        with _brute_cache_lock:
            _brute_cache.pop(client_ip, None)

    class RateLimitMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Any:
            path = request.url.path

            # Generate request ID
            request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)

            # Client IP (with proxy awareness)
            forwarded = request.headers.get("X-Forwarded-For", "")
            client_ip = (
                forwarded.split(",")[0].strip()
                if forwarded and os.environ.get("BASTION_TRUST_PROXY", "").lower() in ("true", "1", "yes")
                else (request.client.host if request.client else "unknown")
            )

            # Request size limit — prevent OOM from oversized payloads
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    cl = int(content_length)
                except (ValueError, TypeError):
                    return JSONResponse(
                        {"error": "Invalid Content-Length header"},
                        status_code=400,
                    )
                if cl > _MAX_REQUEST_BYTES:
                    return JSONResponse(
                        {"error": "Request too large — maximum 1MB allowed"},
                        status_code=413,
                    )

            # PKCE capture: intercept token endpoint to extract code_verifier
            if path.rstrip("/") in ("/token", "/mcp/token") and request.method == "POST":
                try:
                    from bastion.auth_provider import store_pkce_verifier
                    form_data = dict(await request.form())
                    code_verifier = str(form_data.get("code_verifier", ""))
                    auth_code = str(form_data.get("code", ""))
                    if code_verifier and auth_code:
                        store_pkce_verifier(auth_code, code_verifier)
                except Exception:
                    logger.debug("PKCE capture failed (non-blocking)")

            if path in skip_paths:
                return await call_next(request)

            # Brute-force protection
            if _check_brute_force(client_ip):
                return JSONResponse({"error": "Too many failed attempts, temporarily locked out"}, status_code=429)

            if not oauth_active and not _check_auth(dict(request.headers)):
                _record_brute_failure(client_ip)
                return JSONResponse({"error": "Unauthorized"}, status_code=401)

            _clear_brute_failures(client_ip)

            # RBAC: when OAuth is active, enforce role-based scope checks
            if oauth_active and path not in ("/oauth/revoke", "/oauth/introspect"):
                auth_header = request.headers.get("authorization", "")
                if auth_header.startswith("Bearer "):
                    token_val = auth_header.removeprefix("Bearer ").strip()
                    provider = getattr(mcp, "_auth_server_provider", None)
                    if provider and hasattr(provider, "load_access_token"):
                        try:
                            token_obj = await provider.load_access_token(token_val)
                            if token_obj:
                                from bastion.auth_provider import resolve_role_from_scopes, role_has_scope
                                role = resolve_role_from_scopes(token_obj.scopes)
                                # Write operations require memory:write scope
                                if request.method in ("POST", "PUT", "PATCH", "DELETE"):
                                    if not role_has_scope(role, "memory:write"):
                                        return JSONResponse(
                                            {"error": "Insufficient permissions for write operations"},
                                            status_code=403,
                                        )
                                # Read operations require memory:read scope
                                elif request.method == "GET":
                                    if not role_has_scope(role, "memory:read"):
                                        return JSONResponse(
                                            {"error": "Insufficient permissions for read operations"},
                                            status_code=403,
                                        )
                        except Exception as exc:
                            logger.warning("RBAC token validation failed: %s", exc)
                            return JSONResponse(
                                {"error": "Token validation failed"},
                                status_code=401,
                            )

            limiter = _get_limiter()
            if not limiter.acquire():
                _metrics_rate_limit_hits += 1
                return JSONResponse(
                    {"error": "Rate limit exceeded. Please retry later."},
                    status_code=429,
                )
            _start_time = time.monotonic()
            try:
                response = await asyncio.wait_for(call_next(request), timeout=_REQUEST_TIMEOUT_SECONDS)
                response.headers["X-Request-ID"] = request_id
                _elapsed = time.monotonic() - _start_time
                key = (request.method, path, response.status_code)
                _metrics_requests_total[key] = _metrics_requests_total.get(key, 0) + 1
                dur_key = (request.method, path)
                if dur_key not in _metrics_durations:
                    _metrics_durations[dur_key] = []
                dur_list = _metrics_durations[dur_key]
                dur_list.append(_elapsed)
                if len(dur_list) > 500:
                    dur_list.pop(0)
                return response
            except TimeoutError:
                return JSONResponse({"error": "Request timeout"}, status_code=504)
            finally:
                limiter.release()

    return RateLimitMiddleware(inner)


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Bastion MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "http"],
        default="stdio",
        help="Transport protocol (default: stdio)",
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="HTTP host (default: 0.0.0.0)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=9997,
        help="HTTP port (default: 9997)",
    )
    parser.add_argument(
        "--mock",
        action="store_true",
        help="Run in mock mode (no CockroachDB required)",
    )
    parser.add_argument(
        "--oauth",
        action="store_true",
        help="Enable OAuth 2.1 authorization code + PKCE flow",
    )
    parser.add_argument(
        "--stateless",
        action="store_true",
        help="Per-request memory instances for horizontal scaling (no sticky sessions)",
    )
    parser.add_argument(
        "--multi-tenant",
        action="store_true",
        help="Derive agent_id from client_id for multi-agent isolation",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, stream=sys.stderr)

    # Graceful shutdown on SIGTERM/SIGINT
    import signal

    def _shutdown_handler(signum: int, frame: Any) -> None:
        logger.info("Received signal %d — shutting down gracefully", signum)
        close_shared_pool()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _shutdown_handler)
    signal.signal(signal.SIGINT, _shutdown_handler)

    atexit.register(close_shared_pool)

    # Metrics TTL cleanup — prevent unbounded memory growth
    def _cleanup_metrics() -> None:
        while True:
            time.sleep(300)  # every 5 minutes
            cutoff = time.monotonic() - 3600  # keep last hour
            for key in list(_metrics_durations.keys()):
                durations = _metrics_durations[key]
                _metrics_durations[key] = [d for d in durations if d > cutoff]
                if not _metrics_durations[key]:
                    del _metrics_durations[key]

    cleanup_thread = threading.Thread(target=_cleanup_metrics, daemon=True)
    cleanup_thread.start()

    mcp = create_server(
        mock=args.mock,
        oauth_enabled=args.oauth,
        stateless=args.stateless,
        multi_tenant=args.multi_tenant,
    )

    if args.transport == "http":
        import uvicorn

        app = _make_http_app(mcp)
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
