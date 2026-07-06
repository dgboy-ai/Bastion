"""
Bastion A2A Server — Agent-to-Agent Protocol v1.0 Implementation

Implements the A2A agent card discovery and JSON-RPC task lifecycle
directly over HTTP. No SDK dependency at runtime (self-contained).

Usage:
    python -m bastion.a2a_server
    BASTION_CONN=postgresql://... python -m bastion.a2a_server
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
import signal
import sys
import time
import uuid
from collections import defaultdict, deque
from typing import Any

_SAFE_ERROR_MSG = "Internal server error (see server logs for details)"
_MAX_REQUEST_BYTES = 1_048_576  # 1 MiB
_TASK_TTL_SECONDS = 300  # completed/failed tasks expire after 5 minutes
_MAX_TASKS = 10_000
_ORPHAN_TASK_TTL_SECONDS = 1800  # abandoned working tasks expire after 30 minutes
_RATE_LIMIT_WINDOW = 60  # seconds
_RATE_LIMIT_MAX = 600  # requests per window per IP
_REQUEST_TIMEOUT_SECONDS = 60  # max request processing time

# ---------------------------------------------------------------------------
# Structured logging
# ---------------------------------------------------------------------------

class _JsonFormatter(logging.Formatter):
    """Outputs JSON-structured log lines (one object per line)."""

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


logger = logging.getLogger("bastion-a2a")

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse, Response
    from pydantic import BaseModel
except ImportError:
    FastAPI = None  # type: ignore


# ---------------------------------------------------------------------------
# Streaming body reader with size enforcement
# ---------------------------------------------------------------------------

class _RequestTooLargeError(Exception):
    pass


async def _read_body(request: Request, max_bytes: int = _MAX_REQUEST_BYTES) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
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
# Agent Card (A2A v1.0 spec)
# ---------------------------------------------------------------------------


class AgentSkillModel(BaseModel):
    id: str = ""
    name: str = ""
    description: str = ""
    tags: list[str] = []
    examples: list[str] = []


class AgentCapabilitiesModel(BaseModel):
    streaming: bool = True


class AgentCardModel(BaseModel):
    model_config = {"protected_namespaces": ()}
    protocolVersion: str = "1.0"  # type: ignore  # noqa: N815
    name: str = "Bastion Memory Agent"
    description: str = "A2A-compliant memory agent with hash-chain integrity and C-SPANN vectors."
    url: str = ""
    version: str = "0.3.0"
    capabilities: AgentCapabilitiesModel = AgentCapabilitiesModel()
    skills: list[AgentSkillModel] = []

# ---------------------------------------------------------------------------
# Server factory
# ---------------------------------------------------------------------------

def create_a2a_server(
    connection_string: str | None = None,
    mock: bool | None = None,
    host: str = "0.0.0.0",
    port: int = 9998,
) -> tuple[FastAPI, Any]:
    if FastAPI is None:
        raise ImportError("fastapi is required; pip install fastapi uvicorn")

    from bastion.memory import BastionMemory

    _mock = mock if mock is not None else os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")
    conn = connection_string or os.environ.get("BASTION_CONN", "")
    agent_id = os.environ.get("BASTION_AGENT_ID", "bastion-a2a")

    if not _mock and conn and "connect_timeout" not in conn:
        sep = "&" if "?" in conn else "?"
        conn = f"{conn}{sep}connect_timeout=10"
    try:
        memory = BastionMemory(agent_id, conn, mock=_mock)
    except Exception:
        logger.exception("Failed to create BastionMemory with real DB, falling back to mock",
                         extra={"agent_id": agent_id})
        memory = BastionMemory(agent_id, "", mock=True)

    base_url = os.environ.get("A2A_BASE_URL", f"http://{host}:{port}")

    card = AgentCardModel(
        name="Bastion Memory Agent",
        description="A2A-compliant memory agent with hash-chain integrity, "
        "C-SPANN vectors, knowledge graph, and time travel.",
        url=base_url,
        version="0.3.0",
        capabilities=AgentCapabilitiesModel(streaming=False),
        skills=[
            AgentSkillModel(
                id="memory_store",
                name="Store Agent Memory",
                description="Store a memory with SHA-256 hash-chain integrity and C-SPANN vector indexing.",
                tags=["memory", "storage", "hash-chain"],
                examples=["Store that the user prefers Python over TypeScript"],
            ),
            AgentSkillModel(
                id="memory_search",
                name="Search Agent Memories",
                description="Semantic vector search across agent memories with cognitive decay weighting.",
                tags=["memory", "search", "vector", "c-spann"],
                examples=["Find memories about project architecture decisions"],
            ),
            AgentSkillModel(
                id="graph_query",
                name="Knowledge Graph Query",
                description="Traverse the knowledge graph with multi-hop BFS starting from an entity.",
                tags=["graph", "knowledge", "traversal"],
                examples=["Find what technologies Divyansh's projects use"],
            ),
            AgentSkillModel(
                id="reinforce",
                name="Reinforce Memory",
                description="Boost a memory's importance score based on successful retrieval.",
                tags=["memory", "decay", "reinforcement"],
                examples=["Reinforce memory abc-123 after successful use"],
            ),
            AgentSkillModel(
                id="broadcast",
                name="Broadcast to Namespace",
                description="Send an event message to all agents in the same namespace.",
                tags=["communication", "namespace", "a2a"],
                examples=["Broadcast task_complete event to project-alice agents"],
            ),
        ],
    )

    skill_map = {
        "memory_store": "store",
        "memory_search": "search",
        "graph_query": "graph_query",
        "reinforce": "reinforce",
        "broadcast": "broadcast",
    }

    _tasks: dict[str, dict] = {}
    _rate_buckets: dict[str, list[float]] = defaultdict(list)
    _rate_checks = 0
    _metrics_requests_total: dict[tuple[str, str, int], int] = defaultdict(int)
    _metrics_durations: dict[tuple[str, str], deque[float]] = defaultdict(lambda: deque(maxlen=500))
    _metrics_rate_limit_hits = 0
    _metrics_tasks_evicted = 0
    _metrics_start_time = time.monotonic()

    def _check_rate_limit(client_ip: str) -> bool:
        nonlocal _rate_checks
        now = time.time()
        window_start = now - _RATE_LIMIT_WINDOW
        bucket = _rate_buckets[client_ip]
        while bucket and bucket[0] < window_start:
            bucket.pop(0)
        if len(bucket) >= _RATE_LIMIT_MAX:
            return False
        bucket.append(now)

        _rate_checks += 1
        if _rate_checks % 1000 == 0:
            stale = [ip for ip, ts in _rate_buckets.items() if not ts]
            for ip in stale:
                del _rate_buckets[ip]
        return True

    def _evict_stale_tasks() -> int:
        now = time.monotonic()
        stale = []
        for tid, t in list(_tasks.items()):
            dm = t.get("_dm")
            if dm is not None:
                stale_at = dm + _TASK_TTL_SECONDS
            else:
                cm = t.get("_cm", 0)
                stale_at = cm + _ORPHAN_TASK_TTL_SECONDS
            if stale_at < now:
                stale.append(tid)
        for tid in stale:
            _tasks.pop(tid, None)
        return len(stale)

    def _store_task(tid: str, task: dict) -> None:
        nonlocal _metrics_tasks_evicted
        evicted_count = _evict_stale_tasks()
        _metrics_tasks_evicted += evicted_count
        if len(_tasks) >= _MAX_TASKS:
            oldest = min(_tasks, key=lambda k: _tasks[k].get("_created_at", 0))
            _tasks.pop(oldest, None)
            _metrics_tasks_evicted += 1
        _tasks[tid] = task

    app = FastAPI(title="Bastion A2A Server", version="0.3.0")
    cors_origins = [o for o in os.environ.get("CORS_ALLOW_ORIGINS", "*").split(",") if o]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def _request_id_middleware(request: Request, call_next):
        nonlocal _metrics_requests_total, _metrics_durations, _metrics_rate_limit_hits
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
        request.state.request_id = request_id

        forwarded = request.headers.get("X-Forwarded-For", "")
        client_ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
        if not _check_rate_limit(client_ip):
            _metrics_rate_limit_hits += 1
            logger.warning("Rate limit exceeded", extra={"request_id": request_id, "client_ip": client_ip})
            return JSONResponse({"error": "Too many requests"}, status_code=429)

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

    @app.get("/healthz")
    async def healthz():
        return JSONResponse({"status": "ok"})

    @app.get("/readyz")
    async def readyz():
        try:
            if memory.is_connected:
                return JSONResponse({"status": "ok"})
            return JSONResponse({"status": "not ready", "detail": "database not connected"}, status_code=503)
        except Exception:
            logger.warning("Readiness check failed", exc_info=True)
            return JSONResponse({"status": "not ready"}, status_code=503)

    @app.get("/.well-known/agent-card.json")
    async def get_agent_card(request: Request):
        base = str(request.base_url).rstrip("/")
        card_data = card.model_dump()
        card_data["url"] = base
        return JSONResponse(card_data)

    @app.get("/metrics")
    async def metrics():
        nonlocal _metrics_requests_total, _metrics_durations
        nonlocal _metrics_rate_limit_hits, _metrics_tasks_evicted, _metrics_start_time
        lines = [
            "# HELP bastion_requests_total Total HTTP requests by method, path, and status",
            "# TYPE bastion_requests_total counter",
        ]
        for (method, path, status), count in sorted(_metrics_requests_total.items()):
            lines.append(f'bastion_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')
        lines.append("")
        lines.append("# HELP bastion_request_duration_seconds Request duration percentiles (sampled last 500 per path)",
                     )
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
        lines.append("# HELP bastion_rate_limit_hits_total Total rate-limited requests",
                     )
        lines.append("# TYPE bastion_rate_limit_hits_total counter")
        lines.append(f"bastion_rate_limit_hits_total {_metrics_rate_limit_hits}")
        lines.append("")
        lines.append("# HELP bastion_tasks_evicted_total Total tasks evicted from store",
                     )
        lines.append("# TYPE bastion_tasks_evicted_total counter")
        lines.append(f"bastion_tasks_evicted_total {_metrics_tasks_evicted}")
        lines.append("")
        lines.append("# HELP bastion_up Server uptime in seconds")
        lines.append("# TYPE bastion_up gauge")
        lines.append(f"bastion_up {time.monotonic() - _metrics_start_time:.0f}")
        lines.append("")
        return Response(content="\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")

    @app.post("/")
    async def jsonrpc_endpoint(request: Request):
        rid = getattr(request.state, "request_id", uuid.uuid4().hex)
        try:
            raw = await _read_body(request)
        except _RequestTooLargeError:
            logger.warning("Request too large", extra={"request_id": rid})
            return JSONResponse(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Request too large"}},
                status_code=413,
            )

        try:
            body = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            logger.warning("Parse error", extra={"request_id": rid, "error": str(exc)})
            return JSONResponse(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}},
            )

        if not isinstance(body, dict):
            logger.info("Invalid JSON body type", extra={"request_id": rid, "type": type(body).__name__})
            return JSONResponse(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Body must be a JSON object"}},
            )

        if body.get("jsonrpc") != "2.0":
            logger.info("Invalid JSON-RPC version", extra={"request_id": rid, "version": body.get("jsonrpc")})
            return JSONResponse(
                {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid JSON-RPC version"}},
            )

        req_id = body.get("id", uuid.uuid4().hex)
        method = body.get("method", "")
        params = body.get("params", {})
        if not isinstance(params, dict):
            logger.info("Invalid params type", extra={"request_id": rid, "type": type(params).__name__})
            return JSONResponse(
                {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": "params must be a JSON object"}},
            )

        try:
            result: dict[str, Any] | None = None
            if method == "tasks/send":
                result = _handle_tasks_send(memory, params, skill_map, _store_task, _tasks, request_id=rid)
            elif method == "tasks/get":
                result = _handle_tasks_get(params, _tasks)
                if result is None:
                    task_id = params.get("id", "")
                    err = {"code": -32001, "message": f"Task not found: {task_id}"}
                    return JSONResponse(
                        {"jsonrpc": "2.0", "id": req_id, "error": err},
                        status_code=404,
                    )
            elif method == "tasks/cancel":
                result = _handle_tasks_cancel(params, _tasks)
                if result is None:
                    task_id = params.get("id", "")
                    err = {"code": -32001, "message": f"Task not found: {task_id}"}
                    return JSONResponse(
                        {"jsonrpc": "2.0", "id": req_id, "error": err},
                        status_code=404,
                    )
            else:
                logger.info("Method not found", extra={"request_id": rid, "method": method})
                return JSONResponse(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {"code": -32601, "message": f"Method not found: {method}"},
                    },
                )
            return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})
        except Exception:
            logger.exception("JSON-RPC error", extra={"request_id": rid, "method": method})
            return JSONResponse(
                {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": _SAFE_ERROR_MSG}},
                status_code=500,
            )

    @app.post("/tasks/send")
    async def rest_tasks_send(request: Request):
        rid = getattr(request.state, "request_id", uuid.uuid4().hex)
        try:
            raw = await _read_body(request)
        except _RequestTooLargeError:
            return JSONResponse({"error": "Request too large"}, status_code=413)

        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            return JSONResponse({"error": "Invalid JSON"}, status_code=400)

        if not isinstance(body, dict):
            return JSONResponse({"error": "Body must be a JSON object"}, status_code=400)

        try:
            result = _handle_tasks_send(memory, body, skill_map, _store_task, _tasks, request_id=rid)
            return JSONResponse(result)
        except Exception:
            logger.exception("REST error", extra={"request_id": rid})
            return JSONResponse({"error": _SAFE_ERROR_MSG}, status_code=500)

    return app, memory


# ---------------------------------------------------------------------------
# A2A task handlers
# ---------------------------------------------------------------------------

def _execute_skill(mem, method: str, params: dict[str, Any]) -> Any:
    if method == "store":
        mtype = params.get("memory_type", "fact")
        content = params.get("content") or params.get("text")
        if not content:
            return {"error": "Missing required parameter: content or text"}
        meta = params.get("metadata")
        return mem.store(mtype, content, meta).to_dict()
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
    return {"error": f"Unknown method: {method}"}


def _strip_internal(task: dict) -> dict:
    return {k: v for k, v in task.items() if not k.startswith("_")}


def _handle_tasks_send(mem, params: dict, skill_map: dict, store_fn, task_store: dict, request_id: str = "") -> dict:
    message = params.get("message", params)
    skill_id = message.get("skill", "")
    method = skill_map.get(skill_id)
    now = time.time()
    mono = time.monotonic()
    if not method:
        task_id = uuid.uuid4().hex
        store_fn(task_id, {
            "id": task_id,
            "status": {"state": "failed"},
            "_created_at": now,
            "_completed_at": now,
            "_cm": mono,
            "_dm": mono,
        })
        logger.info("Unknown skill", extra={"request_id": request_id, "skill": skill_id, "task_id": task_id})
        return {"id": task_id, "status": {"state": "failed"}}

    task_id = uuid.uuid4().hex
    store_fn(task_id, {
        "id": task_id,
        "status": {"state": "working"},
        "_created_at": now,
        "_cm": mono,
    })
    try:
        result = _execute_skill(mem, method, message)
        store_fn(task_id, {
            "id": task_id,
            "status": {"state": "completed"},
            "artifacts": [{"parts": [{"text": json.dumps(result, default=str)}]}],
            "_created_at": now,
            "_completed_at": time.time(),
            "_cm": mono,
            "_dm": time.monotonic(),
        })
    except Exception:
        logger.exception(
            "Skill execution failed",
            extra={"request_id": request_id, "skill": skill_id, "task_id": task_id},
        )
        store_fn(task_id, {
            "id": task_id,
            "status": {"state": "failed"},
            "_created_at": now,
            "_completed_at": time.time(),
            "_cm": mono,
            "_dm": time.monotonic(),
        })

    return _strip_internal(task_store[task_id])


def _handle_tasks_get(params: dict, task_store: dict) -> dict | None:
    task_id = params.get("id", "")
    task = task_store.get(task_id)
    if not task:
        return None
    return _strip_internal(task)


def _handle_tasks_cancel(params: dict, task_store: dict) -> dict | None:
    task_id = params.get("id", "")
    task = task_store.get(task_id)
    if not task:
        return None
    task["status"]["state"] = "canceled"
    return _strip_internal(task)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    _configure_logging()
    import uvicorn

    mock = "--mock" in sys.argv or os.environ.get("BASTION_MOCK", "").lower() in ("true", "1", "yes")
    port = int(os.environ.get("A2A_PORT", "9998"))
    host = os.environ.get("A2A_HOST", "0.0.0.0")

    app, memory = create_a2a_server(mock=mock, host=host, port=port)

    server = uvicorn.Server(uvicorn.Config(app, host=host, port=port, log_config=None))

    def _shutdown(signum, frame):
        logger.info("Shutdown signal received", extra={"signal": signum})
        server.should_exit = True

    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _shutdown)
        signal.signal(signal.SIGINT, _shutdown)

    logger.info("Bastion A2A server starting", extra={"host": host, "port": port, "mock": mock})
    logger.info("Agent Card available", extra={"url": f"http://{host}:{port}/.well-known/agent-card.json"})
    try:
        server.run()
    finally:
        try:
            memory.close()
        except Exception:
            logger.exception("Error closing memory connection during shutdown")
        logger.info("Bastion A2A server shut down")


if __name__ == "__main__":
    main()
