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

import atexit
import contextlib
import json
import logging
import os
import sys
import threading
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
from bastion.memory import BastionMemory
from bastion.pool import ConnectionPool

logger = logging.getLogger("bastion-mcp")


async def _report_progress(ctx: Context, progress: float, total: float, message: str | None = None) -> None:
    with contextlib.suppress(ValueError):
        await ctx.report_progress(progress, total, message)


async def _notify_resource_updated(ctx: Context, uri: str) -> None:
    with contextlib.suppress(ValueError):
        await ctx.session.send_resource_updated(AnyUrl(uri))


_SHARED_POOL: ConnectionPool | None = None
_API_KEYS: set[str] | None = None
_RATE_LIMITER: RequestLimiter | None = None
_LIMITER_INSTANCE_ID: str = uuid.uuid4().hex[:16]
_INIT_LOCK = threading.Lock()


def close_shared_pool() -> None:
    global _SHARED_POOL
    pool = _SHARED_POOL
    _SHARED_POOL = None
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
                raw = os.environ.get("BASTION_MCP_API_KEYS", "")
                _API_KEYS = {k.strip() for k in raw.split(",") if k.strip()} if raw else set()
                if not _API_KEYS:
                    logger.warning(
                        "BASTION_MCP_API_KEYS not set — MCP server is running without authentication. "
                        "Set BASTION_MCP_API_KEYS to a comma-separated list of API keys."
                    )
    return _API_KEYS


