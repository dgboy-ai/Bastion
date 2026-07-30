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
import functools
import json
import logging
import os
import sys
import threading
import time
import uuid
from typing import Any

import anyio
import anyio.to_thread
import httpx
from dotenv import load_dotenv
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

load_dotenv()  # loads .env.local or .env

# Hard caps for production safety
MAX_K = 100
MAX_STORE_BYTES = 100_000
_MAX_CONTENT_LENGTH = 100_000
_MAX_REQUEST_BYTES = 1_048_576


def check_request_size(data_len: int) -> None:
    """Ensure the incoming request does not exceed safety limits."""
    if data_len > _MAX_REQUEST_BYTES:
        raise ValueError("Request too large")

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stderr,
    force=True,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
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
_metrics_lock = threading.Lock()
_metrics_requests_total: dict[tuple[str, str, int], int] = {}
_metrics_durations: dict[tuple[str, str], list[float]] = {}
_metrics_rate_limit_hits: int = 0
_metrics_start_time: float = time.monotonic()

# -- Bridge egress rate limiter (token bucket, reset per 60s) --
_BRIDGE_MAX_TOKENS: int = int(os.environ.get("BASTION_BRIDGE_RATE_LIMIT", "60"))
_BRIDGE_BUCKET: int = _BRIDGE_MAX_TOKENS
_BRIDGE_LAST_REFILL: float = time.monotonic()
_BRIDGE_LOCK = threading.Lock()


def _bridge_acquire_token() -> bool:
    global _BRIDGE_BUCKET, _BRIDGE_LAST_REFILL
    now = time.monotonic()
    with _BRIDGE_LOCK:
        elapsed = now - _BRIDGE_LAST_REFILL
        if elapsed >= 60.0:
            _BRIDGE_BUCKET = _BRIDGE_MAX_TOKENS
            _BRIDGE_LAST_REFILL = now
        if _BRIDGE_BUCKET > 0:
            _BRIDGE_BUCKET -= 1
            return True
        return False


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
                # 1. Env-var keys (legacy, still honored)
                raw_multi = os.environ.get("BASTION_MCP_API_KEYS", "")
                raw_single = os.environ.get("BASTION_API_KEY", "")
                keys: set[str] = set()
                if raw_multi:
                    keys = {k.strip() for k in raw_multi.split(",") if k.strip()}
                if raw_single and raw_single not in keys:
                    keys.add(raw_single.strip())

                # 2. DB-backed keys from agent_auth table (dynamic, revocable)
                conn_str = os.environ.get("BASTION_CONN", "")
                if conn_str:
                    import bcrypt

                    try:
                        from bastion.pool import ConnectionPool
                        pool = ConnectionPool(connection_string=conn_str, min_size=1, max_size=1)
                        db_conn = pool.acquire(timeout=5)
                        try:
                            with db_conn.cursor() as cur:
                                cur.execute(
                                    "SELECT key_hash FROM agent_auth "
                                    "WHERE revoked_at IS NULL "
                                    "AND (expires_at IS NULL OR expires_at > now())"
                                )
                                for row in cur.fetchall():
                                    keys.add(row[0])
                        finally:
                            pool.release(db_conn)
                        pool.close_all()
                        if keys:
                            logger.info("Loaded %d active API keys from agent_auth table", len(keys))
                    except ImportError:
                        logger.debug("bcrypt not available — DB key lookup skipped")
                    except Exception as exc:
                        logger.debug("DB key lookup failed (non-fatal): %s", exc)

                _API_KEYS = keys
                if not _API_KEYS:
                    logger.warning(
                        "No API keys configured — MCP server is running without authentication. "
                        "Set BASTION_MCP_API_KEYS, BASTION_API_KEY, or add keys to agent_auth table."
                    )
    return _API_KEYS


def _check_auth(headers: dict[str, str]) -> bool:
    import secrets as _secrets

    keys = _load_api_keys()
    if not keys:
        # No API keys configured — allow access in mock mode
        if os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes"):
            return True
        # In production, deny
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


