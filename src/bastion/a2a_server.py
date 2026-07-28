"""
Bastion A2A Server — A2A v1.0 Protocol Implementation.

Features:
  - A2A v1.0 Signed Agent Cards (Ed25519 cryptographic identity)
  - JSON-RPC 2.0 task lifecycle (working / input-required / completed)
  - Prometheus metrics, rate limiting, API key auth
  - Bastion-specific endpoints: healthz, readyz, metrics
  - Push notification registration via CDC changefeed

Usage:
    python -m bastion.a2a_server
    BASTION_CONN=postgresql://... python -m bastion.a2a_server
    BASTION_A2A_PRIVATE_KEY="base64..." python -m bastion.a2a_server  # persistent identity
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import signal
import sys
import threading
import time
import uuid
from collections import defaultdict, deque
from functools import partial
from typing import Any

import anyio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from bastion.config import DOCS_URL, VERSION
from bastion.log_setup import get_logger
from bastion.spend_manager import SpendManager

_SAFE_ERROR_MSG = "Internal server error (see server logs for details)"
_MAX_REQUEST_BYTES = 1_048_576
_TASK_TTL_SECONDS = 300
_MAX_TASKS = 10_000
_ORPHAN_TASK_TTL_SECONDS = 1800
_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 600
_REQUEST_TIMEOUT_SECONDS = 60
_A2A_VERSION = "1.0"

# Task state machine: valid transitions only
_TASK_VALID_TRANSITIONS: dict[str, set[str]] = {
    "SUBMITTED": {"WORKING", "INPUT_REQUIRED", "CANCELED"},
    "WORKING": {"COMPLETED", "FAILED", "INPUT_REQUIRED", "CANCELED"},
    "INPUT_REQUIRED": {"WORKING", "CANCELED"},  # multi-turn: agent asks for more input
    "COMPLETED": set(),  # terminal
    "FAILED": set(),  # terminal
    "CANCELED": set(),  # terminal
}

_JSONRPC_PARSE_ERROR = -32700
_JSONRPC_INVALID_REQUEST = -32600
_JSONRPC_METHOD_NOT_FOUND = -32601
_JSONRPC_INVALID_PARAMS = -32602
_JSONRPC_INTERNAL_ERROR = -32603
_A2A_TASK_NOT_FOUND = -32001
_A2A_VERSION_NOT_SUPPORTED = -32009

logger = get_logger("bastion-a2a")

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "severity": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "request_id"):
            entry["request_id"] = record.request_id
        if hasattr(record, "trace_id"):
            entry["trace_id"] = record.trace_id
        if record.exc_info and record.exc_info[0]:
            entry["exception"] = self.formatException(record.exc_info).replace("\n", "\\n").replace("\r", "\\r")
        return json.dumps(entry, default=str)


def _configure_logging() -> None:
    use_json = os.environ.get("LOG_JSON", "0").lower() in ("1", "true", "yes")
    if use_json:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(_JsonFormatter())
        logging.basicConfig(level=logging.INFO, handlers=[handler])
    else:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )


# ---------------------------------------------------------------------------
# Server factory
# ---------------------------------------------------------------------------


def create_a2a_server(
    connection_string: str | None = None,
    mock: bool | None = None,
    host: str = "127.0.0.1",
    port: int = 9998,
) -> tuple[FastAPI, Any]:
    from bastion.memory import BastionMemory

    _mock = mock if mock is not None else os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")
    conn = connection_string or os.environ.get("BASTION_CONN", "")
    agent_id = os.environ.get("BASTION_AGENT_ID", "bastion-a2a")

    if not _mock and conn and "connect_timeout" not in conn:
        sep = "&" if "?" in conn else "?"
        conn = f"{conn}{sep}connect_timeout=10"
    try:
        memory = BastionMemory(agent_id, connection_string=conn, mock=_mock)
    except Exception:
        logger.exception(
            "Failed to create BastionMemory with real DB, falling back to mock", extra={"agent_id": agent_id}
        )
        memory = BastionMemory(agent_id, mock=True)

    # -- SpendManager: initialized once, reused across all requests --
    _spend_manager = SpendManager(connection_string=conn, mock=_mock)

    skill_map = {
        "memory_store": "store",
        "memory_search": "search",
        "memory_timetravel": "memory_timetravel",
        "memory_audit": "memory_audit",
        "memory_heal": "memory_heal",
        "memory_delete": "memory_delete",
        "memory_pin": "memory_pin",
        "memory_get_pinned": "memory_get_pinned",
        "memory_list": "memory_list",
        "memory_correct": "memory_correct",
        "memory_health": "memory_health",
        "memory_apply_patch": "memory_apply_patch",
        "resolve_conflict": "resolve_conflict",
        "ltm_check_reuse": "ltm_check_reuse",
        "ltm_store_analysis": "ltm_store_analysis",
        "ltm_invalidate": "ltm_invalidate",
        "detect_contradictions": "detect_contradictions",
        "scan_all_contradictions": "scan_all_contradictions",
        "dream": "dream",
        "dream_history": "dream_history",
        "detect_observations": "detect_observations",
        "multi_signal_search": "multi_signal_search",
        "context_pack": "context_pack",
        "agent_schema": "agent_schema",
        "a2a_bridge": "a2a_bridge",
    }

    # -- RBAC: role-based skill access control --
    # reader: can read/search/list
    # writer: can read + write/store/delete/correct
    # admin: can do everything including dream, heal, schema
    _skill_roles: dict[str, str] = {
        "memory_search": "reader",
        "memory_list": "reader",
        "memory_health": "reader",
        "memory_get_pinned": "reader",
        "memory_timetravel": "reader",
        "memory_audit": "reader",
        "detect_observations": "reader",
        "scan_all_contradictions": "reader",
        "context_pack": "reader",
        "agent_schema": "reader",
        "a2a_bridge": "reader",
        "ltm_check_reuse": "reader",
        "dream_history": "reader",
        "memory_store": "writer",
        "memory_pin": "writer",
        "memory_correct": "writer",
        "memory_apply_patch": "writer",
        "resolve_conflict": "writer",
        "broadcast": "writer",
        "reinforce": "writer",
        "ltm_store_analysis": "writer",
        "ltm_invalidate": "writer",
        "detect_contradictions": "writer",
        "multi_signal_search": "writer",
        "memory_delete": "admin",
        "memory_heal": "admin",
        "dream": "admin",
    }
    _role_hierarchy = {"reader": 0, "writer": 1, "admin": 2}

    def _resolve_role(api_key_value: str) -> str:
        """Resolve role from API key. Supports per-key role mapping via BASTION_A2A_ROLES env var.
        Format: BASTION_A2A_ROLES=key1:writer,key2:reader,default:admin
        Falls back to BASTION_A2A_ROLE env var, then 'admin' for single-key mode."""
        import secrets as _secrets

        role_env = os.environ.get("BASTION_A2A_ROLE", "")
        roles_map = os.environ.get("BASTION_A2A_ROLES", "")
        if roles_map:
            for pair in roles_map.split(","):
                if ":" in pair:
                    k, v = pair.split(":", 1)
                    # Constant-time comparison to prevent timing side-channel
                    if len(k.strip()) == len(api_key_value) and _secrets.compare_digest(k.strip(), api_key_value):
                        return v.strip()
        if role_env:
            return role_env
        return "admin"

    # -- A2A Agent Card ---------------------------------------------------

    from bastion.a2a_signing import AgentCardSigner

    _agent_card_signer = AgentCardSigner.from_env("BASTION_A2A_PRIVATE_KEY")
    logger.info(
        "A2A signing key loaded",
        extra={"public_key": _agent_card_signer.get_public_key_base64()[:16] + "..."},
    )

    _agent_card_url = os.environ.get("A2A_URL", f"http://{host}:{port}")
    _agent_card_unsigned: dict[str, Any] = {
        "name": "Bastion Memory Agent",
        "description": (
            "A2A-compliant memory agent with hash-chain integrity, "
            "C-SPANN vector indexing, knowledge graph, and time travel."
        ),
        "version": VERSION,
        "a2a_version": "1.0",
        "url": _agent_card_url,
        "documentationUrl": DOCS_URL,
        "capabilities": {
            "streaming": True,
            "pushNotifications": True,
            "stateTransitionHistory": True,
        },
        "skills": [
            {
                "id": "memory_store",
                "name": "Store Agent Memory",
                "description": "Store a memory with SHA-256 hash-chain integrity and C-SPANN vector indexing.",
                "tags": ["memory", "storage", "hash-chain", "c-spann"],
                "examples": ["Store that the user prefers Python over TypeScript"],
            },
            {
                "id": "memory_search",
                "name": "Search Agent Memories",
                "description": "Semantic vector search across agent memories with cognitive decay weighting.",
                "tags": ["memory", "search", "vector", "c-spann"],
                "examples": ["Find memories about project architecture decisions"],
            },
            {
                "id": "memory_timetravel",
                "name": "Time Travel Memory",
                "description": "Query agent memory state at any past timestamp using CockroachDB AS OF SYSTEM TIME.",
                "tags": ["memory", "time-travel", "audit"],
                "examples": ["Show me what the memory said about project architecture yesterday"],
            },
            {
                "id": "memory_audit",
                "name": "Audit Memory Changes",
                "description": "Retrieve the append-only hash-chain audit log for an agent.",
                "tags": ["memory", "audit", "hash-chain"],
                "examples": ["Show the change history for memory abc-123"],
            },
            {
                "id": "memory_heal",
                "name": "Self-Heal Memory",
                "description": (
                    "CDC-triggered self-healing: remove expired memories, detect anomalies, compact storage."
                ),
                "tags": ["memory", "healing", "integrity"],
                "examples": ["Heal any broken hash chain links in my memories"],
            },
            {
                "id": "memory_delete",
                "name": "Delete Memory",
                "description": "Delete a single memory by ID with confirmation. Uses SERIALIZABLE isolation.",
                "tags": ["memory", "delete", "destructive"],
                "examples": ["Delete memory abc-123"],
            },
            {
                "id": "memory_pin",
                "name": "Pin Safety-Critical Memory",
                "description": (
                    "Pin safety-critical memories that survive context compaction. "
                    "Priority: 0=normal, 1=important, 2=CRITICAL."
                ),
                "tags": ["memory", "pin", "safety"],
                "examples": ["Pin the memory about never sharing API keys"],
            },
            {
                "id": "memory_get_pinned",
                "name": "Get Pinned Memories",
                "description": "Retrieve all pinned memories with priority >= min_priority.",
                "tags": ["memory", "pin", "read"],
                "examples": ["Get all critical pinned memories"],
            },
            {
                "id": "memory_list",
                "name": "List Agent Memories",
                "description": "List all memories for the current agent with filtering and pagination.",
                "tags": ["memory", "list", "governance"],
                "examples": ["List all fact-type memories"],
            },
            {
                "id": "memory_correct",
                "name": "Correct Memory Content",
                "description": "Update a memory's content for governance and correction.",
                "tags": ["memory", "correct", "governance"],
                "examples": ["Correct memory abc-123 to say 'Python 3.12' instead of 'Python 3.10'"],
            },
            {
                "id": "memory_health",
                "name": "Memory Health Metrics",
                "description": "Return memory health metrics: total count, pinned count, freshness ratio, scores.",
                "tags": ["memory", "health", "metrics"],
                "examples": ["Show memory health dashboard"],
            },
            {
                "id": "memory_apply_patch",
                "name": "Apply JSON Patch to Memory",
                "description": "Apply RFC 6902 JSON Patch operations to a memory's metadata atomically.",
                "tags": ["memory", "patch", "metadata"],
                "examples": ["Add a 'verified' tag to memory abc-123 metadata"],
            },
            {
                "id": "resolve_conflict",
                "name": "Resolve Memory Conflict",
                "description": "Resolve conflicting memories from multiple agents using SERIALIZABLE isolation.",
                "tags": ["memory", "conflict", "resolution"],
                "examples": ["Merge conflicting facts about user preferences"],
            },
            {
                "id": "ltm_check_reuse",
                "name": "LTM Gateway - Check Reuse",
                "description": (
                    "Check if a similar analysis already exists in long-term memory before running expensive workflows."
                ),
                "tags": ["ltm", "cache", "reuse"],
                "examples": ["Check if we already analyzed Q3 market trends"],
            },
            {
                "id": "ltm_store_analysis",
                "name": "LTM Gateway - Store Analysis",
                "description": "Store a completed analysis result for future reuse by the LTM Gateway.",
                "tags": ["ltm", "store", "analysis"],
                "examples": ["Store the Q3 market analysis result"],
            },
            {
                "id": "ltm_invalidate",
                "name": "LTM Gateway - Invalidate",
                "description": "Mark cached analyses as stale when new information contradicts them.",
                "tags": ["ltm", "invalidate", "stale"],
                "examples": ["Invalidate the cached Q2 analysis - data is outdated"],
            },
            {
                "id": "detect_contradictions",
                "name": "Detect Contradictions",
                "description": "Scan existing memories for contradictions against a newly stored memory.",
                "tags": ["memory", "contradictions", "integrity"],
                "examples": ["Find contradictions in what we know about the database schema"],
            },
            {
                "id": "scan_all_contradictions",
                "name": "Batch Contradiction Scan",
                "description": "Scan ALL agent memories for existing contradictions across the entire store.",
                "tags": ["memory", "contradictions", "batch"],
                "examples": ["Run a full contradiction scan on all memories"],
            },
            {
                "id": "dream",
                "name": "Dream / Consolidate",
                "description": (
                    "Sleep-time memory consolidation: review episodic memories, "
                    "extract patterns, promote high-value, prune low-value."
                ),
                "tags": ["memory", "consolidation", "dream"],
                "examples": ["Dream about my project memories and summarize key patterns"],
            },
            {
                "id": "dream_history",
                "name": "Dream History",
                "description": "Retrieve past dreaming/consolidation sessions from the audit trail.",
                "tags": ["memory", "dream", "history"],
                "examples": ["Show me past consolidation sessions"],
            },
            {
                "id": "detect_observations",
                "name": "Detect Meta-Patterns",
                "description": "Scan all memories to detect recurring themes, entity co-occurrences, temporal trends.",
                "tags": ["memory", "patterns", "meta"],
                "examples": ["What patterns emerge across my memories?"],
            },
            {
                "id": "multi_signal_search",
                "name": "Multi-Signal Retrieval",
                "description": "4-signal fusion search: vector + BM25 keyword + entity + temporal scoring.",
                "tags": ["memory", "search", "multi-signal"],
                "examples": ["Search with all signals for 'Python deployment'"],
            },
            {
                "id": "context_pack",
                "name": "Context Budget Packer",
                "description": "Pack the most relevant memories into a token budget for LLM context injection.",
                "tags": ["memory", "context", "llm"],
                "examples": ["Pack top memories into a 4000-token context for the next LLM call"],
            },
            {
                "id": "agent_schema",
                "name": "Agent Schema Query",
                "description": (
                    "Query the agent's own database schema. Returns table structures, indexes, and column definitions."
                ),
                "tags": ["schema", "database", "introspection"],
                "examples": ["Show me the memory_records table schema"],
            },
            {
                "id": "a2a_bridge",
                "name": "A2A Agent Bridge",
                "description": "Retrieve the A2A Agent Card for inter-agent discovery. Returns A2A-compliant metadata.",
                "tags": ["a2a", "discovery", "bridge"],
                "examples": ["Get the A2A agent card for this memory agent"],
            },
        ],
        "defaultInputModes": ["text"],
        "defaultOutputModes": ["text"],
        "supportsAuthenticatedExtendedCard": False,
        "provider": {
            "organization": "Bastion",
            "url": "https://github.com/dgboy-ai/Bastion",
        },
    }

    # -- In-memory fallback cache (used when mock mode or DB unavailable) --
    # WARNING: Tasks in mock mode are NOT persisted across restarts.
    # For production, set BASTION_CONN and unset BASTION_MOCK.

    _tasks: dict[str, dict[str, Any]] = {}
    _tasks_lock = threading.Lock()
    _tasks_warned = False

    # -- Background task cleanup ------------------------------------------

    _cleanup_interval = int(os.environ.get("A2A_CLEANUP_INTERVAL", "3600"))  # seconds
    _task_max_age = int(os.environ.get("A2A_TASK_MAX_AGE", "86400"))  # seconds

    def _cleanup_loop() -> None:
        while True:
            time.sleep(_cleanup_interval)
            try:
                if not memory._mock:
                    deleted = memory._a2a_store.cleanup_expired(max_age_seconds=_task_max_age)
                    if deleted:
                        logger.info("Cleaned up %d expired A2A tasks", extra={"count": deleted})
                # Clean up in-memory stale tasks (mock mode TTL)
                now = time.time()
                mono = time.monotonic()
                with _tasks_lock:
                    stale = [k for k, v in list(_tasks.items()) if v.get("_dm") and v["_dm"] + _TASK_TTL_SECONDS < mono]
                    for k in stale:
                        _tasks.pop(k, None)
                    if len(_tasks) > _MAX_TASKS:
                        oldest = min(_tasks, key=lambda k: _tasks[k]["_created_at"])
                        _tasks.pop(oldest, None)
                # Clean up expired brute-force cache entries
                with _brute_cache_lock:
                    expired = [
                        ip
                        for ip, (_, ws, lu) in _brute_cache.items()
                        if (lu and now > lu) or (not lu and now - ws > _auth_window_seconds)
                    ]
                    for ip in expired:
                        _brute_cache.pop(ip, None)
                    if expired:
                        logger.debug("Cleaned %d expired brute-force entries", extra={"count": len(expired)})
                # Clean up expired idempotency store entries
                with _idempotency_lock:
                    expired_keys = [
                        k for k, v in _idempotency_store.items() if now - v.get("_ts", 0) >= _idempotency_ttl
                    ]
                    for k in expired_keys:
                        _idempotency_store.pop(k, None)
                    if expired_keys:
                        logger.debug("Cleaned %d expired idempotency entries", extra={"count": len(expired_keys)})
            except Exception:
                logger.exception("Background cleanup failed")

    _cleanup_thread = threading.Thread(target=_cleanup_loop, daemon=True, name="a2a-cleanup")
    _cleanup_thread.start()

    async def _store_task(
        tid: str,
        status: str,
        artifacts: list[dict[str, Any]] | None = None,
        callback_url: str | None = None,
        runtime_metadata: dict[str, Any] | None = None,
        parent_task_id: str | None = None,
        priority: int = 0,
    ) -> dict[str, Any]:
        nonlocal _tasks_warned
        now = time.time()
        mono = time.monotonic()

        if not memory._mock:
            try:
                task_record = await anyio.to_thread.run_sync(
                    memory.store_a2a_task,
                    tid,
                    agent_id,
                    "unknown",
                    status,
                    callback_url,
                    runtime_metadata,
                    parent_task_id,
                    priority,
                )
                return {
                    "id": task_record["task_id"],
                    "status": {"state": task_record["status"]},
                    "artifacts": artifacts or [],
                    "_created_at": now,
                    "_completed_at": None if status in ("WORKING", "SUBMITTED") else now,
                    "_cm": mono,
                    "_dm": None if status in ("WORKING", "SUBMITTED") else mono,
                    "runtime_metadata": task_record.get("runtime_metadata"),
                    "last_heartbeat": task_record.get("last_heartbeat"),
                    "error_message": task_record.get("error_message"),
                    "retry_count": task_record.get("retry_count", 0),
                    "parent_task_id": task_record.get("parent_task_id"),
                    "priority": task_record.get("priority", 0),
                }
            except Exception:
                logger.exception("DB task store failed, falling back to in-memory")

        # In-memory fallback (mock mode or DB failure)
        if not _tasks_warned:
            _tasks_warned = True
            logger.warning(
                "A2A tasks are stored in-memory only — lost on restart. Set BASTION_CONN for persistent task storage."
            )
        task = {
            "id": tid,
            "status": {"state": status},
            "artifacts": artifacts or [],
            "_created_at": now,
            "_completed_at": None if status in ("WORKING", "SUBMITTED") else now,
            "_cm": mono,
            "_dm": None if status in ("WORKING", "SUBMITTED") else mono,
            "runtime_metadata": runtime_metadata,
            "last_heartbeat": None,
            "error_message": None,
            "retry_count": 0,
            "parent_task_id": parent_task_id,
            "priority": priority,
        }
        with _tasks_lock:
            _tasks[tid] = task
        return task

    async def _get_task(tid: str) -> dict[str, Any] | None:
        if not memory._mock:
            try:
                record = await anyio.to_thread.run_sync(memory.get_a2a_task, tid)
                if record:
                    now = time.time()
                    mono = time.monotonic()
                    return {
                        "id": record["task_id"],
                        "status": {"state": record["status"]},
                        "artifacts": record.get("artifacts") or [],
                        "_created_at": now,
                        "_completed_at": now if record["status"] in ("COMPLETED", "FAILED", "CANCELED") else None,
                        "_cm": mono,
                        "_dm": now if record["status"] in ("COMPLETED", "FAILED", "CANCELED") else None,
                        "runtime_metadata": record.get("runtime_metadata"),
                        "last_heartbeat": record.get("last_heartbeat"),
                        "error_message": record.get("error_message"),
                        "retry_count": record.get("retry_count", 0),
                        "parent_task_id": record.get("parent_task_id"),
                        "priority": record.get("priority", 0),
                    }
            except Exception:
                logger.exception("DB task get failed, falling back to in-memory")

        # In-memory fallback (mock mode or DB failure)
        with _tasks_lock:
            return _tasks.get(tid)

    async def _update_task(
        tid: str,
        status: str,
        artifacts: list[dict[str, Any]] | None = None,
        runtime_metadata: dict[str, Any] | None = None,
        error_message: str | None = None,
        retry_count: int | None = None,
    ) -> dict[str, Any] | None:
        existing_task = await _get_task(tid)
        if existing_task:
            current_state = existing_task.get("status", {}).get("state", "")
            if current_state and not _validate_task_transition(tid, current_state, status):
                logger.warning(
                    "Task state transition rejected",
                    extra={"task_id": tid, "from": current_state, "to": status},
                )
                return existing_task

        if not memory._mock:
            try:
                record = await anyio.to_thread.run_sync(
                    memory.update_a2a_task,
                    tid,
                    status,
                    artifacts,
                    None,  # callback_url unchanged
                    runtime_metadata,
                    error_message,
                    retry_count,
                )
                if record:
                    now = time.time()
                    mono = time.monotonic()
                    _maybe_notify_push(tid, record["status"], artifacts, record.get("callback_url"))
                    return {
                        "id": record["task_id"],
                        "status": {"state": record["status"]},
                        "artifacts": record.get("artifacts") or [],
                        "_created_at": now,
                        "_completed_at": now if record["status"] in ("COMPLETED", "FAILED", "CANCELED") else None,
                        "_cm": mono,
                        "_dm": now if record["status"] in ("COMPLETED", "FAILED", "CANCELED") else None,
                        "runtime_metadata": record.get("runtime_metadata"),
                        "last_heartbeat": record.get("last_heartbeat"),
                        "error_message": record.get("error_message"),
                        "retry_count": record.get("retry_count", 0),
                        "parent_task_id": record.get("parent_task_id"),
                        "priority": record.get("priority", 0),
                    }
            except Exception:
                logger.exception("DB task update failed, falling back to in-memory")

        # In-memory fallback (mock mode or DB failure)
        with _tasks_lock:
            task = _tasks.get(tid)
            if task:
                task["status"]["state"] = status
                if artifacts is not None:
                    task["artifacts"] = artifacts
                if runtime_metadata is not None:
                    task["runtime_metadata"] = runtime_metadata
                if error_message is not None:
                    task["error_message"] = error_message
                if retry_count is not None:
                    task["retry_count"] = retry_count
                task["last_heartbeat"] = time.time()
                if status in ("COMPLETED", "FAILED", "CANCELED"):
                    task["_completed_at"] = time.time()
                    task["_dm"] = time.monotonic()
                    _maybe_notify_push(tid, status, artifacts)
        return task

    # -- FastAPI app -------------------------------------------------------

    app = FastAPI(title="Bastion A2A Server", version=VERSION)

    # Schedule periodic orphaned-task cleanup
    async def _schedule_cleanup():
        while True:
            await anyio.sleep(_task_stale_timeout // 2)
            await _cleanup_orphaned_tasks()

    @app.on_event("startup")
    async def _start_cleanup():
        _cleanup_task = asyncio.ensure_future(_schedule_cleanup())

    cors_origins = [
        o.strip()
        for o in os.environ.get(
            "CORS_ALLOW_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if o.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept"],
    )

    # -- Idempotency -------------------------------------------------------

    _idempotency_store: dict[str, dict[str, Any]] = {}
    _idempotency_lock = threading.Lock()
    _idempotency_ttl = 86400
    _idempotency_max_size = 10000  # Prevent unbounded memory growth

    async def _check_idempotency(key: str) -> dict[str, Any] | None:
        with _idempotency_lock:
            entry = _idempotency_store.get(key)
            if entry and time.time() - entry.get("_ts", 0) < _idempotency_ttl:
                return entry
            if entry:
                _idempotency_store.pop(key, None)
            return None

    def _set_idempotency(key: str, data: dict[str, Any]) -> None:
        with _idempotency_lock:
            # Evict expired entries and enforce max size
            if len(_idempotency_store) >= _idempotency_max_size:
                now = time.time()
                expired = [k for k, v in _idempotency_store.items() if now - v.get("_ts", 0) >= _idempotency_ttl]
                for k in expired[: len(expired) // 2 or 1]:
                    _idempotency_store.pop(k, None)
                # If still over limit, drop oldest
                if len(_idempotency_store) >= _idempotency_max_size:
                    oldest_key = min(_idempotency_store, key=lambda k: _idempotency_store[k].get("_ts", 0))
                    _idempotency_store.pop(oldest_key, None)
            _idempotency_store[key] = data

    # -- Metrics state -----------------------------------------------------

    _rate_buckets: dict[str, list[float]] = defaultdict(list)
    _rate_buckets_lock = threading.Lock()
    _rate_checks = 0
    _rate_max_ips = 10000  # Maximum distinct IPs to track
    _metrics_requests_total: dict[tuple[str, str, int], int] = defaultdict(int)
    _metrics_durations: dict[tuple[str, str], deque[float]] = defaultdict(lambda: deque(maxlen=500))
    _metrics_rate_limit_hits = 0
    _metrics_start_time = time.monotonic()

    def _check_rate_limit(client_ip: str) -> bool:
        """Distributed rate limiter using CockroachDB with native TTL.

        Falls back to in-memory sliding window when DB is unavailable or in mock mode.
        """
        nonlocal _rate_checks
        now = time.time()
        window_start = now - _RATE_LIMIT_WINDOW

        # Try DB-backed distributed rate limiting first
        if _brute_pool and not _mock:
            try:
                db_conn = _brute_pool.acquire(timeout=2)
                try:
                    with db_conn.cursor() as cur:
                        # Count requests in the window using TTL-expired data
                        cur.execute(
                            "SELECT count(*) FROM a2a_rate_limits WHERE ip_address = %s AND request_time > %s",
                            (client_ip, datetime.datetime.fromtimestamp(window_start, tz=datetime.UTC)),
                        )
                        row = cur.fetchone()
                        count = int(row[0]) if row else 0
                        if count >= _RATE_LIMIT_MAX:
                            db_conn.rollback()
                            return False
                        # Record this request
                        cur.execute(
                            "INSERT INTO a2a_rate_limits (ip_address, request_time) VALUES (%s, now())",
                            (client_ip,),
                        )
                    db_conn.commit()
                    _rate_checks += 1
                    return True
                finally:
                    _brute_pool.release(db_conn)
            except Exception:
                pass  # Fall through to in-memory

        # Fallback: in-memory sliding window (for mock mode or DB failure)
        with _rate_buckets_lock:
            bucket = _rate_buckets[client_ip]
            while bucket and bucket[0] < window_start:
                bucket.pop(0)
            if len(bucket) >= _RATE_LIMIT_MAX:
                return False
            bucket.append(now)
            _rate_checks += 1
            # Periodic cleanup: evict empty buckets and cap at max IPs
            if _rate_checks % 100 == 0:
                stale = [ip for ip, ts in list(_rate_buckets.items()) if not ts]
                for ip in stale:
                    del _rate_buckets[ip]
                if len(_rate_buckets) > _rate_max_ips:
                    sorted_ips = sorted(
                        _rate_buckets.keys(),
                        key=lambda ip: max(_rate_buckets[ip]) if _rate_buckets[ip] else 0,
                    )
                    for ip in sorted_ips[: len(sorted_ips) - _rate_max_ips // 2]:
                        _rate_buckets.pop(ip, None)
            return True

    def _check_version(request: Request) -> bool:
        version = request.headers.get("a2a-version", "")
        return version == _A2A_VERSION

    # -- Signature verification -------------------------------------------

    from bastion.a2a_signing import TrustedKeyRegistry, verify_card_signed_trusted

    _sender_key_cache: dict[str, tuple[str, float]] = {}  # url -> (pem, expiry)
    _sender_key_cache_lock = threading.Lock()
    _signature_cache_ttl = 86400  # 24 hours
    _signature_cache_maxsize = 100  # prevent unbounded memory growth (DoS)
    _strict_auth = os.environ.get("BASTION_A2A_STRICT", "true").lower() in ("true", "1", "yes")
    _trust_registry = TrustedKeyRegistry(
        mode="strict" if _strict_auth else "tofu",
    )

    def _is_safe_url(url: str) -> bool:
        """Check if a URL is safe to fetch (no private/internal IPs).

        Resolves DNS to prevent rebinding attacks where a hostname initially
        resolves to a public IP but later resolves to an internal IP.
        """
        import ipaddress
        import socket
        from urllib.parse import urlparse

        try:
            parsed = urlparse(url)
            if parsed.scheme not in ("https",):
                return False
            hostname = parsed.hostname or ""
            if not hostname:
                return False
            # Allow loopback for local dev (BASTION_BRIDGE_ALLOW_LOOPBACK)
            _allow_loopback = os.environ.get("BASTION_BRIDGE_ALLOW_LOOPBACK", "").lower() in ("1", "true", "yes")
            if _allow_loopback:
                return True
            # Block known internal hostnames
            blocked = ("localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal")
            if hostname.lower() in blocked:
                return False
            if hostname.endswith((".local", ".internal", ".localhost")):
                return False
            # Resolve DNS and check the resolved IP addresses
            try:
                resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
                for _, _, _, _, sockaddr in resolved:
                    ip = ipaddress.ip_address(sockaddr[0])
                    if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                        return False
            except (socket.gaierror, OSError):
                return False  # DNS resolution failed — block
            return True
        except Exception:
            return False

    async def _verify_sender_signature(request: Request, body: bytes) -> bool:
        """Verify Ed25519 signature on incoming SendMessage requests."""
        sender_url = request.headers.get("X-Sender-URL", "")
        signature_b64 = request.headers.get("X-Sender-Signature", "")

        # Require BOTH signature headers or NEITHER — partial headers are rejected
        if not sender_url and not signature_b64:
            # No signature headers — reject in strict mode, allow in legacy mode
            return not _strict_auth  # backwards compatible only when strict_auth is off
        if not sender_url or not signature_b64:
            return False  # partial headers — reject (prevents signature bypass)

        # SSRF protection with DNS pinning (TOCTOU-safe)
        parsed_url = urlparse(sender_url)
        hostname = parsed_url.hostname or ""
        if not hostname:
            return False
        _allow_loopback = os.environ.get("BASTION_BRIDGE_ALLOW_LOOPBACK", "").lower() in ("1", "true", "yes")
        try:
            addrinfo = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        except socket.gaierror:
            return False
        resolved_ips = []
        for _, _, _, _, sockaddr in addrinfo:
            ip = sockaddr[0]
            try:
                ip_addr = ipaddress.ip_address(ip)
            except ValueError:
                continue
            is_private = ip_addr.is_private or ip_addr.is_loopback or ip_addr.is_link_local or ip_addr.is_reserved
            if is_private and not _allow_loopback:
                continue
            resolved_ips.append(ip)
        if not resolved_ips:
            return False
        pinned_ip = resolved_ips[0]
        port_part = f":{parsed_url.port}" if parsed_url.port else ""
        base_path = parsed_url.path.rstrip('/') if parsed_url.path else ''
        pinned_fetch_url = f"{parsed_url.scheme}://{pinned_ip}{port_part}{base_path}/.well-known/agent-card.json"
        if parsed_url.query:
            pinned_fetch_url += f"?{parsed_url.query}"
        logger.debug("DNS pinned for sender auth", extra={"hostname": hostname, "pinned_ip": pinned_ip})

        # Check cache
        now = time.time()
        with _sender_key_cache_lock:
            cached = _sender_key_cache.get(sender_url)
        if cached and cached[1] > now:
            pubkey_pem = cached[0]
        else:
            # Fetch sender's agent card via pinned IP (no re-resolve)
            try:
                import httpx

                async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
                    resp = await client.get(pinned_fetch_url)
                    if resp.status_code != 200:
                        logger.warning("Failed to fetch sender agent card", extra={"sender_url": sender_url})
                        return False
                    card = resp.json()
                    if not verify_card_signed_trusted(card, _trust_registry):
                        logger.warning("Sender card signature verification FAILED", extra={"sender_url": sender_url})
                        return False
                    sig_info = card.get("signature", {})
                    pubkey_pem = sig_info.get("publicKeyPem", "")
                    if not pubkey_pem:
                        logger.warning("Sender card missing publicKeyPem", extra={"sender_url": sender_url})
                        return False
                    with _sender_key_cache_lock:
                        _sender_key_cache[sender_url] = (pubkey_pem, now + _signature_cache_ttl)
                        if len(_sender_key_cache) > _signature_cache_maxsize:
                            oldest = min(_sender_key_cache, key=lambda k: _sender_key_cache[k][1])
                            _sender_key_cache.pop(oldest)
            except Exception:
                logger.exception("Error fetching sender agent card", extra={"sender_url": sender_url})
                return False

        # Verify signature
        try:
            import base64

            from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
            from cryptography.hazmat.primitives.serialization import load_pem_public_key

            pubkey = load_pem_public_key(pubkey_pem.encode())
            if not isinstance(pubkey, Ed25519PublicKey):
                return False
            sig_bytes = base64.b64decode(signature_b64)
            pubkey.verify(sig_bytes, body)
            return True
        except Exception:
            logger.exception("Signature verification failed", extra={"sender_url": sender_url})
            return False

    # -- Webhook push notification registration ---------------------------

    # -- Authentication ----------------------------------------------------
    # Accept both BASTION_API_KEY and BASTION_MCP_API_KEYS (unified auth)
    _api_key = os.environ.get("BASTION_API_KEY", "")
    _mcp_keys_raw = os.environ.get("BASTION_MCP_API_KEYS", "")
    if _mcp_keys_raw and not _api_key:
        _api_key = _mcp_keys_raw.split(",")[0].strip()
    if not _api_key:
        # Allow mock mode to start without API key (auth enforced on requests via _verify_api_key)
        logger.warning("No API key configured — auth will be enforced on requests")

    # Brute-force protection: DB-backed with in-memory LRU cache for hot path.
    # Survives server restarts and works across multiple instances.
    _auth_lockout_seconds = 300  # 5-minute lockout
    _auth_max_failures = 10  # lockout after 10 failures in window
    _auth_window_seconds = 600  # 10-minute sliding window
    _auth_max_ips = 10000  # Cap in-memory cache to prevent memory exhaustion

    # In-memory LRU cache: maps IP -> (failure_count, window_start_ts, locked_until_ts)
    _brute_cache: dict[str, tuple[int, float, float | None]] = {}
    _brute_cache_lock = threading.Lock()

    def _get_brute_force_pool():
        """Lazy-init a small connection pool for brute-force tracking."""
        if not conn or _mock:
            return None
        try:
            from bastion.pool import ConnectionPool

            return ConnectionPool(
                connection_string=conn,
                min_size=1,
                max_size=2,
                max_idle_seconds=60,
            )
        except Exception:
            return None

    _brute_pool = _get_brute_force_pool()

    def _check_brute_force(client_ip: str) -> bool:
        """Returns True if IP is locked out due to too many failed auth attempts."""
        now = time.time()
        with _brute_cache_lock:
            entry = _brute_cache.get(client_ip)
            if entry:
                count, window_start, locked_until = entry
                # Check if currently locked out
                if locked_until and now < locked_until:
                    return True
                # Check if window expired — reset
                if now - window_start > _auth_window_seconds:
                    _brute_cache[client_ip] = (0, now, None)
                    entry = (0, now, None)
                count = entry[0]
                if count >= _auth_max_failures:
                    return True
            else:
                # Evict oldest entries if cache grows too large
                if len(_brute_cache) > _auth_max_ips:
                    oldest = sorted(_brute_cache.keys(), key=lambda ip: _brute_cache[ip][1])[:1000]
                    for ip in oldest:
                        _brute_cache.pop(ip, None)
        # Check DB as fallback (e.g., after restart when cache is cold)
        if _brute_pool and client_ip not in _brute_cache:
            try:
                conn_obj = _brute_pool.acquire(timeout=2)
                try:
                    with conn_obj.cursor() as cur:
                        cur.execute(
                            "SELECT failure_count, locked_until FROM auth_brute_force "
                            "WHERE ip_address = %s AND window_start > %s",
                            (client_ip, now - _auth_window_seconds),
                        )
                        row = cur.fetchone()
                        if row:
                            count, locked_until = row
                            locked_ts = locked_until.timestamp() if locked_until else None
                            with _brute_cache_lock:
                                _brute_cache[client_ip] = (count, now - _auth_window_seconds, locked_ts)
                            if locked_ts and now < locked_ts:
                                return True
                            if count >= _auth_max_failures:
                                return True
                finally:
                    _brute_pool.release(conn_obj)
            except Exception:
                logger.warning("DB brute-force check failed, falling back to in-memory cache")
                # Fall back to in-memory cache instead of failing open
                with _brute_cache_lock:
                    entry = _brute_cache.get(client_ip)
                    if entry:
                        count, window_start, locked_until = entry
                        if locked_until and now < locked_until:
                            return True
                        if count >= _auth_max_failures:
                            return True
        return False

    def _record_auth_failure(client_ip: str) -> None:
        now = time.time()
        with _brute_cache_lock:
            entry = _brute_cache.get(client_ip)
            if entry:
                count, window_start, _ = entry
                if now - window_start > _auth_window_seconds:
                    count = 0
                    window_start = now
                count += 1
                locked_until = now + _auth_lockout_seconds if count >= _auth_max_failures else None
                _brute_cache[client_ip] = (count, window_start, locked_until)
            else:
                _brute_cache[client_ip] = (1, now, None)
        # Persist to DB (fire-and-forget)
        if _brute_pool:
            try:
                pool_conn = _brute_pool.acquire(timeout=2)
                try:
                    with pool_conn.cursor() as cur:
                        if _auth_max_failures <= 1:
                            datetime.datetime.fromtimestamp(now + _auth_lockout_seconds, tz=datetime.UTC)
                        cur.execute(
                            "INSERT INTO auth_brute_force (ip_address, failure_count, window_start, last_failure) "
                            "VALUES (%s, 1, %s, %s) "
                            "ON CONFLICT (ip_address) DO UPDATE SET "
                            "failure_count = auth_brute_force.failure_count + 1, "
                            "last_failure = EXCLUDED.last_failure, "
                            "window_start = CASE "
                            "  WHEN EXCLUDED.window_start > auth_brute_force.window_start "
                            "  THEN EXCLUDED.window_start ELSE auth_brute_force.window_start END, "
                            "locked_until = CASE "
                            "  WHEN auth_brute_force.failure_count + 1 >= %s "
                            "  THEN now() + make_interval(secs => %s) "
                            "  ELSE auth_brute_force.locked_until END",
                            (
                                client_ip,
                                datetime.datetime.fromtimestamp(now, tz=datetime.UTC),
                                datetime.datetime.fromtimestamp(now, tz=datetime.UTC),
                                _auth_max_failures,
                                _auth_lockout_seconds,
                            ),
                        )
                    pool_conn.commit()
                finally:
                    _brute_pool.release(pool_conn)
            except Exception:
                pass

    def _clear_auth_failures(client_ip: str) -> None:
        with _brute_cache_lock:
            _brute_cache.pop(client_ip, None)
        if _brute_pool:
            try:
                pool_conn = _brute_pool.acquire(timeout=2)
                try:
                    with pool_conn.cursor() as cur:
                        cur.execute("DELETE FROM auth_brute_force WHERE ip_address = %s", (client_ip,))
                    pool_conn.commit()
                finally:
                    _brute_pool.release(pool_conn)
            except Exception:
                pass

    def _verify_api_key(provided: str) -> bool:
        import secrets as _secrets

        if not _api_key:
            # No API key configured — deny all requests
            return False
        return _secrets.compare_digest(provided, _api_key)

    # -- Task State Machine Validation ------------------------------------

    def _validate_task_transition(tid: str, current_state: str, new_state: str) -> bool:
        """Validate that a task state transition is legal. Returns True if valid."""
        valid_next = _TASK_VALID_TRANSITIONS.get(current_state)
        if valid_next is None:
            logger.warning("Unknown task state", extra={"task_id": tid, "state": current_state})
            return False
        if new_state not in valid_next:
            logger.warning(
                "Invalid task state transition",
                extra={"task_id": tid, "from": current_state, "to": new_state},
            )
            return False
        return True

    # -- Push Notification Delivery Worker --------------------------------

    from bastion.push_dispatcher import get_dispatcher

    _push_dispatch = get_dispatcher()

    def _maybe_notify_push(
        task_id: str,
        status: str,
        artifacts: list | None = None,
        callback_url: str | None = None,
    ) -> None:
        """Deliver push notification if a callback is registered or provided."""
        if callback_url:
            _push_dispatch.register(task_id, callback_url)
        _push_dispatch.notify(task_id, status, artifacts)

    # -- Middleware --------------------------------------------------------

    _has_otel_api = False
    try:
        from opentelemetry import context as _otel_context
        from opentelemetry import propagate as _otel_propagate

        _has_otel_api = True
    except ImportError:
        logger.debug("OpenTelemetry not installed, tracing disabled")

    @app.middleware("http")
    async def _request_id_middleware(request: Request, call_next):
        nonlocal _metrics_requests_total, _metrics_durations, _metrics_rate_limit_hits
        # Only trust X-Forwarded-For behind known reverse proxies
        # Otherwise use direct client IP to prevent spoofing
        forwarded = request.headers.get("X-Forwarded-For", "")
        client_ip = (
            forwarded.split(",")[0].strip()
            if forwarded and os.environ.get("BASTION_TRUST_PROXY", "").lower() in ("true", "1", "yes")
            else (request.client.host if request.client else "unknown")
        )
        if request.url.path not in ("/healthz", "/readyz", "/metrics") and not request.url.path.startswith(
            "/.well-known/"
        ):
            if _check_brute_force(client_ip):
                logger.warning("IP locked out due to brute-force", extra={"client_ip": client_ip})
                return JSONResponse({"error": "Too many failed attempts, temporarily locked out"}, status_code=429)
            auth = request.headers.get("Authorization", "")
            token = auth.removeprefix("Bearer ") if auth.startswith("Bearer ") else ""
            if _api_key and (not token or not _verify_api_key(token)):
                _record_auth_failure(client_ip)
                return JSONResponse({"error": "Unauthorized"}, status_code=401)
            if _api_key:
                _clear_auth_failures(client_ip)
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
        request.state.request_id = request_id

        if not _check_rate_limit(client_ip):
            _metrics_rate_limit_hits += 1
            logger.warning("Rate limit exceeded", extra={"request_id": request_id, "client_ip": client_ip})
            return JSONResponse({"error": "Too many requests"}, status_code=429)

        # Propagate OpenTelemetry trace context from incoming traceparent header
        _otel_token = None
        if _has_otel_api:
            ctx = _otel_propagate.extract(dict(request.headers))
            _otel_token = _otel_context.attach(ctx)

        logger.info(
            "Request started",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client_ip": client_ip,
            },
        )
        _start_time = time.monotonic()
        try:
            try:
                response = await asyncio.wait_for(call_next(request), timeout=_REQUEST_TIMEOUT_SECONDS)
            except TimeoutError:
                logger.warning("Request timeout", extra={"request_id": request_id, "timeout": _REQUEST_TIMEOUT_SECONDS})
                _metrics_requests_total[(request.method, request.url.path, 504)] += 1
                return JSONResponse({"error": "Request timeout"}, status_code=504)
            response.headers["X-Request-ID"] = request_id
        except Exception:
            logger.exception("Request failed", extra={"request_id": request_id})
            raise
        finally:
            if _otel_token is not None:
                _otel_context.detach(_otel_token)
        _elapsed = time.monotonic() - _start_time
        _metrics_requests_total[(request.method, request.url.path, response.status_code)] += 1
        _metrics_durations[(request.method, request.url.path)].append(_elapsed)
        logger.info(
            "Request completed",
            extra={
                "request_id": request_id,
                "status_code": response.status_code,
                "duration_ms": round(_elapsed * 1000),
            },
        )
        return response

    # ----------------------------------------------------------------------
    # A2A v1.0 Signed Agent Card
    # ----------------------------------------------------------------------

    @app.get("/.well-known/agent-card.json")
    async def agent_card():
        signed = _agent_card_signer.sign_card(_agent_card_unsigned)
        return JSONResponse(signed)

    @app.get("/.well-known/public-key.pem")
    async def public_key():
        return Response(
            content=_agent_card_signer.get_public_key_pem(),
            media_type="application/x-pem-file",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    # ----------------------------------------------------------------------
    # A2A JSON-RPC endpoint (POST /)
    # ----------------------------------------------------------------------

    @app.post("/")
    async def jsonrpc_endpoint(request: Request):
        rid = getattr(request.state, "request_id", uuid.uuid4().hex)

        try:
            raw = await _read_body(request)
        except _RequestTooLargeError:
            logger.warning("Request too large", extra={"request_id": rid})
            return JSONResponse({"error": "Request too large"}, status_code=413)

        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            logger.warning("Parse error", extra={"request_id": rid, "error": str(exc)})
            return _rpc_error(_JSONRPC_PARSE_ERROR, "Parse error")

        if not isinstance(body, dict):
            return _rpc_error(_JSONRPC_INVALID_REQUEST, "Body must be a JSON object")

        if body.get("jsonrpc") != "2.0":
            return _rpc_error(_JSONRPC_INVALID_REQUEST, "Invalid JSON-RPC version")

        if not _check_version(request):
            return _rpc_error(
                _A2A_VERSION_NOT_SUPPORTED,
                f"A2A version is not supported. Expected '{_A2A_VERSION}'.",
                data=[
                    {
                        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                        "reason": "VERSION_NOT_SUPPORTED",
                        "domain": "a2a-protocol.org",
                        "metadata": {},
                    }
                ],
            )

        req_id = body.get("id", uuid.uuid4().hex)
        method = body.get("method", "")
        params = body.get("params", {})

        try:
            # Verify signature for ALL methods in strict mode
            if _strict_auth and request and raw:
                sender_url = request.headers.get("X-Sender-URL", "")
                sender_sig = request.headers.get("X-Sender-Signature", "")
                if not (sender_url and sender_sig):
                    return JSONResponse(
                        {"error": "Missing required signature headers (X-Sender-URL, X-Sender-Signature)"},
                        status_code=401,
                    )
                if not await _verify_sender_signature(request, raw):
                    return JSONResponse(
                        {"error": "Signature verification failed"},
                        status_code=401,
                    )

            if method == "SendMessage":
                return await _handle_send_message(params, rid, req_id, raw, request)
            elif method == "GetTask":
                return await _handle_get_task(params, req_id)
            elif method == "CancelTask":
                return await _handle_cancel_task(params, req_id)
            elif method == "setTaskPushNotification":
                return await _handle_set_push_notification(params, req_id)
            elif method == "getTaskPushNotification":
                return _handle_get_push_notification(params, req_id)
            else:
                logger.info("Method not found", extra={"request_id": rid, "method": method})
                return _rpc_error(_JSONRPC_METHOD_NOT_FOUND, f"Method not found: {method}", req_id)
        except Exception:
            logger.exception("JSON-RPC error", extra={"request_id": rid, "method": method})
            return _rpc_error(_JSONRPC_INTERNAL_ERROR, _SAFE_ERROR_MSG, req_id)

    # ----------------------------------------------------------------------
    # A2A REST endpoints
    # ----------------------------------------------------------------------

    @app.post("/message:send")
    async def rest_message_send(request: Request):
        rid = getattr(request.state, "request_id", uuid.uuid4().hex)
        if not _check_version(request):
            return JSONResponse({"error": "Unsupported A2A version"}, status_code=400)
        try:
            raw = await _read_body(request)
            body = json.loads(raw)
        except Exception:
            logger.exception("Invalid request body in /message:send")
            return JSONResponse({"error": "Invalid request"}, status_code=400)
        # OWASP guard is applied inside _handle_send_message
        result = await _handle_send_message(body, rid, "rest", raw, request)
        return result

    @app.get("/tasks/{task_id}")
    async def rest_get_task(task_id: str):
        task = await _get_task(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        return JSONResponse(_strip_internal(task))

    @app.post("/tasks/{task_id}:cancel")
    async def rest_cancel_task(task_id: str):
        task = await _get_task(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        current_state = task.get("status", {}).get("state", "")
        if current_state in ("COMPLETED", "FAILED", "CANCELED"):
            return JSONResponse({"error": "Cannot modify task in terminal state"}, status_code=400)
        await _update_task(task_id, "CANCELED")
        task = (await _get_task(task_id)) or task
        return JSONResponse(_strip_internal(task))

    @app.put("/tasks/{task_id}")
    async def rest_update_task(task_id: str, request: Request):
        """Update a task's metadata (e.g., callback URL)."""
        task = await _get_task(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)
        callback_url = body.get("callback_url")
        if callback_url and not _push_dispatch.register(task_id, callback_url):
            return JSONResponse({"error": "Callback URL rejected (SSRF protection)"}, status_code=400)
        if not memory._mock and callback_url:
            current_status = task.get("status", {}).get("state", "WORKING")
            await anyio.to_thread.run_sync(
                partial(memory.update_a2a_task, task_id, current_status, callback_url=callback_url),
            )
        task = (await _get_task(task_id)) or task
        return JSONResponse(_strip_internal(task))

    @app.delete("/tasks/{task_id}")
    async def rest_delete_task(task_id: str):
        """Delete a task (only terminal states: COMPLETED, FAILED, CANCELED)."""
        task = await _get_task(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        state = task.get("status", {}).get("state", "")
        if state not in ("COMPLETED", "FAILED", "CANCELED"):
            return JSONResponse({"error": "Only terminal tasks can be deleted"}, status_code=409)
        with _tasks_lock:
            _tasks.pop(task_id, None)
        if not memory._mock:
            try:
                await anyio.to_thread.run_sync(memory._a2a_store.delete_task, task_id)
            except Exception as exc:
                logger.warning("Failed to delete task from DB: %s", exc)
        _push_dispatch.unregister(task_id)
        logger.info("Task deleted", extra={"task_id": task_id})
        return JSONResponse({"deleted": task_id, "status": "ok"})

    # ----------------------------------------------------------------------
    # A2A Streaming endpoint (SSE)
    # ----------------------------------------------------------------------

    from starlette.responses import StreamingResponse

    @app.post("/message:sendStream")
    async def stream_message_send(request: Request):
        """Stream task lifecycle events via Server-Sent Events (A2A v1.0 streaming)."""
        rid = getattr(request.state, "request_id", uuid.uuid4().hex)
        if not _check_version(request):
            return JSONResponse({"error": "Unsupported A2A version"}, status_code=400)
        try:
            raw = await _read_body(request)
            body = json.loads(raw)
        except Exception:
            logger.exception("Invalid request body in /message:sendStream")
            return JSONResponse({"error": "Invalid request"}, status_code=400)

        task_id = uuid.uuid4().hex
        await _store_task(task_id, "SUBMITTED")

        async def event_generator():
            # Emit SUBMITTED event
            yield f"event: TaskStatusUpdate\ndata: {json.dumps({'task_id': task_id, 'status': 'SUBMITTED'})}\n\n"

            # Transition to WORKING
            await _update_task(task_id, "WORKING")
            yield f"event: TaskStatusUpdate\ndata: {json.dumps({'task_id': task_id, 'status': 'WORKING'})}\n\n"

            # Extract metadata before try block (fix M1: skill_id scope)
            message = body.get("message", body) if isinstance(body, dict) else {}
            parts = message.get("parts", []) if isinstance(message, dict) else []
            metadata = message.get("metadata", {}) if isinstance(message, dict) else {}
            text = ""
            for part in parts:
                t = part.get("text", "")
                if t:
                    text = t
                    break
            skill_id = metadata.get("skill", "")

            try:
                # ── OWASP ASI06 Guard: screen streaming message content ──
                try:
                    from bastion.guard import MemoryGuard

                    _guard = MemoryGuard()
                    for part in parts:
                        part_text = part.get("text", "")
                        if part_text:
                            guard_result = _guard.check(part_text)
                            if not guard_result.is_safe:
                                threat_details = [f.threat_type for f in guard_result.findings]
                                threat_msg = ", ".join(threat_details) or "injection detected"
                                await _update_task(task_id, "FAILED")
                                error_data = json.dumps(
                                    {
                                        "task_id": task_id,
                                        "status": "FAILED",
                                        "error": f"Blocked by security guard: {threat_msg}",
                                    }
                                )
                                yield f"event: TaskStatusUpdate\ndata: {error_data}\n\n"
                                yield "event: TaskComplete\ndata: {}\n\n"
                                return
                except Exception:
                    logger.warning("OWASP guard check failed in streaming (blocking)", exc_info=True)
                    await _update_task(task_id, "FAILED")
                    _err_data = json.dumps(
                        {
                            "task_id": task_id,
                            "status": "FAILED",
                            "error": "Blocked by security guard: check failed",
                        }
                    )
                    yield f"event: TaskStatusUpdate\ndata: {_err_data}\n\n"
                    yield "event: TaskComplete\ndata: {}\n\n"
                    return
                skill_params = dict(metadata.get("params", {})) if metadata.get("params") else {}
                if not skill_params and text:
                    skill_params = _infer_params(text, skill_id)

                method = skill_map.get(skill_id)

                if not method:
                    await _update_task(task_id, "FAILED")
                    yield (
                        f"event: TaskStatusUpdate\ndata: "
                        f"{json.dumps({'task_id': task_id, 'status': 'FAILED', 'error': 'Unknown skill'})}"
                        f"\n\n"
                    )
                    yield "event: TaskComplete\ndata: {}\n\n"
                    return

                yield (
                    f"event: TaskArtifactUpdate\ndata: "
                    f"{json.dumps({'task_id': task_id, 'artifact': {'parts': [{'text': f'Executing {skill_id}...'}]}})}"
                    f"\n\n"
                )

                result = await asyncio.wait_for(
                    anyio.to_thread.run_sync(_execute_skill, memory, method, skill_params),
                    timeout=_REQUEST_TIMEOUT_SECONDS,
                )
                parts_out = [{"text": json.dumps(result, default=str)}]
                await _update_task(task_id, "COMPLETED", [{"parts": parts_out}])
                yield (
                    f"event: TaskArtifactUpdate\ndata: "
                    f"{json.dumps({'task_id': task_id, 'artifact': {'parts': parts_out}})}"
                    f"\n\n"
                )
                yield (f"event: TaskStatusUpdate\ndata: {json.dumps({'task_id': task_id, 'status': 'COMPLETED'})}\n\n")

            except Exception:
                logger.exception("Streaming skill execution failed", extra={"request_id": rid, "skill": skill_id})
                await _update_task(task_id, "FAILED")
                _err_msg = json.dumps(
                    {
                        "task_id": task_id,
                        "status": "FAILED",
                        "error": "Skill execution failed (see server logs)",
                    }
                )
                yield f"event: TaskStatusUpdate\ndata: {_err_msg}\n\n"

            yield "event: TaskComplete\ndata: {}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # ----------------------------------------------------------------------
    # Bastion-specific endpoints
    # ----------------------------------------------------------------------

    @app.get("/healthz")
    async def healthz():
        return JSONResponse({"status": "ok"})

    # -- Task cleanup: mark orphaned non-terminal tasks as failed --------
    _task_stale_timeout = 3600  # 1 hour

    async def _cleanup_orphaned_tasks() -> None:
        """Periodically mark stale non-terminal tasks as failed."""
        if memory._mock:
            return
        try:
            await anyio.to_thread.run_sync(
                partial(
                    memory.update_a2a_task,
                    None,  # agent_id — not needed for this query
                    None,  # status
                    cleanup_stale=True,
                    stale_timeout=_task_stale_timeout,
                )
            )
        except Exception:
            logger.debug("Orphaned task cleanup failed (non-critical)")

    @app.get("/readyz")
    async def readyz():
        try:
            connected = await anyio.to_thread.run_sync(lambda: memory.is_connected)
            if connected:
                return JSONResponse({"status": "ok"})
            return JSONResponse({"status": "not ready", "detail": "database not connected"}, status_code=503)
        except Exception:
            logger.warning("Readiness check failed", exc_info=True)
            return JSONResponse({"status": "not ready"}, status_code=503)

    @app.get("/metrics")
    async def metrics():
        nonlocal _metrics_requests_total, _metrics_durations
        nonlocal _metrics_rate_limit_hits, _metrics_start_time
        lines = [
            "# HELP bastion_requests_total Total HTTP requests by method, path, and status",
            "# TYPE bastion_requests_total counter",
        ]
        for (method, path, status), count in sorted(_metrics_requests_total.items()):
            lines.append(f'bastion_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')
        lines.append("")
        lines.append("# HELP bastion_request_duration_seconds Request duration percentiles (sampled last 500 per path)")
        lines.append("# TYPE bastion_request_duration_seconds summary")
        for (method, path), durations in sorted(_metrics_durations.items()):
            if not durations:
                continue
            dur_sorted = sorted(durations)
            n = len(dur_sorted)
            for p, label in [(50, "0.5"), (90, "0.9"), (95, "0.95"), (99, "0.99")]:
                idx = int(n * p / 100)
                tmpl = 'bastion_request_duration_seconds{method="%s",path="%s",quantile="%s"} %.6f'
                lines.append(tmpl % (method, path, label, dur_sorted[idx]))
            tmpl_sum = 'bastion_request_duration_seconds_sum{method="%s",path="%s"} %.6f'
            lines.append(tmpl_sum % (method, path, sum(durations)))
            tmpl_cnt = 'bastion_request_duration_seconds_count{method="%s",path="%s"} %d'
            lines.append(tmpl_cnt % (method, path, n))
        lines.append("")
        lines.append("# HELP bastion_rate_limit_hits_total Total rate-limited requests")
        lines.append("# TYPE bastion_rate_limit_hits_total counter")
        lines.append(f"bastion_rate_limit_hits_total {_metrics_rate_limit_hits}")
        lines.append("")
        lines.append("# HELP bastion_up Server uptime in seconds")
        lines.append("# TYPE bastion_up gauge")
        lines.append(f"bastion_up {time.monotonic() - _metrics_start_time:.0f}")
        lines.append("")
        return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    # ----------------------------------------------------------------------
    # Handler functions (closure captures memory, skill_map, _store_task, _get_task)
    # ----------------------------------------------------------------------

    def _rpc_error(code: int, message: str, req_id: Any = None, data: Any = None) -> JSONResponse:
        body: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": code, "message": message},
        }
        if data:
            body["error"]["data"] = data
        return JSONResponse(body)

    def _rpc_result(result: Any, req_id: Any = None) -> JSONResponse:
        return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})

    def _strip_internal(task: dict) -> dict:
        return {k: v for k, v in task.items() if not k.startswith("_")}

    def _infer_params(text: str, skill_id: str = "") -> dict[str, Any]:
        if not text:
            return {}
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
        # Detect intent from natural language
        lower = text.lower()
        graph_signals = ("graph", "traverse", "relation", "hop", "entity", "what is", "tell me about")
        search_signals = ("search", "find", "query", "look up", "retrieve", "what do you know about", "show me")
        if skill_id == "graph_query" or any(signal in lower for signal in graph_signals):
            return {"start_entity": text, "hops": 2}
        if any(signal in lower for signal in search_signals):
            return {"query": text}
        return {"content": text}

    async def _handle_send_message(
        params: dict[str, Any],
        rid: str,
        req_id: Any,
        raw_body: bytes = b"",
        request: Request | None = None,
    ) -> JSONResponse:
        # Idempotency key check
        idempotency_key = request.headers.get("X-Idempotency-Key", "") if request else ""
        if idempotency_key:
            cached = await _check_idempotency(idempotency_key)
            if cached:
                logger.info("Idempotency hit", extra={"key": idempotency_key, "request_id": rid})
                return _rpc_result(cached["result"], cached.get("id"))

        # Input validation
        message = params.get("message", params) if isinstance(params, dict) else {}
        parts = message.get("parts", []) if isinstance(message, dict) else []
        if not parts:
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "Message must have at least one part", req_id)

        # Verify sender signature
        if request and raw_body:
            sender_url = request.headers.get("X-Sender-URL", "")
            sender_sig = request.headers.get("X-Sender-Signature", "")

            if _strict_auth and not (sender_url and sender_sig):
                logger.warning(
                    "Strict auth: missing signature headers",
                    extra={"request_id": rid, "sender_url": sender_url},
                )
                return JSONResponse(
                    {"error": "Missing required signature headers (X-Sender-URL, X-Sender-Signature)"},
                    status_code=401,
                )

            if sender_url and sender_sig:
                try:
                    verified = await _verify_sender_signature(request, raw_body)
                    if not verified:
                        logger.warning(
                            "Signature verification failed",
                            extra={"request_id": rid, "sender_url": sender_url},
                        )
                        return _rpc_error(
                            _JSONRPC_INTERNAL_ERROR,
                            "Signature verification failed: invalid or missing sender signature",
                            req_id,
                        )
                except Exception:
                    logger.exception("Signature verification error", extra={"request_id": rid})
                    return _rpc_error(
                        _JSONRPC_INTERNAL_ERROR,
                        "Signature verification error",
                        req_id,
                    )

        message = params.get("message", params) if isinstance(params, dict) else {}
        parts = message.get("parts", [])
        metadata = message.get("metadata", {}) or {}

        skill_id = metadata.get("skill", "")
        skill_params = dict(metadata.get("params", {}))

        text = ""
        for part in parts:
            t = part.get("text", "")
            if t:
                text = t
                break

        method = skill_map.get(skill_id)

        if not method:
            task_id = uuid.uuid4().hex
            task = await _store_task(task_id, "FAILED")
            _maybe_notify_push(task_id, "FAILED")
            return _rpc_result(_strip_internal(task), req_id)

        # -- RBAC: check role permission for this skill --
        required_role = _skill_roles.get(skill_id, "reader")
        # Resolve role from CALLER's token, not the server's key
        caller_token = ""
        if request:
            auth_header = request.headers.get("Authorization", "")
            caller_token = auth_header.removeprefix("Bearer ") if auth_header.startswith("Bearer ") else ""
        caller_role = _resolve_role(caller_token) if caller_token else ("reader" if not _api_key else "reader")
        # Warn when running without API key (dev mode only — not for production)
        if not _api_key and not caller_token:
            logger.debug("No API key configured — unauthenticated requests treated as reader (dev mode)")
        required_level = _role_hierarchy.get(required_role, 0)
        caller_level = _role_hierarchy.get(caller_role, 0)
        if caller_level < required_level:
            task_id = uuid.uuid4().hex
            await _store_task(task_id, "FAILED")
            return _rpc_error(
                _JSONRPC_INVALID_PARAMS,
                f"Insufficient permissions: skill '{skill_id}' requires "
                f"'{required_role}' role, caller has '{caller_role}'",
                req_id,
            )

        # ── Spend check: enforce per-agent daily budgets ──
        caller_agent = metadata.get("agent_id", "unknown")
        spend_category = "store" if skill_id in ("memory_store", "ltm_store_analysis") else "search"
        budget_check = _spend_manager.check_and_increment(caller_agent, spend_category, 1)
        if not budget_check["allowed"]:
            task_id = uuid.uuid4().hex
            await _store_task(task_id, "FAILED")
            return _rpc_error(
                _JSONRPC_INTERNAL_ERROR,
                f"Budget exceeded for {spend_category}: {budget_check['reason']}",
                req_id,
            )

        # Create task ID BEFORE guard check so guard can reference it on failure
        task_id = uuid.uuid4().hex
        await _store_task(task_id, "WORKING")

        # ── OWASP ASI06 Guard: screen incoming message before execution ──
        try:
            from bastion.guard import MemoryGuard

            _guard = MemoryGuard()
            for part in parts:
                part_text = part.get("text", "")
                if part_text:
                    guard_result = _guard.check(part_text)
                    if not guard_result.is_safe:
                        threat_details = [f.threat_type for f in guard_result.findings]
                        logger.warning(
                            "OWASP guard blocked A2A message content",
                            extra={
                                "request_id": rid,
                                "threats": threat_details,
                                "sender_url": request.headers.get("X-Sender-URL", "") if request else "",
                            },
                        )
                        await _update_task(task_id, "FAILED")
                        return _rpc_error(
                            _JSONRPC_INVALID_PARAMS,
                            f"Message blocked by security guard: {', '.join(threat_details) or 'injection detected'}",
                            req_id,
                        )
        except Exception as exc:
            logger.warning("OWASP guard check failed (blocking): %s", exc)
            await _update_task(task_id, "FAILED")
            return _rpc_error(
                _JSONRPC_INTERNAL_ERROR,
                "Message blocked: security guard check failed",
                req_id,
            )

        if not skill_params:
            skill_params = _infer_params(text, skill_id)

        try:
            result = await anyio.to_thread.run_sync(_execute_skill, memory, method, skill_params)
            parts_out = [{"text": json.dumps(result, default=str)}]
            await _update_task(task_id, "COMPLETED", [{"parts": parts_out}])
        except Exception:
            logger.exception("Skill execution failed", extra={"request_id": rid, "skill": skill_id})
            await _update_task(task_id, "FAILED")

        task = (await _get_task(task_id)) or _tasks.get(task_id, {"id": task_id, "status": {"state": "FAILED"}})
        result = _strip_internal(task)
        if idempotency_key:
            _set_idempotency(idempotency_key, {"id": req_id, "result": result, "_ts": time.time()})
        return _rpc_result(result, req_id)

    async def _handle_get_task(params: dict[str, Any], req_id: Any) -> JSONResponse:
        if isinstance(params, list):
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "params must be an object", req_id)
        task_id = params.get("id", "") if isinstance(params, dict) else ""
        task = await _get_task(task_id)
        if not task:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"Task not found: {task_id}", req_id)
        return _rpc_result(_strip_internal(task), req_id)

    async def _handle_cancel_task(params: dict[str, Any], req_id: Any) -> JSONResponse:
        if isinstance(params, list):
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "params must be an object", req_id)
        task_id = params.get("id", "") if isinstance(params, dict) else ""
        task = await _get_task(task_id)
        if not task:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"Task not found: {task_id}", req_id)
        current_state = task.get("status", {}).get("state", "")
        if current_state in ("COMPLETED", "FAILED", "CANCELED"):
            return _rpc_error(
                _JSONRPC_INVALID_REQUEST,
                f"Cannot cancel task in terminal state: {current_state}",
                req_id,
            )
        await _update_task(task_id, "CANCELED")
        task = (await _get_task(task_id)) or task
        return _rpc_result(_strip_internal(task), req_id)

    async def _handle_set_push_notification(params: dict[str, Any], req_id: Any) -> JSONResponse:
        task_id = params.get("id", "")
        if not task_id:
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "Missing task id", req_id)
        callback_url = params.get("url", "")
        if not callback_url:
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "Missing callback url", req_id)
        if not _push_dispatch.register(task_id, callback_url):
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "Callback URL rejected (SSRF protection)", req_id)
        if not memory._mock:
            task = await _get_task(task_id)
            current_status = (task.get("status", {}).get("state", "WORKING")) if task else "WORKING"
            await anyio.to_thread.run_sync(
                partial(memory.update_a2a_task, task_id, current_status, callback_url=callback_url),
            )
        logger.info("Push notification registered", extra={"task_id": task_id, "callback_url": callback_url})
        return _rpc_result({"task_id": task_id, "url": callback_url}, req_id)

    def _handle_get_push_notification(params: dict[str, Any], req_id: Any) -> JSONResponse:
        task_id = params.get("id", "")
        if not task_id:
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "Missing task id", req_id)
        url = _push_dispatch.get_callback_url(task_id)
        if not url:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"No push notification for task: {task_id}", req_id)
        return _rpc_result({"task_id": task_id, "url": url}, req_id)

    return app, memory