def _check_auth(headers: dict[str, str]) -> bool:
    import secrets as _secrets

    keys = _load_api_keys()
    if not keys:
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

    if (stateless or multi_tenant) and not is_mock:
        global _SHARED_POOL
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
        return mem

    use_oauth = oauth_enabled if oauth_enabled is not None else is_oauth_enabled()

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
        threshold: float = 0.8,
        memory_type: str | None = None,
        cursor: str | None = None,
    ) -> str:
        if k < 1:
            return json.dumps({"error": "k must be >= 1"})
        if not 0.0 <= threshold <= 1.0:
            return json.dumps({"error": "threshold must be between 0.0 and 1.0"})
        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})
        mem = _resolve_memory(ctx)
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
    ) -> str:
        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(
                mem.store,
                memory_type,
                content,
                metadata,
                expires_in_seconds,
            )
        except SecurityBlockError as exc:
            logger.warning("Memory store blocked by guard: %s", exc)
            report = getattr(exc, "report", None)
            result = {
                "error": "security_block",
                "detail": str(exc),
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
        mem = _resolve_memory(ctx)
        try:
            results = await anyio.to_thread.run_sync(
                mem.get_at_time,
                timestamp,
                agent_id,
            )
            return json.dumps([r.to_dict() for r in results], indent=2, default=str)
        except Exception as e:
            logger.exception("memory_timetravel failed")
            return json.dumps({"error": f"Time travel query failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("memory_audit failed")
            return json.dumps({"error": f"Audit query failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("memory_heal failed")
            return json.dumps({"error": f"Self-heal failed: {type(e).__name__}"})

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
        mem = _resolve_memory(ctx)
        await anyio.to_thread.run_sync(mem._delete_by_id, memory_id)
        await _notify_resource_updated(ctx, "bastion://stats")
        await _notify_resource_updated(ctx, f"bastion://memory/{memory_id}")
        return json.dumps({"deleted": memory_id, "status": "ok"}, indent=2)

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
        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(
                mem.pin, memory_type, content, pin_priority, metadata,
            )
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(record.to_dict(), indent=2, default=str)
        except Exception as e:
            logger.exception("memory_pin failed")
            return json.dumps({"error": f"Pin failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("memory_get_pinned failed")
            return json.dumps({"error": f"Get pinned failed: {type(e).__name__}"})

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
        mem = _resolve_memory(ctx)
        try:
            results = await anyio.to_thread.run_sync(mem.list_memories, memory_type, limit, offset)
            return json.dumps([r.to_dict() for r in results], indent=2, default=str)
        except Exception as e:
            logger.exception("memory_list failed")
            return json.dumps({"error": f"List failed: {type(e).__name__}"})

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
        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(mem.correct_memory, memory_id, new_content, metadata)
            if record is None:
                return json.dumps({"error": f"Memory {memory_id} not found"})
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(record.to_dict(), indent=2, default=str)
        except Exception as e:
            logger.exception("memory_correct failed")
            return json.dumps({"error": f"Correct failed: {type(e).__name__}"})

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
        mem = _resolve_memory(ctx)
        health = await anyio.to_thread.run_sync(mem.memory_health)
        return json.dumps(health, indent=2, default=str)

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
        except Exception as e:
            logger.exception("memory_apply_patch failed")
            return json.dumps({"error": f"Patch failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("resolve_conflict failed")
            return json.dumps({"error": f"Conflict resolution failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("ltm_check_reuse failed")
            return json.dumps({"error": f"LTM check failed: {type(e).__name__}"})

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

        mem = _resolve_memory(ctx)
        try:
            gateway = LTMMemoryGateway(mem)
            store_result = await anyio.to_thread.run_sync(
                gateway.store_analysis, query, result, analysis_type, metadata, tokens_used,
            )
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(store_result.to_dict(), indent=2, default=str)
        except Exception as e:
            logger.exception("ltm_store_analysis failed")
            return json.dumps({"error": f"LTM store failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("ltm_invalidate failed")
            return json.dumps({"error": f"LTM invalidate failed: {type(e).__name__}"})

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
        except Exception as e:
            logger.exception("detect_contradictions failed")
            return json.dumps({"error": f"Contradiction detection failed: {type(e).__name__}"})

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
            return json.dumps(
                [r.to_dict() for r in results],
                indent=2,
                default=str,
            )
        except Exception as e:
            logger.exception("scan_all_contradictions failed")
            return json.dumps({"error": f"Batch contradiction scan failed: {type(e).__name__}"})

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

        mem = _resolve_memory(ctx)
        dreamer = MemoryDreamer(mem, lookback_hours=lookback_hours)
        await _report_progress(ctx, 0, 4, "Starting dream cycle...")
        journal = await anyio.to_thread.run_sync(dreamer.dream)
        await _report_progress(ctx, 4, 4, "Dream cycle complete")
        await _notify_resource_updated(ctx, "bastion://stats")
        return json.dumps(journal.to_dict(), indent=2, default=str)

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

        mem = _resolve_memory(ctx)
        dreamer = MemoryDreamer(mem)
        history = await anyio.to_thread.run_sync(dreamer.get_dream_history)
        return json.dumps(history, indent=2, default=str)

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
            return json.dumps(report.to_dict(), indent=2, default=str)
        except Exception as e:
            logger.exception("detect_observations failed")
            return json.dumps({"error": f"Observation detection failed: {type(e).__name__}"})

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
        if k < 1:
            return json.dumps({"error": "k must be >= 1"})

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
        except Exception as e:
            logger.exception("context_pack failed")
            return json.dumps({"error": f"Context packing failed: {type(e).__name__}"})

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
            except Exception as e:
                schema = {"error": str(e)}

        return json.dumps(schema, indent=2, default=str)

    @mcp.tool(
        name="a2a_bridge",
        title="A2A Agent Bridge",
        description=("Retrieve the A2A Agent Card for inter-agent discovery. Returns A2A-compliant metadata."),
        annotations=ToolAnnotations(
            title="A2A Agent Bridge",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def a2a_bridge(agent_id: str = "bastion-agent") -> str:
        return json.dumps(_build_a2a_card(agent_id), indent=2, default=str)

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
            "version": "1.0.0",
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
                "env_var": "BASTION_MCP_API_KEYS" if not use_oauth else "BASTION_MCP_OAUTH_CLIENT_ID",
                "oauth_issuer": (
                    os.environ.get("BASTION_MCP_ISSUER_URL", "http://localhost:9997") if use_oauth else None
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

        return JSONResponse(_build_a2a_card("bastion-agent"))

    # ── Custom HTTP routes (healthz, metrics) ─────────────────────────────

    @mcp.custom_route("/healthz", methods=["GET"])
    async def healthz_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        return JSONResponse(
            {
                "status": "ok",
                "service": "bastion-mcp",
                "tools": 25,
            }
        )

    @mcp.custom_route("/metrics", methods=["GET"])
    async def metrics_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        limiter = _get_limiter()
        return JSONResponse(
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
            }
        )

    mcp._bastion_memory = _shared  # type: ignore[attr-defined]
    return mcp


def _make_http_app(mcp: FastMCP) -> Any:
    """Wrap the FastMCP Streamable HTTP app with auth, rate limiting, and PKCE capture."""
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    inner = mcp.streamable_http_app()
    oauth_active = mcp.settings.auth is not None
    skip_paths = frozenset(
        {
            "/healthz",
            "/metrics",
            "/.well-known/mcp-server.json",
            "/.well-known/agent-card.json",
        }
    )

    class RateLimitMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: Any) -> Any:
            path = request.url.path

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
            if not oauth_active and not _check_auth(dict(request.headers)):
                return JSONResponse({"error": "Unauthorized"}, status_code=401)
            limiter = _get_limiter()
            if not limiter.acquire():
                return JSONResponse(
                    {"error": "Rate limit exceeded. Please retry later."},
                    status_code=429,
                )
            try:
                return await call_next(request)
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

    atexit.register(close_shared_pool)

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