def _parse_sse_response(text: str) -> dict:
    for line in text.strip().splitlines():
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                continue
    return {"error": "No data line in SSE response", "raw": text[:500]}


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

    # Configure anyio thread pool to prevent exhaustion under high load
    _thread_pool_max = int(os.environ.get("BASTION_THREAD_POOL_MAX", "40"))
    try:
        anyio.to_thread.current_default_thread_limiter().total_tokens = _thread_pool_max
    except RuntimeError:
        pass  # no event loop yet; will be set when server starts

    # Pre-warm local embedding model in background thread (eliminates 28s cold start)
    if not is_mock:

        def _prewarm_model() -> None:
            try:
                from sentence_transformers import SentenceTransformer

                SentenceTransformer("all-MiniLM-L6-v2")
                logger.info("Local embedding model pre-warmed (cold start eliminated)")
            except ImportError:
                pass
            except Exception as exc:
                logger.debug("Embedding pre-warm skipped (non-critical): %s", exc)

        t = threading.Thread(target=_prewarm_model, daemon=True)
        t.start()
        logger.info("Background embedding pre-warm started")

        # Start background auto-consolidation daemon
        _consolidation_interval = int(
            os.environ.get("BASTION_CONSOLIDATION_INTERVAL_MINUTES", "60")
        )

        def _consolidation_worker() -> None:
            """Periodically run memory consolidation in the background."""
            from bastion.dreaming import MemoryDreamer

            dreamer = MemoryDreamer(_shared)
            while True:
                try:
                    time.sleep(_consolidation_interval * 60)
                    journal = dreamer.dream()
                    if journal.memories_reviewed > 0:
                        logger.info(
                            "Auto-consolidation: reviewed=%d consolidated=%d "
                            "promoted=%d pruned=%d duration=%dms",
                            journal.memories_reviewed,
                            journal.memories_consolidated,
                            journal.memories_promoted,
                            journal.memories_pruned,
                            journal.duration_ms,
                        )
                except Exception as exc:
                    logger.warning("Auto-consolidation cycle failed: %s", exc)

        cw = threading.Thread(target=_consolidation_worker, daemon=True)
        cw.start()
        logger.info(
            "Background auto-consolidation started (every %d min)",
            _consolidation_interval,
        )

    # Store shared memory globally for health check routes (thread-safe)
    global _SHARED_MEMORY, _SHARED_POOL
    with _INIT_LOCK:
        _SHARED_MEMORY = _shared

    if (stateless or multi_tenant) and not is_mock and _SHARED_POOL is None:
        with _INIT_LOCK:
            if _SHARED_POOL is None:
                _SHARED_POOL = _shared.get_pool()

    def _safe_client_id(ctx: Context | None = None) -> str:
        """Get client_id from context, returning 'mcp-agent' if unavailable."""
        if ctx is None:
            return "mcp-agent"
        try:
            return ctx.client_id or "mcp-agent"
        except (ValueError, RuntimeError, AttributeError):
            return "mcp-agent"

    def _resolve_memory(ctx: Context | None = None) -> BastionMemory:
        if not multi_tenant and not stateless:
            return _shared
        agent_id = "mcp-agent"
        if multi_tenant and ctx is not None:
            agent_id = _safe_client_id(ctx)
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
                        safe_name = "".join(c for c in agent_id[:32] if c.isalnum() or c in "-_")
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
        json_response=True,
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
                    "memory_store_batch",
                    "memory_timetravel",
                    "memory_audit",
                    "memory_heal",
                    "memory_delete",
                    "memory_pin",
                    "memory_get_pinned",
                    "memory_list",
                    "memory_correct",
                    "memory_health",
                    "memory_apply_patch",
                    "resolve_conflict",
                    "ltm_check_reuse",
                    "ltm_store_analysis",
                    "ltm_invalidate",
                    "detect_contradictions",
                    "scan_all_contradictions",
                    "dream",
                    "dream_history",
                    "detect_observations",
                    "multi_signal_search",
                    "context_pack",
                    "agent_schema",
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
        agent_id = _safe_client_id(ctx)
        spend = _get_spend_manager()
        check = spend.check_and_increment(agent_id, "search", 1)
        if not check["allowed"]:
            return json.dumps(
                {
                    "error": f"Search budget exhausted: {check['reason']}",
                    "remaining": check["remaining"],
                    "suspended": check["suspended"],
                }
            )
        # Use lower default threshold for mock mode (mock embeddings are less discriminative)
        if threshold is None:
            threshold = 0.3 if mem.is_mock else 0.8
        internal_k = max(k, 200)
        results = await anyio.to_thread.run_sync(
            functools.partial(
                mem.search,
                query,
                internal_k,
                threshold,
                memory_type,
            )
        )

        offset = 0
        if cursor:
            try:
                import base64

                decoded = base64.b64decode(cursor).decode("ascii")
                offset = int(decoded)
                if offset < 0 or offset > 1_000_000:
                    raise ValueError(f"Cursor offset out of range: {offset}")
            except Exception:
                logger.warning("Invalid cursor, resetting to offset 0")
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
            "fact",
            "task",
            "preference",
            "learned",
            "procedure",
            "session",
            "instruction",
            "episodic",
            "semantic",
            "procedural",
            "system_event",
            "security",
            "thought_node",
            "saga",
            "conversation",
            "user_message",
            "agent_response",
            "error_log",
            "checkpoint",
            "observation",
            "contradiction",
            "dream",
        }
        if memory_type not in valid_types:
            return json.dumps({"error": f"Invalid memory_type: {memory_type}. Must be one of: {sorted(valid_types)}"})
        if not content or not content.strip():
            return json.dumps({"error": "content must be a non-empty string"})
        if len(content.encode("utf-8")) > MAX_STORE_BYTES:
            return json.dumps({"error": f"content exceeds maximum size of {MAX_STORE_BYTES} bytes"})

        agent_id = _safe_client_id(ctx)
        spend = _get_spend_manager()
        check = spend.check_and_increment(agent_id, "store", 1)
        if not check["allowed"]:
            return json.dumps(
                {
                    "error": f"Store budget exhausted: {check['reason']}",
                    "remaining": check["remaining"],
                    "suspended": check["suspended"],
                }
            )

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
                functools.partial(
                    mem.store,
                    memory_type,
                    content,
                    meta,
                    expires_in_seconds,
                )
            )
        except SecurityBlockError as exc:
            logger.warning("Memory store blocked by guard: %s", exc)
            report = getattr(exc, "report", None)
            result: dict[str, Any] = {
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
        name="memory_store_encrypted",
        title="Store Encrypted Agent Memory",
        description=(
            "Store a memory encrypted with AWS KMS AES-256-GCM envelope encryption. "
            "Content is encrypted before storage using the BastionEncryption KMS key. "
            "Embedding is computed on plaintext before encryption, so vector similarity "
            "search still works. Decryption happens transparently on retrieval. "
            "Uses ARN: arn:aws:kms:ap-south-1:600929977979:key/cd7692b4-b38e-47ee-abae-eed566c0b6d3"
        ),
        annotations=ToolAnnotations(
            title="Store Encrypted Agent Memory",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def memory_store_encrypted(
        ctx: Context,
        content: str,
        memory_type: str = "fact",
        metadata: dict[str, Any] | None = None,
        expires_in_seconds: int | None = None,
    ) -> str:
        valid_types = {
            "fact", "task", "preference", "learned", "procedure",
            "session", "instruction", "episodic", "semantic", "procedural",
            "system_event", "security", "thought_node", "saga",
            "conversation", "user_message", "agent_response", "error_log",
            "checkpoint", "observation", "contradiction", "dream",
        }
        if memory_type not in valid_types:
            return json.dumps({"error": f"Invalid memory_type: {memory_type}. Must be one of: {sorted(valid_types)}"})
        if not content or not content.strip():
            return json.dumps({"error": "content must be a non-empty string"})
        if len(content.encode("utf-8")) > MAX_STORE_BYTES:
            return json.dumps({"error": f"content exceeds maximum size of {MAX_STORE_BYTES} bytes"})
        mem = _resolve_memory(ctx)
        from bastion.kms import EncryptedMemoryWrapper
        wrapper = EncryptedMemoryWrapper(mem)
        try:
            record = await anyio.to_thread.run_sync(
                functools.partial(
                    wrapper.store,
                    memory_type,
                    content,
                    metadata,
                    expires_in_seconds,
                )
            )
        except SecurityBlockError as exc:
            logger.warning("Encrypted store blocked by guard: %s", exc)
            report = getattr(exc, "report", None)
            result: dict[str, Any] = {
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
            logger.exception("memory_store_encrypted failed")
            return json.dumps({"error": "Encrypted store operation failed — check server logs for details"})
        return json.dumps(record.to_dict(), indent=2, default=str)

    @mcp.tool(
        name="memory_search_encrypted",
        title="Search Encrypted Agent Memories",
        description=(
            "Search agent memories that were encrypted with AWS KMS. "
            "Results are transparently decrypted on retrieval using the "
            "BastionEncryption KMS key. Uses C-SPANN vector similarity search."
        ),
        annotations=ToolAnnotations(
            title="Search Encrypted Agent Memories",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def memory_search_encrypted(
        ctx: Context,
        query: str,
        k: int = 5,
        threshold: float | None = None,
        memory_type: str | None = None,
    ) -> str:
        if k < 1:
            return json.dumps({"error": "k must be >= 1"})
        k = min(k, MAX_K)
        if threshold is not None and not 0.0 <= threshold <= 1.0:
            return json.dumps({"error": "threshold must be between 0.0 and 1.0"})
        if not query or not query.strip():
            return json.dumps({"error": "query must be a non-empty string"})
        mem = _resolve_memory(ctx)
        from bastion.kms import EncryptedMemoryWrapper
        wrapper = EncryptedMemoryWrapper(mem)
        if threshold is None:
            threshold = 0.3 if mem.is_mock else 0.8
        internal_k = max(k, 200)
        results = await anyio.to_thread.run_sync(
            functools.partial(
                wrapper.search,
                query,
                internal_k,
                threshold,
                memory_type,
            )
        )
        page = results[:k]
        return json.dumps(
            {
                "results": [r.to_dict() for r in page],
                "total": len(results),
            },
            indent=2,
            default=str,
        )

    @mcp.tool(
        name="memory_store_batch",
        title="Batch Store Memories",
        description=(
            "Atomically store multiple memories within a single SERIALIZABLE "
            "transaction. Each memory must have at least 'content' and 'memory_type'. "
            "Batch size limited to 100. Reduces round-trips vs. calling memory_store "
            "repeatedly."
        ),
        annotations=ToolAnnotations(
            title="Batch Store Memories",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def memory_store_batch(
        ctx: Context,
        memories: list[dict[str, Any]],
    ) -> str:
        if not memories:
            return json.dumps({"error": "memories list is required"})
        if len(memories) > 100:
            return json.dumps({"error": "Batch size limited to 100 memories"})
        for i, entry in enumerate(memories):
            if not isinstance(entry, dict):
                return json.dumps({"error": f"memories[{i}] must be a dict"})
            content = entry.get("content", "")
            if not content or not content.strip():
                return json.dumps({"error": f"memories[{i}].content must be a non-empty string"})
            if len(content.encode("utf-8")) > MAX_STORE_BYTES:
                return json.dumps({"error": f"memories[{i}] content exceeds maximum size of {MAX_STORE_BYTES} bytes"})
            memory_type = entry.get("memory_type", "fact")
            valid_types = {
                "fact",
                "task",
                "preference",
                "learned",
                "procedure",
                "session",
                "instruction",
                "episodic",
                "semantic",
                "procedural",
                "system_event",
                "security",
                "thought_node",
                "saga",
                "conversation",
                "user_message",
                "agent_response",
                "error_log",
                "checkpoint",
                "observation",
                "contradiction",
                "dream",
            }
            if memory_type not in valid_types:
                return json.dumps({"error": f"memories[{i}] invalid memory_type: {memory_type}"})

        agent_id = _safe_client_id(ctx)
        spend = _get_spend_manager()
        check = spend.check_and_increment(agent_id, "store_batch", len(memories))
        if not check["allowed"]:
            return json.dumps(
                {
                    "error": f"Batch store budget exhausted: {check['reason']}",
                    "remaining": check["remaining"],
                    "suspended": check["suspended"],
                }
            )

        mem = _resolve_memory(ctx)
        try:
            records = await anyio.to_thread.run_sync(mem.store_batch, memories)
            await _notify_resource_updated(ctx, "bastion://stats")
            return json.dumps(
                {"stored": len(records), "records": [r.to_dict() for r in records]},
                indent=2,
                default=str,
            )
        except SecurityBlockError as exc:
            logger.warning("Batch store blocked by guard: %s", exc)
            report = getattr(exc, "report", None)
            result: dict[str, Any] = {"error": "security_block", "detail": "Content blocked by security guard", "is_safe": False}
            if report:
                result["findings"] = [
                    {"detector": f.detector, "threat_type": f.threat_type, "severity": f.severity, "detail": f.detail}
                    for f in report.findings
                ]
                result["trust_score"] = report.trust_score
                result["poisoning_risk"] = report.poisoning_risk
            return json.dumps(result, indent=2)
        except Exception:
            logger.exception("memory_store_batch failed")
            return json.dumps({"error": "Batch store failed — check server logs"})

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
        # In multi-tenant mode, force agent_id to caller's identity
        if multi_tenant:
            agent_id = _safe_client_id(ctx)
        # Validate timestamp format (ISO 8601 or relative like "5 minutes ago")
        import re

        ts = timestamp.strip()
        if len(ts) > 100:
            return json.dumps({"error": "timestamp too long (max 100 chars)"})
        valid_iso = bool(re.match(r"\d{4}-\d{2}-\d{2}", ts))
        valid_relative = bool(re.match(r"\d+\s+\w+\s+ago|now|just now", ts, re.I))
        if not valid_iso and not valid_relative:
            return json.dumps(
                {
                    "error": "Invalid timestamp format. Use ISO 8601 (2026-01-01T00:00:00Z) "
                    "or relative (5 minutes ago, now)",
                }
            )
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
        # In multi-tenant mode, force agent_id to caller's identity
        if multi_tenant:
            agent_id = _safe_client_id(ctx)
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
    async def memory_heal(ctx: Context, agent_id: str | None = None, background_verify: bool = False) -> str:
        mem = _resolve_memory(ctx)
        try:
            await _report_progress(ctx, 0, 3, "Pruning expired memories...")
            result = await anyio.to_thread.run_sync(mem.heal, agent_id, background_verify)
            await _report_progress(ctx, 3, 3, "Self-heal complete")
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
        if len(content) > _MAX_CONTENT_LENGTH:
            return json.dumps({"error": f"Content too long (max {_MAX_CONTENT_LENGTH} chars)"})
        if pin_priority not in (0, 1, 2):
            return json.dumps({"error": "pin_priority must be 0 (normal), 1 (important), or 2 (CRITICAL)"})
        valid_types = {"fact", "task", "preference", "learned", "procedure", "safety_rule", "instruction"}
        if memory_type not in valid_types:
            return json.dumps({"error": f"Invalid memory_type: {memory_type}. Must be one of: {valid_types}"})
        mem = _resolve_memory(ctx)
        try:
            record = await anyio.to_thread.run_sync(
                mem.pin,
                memory_type,
                content,
                pin_priority,
                metadata,
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
            "and cursor-based pagination. User-facing governance tool. "
            "Returns next_cursor for fetching the next page."
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
        cursor: str | None = None,
    ) -> str:
        # Bounds checking — reduced max to prevent large payloads
        if limit < 1 or limit > 200:
            return json.dumps({"error": "limit must be between 1 and 200"})
        if cursor is not None:
            try:
                import base64

                decoded = base64.b64decode(cursor).decode("ascii")
                if not decoded or len(decoded) > 64:
                    return json.dumps({"error": "invalid cursor"})
            except Exception:
                return json.dumps({"error": "cursor must be base64-encoded"})
        mem = _resolve_memory(ctx)
        try:
            fetch_limit = limit + 1
            results = await anyio.to_thread.run_sync(mem.list_memories, memory_type, fetch_limit, cursor)
            has_more = len(results) > limit
            if has_more:
                results = results[:limit]
            next_cursor = None
            if has_more and results:
                import base64

                last_created = results[-1].created_at
                if hasattr(last_created, "isoformat"):
                    next_cursor = base64.b64encode(last_created.isoformat().encode()).decode()
                else:
                    next_cursor = base64.b64encode(str(last_created).encode()).decode()
            return json.dumps(
                {"results": [r.to_dict() for r in results], "next_cursor": next_cursor},
                indent=2,
                default=str,
            )
        except Exception:
            logger.exception("memory_list failed")
            return json.dumps({"error": "List failed — check server logs"})

    @mcp.tool(
        name="memory_correct",
        title="Correct Memory Content",
        description=("Update a memory's content. User-facing governance tool for correcting stored information."),
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
            "freshness ratio, average access/importance scores, "
            "vector index health, and embedding quality status."
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
        name="forensic_report",
        title="Forensic Integrity Report",
        description=(
            "Generate a forensic integrity report from live CockroachDB data. "
            "Verifies SHA-256 hash chain integrity, counts audit entries, checks "
            "memory distribution by type, and returns guard statistics. "
            "No mocks — all data comes from real cluster queries."
        ),
        annotations=ToolAnnotations(
            title="Forensic Integrity Report",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def forensic_report(ctx: Context) -> str:
        try:
            mem = _resolve_memory(ctx)
            report = await anyio.to_thread.run_sync(mem.forensic_report)
            return json.dumps(report, indent=2, default=str)
        except Exception:
            logger.exception("forensic_report failed")
            return json.dumps({"error": "Forensic report failed — check server logs"})

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
        if not isinstance(patch_ops, list) or len(patch_ops) > 50:
            return json.dumps({"error": "patch_ops must be a list of at most 50 operations"})
        # Validate each patch operation has required fields
        valid_ops = {"add", "remove", "replace", "move", "copy", "test"}
        for i, op in enumerate(patch_ops):
            if not isinstance(op, dict) or "op" not in op or "path" not in op:
                return json.dumps({"error": f"patch_ops[{i}] must have 'op' and 'path' fields"})
            if op["op"] not in valid_ops:
                return json.dumps({"error": f"patch_ops[{i}].op must be one of: {valid_ops}"})
            if not isinstance(op["path"], str) or not op["path"].startswith("/"):
                return json.dumps({"error": f"patch_ops[{i}].path must start with /"})
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
        if len(fact_a) > _MAX_CONTENT_LENGTH or len(fact_b) > _MAX_CONTENT_LENGTH:
            return json.dumps({"error": f"Facts too long (max {_MAX_CONTENT_LENGTH} chars each)"})
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
                gateway.check_reuse,
                query,
                threshold,
                analysis_type,
            )
            if result is None:
                return json.dumps(
                    {
                        "reuse_found": False,
                        "query": query[:200],
                        "threshold": threshold,
                        "recommendation": "run_workflow",
                    },
                    indent=2,
                )
            return json.dumps(
                {
                    "reuse_found": True,
                    **result.to_dict(),
                },
                indent=2,
                default=str,
            )
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
                gateway.store_analysis,
                query,
                result,
                analysis_type,
                metadata,
                tokens_used,
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
                retriever.search,
                query,
                k,
                threshold,
                memory_type,
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
                functools.partial(
                    packer.pack,
                    budget_tokens,
                    query,
                )
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
                tables_dict = {name: {"columns": [c["name"] for c in t["columns"]]} for name, t in mock_tables.items()}
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
                            schema = {
                                "table": table,
                                "columns": [{"name": r[0], "type": r[1], "nullable": r[2] == "YES"} for r in rows],
                            }
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
        # Cap timeout to prevent SSRF via long-running connections
        timeout_seconds = min(max(timeout_seconds, 1), 120)
        # Discovery mode: return signed Agent Card
        if not a2a_url or not skill:
            card = _build_a2a_card(agent_id)
            signed = _mcp_card_signer.sign_card(card)
            return json.dumps(signed, indent=2, default=str)

        # Egress rate limit: acquire token from the per-minute bucket
        if not _bridge_acquire_token():
            return json.dumps({"error": "Bridge rate limit exceeded — try again later (60 requests/min)"})

        # Forwarding mode: send request to A2A server
        import ipaddress
        import socket

        from urllib.parse import urlparse

        import httpx

        try:
            parsed = urlparse(a2a_url)
            if parsed.scheme not in ("http", "https"):
                return json.dumps({"error": "Only http/https URLs allowed"})
            hostname = parsed.hostname or ""
            if not hostname:
                return json.dumps({"error": "Invalid URL: no hostname"})
        except Exception:
            return json.dumps({"error": "Invalid URL format"})

        # ------------------------------------------------------------------
        # SSRF protection: resolve DNS once and pin the resolved IP
        # This eliminates the TOCTOU gap where a re-resolve could return a
        # different (internal) IP after the security check passes.
        # ------------------------------------------------------------------
        _allow_loopback = os.environ.get("BASTION_BRIDGE_ALLOW_LOOPBACK", "").lower() in ("1", "true", "yes")
        try:
            addrinfo = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except socket.gaierror:
            return json.dumps({"error": f"DNS resolution failed for {hostname}"})
        resolved_ips: list[str] = []
        for _, _, _, _, sockaddr in addrinfo:
            ip = str(sockaddr[0])
            try:
                ip_addr = ipaddress.ip_address(ip)
            except ValueError:
                continue
            is_private = ip_addr.is_private or ip_addr.is_loopback or ip_addr.is_link_local or ip_addr.is_reserved
            if is_private and not _allow_loopback:
                continue
            if is_private and _allow_loopback:
                resolved_ips.append(ip)
            elif not is_private:
                resolved_ips.append(ip)
        if not resolved_ips:
            return json.dumps({"error": "No reachable IP addresses for target A2A server"})

        pinned_ip = resolved_ips[0]
        port_part = f":{parsed.port}" if parsed.port else ""
        url_scheme = parsed.scheme
        pinned_url = f"{url_scheme}://{pinned_ip}{port_part}{parsed.path or '/'}"
        if parsed.query:
            pinned_url += f"?{parsed.query}"
        logger.info(
            "Bridge DNS pinned",
            extra={"hostname": hostname, "pinned_ip": pinned_ip, "target": a2a_url},
        )

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
        headers = {
            "A2A-Version": "1.0",
            "Content-Type": "application/json",
            "Host": hostname,
        }
        # NOTE: Do NOT forward the server's own API key to external A2A servers.
        # The target server should have its own auth configured.

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(pinned_url, json=payload, headers=headers)
                resp.raise_for_status()
                body = resp.json()
                if "error" in body:
                    return json.dumps({"error": body["error"], "source": "a2a_bridge"}, indent=2)
                result = body.get("result", {})
                status = result.get("status", {}).get("state", "UNKNOWN")
                artifacts = result.get("artifacts", [])
                if artifacts:
                    text = artifacts[0]["parts"][0]["text"]
                    return json.dumps(
                        {
                            "status": status,
                            "task_id": result.get("id"),
                            "result": json.loads(text) if text else None,
                            "bridge": {"from": "mcp", "to": a2a_url, "skill": skill},
                        },
                        indent=2,
                        default=str,
                    )
                return json.dumps(
                    {
                        "status": status,
                        "task_id": result.get("id"),
                        "bridge": {"from": "mcp", "to": a2a_url, "skill": skill},
                    },
                    indent=2,
                    default=str,
                )
        except httpx.TimeoutException:
            return json.dumps({"error": f"A2A bridge timeout after {timeout_seconds}s", "source": "a2a_bridge"})
        except Exception:
            logger.exception("A2A bridge failed")
            return json.dumps({"error": "A2A bridge failed — check server logs", "source": "a2a_bridge"})

    @mcp.tool(
        name="managed_mcp_list_tools",
        title="List Official CockroachDB Cloud MCP Tools",
        description=(
            "List all available tools on the official CockroachDB Cloud Managed MCP Server. "
            "Requires COCKROACHDB_MCP_API_KEY env var (Advanced plan) or OAuth browser flow. "
            "Use this to discover which Cloud Console operations are available via the managed MCP."
        ),
        annotations=ToolAnnotations(
            title="List Official CockroachDB Cloud MCP Tools",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def managed_mcp_list_tools(ctx: Context) -> str:
        api_key = os.environ.get("COCKROACHDB_MCP_API_KEY", "")
        oauth_token = os.environ.get("COCKROACHDB_MCP_OAUTH_TOKEN", "")
        dashboard_url = os.environ.get("BASTION_DASHBOARD_URL", "http://localhost:3000")
        url = f"{dashboard_url.rstrip('/')}/api/official-mcp"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        elif oauth_token:
            headers["Authorization"] = f"Bearer {oauth_token}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                tools = data.get("tools", [])
                return json.dumps(
                    {
                        "provider": "CockroachDB Cloud Managed MCP",
                        "cluster_id": data.get("clusterId"),
                        "cluster_name": data.get("clusterName"),
                        "region": data.get("region"),
                        "plan": data.get("plan"),
                        "auth": data.get("auth"),
                        "oauth_config": data.get("oauthConfig"),
                        "tools": tools,
                        "tool_count": len(tools),
                    },
                    indent=2,
                )
        except httpx.ConnectError:
            return json.dumps(
                {
                    "error": "Could not connect to Bastion dashboard proxy",
                    "detail": f"Ensure the dashboard is running at {dashboard_url}",
                    "setup_steps": [
                        "1. Start the Bastion dashboard: cd dashboard && npm run dev",
                        "2. Verify it's accessible at http://localhost:3000 (or set BASTION_DASHBOARD_URL)",
                        "3. For OAuth (Basic plan): open https://cockroachlabs.cloud/mcp in browser",
                        "   → Log in to CockroachDB Cloud",
                        "   → Select your organization",
                        "   → Click 'Authorize' for your cluster",
                        "   → Grant Read + Write permissions",
                        "4. For API key (Advanced plan only): create service account in Cloud Console",
                        "   → Assign Cluster Admin/Operator role on 'bastion-memory'",
                        "   → Copy secret key → set COCKROACHDB_MCP_API_KEY=<key> in .env.local",
                        "5. For server-side calls on Basic plan: after OAuth in browser, extract access_token",
                        "   → from your MCP client config (e.g., ~/.config/Claude/claude_desktop_config.json)",
                        "   → set COCKROACHDB_MCP_OAUTH_TOKEN=<token> in .env.local",
                    ],
                },
                indent=2,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                return json.dumps(
                    {
                        "error": "Authentication required (401)",
                        "detail": "No valid auth provided to CockroachDB Cloud Managed MCP",
                        "plan": "Basic (your cluster details in Cloud Console)",
                        "cluster_id": "<set-via-COCKROACHDB_CLUSTER_ID-env-var>",
                        "setup_steps": [
                            "1. BASIC PLAN ONLY SUPPORTS OAUTH BROWSER FLOW — no API keys",
                            "2. Open https://cockroachlabs.cloud/mcp in your browser",
                            "3. Log in to CockroachDB Cloud",
                            "4. Select your organization (if multiple)",
                            "5. Click 'Authorize' to grant access to 'bastion-memory' cluster",
                            "6. Choose: Read only, or Read + Write",
                            "7. For MCP CLIENTS (Claude Desktop, Cursor, Cline): they handle this automatically",
                            "   → Just add the MCP server config and click 'Authenticate' in the client",
                            "8. FOR SERVER-SIDE CALLS (this tool): you must manually provide a token:",
                            "   a. Complete OAuth in a browser-based MCP client first",
                            "   b. Extract the access_token from the client's config file",
                            "   c. Set COCKROACHDB_MCP_OAUTH_TOKEN=<token> in .env.local",
                            "   d. Restart the MCP server",
                            "9. Token expires ~1 hour — repeat when it fails again",
                            "10. UPGRADE TO ADVANCED PLAN for API keys (service accounts) that don't expire",
                        ],
                        "docs": "https://www.cockroachlabs.com/docs/cockroachdb-cloud/mcp-server",
                    },
                    indent=2,
                )
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text[:500]
            return json.dumps(
                {
                    "error": f"Managed MCP returned {exc.response.status_code}",
                    "detail": detail,
                    "hint": "If running on Basic plan, use OAuth browser flow (see steps above). "
                    "API keys require Advanced plan.",
                },
                indent=2,
            )

    @mcp.tool(
        name="managed_mcp_call",
        title="Call Official CockroachDB Cloud MCP Tool",
        description=(
            "Execute a tool on the official CockroachDB Cloud Managed MCP Server. "
            "Proxied through the Bastion dashboard /api/official-mcp route. "
            "Use this to query cluster info, databases, tables, schemas, and execute SQL "
            "on your CockroachDB Cloud cluster via the official managed MCP."
        ),
        annotations=ToolAnnotations(
            title="Call Official CockroachDB Cloud MCP Tool",
            readOnlyHint=False,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def managed_mcp_call(
        ctx: Context,
        tool: str,
        params: dict[str, Any] | None = None,
    ) -> str:
        if not tool or not tool.strip():
            return json.dumps({"error": "tool name is required"})
        valid_tools = {
            "list_clusters",
            "get_cluster",
            "list_databases",
            "list_tables",
            "get_table_schema",
            "select_query",
            "explain_query",
            "show_statement",
            "show_running_queries",
            "create_database",
            "create_table",
            "insert_rows",
        }
        if tool not in valid_tools:
            return json.dumps(
                {
                    "error": f"Unknown tool: {tool}",
                    "valid_tools": sorted(valid_tools),
                }
            )
        api_key = os.environ.get("COCKROACHDB_MCP_API_KEY", "")
        oauth_token = os.environ.get("COCKROACHDB_MCP_OAUTH_TOKEN", "")
        cluster_id = os.environ.get("COCKROACHDB_CLUSTER_ID", "<your-cluster-id>")

        # Official CockroachDB Cloud MCP endpoint
        url = "https://cockroachlabs.cloud/mcp"
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        elif oauth_token:
            headers["Authorization"] = f"Bearer {oauth_token}"
        # Scope to our cluster
        if cluster_id:
            headers["mcp-cluster-id"] = cluster_id

        # MCP JSON-RPC payload
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": tool,
                "arguments": params or {},
            },
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")
                if "text/event-stream" in content_type:
                    result = _parse_sse_response(resp.text)
                else:
                    result = resp.json()
                tool_result = result.get("result", result)
                if isinstance(tool_result, dict) and "content" in tool_result:
                    for item in tool_result["content"]:
                        if item.get("type") == "text":
                            try:
                                tool_result = json.loads(item["text"])
                            except (json.JSONDecodeError, TypeError):
                                tool_result = item["text"]
                            break
                return json.dumps(
                    {
                        "tool": tool,
                        "provider": "CockroachDB Cloud Managed MCP",
                        "cluster_id": cluster_id,
                        "result": tool_result,
                    },
                    indent=2,
                    default=str,
                )
        except httpx.ConnectError:
            return json.dumps(
                {
                    "error": "Could not connect to CockroachDB Cloud MCP",
                    "detail": "Network error connecting to cockroachlabs.cloud",
                    "url": url,
                },
                indent=2,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                return json.dumps(
                    {
                        "error": "Authentication required (401)",
                        "detail": "No valid auth provided to CockroachDB Cloud Managed MCP",
                        "cluster_id": cluster_id,
                        "setup_steps": [
                            "1. Set COCKROACHDB_MCP_API_KEY (Advanced plan) or COCKROACHDB_MCP_OAUTH_TOKEN",
                            "2. For OAuth: open https://cockroachlabs.cloud/mcp in browser, log in, authorize",
                            "3. For API key: create service account in Cloud Console, copy secret key",
                        ],
                        "docs": "https://www.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server",
                    },
                    indent=2,
                )
            try:
                detail = exc.response.json()
            except Exception:
                detail = exc.response.text[:500]
            return json.dumps(
                {
                    "error": f"Managed MCP returned {exc.response.status_code}",
                    "detail": detail,
                },
                indent=2,
            )
        except Exception as exc:
            logger.exception("managed_mcp_call failed")
            return json.dumps({"error": "Failed to call managed MCP"}, indent=2)

    @mcp.tool(
        name="invoke_agent_skill",
        title="Invoke CockroachDB Agent Skill",
        description=(
            "Execute a CockroachDB Agent Skill from the official skills repo (.agents/skills/). "
            "Skills are machine-executable playbooks for cluster operations: health checks, "
            "performance triage, schema analysis, security audits, capacity planning, and more. "
            "Returns the skill's diagnostic queries and (optionally) executes them against your cluster."
        ),
        annotations=ToolAnnotations(
            title="Invoke CockroachDB Agent Skill",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def invoke_agent_skill(
        ctx: Context,
        skill_name: str,
        execute: bool = False,
        params: dict[str, Any] | None = None,
    ) -> str:
        """Invoke a CockroachDB Agent Skill by name.

        Args:
            skill_name: Name of the skill (e.g., 'triaging-live-sql-activity', 'reviewing-cluster-health')
            execute: If true, execute the skill's SQL queries against the cluster
            params: Optional parameters for the skill (e.g., {"threshold_minutes": 5})
        """
        import re
        from pathlib import Path

        if not re.match(r'^[a-zA-Z0-9_-]+$', skill_name):
            return json.dumps({"error": f"Invalid skill name: '{skill_name}'"}, indent=2)

        skills_dir = Path(__file__).parent.parent.parent / ".agents" / "skills"
        if not skills_dir.exists():
            return json.dumps({"error": "Agent skills directory not found"}, indent=2)

        skill_dir = skills_dir / skill_name
        if not skill_dir.exists():
            available = sorted([d.name for d in skills_dir.iterdir() if d.is_dir()])
            return json.dumps(
                {
                    "error": f"Skill '{skill_name}' not found",
                    "available_skills": available,
                },
                indent=2,
            )

        skill_file = skill_dir / "SKILL.md"
        if not skill_file.exists():
            return json.dumps({"error": f"SKILL.md not found for '{skill_name}'"}, indent=2)

        content = skill_file.read_text(encoding="utf-8")

        # Extract SQL code blocks
        sql_blocks = re.findall(r"```sql\n(.*?)\n```", content, re.DOTALL)

        # Extract bash code blocks (for CLI commands)
        bash_blocks = re.findall(r"```bash\n(.*?)\n```", content, re.DOTALL)

        # Parse frontmatter
        frontmatter = {}
        if content.startswith("---"):
            fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
            if fm_match:
                for line in fm_match.group(1).split("\n"):
                    if ":" in line:
                        k, v = line.split(":", 1)
                        frontmatter[k.strip()] = v.strip()

        result = {
            "skill": skill_name,
            "description": frontmatter.get("description", ""),
            "compatibility": frontmatter.get("compatibility", ""),
            "sql_queries": sql_blocks,
            "bash_commands": bash_blocks,
            "executed": False,
        }

        if execute and sql_blocks:
            # Execute queries against the cluster
            mem = _resolve_memory(ctx)
            if mem._mock:
                result["execution_results"] = [
                    {"query": q[:100] + "...", "status": "skipped", "reason": "mock mode"}
                    for q in sql_blocks
                ]
            else:
                execution_results = []
                pool = mem.get_pool()
                for i, query in enumerate(sql_blocks):
                    # Apply parameter substitutions using parameterized SQL
                    q = query
                    exec_params: dict[str, str] = {}
                    if params:
                        for k, v in params.items():
                            q = q.replace(f"{{{k}}}", f"%({k})s")
                            q = q.replace(f"${k}", f"%({k})s")
                            exec_params[k] = str(v)

                    # Safety: only allow SELECT/SHOW/WITH queries
                    q_stripped = q.lstrip()
                    while q_stripped.startswith("--"):
                        q_stripped = q_stripped[q_stripped.find("\n") + 1:].lstrip()
                    q_stripped = q_stripped.upper()
                    if not (q_stripped.startswith("SELECT") or
                            q_stripped.startswith("WITH") or
                            q_stripped.startswith("SHOW")):
                        execution_results.append({
                            "query_index": i,
                            "query": q[:200],
                            "status": "rejected",
                            "reason": "Only SELECT/SHOW/WITH queries allowed for safety"
                        })
                        continue

                    try:
                        conn = pool.acquire(timeout=10.0)
                        try:
                            with conn.cursor() as cur:
                                cur.execute(q, exec_params if exec_params else None)
                                rows = cur.fetchall()
                                cols = [desc[0] for desc in cur.description] if cur.description else []
                                execution_results.append({
                                    "query_index": i,
                                    "query": q[:200],
                                    "status": "success",
                                    "row_count": len(rows),
                                    "columns": cols,
                                    "rows": rows[:20],  # Limit rows
                                })
                        finally:
                            pool.release(conn)
                    except Exception as e:
                        execution_results.append({
                            "query_index": i,
                            "query": q[:200],
                            "status": "error",
                            "error": str(e)[:200],
                        })

                result["executed"] = True
                result["execution_results"] = execution_results

        return json.dumps(result, indent=2, default=str)

    @mcp.tool(
        name="list_agent_skills",
        title="List CockroachDB Agent Skills",
        description=(
            "List all available CockroachDB Agent Skills from the official skills repo (.agents/skills/). "
            "Each skill is a machine-executable playbook for cluster operations."
        ),
        annotations=ToolAnnotations(
            title="List CockroachDB Agent Skills",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def list_agent_skills(ctx: Context) -> str:
        import re
        from pathlib import Path

        skills_dir = Path(__file__).parent.parent.parent / ".agents" / "skills"
        if not skills_dir.exists():
            return json.dumps({"error": "Agent skills directory not found"}, indent=2)

        skills = []
        for skill_dir in sorted(skills_dir.iterdir()):
            if skill_dir.is_dir():
                skill_file = skill_dir / "SKILL.md"
                desc = ""
                compat = ""
                if skill_file.exists():
                    content = skill_file.read_text(encoding="utf-8")
                    if content.startswith("---"):
                        fm_match = re.match(r"^---\n(.*?)\n---", content, re.DOTALL)
                        if fm_match:
                            for line in fm_match.group(1).split("\n"):
                                if ":" in line:
                                    k, v = line.split(":", 1)
                                    if k.strip() == "description":
                                        desc = v.strip()
                                    elif k.strip() == "compatibility":
                                        compat = v.strip()

                skills.append({
                    "name": skill_dir.name,
                    "description": desc,
                    "compatibility": compat,
                })

        return json.dumps(
            {
                "total": len(skills),
                "skills": skills,
            },
            indent=2,
        )

    @mcp.tool(
        name="ccloud_exec",
        title="Execute ccloud CLI Command",
        description=(
            "Run CockroachDB Cloud CLI (ccloud) commands with JSON output for agent integration. "
            "Supports cluster management, SQL execution, backup operations, networking, and audit logs. "
            "Requires ccloud CLI installed and authenticated (ccloud auth login or service account)."
        ),
        annotations=ToolAnnotations(
            title="Execute ccloud CLI Command",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=False,
            openWorldHint=True,
        ),
    )
    async def ccloud_exec(
        ctx: Context,
        command: str,
        args: list[str] | None = None,
        cluster_id: str | None = None,
        timeout_seconds: int = 60,
    ) -> str:
        """Execute a ccloud CLI command with JSON output.

        Falls back to direct CockroachDB Cloud REST API if ccloud CLI is unavailable
        (e.g., on headless servers like Render). Requires COCKROACHDB_MCP_API_KEY env var
        for REST API fallback.

        Args:
            command: ccloud subcommand (e.g., 'cluster', 'sql', 'backup', 'network', 'audit-log')
            args: Additional arguments (e.g., ['list', '--format=json'])
            cluster_id: Optional cluster ID to scope the command (adds --cluster flag)
            timeout_seconds: Command timeout (max 120)
        """
        import shlex
        import subprocess

        # Validate timeout
        timeout_seconds = min(max(timeout_seconds, 5), 120)

        # Allowed ccloud commands (safety allowlist — no `sql` or `node` to prevent arbitrary execution)
        allowed_commands = {
            "cluster", "backup", "restore", "network",
            "audit-log", "user", "service-account", "organization",
            "version", "completion", "auth",
        }

        cmd_parts = command.split()
        if not cmd_parts or cmd_parts[0] not in allowed_commands:
            return json.dumps(
                {
                    "error": f"Command '{command}' not allowed",
                    "allowed_commands": sorted(allowed_commands),
                },
                indent=2,
            )

        # Build command
        full_cmd = ["ccloud"] + cmd_parts
        if args:
            full_cmd.extend(args)

        # Ensure JSON output — strip any user-supplied output flag first
        filtered = []
        skip_next = False
        for p in full_cmd:
            if skip_next:
                skip_next = False
                continue
            if p in ("-o", "--output", "--format") or p.startswith("--output=") or p.startswith("--format="):
                if "=" not in p:
                    skip_next = True
                continue
            filtered.append(p)
        full_cmd = filtered
        full_cmd.extend(["-o", "json"])

        # Add cluster scoping if provided
        if cluster_id and "cluster" in cmd_parts[0]:
            full_cmd.extend(["--cluster", cluster_id])

        # Security: validate no shell injection (block all shell metacharacters)
        _SHELL_METACHARS = set(";&|`$(){}[]<>!\\'\"\n\r\t#*?~")
        for part in full_cmd:
            for c in part:
                if c in _SHELL_METACHARS:
                    safe_repr = " ".join(shlex.quote(p) for p in full_cmd)
                    logger.warning("ccloud_exec blocked: metachar %r in %s", c, safe_repr)
                    return json.dumps({"error": f"Invalid character {c!r} in command"}, indent=2)

        # Try ccloud CLI first, fall back to REST API
        try:
            result = subprocess.run(
                ["ccloud", "version"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=5,
            )
            ccloud_available = result.returncode == 0
        except FileNotFoundError:
            ccloud_available = False

        if ccloud_available:
            try:
                result = subprocess.run(
                    full_cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=timeout_seconds,
                )

                output = result.stdout.strip()
                stderr = result.stderr.strip()

                parsed = None
                if output:
                    try:
                        parsed = json.loads(output)
                    except json.JSONDecodeError:
                        parsed = output

                return json.dumps(
                    {
                        "backend": "ccloud_cli",
                        "command": " ".join(shlex.quote(p) for p in full_cmd),
                        "exit_code": result.returncode,
                        "stdout": parsed,
                        "stderr": stderr if stderr else None,
                        "success": result.returncode == 0,
                    },
                    indent=2,
                    default=str,
                )

            except subprocess.TimeoutExpired:
                return json.dumps({"error": f"Command timed out after {timeout_seconds}s"}, indent=2)
            except Exception as exc:
                logger.exception("ccloud_exec failed")
                return json.dumps({"error": "Failed to execute ccloud"}, indent=2)

        # Fallback: direct REST API using COCKROACHDB_MCP_API_KEY
        api_key = os.environ.get("COCKROACHDB_MCP_API_KEY", "")
        if not api_key:
            return json.dumps(
                {
                    "backend": "rest_api",
                    "error": "ccloud CLI not available and no COCKROACHDB_MCP_API_KEY set",
                    "detail": "Install ccloud CLI (https://cockroachlabs.com/docs/ccloud-install) or set COCKROACHDB_MCP_API_KEY for REST API fallback",
                    "hint": "Generate an API key: CockroachDB Cloud Console → API Keys → Create API Key",
                },
                indent=2,
            )

        crdb_api = "https://cockroachlabs.cloud/api/v1"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        rest_routes = {
            "cluster": {
                "list": ("GET", "/clusters"),
                "describe": ("GET", f"/clusters/{cluster_id}" if cluster_id else "/clusters"),
            },
            "backup": {
                "list": ("GET", f"/clusters/{cluster_id}/backups" if cluster_id else "/clusters"),
            },
            "audit-log": {
                "list": ("GET", "/auditlogevents"),
            },
            "user": {
                "list": ("GET", "/users"),
            },
            "service-account": {
                "list": ("GET", "/serviceaccounts"),
            },
            "organization": {
                "describe": ("GET", "/organizations"),
            },
            "version": {
                "version": None,
            },
        }

        sub_cmd = cmd_parts[1] if len(cmd_parts) > 1 else "list"
        top_cmd = cmd_parts[0]

        if top_cmd == "version":
            return json.dumps(
                {
                    "backend": "rest_api",
                    "stdout": {"version": "0.6.12+rest", "source": "REST API fallback"},
                    "success": True,
                },
                indent=2,
            )

        route = rest_routes.get(top_cmd, {}).get(sub_cmd)
        if not route:
            return json.dumps(
                {
                    "backend": "rest_api",
                    "error": f"REST API fallback: '{top_cmd} {sub_cmd}' not supported",
                    "supported": [
                        f"{t} {s}" for t, subs in rest_routes.items()
                        for s in subs if subs.get(s)
                    ],
                    "hint": "Install ccloud CLI for full command support",
                },
                indent=2,
            )

        method, url_path = route
        url = f"{crdb_api}{url_path}"

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                if method == "GET":
                    resp = await client.get(url, headers=headers)
                elif method == "POST":
                    resp = await client.post(url, headers=headers)
                else:
                    return json.dumps({"error": f"Unsupported method {method}"}, indent=2)

                resp.raise_for_status()
                data = resp.json()

                return json.dumps(
                    {
                        "backend": "rest_api",
                        "command": f"{top_cmd} {sub_cmd}",
                        "stdout": data,
                        "success": True,
                    },
                    indent=2,
                    default=str,
                )

        except httpx.HTTPStatusError as exc:
            return json.dumps(
                {
                    "backend": "rest_api",
                    "error": f"API error: {exc.response.status_code}",
                    "detail": exc.response.text[:500],
                    "hint": "Verify COCKROACHDB_MCP_API_KEY has correct permissions",
                },
                indent=2,
            )
        except httpx.ConnectError:
            return json.dumps(
                {
                    "backend": "rest_api",
                    "error": "Could not connect to CockroachDB Cloud API",
                    "detail": f"Failed to reach {crdb_api}",
                },
                indent=2,
            )
        except Exception as exc:
            logger.exception("ccloud_exec REST fallback failed")
            return json.dumps({"backend": "rest_api", "error": "REST API fallback failed"}, indent=2)

    # ── EU AI Act Compliance Tool ─────────────────────────────────────────

    @mcp.tool(
        name="compliance_report",
        title="Generate EU AI Act Compliance Report",
        description=(
            "Generate an EU AI Act Article 12 compliance report for the current agent. "
            "Audits the hash chain integrity, audit log completeness, and memory retention "
            "against Article 12 requirements: automatic event logging, tamper-evident records, "
            "traceability, and post-market monitoring. Optional date range filtering. "
            "Returns structured JSON suitable for regulatory evidence."
        ),
        annotations=ToolAnnotations(
            title="Generate EU AI Act Compliance Report",
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    async def compliance_report(
        ctx: Context,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> str:
        """Generate an EU AI Act Article 12 compliance report.

        Args:
            start_date: Optional ISO 8601 start date (e.g., '2026-07-01T00:00:00Z')
            end_date: Optional ISO 8601 end date (e.g., '2026-07-29T00:00:00Z')
        """
        mem = _resolve_memory(ctx)
        from bastion.compliance import ComplianceReporter

        reporter = ComplianceReporter(mem)
        mem_agent = mem.agent_id
        report = reporter.generate_report(mem_agent, start_date=start_date, end_date=end_date)
        return json.dumps(report, indent=2, default=str)

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
                "name": "memory_store_batch",
                "description": "Atomically batch store up to 100 memories in a single SERIALIZABLE transaction",
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
                "description": "A2A protocol bridge: discover agent cards or forward skill execution requests",
                "read_only": True,
            },
            {
                "name": "compliance_report",
                "description": "EU AI Act Article 12 compliance report: hash chain, audit log, retention verification",
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
                "name": "forensic_report",
                "description": "Forensic integrity report: hash chain, audit trail, guard stats from live CRDB",
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
            {
                "name": "managed_mcp_list_tools",
                "description": "List available tools on the official CockroachDB Cloud Managed MCP Server",
                "read_only": True,
            },
            {
                "name": "managed_mcp_call",
                "description": "Execute a tool on the official CockroachDB Cloud Managed MCP Server (cluster queries, SQL, schema)",
                "read_only": False,
            },
            {
                "name": "invoke_agent_skill",
                "description": "Execute a CockroachDB Agent Skill from the official skills repo (health checks, triage, audits)",
                "read_only": True,
            },
            {
                "name": "list_agent_skills",
                "description": "List all available CockroachDB Agent Skills from the official skills repo (.agents/skills/)",
                "read_only": True,
            },
            {
                "name": "ccloud_exec",
                "description": "Execute ccloud CLI commands with JSON output (cluster ops, SQL, backups, networking, audit logs)",
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

    def _err(code: str, msg: str, status: int = 400) -> dict:
        return {"jsonrpc": "2.0", "id": "server-error", "error": {"code": code, "message": msg, "http_status": status}}

    @mcp.custom_route("/healthz", methods=["GET"])
    async def healthz_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        tool_count = len(mcp._tool_manager._tools) if hasattr(mcp, "_tool_manager") else 0
        db_ok = False
        db_error = None
        try:
            mem = _get_shared_memory()
            pool = mem.get_pool()
            conn = pool.acquire(timeout=5.0)
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    db_ok = cur.fetchone() is not None
            finally:
                pool.release(conn)
        except Exception as e:
            db_error = str(e)[:200]

        return JSONResponse(
            {
                "status": "ok" if db_ok else "degraded",
                "service": "bastion-mcp",
                "version": VERSION,
                "tools": tool_count,
                "database": {"connected": db_ok, "error": db_error},
            },
            status_code=200 if db_ok else 503,
        )

    @mcp.custom_route("/readyz", methods=["GET"])
    async def readyz_route(request: Any) -> Any:
        from starlette.responses import JSONResponse

        try:
            mem = _get_shared_memory()
            pool = mem.get_pool()
            conn = pool.acquire(timeout=5.0)
            try:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    if cur.fetchone() is None:
                        return JSONResponse(
                            {"status": "not ready", "reason": "DB query returned no rows"}, status_code=503
                        )
            finally:
                pool.release(conn)
            return JSONResponse({"status": "ok", "database": "connected"})
        except Exception as e:
            return JSONResponse({"status": "not ready", "reason": str(e)[:200]}, status_code=503)

    @mcp.custom_route("/metrics", methods=["GET"])
    async def metrics_route(request: Any) -> Any:
        from starlette.responses import Response

        try:
            limiter = _get_limiter()
            limiter_stats = limiter.get_stats()
        except Exception:
            limiter_stats = {"current": 0, "queued": 0, "max_concurrent": 20}

        with _metrics_lock:
            total_snapshot = dict(_metrics_requests_total)
            durations_snapshot = {k: list(v) for k, v in _metrics_durations.items()}

        lines = [
            "# HELP bastion_mcp_requests_total Total MCP HTTP requests by method, path, and status",
            "# TYPE bastion_mcp_requests_total counter",
        ]
        for (method, path, status), count in sorted(total_snapshot.items()):
            lines.append(f'bastion_mcp_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')
        lines.append("")
        lines.append(
            "# HELP bastion_mcp_request_duration_seconds Request duration percentiles (sampled last 500 per path)"
        )
        lines.append("# TYPE bastion_mcp_request_duration_seconds summary")
        for (method, path), durations in sorted(durations_snapshot.items()):
            if not durations:
                continue
            dur_sorted = sorted(durations)
            n = len(dur_sorted)
            for p, label in [(50, "0.5"), (90, "0.9"), (95, "0.95"), (99, "0.99")]:
                idx = min(int(n * p / 100), n - 1)
                _val = dur_sorted[idx]
                lines.append(
                    f"bastion_mcp_request_duration_seconds"
                    f'{{method="{method}",path="{path}",quantile="{label}"}} {_val:.6f}'
                )
            lines.append(
                f'bastion_mcp_request_duration_seconds_sum{{method="{method}",path="{path}"}} {sum(durations):.6f}'
            )
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

            if provider and hasattr(provider, "is_token_revoked") and await provider.is_token_revoked(token_value):
                return JSONResponse({"active": False})
            if provider and hasattr(provider, "load_access_token"):
                token_obj = await provider.load_access_token(token_value)
                if token_obj:
                    from bastion.auth_provider import resolve_role_from_scopes

                    return JSONResponse(
                        {
                            "active": True,
                            "scope": " ".join(token_obj.scopes or []),
                            "client_id": token_obj.client_id,
                            "role": resolve_role_from_scopes(token_obj.scopes),
                            "expires_in": (token_obj.expires_at - int(time.time())) if token_obj.expires_at else None,
                        }
                    )

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
            "memory_store_batch": "Batch store up to 100 memories atomically",
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
            "/readyz",
            "/.well-known/mcp-server.json",
            "/.well-known/agent-card.json",
        }
    )

    _max_request_bytes = 1_048_576  # 1MB limit for MCP requests
    _request_timeout_seconds = int(os.environ.get("BASTION_MCP_TIMEOUT", "60"))

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
                if cl > _max_request_bytes:
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

            # Skip paths (exact or with trailing slash)
            if path in skip_paths or path.rstrip("/") in skip_paths:
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
                                elif request.method == "GET" and not role_has_scope(role, "memory:read"):
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
                with _metrics_lock:
                    global _metrics_rate_limit_hits
                    _metrics_rate_limit_hits += 1
                return JSONResponse(
                    {"error": "Rate limit exceeded. Please retry later."},
                    status_code=429,
                )
            _start_time = time.monotonic()
            try:
                response = await asyncio.wait_for(call_next(request), timeout=_request_timeout_seconds)
                response.headers["X-Request-ID"] = request_id
                _elapsed = time.monotonic() - _start_time
                with _metrics_lock:
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
            with _metrics_lock:
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