# ---------------------------------------------------------------------------
# Request body reader
# ---------------------------------------------------------------------------


class _RequestTooLargeError(Exception):
    pass


async def _read_body(request: Request, max_bytes: int = _MAX_REQUEST_BYTES) -> bytes:
    content_length = request.headers.get("content-length")
    try:
        if content_length and int(content_length) > max_bytes:
            raise _RequestTooLargeError()
    except (ValueError, TypeError):
        raise _RequestTooLargeError()
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > max_bytes:
            raise _RequestTooLargeError()
        chunks.append(chunk)
    return b"".join(chunks)


# ---------------------------------------------------------------------------
# Skill execution (standalone for testability)
# ---------------------------------------------------------------------------


def _execute_skill(mem: Any, method: str, params: dict[str, Any]) -> Any:
    # OWASP ASI06 guard screening for content-bearing operations
    if method in ("store", "resolve_conflict", "broadcast", "memory_correct"):
        _content_to_check = ""
        if method == "store":
            _content_to_check = params.get("content") or params.get("text") or ""
        elif method == "resolve_conflict":
            _content_to_check = (params.get("fact_a") or "") + " " + (params.get("fact_b") or "")
        elif method == "broadcast":
            _payload = params.get("payload", {})
            if isinstance(_payload, dict):
                _content_to_check = json.dumps(_payload, default=str)
            else:
                _content_to_check = str(_payload)
        elif method == "memory_correct":
            _content_to_check = params.get("new_content") or ""
        if _content_to_check:
            try:
                from bastion.guard import MemoryGuard as BastionGuard

                _guard = BastionGuard()
                _guard_result = _guard.check(_content_to_check)
                if not _guard_result.is_safe:
                    findings = [f.__dict__ for f in _guard_result.findings]
                    return {"error": "Blocked by OWASP ASI06 guard", "findings": findings}
            except Exception:
                logger.warning("Guard screening failed — blocking operation for safety", exc_info=True)
                return {"error": "Blocked: security guard check failed. Operation aborted for safety."}

    if method == "store":
        mtype = params.get("memory_type", "fact")
        content = params.get("content") or params.get("text")
        if not content:
            return {"error": "Missing required parameter: content or text"}
        meta = params.get("metadata")
        expires = params.get("expires_in_seconds")
        return mem.store(mtype, content, meta, expires).to_dict()
    elif method == "search":
        query = params.get("query") or params.get("text")
        if not query:
            return {"error": "Missing required parameter: query or text"}
        k = max(1, min(int(params.get("k", 5)), 100))
        threshold = max(0.0, min(float(params.get("threshold", 0.8)), 1.0))
        mtype = params.get("memory_type")
        ns_scope = params.get("namespace_scope", "own")
        results = mem.search(query, k=k, threshold=threshold, memory_type=mtype, namespace_scope=ns_scope)
        return [r.to_dict() for r in results]
    elif method == "memory_timetravel":
        timestamp = params.get("timestamp", "")
        if not timestamp:
            return {"error": "Missing required parameter: timestamp"}
        agent_id = params.get("agent_id")
        results = mem.get_at_time(timestamp, agent_id)
        return [r.to_dict() for r in results]
    elif method == "memory_audit":
        agent_id = params.get("agent_id")
        entries = mem.audit(agent_id)
        return [e.to_dict() for e in entries]
    elif method == "memory_heal":
        agent_id = params.get("agent_id")
        return mem.heal(agent_id)
    elif method == "memory_delete":
        memory_id = params.get("memory_id", "")
        if not memory_id:
            return {"error": "Missing required parameter: memory_id"}
        confirmed = params.get("confirmed", False)
        if not confirmed:
            return {"error": "Deletion requires confirmed=true"}
        mem._delete_by_id(memory_id)
        return {"deleted": memory_id, "status": "ok"}
    elif method == "memory_pin":
        content = params.get("content", "")
        if not content:
            return {"error": "Missing required parameter: content"}
        memory_type = params.get("memory_type", "safety_rule")
        pin_priority = int(params.get("pin_priority", 2))
        meta = params.get("metadata")
        record = mem.pin(memory_type, content, pin_priority, meta)
        return record.to_dict()
    elif method == "memory_get_pinned":
        min_priority = int(params.get("min_priority", 1))
        results = mem.get_pinned(min_priority)
        return [r.to_dict() for r in results]
    elif method == "memory_list":
        memory_type = params.get("memory_type")
        limit = max(1, min(int(params.get("limit", 50)), 500))
        cursor = params.get("cursor")
        results = mem.list_memories(memory_type, limit, cursor)
        return [r.to_dict() for r in results]
    elif method == "memory_correct":
        memory_id = params.get("memory_id", "")
        new_content = params.get("new_content", "")
        if not memory_id:
            return {"error": "Missing required parameter: memory_id"}
        if not new_content:
            return {"error": "Missing required parameter: new_content"}
        meta = params.get("metadata")
        record = mem.correct_memory(memory_id, new_content, meta)
        if record is None:
            return {"error": f"Memory {memory_id} not found"}
        return record.to_dict()
    elif method == "memory_health":
        return mem.memory_health()
    elif method == "memory_apply_patch":
        memory_id = params.get("memory_id", "")
        patch_ops = params.get("patch_ops", [])
        if not memory_id:
            return {"error": "Missing required parameter: memory_id"}
        if not patch_ops:
            return {"error": "Missing required parameter: patch_ops"}
        result = mem.apply_patch(memory_id, patch_ops)
        if result is None:
            return {"error": f"Memory {memory_id} not found"}
        return result
    elif method == "resolve_conflict":
        from bastion.groq_callback import groq_merge

        fact_a = params.get("fact_a", "")
        fact_b = params.get("fact_b", "")
        context = params.get("context")
        contents = [f for f in (fact_a, fact_b) if f]
        if not contents:
            return {"error": "Missing fact_a or fact_b"}
        merged = groq_merge(contents, context or "a2a_conflict")
        return {"merged": merged, "facts": contents}
    elif method == "ltm_check_reuse":
        from bastion.ltm_gateway import LTMMemoryGateway

        query = params.get("query", "")
        if not query:
            return {"error": "Missing required parameter: query"}
        threshold = float(params.get("threshold", 0.80))
        analysis_type = params.get("analysis_type")
        gateway = LTMMemoryGateway(mem, reuse_threshold=threshold)
        result = gateway.check_reuse(query, threshold, analysis_type)
        if result is None:
            return {
                "reuse_found": False,
                "query": query[:200],
                "threshold": threshold,
                "recommendation": "run_workflow",
            }
        return {"reuse_found": True, **result.to_dict()}
    elif method == "ltm_store_analysis":
        from bastion.ltm_gateway import LTMMemoryGateway

        query = params.get("query", "")
        result_text = params.get("result", "")
        if not query:
            return {"error": "Missing required parameter: query"}
        if not result_text:
            return {"error": "Missing required parameter: result"}
        analysis_type = params.get("analysis_type", "analysis")
        meta = params.get("metadata")
        tokens_used = params.get("tokens_used")
        gateway = LTMMemoryGateway(mem)
        store_result = gateway.store_analysis(query, result_text, analysis_type, meta, tokens_used)
        return store_result.to_dict()
    elif method == "ltm_invalidate":
        from bastion.ltm_gateway import LTMMemoryGateway

        query = params.get("query", "")
        if not query:
            return {"error": "Missing required parameter: query"}
        reason = params.get("reason", "outdated")
        gateway = LTMMemoryGateway(mem)
        return gateway.invalidate(query, reason)
    elif method == "detect_contradictions":
        from bastion.contradiction import ContradictionDetector

        memory_id = params.get("memory_id", "")
        if not memory_id:
            return {"error": "Missing required parameter: memory_id"}
        record = mem.get_memory(memory_id)
        if record is None:
            return {"error": f"Memory {memory_id} not found"}
        detector = ContradictionDetector(mem)
        result = detector.scan_after_store(record)
        return result.to_dict()
    elif method == "scan_all_contradictions":
        from bastion.contradiction import ContradictionDetector

        detector = ContradictionDetector(mem)
        results = detector.scan_all()
        return [r.to_dict() for r in results]
    elif method == "dream":
        from bastion.dreaming import MemoryDreamer

        lookback_hours = max(1, min(int(params.get("lookback_hours", 24)), 168))
        dreamer = MemoryDreamer(mem, lookback_hours=lookback_hours)
        journal = dreamer.dream()
        return journal.to_dict()
    elif method == "dream_history":
        from bastion.dreaming import MemoryDreamer

        dreamer = MemoryDreamer(mem)
        return dreamer.get_dream_history()
    elif method == "detect_observations":
        from bastion.observations import ObservationDetector

        detector = ObservationDetector(mem)
        report = detector.detect()
        return report.to_dict()
    elif method == "multi_signal_search":
        from bastion.retrieval import MultiSignalRetriever

        query = params.get("query", "")
        if not query:
            return {"error": "Missing required parameter: query"}
        k = max(1, min(int(params.get("k", 10)), 500))
        threshold = max(0.0, min(float(params.get("threshold", 0.3)), 1.0))
        mtype = params.get("memory_type")
        retriever = MultiSignalRetriever(mem)
        results = retriever.search(query, k, threshold, mtype)
        return {
            "results": [r.to_dict() for r in results],
            "total": len(results),
            "signals": ["vector", "keyword", "entity", "temporal"],
        }
    elif method == "context_pack":
        from bastion.context_budget import ContextBudgetManager

        budget_tokens = max(1, int(params.get("budget_tokens", 4000)))
        query = params.get("query")
        packer = ContextBudgetManager(mem)
        result = packer.pack(budget_tokens, query)
        return result.to_dict()
    elif method == "graph_query":
        start = params.get("start_entity", "")
        path = params.get("relation_path")
        hops = int(params.get("hops", 2))
        return mem.graph_query(start, path, hops)
    elif method == "reinforce":
        mid = params.get("memory_id", "")
        success = bool(params.get("success", True))
        return {"success": mem.reinforce(mid, success)}
    elif method == "broadcast":
        event_type = params.get("event_type", params.get("type", "event"))
        payload = params.get("payload", {})
        ns = params.get("namespace")
        msg = mem.broadcast(event_type, payload, ns)
        return msg.to_dict()
    elif method == "agent_schema":
        table = params.get("table")
        if mem._mock:
            mock_tables = {
                "agent_memory": {
                    "columns": [
                        "memory_id",
                        "agent_id",
                        "memory_type",
                        "content",
                        "embedding",
                        "metadata",
                        "created_at",
                        "importance_score",
                        "trust_level",
                    ],
                },
                "agent_audit": {"columns": ["audit_id", "agent_id", "action", "details", "recorded_at"]},
                "agent_entities": {"columns": ["entity_id", "agent_id", "entity_type", "name", "attributes"]},
                "agent_relations": {
                    "columns": ["relation_id", "source_entity_id", "target_entity_id", "relation_type"]
                },
            }
            if table:
                return {"table": table, "columns": mock_tables.get(table, {}).get("columns", [])}
            return {"tables": list(mock_tables.keys())}
        else:
            pool = mem.get_pool()
            conn = pool.acquire(timeout=10.0)
            try:
                with conn.cursor() as cur:
                    if table:
                        cur.execute(
                            "SELECT column_name, data_type, is_nullable "
                            "FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position",
                            (table,),
                        )
                        rows = cur.fetchall()
                        return {
                            "table": table,
                            "columns": [{"name": r[0], "type": r[1], "nullable": r[2] == "YES"} for r in rows],
                        }
                    else:
                        cur.execute(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' ORDER BY table_name"
                        )
                        return {"tables": [r[0] for r in cur.fetchall()]}
            finally:
                pool.release(conn)
    elif method == "a2a_bridge":
        agent_id = params.get("agent_id", "bastion-agent")
        from bastion.config import VERSION

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
                "streaming": True,
                "push_notifications": True,
            },
            "protocol": "a2a",
            "provider": {"organization": "Bastion", "url": "https://github.com/dgboy-ai/Bastion"},
        }
    return {"error": f"Unknown method: {method}"}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main():
    _configure_logging()
    import uvicorn

    mock = "--mock" in sys.argv or os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")
    port = int(os.environ.get("A2A_PORT", os.environ.get("PORT", "9998")))
    host = os.environ.get("A2A_HOST", "0.0.0.0")

    app, memory = create_a2a_server(mock=mock, host=host, port=port)

    from bastion.push_dispatcher import get_dispatcher as _get_dispatcher

    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_config=None))

    def _shutdown(signum=None, frame=None):
        logger.info("Shutdown signal received", extra={"signal": str(signum)})
        server.should_exit = True

    # Cross-platform signal handling
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _shutdown)
        signal.signal(signal.SIGINT, _shutdown)
    else:
        # Windows: SIGBREAK is the equivalent of SIGTERM for console apps
        signal.signal(signal.SIGBREAK, _shutdown)
        signal.signal(signal.SIGINT, _shutdown)

    logger.info("Bastion A2A server starting", extra={"host": host, "port": port, "mock": mock})
    logger.info("Agent Card available", extra={"url": f"http://{host}:{port}/.well-known/agent-card.json"})
    try:
        server.run()
    finally:
        try:
            _dispatcher = _get_dispatcher()
            _dispatcher.close()
            _dispatcher.wait_pending(timeout=5.0)
        except Exception:
            logger.exception("Error closing push dispatcher during shutdown")
        try:
            memory.close()
        except Exception:
            logger.exception("Error closing memory connection during shutdown")
        logger.info("Bastion A2A server shut down")


if __name__ == "__main__":
    main()
