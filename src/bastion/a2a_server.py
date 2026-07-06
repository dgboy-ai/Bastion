"""
Bastion A2A Server — A2A v1.0 Protocol Implementation.

Uses the official A2A Python SDK (a2a-sdk v1.1.0) for type definitions and
the Agent Card endpoint. Implements direct FastAPI handlers for JSON-RPC
and REST, avoiding SDK components with protobuf version incompatibilities
(field.label / field.is_repeated across protobuf 5.x-7.x).

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

from a2a.server.routes import add_a2a_routes_to_fastapi, create_agent_card_routes
from a2a.types.a2a_pb2 import AgentCapabilities, AgentCard, AgentSkill
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

_SAFE_ERROR_MSG = "Internal server error (see server logs for details)"
_MAX_REQUEST_BYTES = 1_048_576
_TASK_TTL_SECONDS = 300
_MAX_TASKS = 10_000
_ORPHAN_TASK_TTL_SECONDS = 1800
_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 600
_REQUEST_TIMEOUT_SECONDS = 60
_A2A_VERSION = "1.0"

_JSONRPC_PARSE_ERROR = -32700
_JSONRPC_INVALID_REQUEST = -32600
_JSONRPC_METHOD_NOT_FOUND = -32601
_JSONRPC_INVALID_PARAMS = -32602
_JSONRPC_INTERNAL_ERROR = -32603
_A2A_TASK_NOT_FOUND = -32001
_A2A_VERSION_NOT_SUPPORTED = -32009

logger = logging.getLogger("bastion-a2a")

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
    host: str = "0.0.0.0",
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
        memory = BastionMemory(agent_id, conn, mock=_mock)
    except Exception:
        logger.exception("Failed to create BastionMemory with real DB, falling back to mock",
                         extra={"agent_id": agent_id})
        memory = BastionMemory(agent_id, "", mock=True)

    skill_map = {
        "memory_store": "store",
        "memory_search": "search",
        "graph_query": "graph_query",
        "reinforce": "reinforce",
        "broadcast": "broadcast",
    }

    # -- A2A Agent Card ---------------------------------------------------

    agent_card = AgentCard(
        name="Bastion Memory Agent",
        description="A2A-compliant memory agent with hash-chain integrity, "
        "C-SPANN vector indexing, knowledge graph, and time travel.",
        version="0.3.0",
        capabilities=AgentCapabilities(streaming=False),
        skills=[
            AgentSkill(
                id="memory_store",
                name="Store Agent Memory",
                description="Store a memory with SHA-256 hash-chain integrity and C-SPANN vector indexing.",
                tags=["memory", "storage", "hash-chain"],
                examples=["Store that the user prefers Python over TypeScript"],
            ),
            AgentSkill(
                id="memory_search",
                name="Search Agent Memories",
                description="Semantic vector search across agent memories with cognitive decay weighting.",
                tags=["memory", "search", "vector", "c-spann"],
                examples=["Find memories about project architecture decisions"],
            ),
            AgentSkill(
                id="graph_query",
                name="Knowledge Graph Query",
                description="Traverse the knowledge graph with multi-hop BFS starting from an entity.",
                tags=["graph", "knowledge", "traversal"],
                examples=["Find what technologies Divyansh's projects use"],
            ),
            AgentSkill(
                id="reinforce",
                name="Reinforce Memory",
                description="Boost a memory's importance score based on successful retrieval.",
                tags=["memory", "decay", "reinforcement"],
                examples=["Reinforce memory abc-123 after successful use"],
            ),
            AgentSkill(
                id="broadcast",
                name="Broadcast to Namespace",
                description="Send an event message to all agents in the same namespace.",
                tags=["communication", "namespace", "a2a"],
                examples=["Broadcast task_complete event to project-alice agents"],
            ),
        ],
    )

    # -- In-memory task store ---------------------------------------------

    _tasks: dict[str, dict[str, Any]] = {}

    def _store_task(tid: str, status: str, artifacts: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        now = time.time()
        mono = time.monotonic()
        task: dict[str, Any] = {
            "id": tid,
            "status": {"state": status},
            "artifacts": artifacts or [],
            "_created_at": now,
            "_completed_at": None if status in ("working", "submitted") else now,
            "_cm": mono,
            "_dm": None if status in ("working", "submitted") else mono,
        }
        _tasks[tid] = task
        stale = [k for k, v in _tasks.items() if v.get("_dm") and v["_dm"] + _TASK_TTL_SECONDS < mono]
        for k in stale:
            _tasks.pop(k, None)
        if len(_tasks) > _MAX_TASKS:
            oldest = min(_tasks, key=lambda k: _tasks[k]["_created_at"])
            _tasks.pop(oldest, None)
        return task

    def _get_task(tid: str) -> dict[str, Any] | None:
        return _tasks.get(tid)

    # -- FastAPI app -------------------------------------------------------

    app = FastAPI(title="Bastion A2A Server", version="0.3.0")
    cors_origins = [o.strip() for o in os.environ.get("CORS_ALLOW_ORIGINS", "*").split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # -- Metrics state -----------------------------------------------------

    _rate_buckets: dict[str, list[float]] = defaultdict(list)
    _rate_checks = 0
    _metrics_requests_total: dict[tuple[str, str, int], int] = defaultdict(int)
    _metrics_durations: dict[tuple[str, str], deque[float]] = defaultdict(lambda: deque(maxlen=500))
    _metrics_rate_limit_hits = 0
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

    def _check_version(request: Request) -> bool:
        version = request.headers.get("a2a-version", "")
        return version == _A2A_VERSION

    # -- Middleware --------------------------------------------------------

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

    # ----------------------------------------------------------------------
    # A2A Agent Card (via SDK helper - only for this endpoint)
    # ----------------------------------------------------------------------

    add_a2a_routes_to_fastapi(
        app,
        agent_card_routes=create_agent_card_routes(
            agent_card=agent_card,
            card_url="/.well-known/agent-card.json",
        ),
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
            return _rpc_error(_JSONRPC_PARSE_ERROR, f"Parse error: {exc}")

        if not isinstance(body, dict):
            return _rpc_error(_JSONRPC_INVALID_REQUEST, "Body must be a JSON object")

        if body.get("jsonrpc") != "2.0":
            return _rpc_error(_JSONRPC_INVALID_REQUEST, "Invalid JSON-RPC version")

        if not _check_version(request):
            return _rpc_error(
                _A2A_VERSION_NOT_SUPPORTED,
                f"A2A version is not supported. Expected '{_A2A_VERSION}'.",
                data=[{"@type": "type.googleapis.com/google.rpc.ErrorInfo",
                       "reason": "VERSION_NOT_SUPPORTED",
                       "domain": "a2a-protocol.org", "metadata": {}}],
            )

        req_id = body.get("id", uuid.uuid4().hex)
        method = body.get("method", "")
        params = body.get("params", {})

        try:
            if method == "SendMessage":
                return _handle_send_message(params, rid, req_id)
            elif method == "GetTask":
                return _handle_get_task(params, req_id)
            elif method == "CancelTask":
                return _handle_cancel_task(params, req_id)
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
        result = _handle_send_message(body, rid, "rest")
        return result

    @app.get("/tasks/{task_id}")
    async def rest_get_task(task_id: str):
        task = _get_task(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        return JSONResponse(_strip_internal(task))

    @app.post("/tasks/{task_id}:cancel")
    async def rest_cancel_task(task_id: str):
        task = _get_task(task_id)
        if not task:
            return JSONResponse({"error": "Task not found"}, status_code=404)
        task["status"]["state"] = "CANCELED"
        return JSONResponse(_strip_internal(task))

    # ----------------------------------------------------------------------
    # Bastion-specific endpoints
    # ----------------------------------------------------------------------

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

    def _infer_params(text: str) -> dict[str, Any]:
        if not text:
            return {}
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict):
                return parsed
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
        return {"content": text}

    def _handle_send_message(params: dict[str, Any], rid: str, req_id: Any) -> JSONResponse:
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

        if not skill_params:
            skill_params = _infer_params(text)

        method = skill_map.get(skill_id)

        if not method:
            task = _store_task(uuid.uuid4().hex, "FAILED")
            return _rpc_result(_strip_internal(task), req_id)

        task_id = uuid.uuid4().hex
        _store_task(task_id, "WORKING")

        try:
            result = _execute_skill(memory, method, skill_params)
            parts_out = [{"text": json.dumps(result, default=str)}]
            _store_task(task_id, "COMPLETED", [{"parts": parts_out}])
        except Exception:
            logger.exception("Skill execution failed", extra={"request_id": rid, "skill": skill_id})
            _store_task(task_id, "FAILED")

        return _rpc_result(_strip_internal(_tasks[task_id]), req_id)

    def _handle_get_task(params: dict[str, Any], req_id: Any) -> JSONResponse:
        if isinstance(params, list):
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "params must be an object", req_id)
        task_id = params.get("id", "") if isinstance(params, dict) else ""
        task = _get_task(task_id)
        if not task:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"Task not found: {task_id}", req_id)
        return _rpc_result(_strip_internal(task), req_id)

    def _handle_cancel_task(params: dict[str, Any], req_id: Any) -> JSONResponse:
        task_id = params.get("id", "")
        task = _get_task(task_id)
        if not task:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"Task not found: {task_id}", req_id)
        task["status"]["state"] = "CANCELED"
        return _rpc_result(_strip_internal(task), req_id)

    return app, memory


# ---------------------------------------------------------------------------
# Request body reader
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
# Skill execution (standalone for testability)
# ---------------------------------------------------------------------------


def _execute_skill(mem: Any, method: str, params: dict[str, Any]) -> Any:
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
