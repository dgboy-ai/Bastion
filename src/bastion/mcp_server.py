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

import contextlib
import json
import logging
import os
import sys
from typing import Any

import anyio
from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations
from pydantic import AnyHttpUrl, AnyUrl

from bastion.auth_provider import BastionOAuthProvider, is_oauth_enabled
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


def _load_api_keys() -> set[str]:
    global _API_KEYS
    if _API_KEYS is None:
        raw = os.environ.get("BASTION_MCP_API_KEYS", "")
        _API_KEYS = {k.strip() for k in raw.split(",") if k.strip()} if raw else set()
    return _API_KEYS


def _check_auth(headers: dict[str, str]) -> bool:
    keys = _load_api_keys()
    if not keys:
        return True
    auth = headers.get("authorization") or headers.get("Authorization") or ""
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ").strip() in keys
    return auth in keys


def _get_limiter() -> RequestLimiter:
    global _RATE_LIMITER
    if _RATE_LIMITER is None:
        _RATE_LIMITER = RequestLimiter(
            max_concurrent=int(os.environ.get("BASTION_MCP_MAX_CONCURRENT", "20")),
            max_queue=int(os.environ.get("BASTION_MCP_MAX_QUEUE", "200")),
            timeout_seconds=int(os.environ.get("BASTION_MCP_TIMEOUT", "60")),
        )
    return _RATE_LIMITER


def _build_a2a_card(agent_id: str) -> dict:
    return {
        "name": f"Bastion/{agent_id}",
        "version": "1.0.0",
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
        record = await anyio.to_thread.run_sync(
            mem.store,
            memory_type,
            content,
            metadata,
            expires_in_seconds,
        )
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
        mem = _resolve_memory(ctx)
        results = await anyio.to_thread.run_sync(
            mem.get_at_time,
            timestamp,
            agent_id,
        )
        return json.dumps([r.to_dict() for r in results], indent=2, default=str)

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
        entries = await anyio.to_thread.run_sync(mem.audit, agent_id)
        return json.dumps([e.to_dict() for e in entries], indent=2, default=str)

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
        await _report_progress(ctx, 0, 2, "Pruning expired memories...")
        result = await anyio.to_thread.run_sync(mem.heal, agent_id)
        await _report_progress(ctx, 2, 2, "Self-heal complete")
        await _notify_resource_updated(ctx, "bastion://stats")
        return json.dumps(result, indent=2, default=str)

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
        mem = _resolve_memory(ctx)
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
                "tools": 8,
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
                ],
            }
        )

    mcp._bastion_memory = _shared
    return mcp


def _make_http_app(mcp: FastMCP) -> Any:
    """Wrap the FastMCP Streamable HTTP app with auth and rate limiting."""
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
