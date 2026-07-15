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
import time
import uuid
from collections import defaultdict, deque
from functools import partial
from typing import Any

import anyio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from bastion.config import DOCS_URL, PROJECT_URL, VERSION
from bastion.log_setup import get_logger

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

    skill_map = {
        "memory_store": "store",
        "memory_search": "search",
        "graph_query": "graph_query",
        "reinforce": "reinforce",
        "broadcast": "broadcast",
        "resolve_conflict": "resolve_conflict",
    }

    # -- A2A Agent Card ---------------------------------------------------

    from bastion.a2a_signing import AgentCardSigner

    _agent_card_signer = AgentCardSigner.from_env("BASTION_A2A_PRIVATE_KEY")
    logger.info(
        "A2A signing key loaded",
        extra={"public_key": _agent_card_signer.get_public_key_base64()[:16] + "..."},
    )

    _agent_card_unsigned: dict[str, Any] = {
        "name": "Bastion Memory Agent",
        "description": (
            "A2A-compliant memory agent with hash-chain integrity, "
            "C-SPANN vector indexing, knowledge graph, and time travel."
        ),
        "version": VERSION,
        "a2a_version": "1.0",
        "url": PROJECT_URL,
        "documentationUrl": DOCS_URL,
        "capabilities": {
            "streaming": False,
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
                "id": "graph_query",
                "name": "Knowledge Graph Query",
                "description": "Traverse the knowledge graph with multi-hop BFS starting from an entity.",
                "tags": ["graph", "knowledge", "traversal"],
                "examples": ["Find what technologies the user's projects use"],
            },
            {
                "id": "reinforce",
                "name": "Reinforce Memory",
                "description": "Boost a memory's importance score based on successful retrieval.",
                "tags": ["memory", "decay", "reinforcement"],
                "examples": ["Reinforce memory abc-123 after successful use"],
            },
            {
                "id": "broadcast",
                "name": "Broadcast to Namespace",
                "description": "Send an event message to all agents in the same namespace.",
                "tags": ["communication", "namespace", "a2a"],
                "examples": ["Broadcast task_complete event to project-alice agents"],
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

    _tasks: dict[str, dict[str, Any]] = {}

    async def _store_task(
        tid: str,
        status: str,
        artifacts: list[dict[str, Any]] | None = None,
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        now = time.time()
        mono = time.monotonic()

        if not memory._mock:
            task_record = await anyio.to_thread.run_sync(
                memory.store_a2a_task, tid, agent_id, "unknown", status, callback_url,
            )
            return {
                "id": task_record["task_id"],
                "status": {"state": task_record["status"]},
                "artifacts": artifacts or [],
                "_created_at": now,
                "_completed_at": None if status in ("WORKING", "SUBMITTED") else now,
                "_cm": mono,
                "_dm": None if status in ("WORKING", "SUBMITTED") else mono,
            }

        # Mock mode: in-memory only
        task = {
            "id": tid,
            "status": {"state": status},
            "artifacts": artifacts or [],
            "_created_at": now,
            "_completed_at": None if status in ("WORKING", "SUBMITTED") else now,
            "_cm": mono,
            "_dm": None if status in ("WORKING", "SUBMITTED") else mono,
        }
        _tasks[tid] = task
        stale = [k for k, v in _tasks.items() if v.get("_dm") and v["_dm"] + _TASK_TTL_SECONDS < mono]
        for k in stale:
            _tasks.pop(k, None)
        if len(_tasks) > _MAX_TASKS:
            oldest = min(_tasks, key=lambda k: _tasks[k]["_created_at"])
            _tasks.pop(oldest, None)
        return task

    async def _get_task(tid: str) -> dict[str, Any] | None:
        if not memory._mock:
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
                }
            return None

        # Mock mode: in-memory only
        return _tasks.get(tid)

    async def _update_task(
        tid: str, status: str, artifacts: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        if not memory._mock:
            record = await anyio.to_thread.run_sync(memory.update_a2a_task, tid, status, artifacts)
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
                }
            return None

        # Mock mode: in-memory only
        task = _tasks.get(tid)
        if task:
            task["status"]["state"] = status
            if artifacts is not None:
                task["artifacts"] = artifacts
            if status in ("COMPLETED", "FAILED", "CANCELED"):
                task["_completed_at"] = time.time()
                task["_dm"] = time.monotonic()
        return task

    # -- FastAPI app -------------------------------------------------------

    app = FastAPI(title="Bastion A2A Server", version="0.3.0")
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
        # Periodic cleanup: evict empty or stale buckets, cap at 10k distinct IPs
        if _rate_checks % 1000 == 0:
            stale = [ip for ip, ts in _rate_buckets.items() if not ts]
            for ip in stale:
                del _rate_buckets[ip]
            if len(_rate_buckets) > 10000:
                sorted_ips = sorted(_rate_buckets, key=lambda ip: _rate_buckets[ip][-1] if _rate_buckets[ip] else 0)
                for ip in sorted_ips[:-5000]:
                    del _rate_buckets[ip]
        return True

    def _check_version(request: Request) -> bool:
        version = request.headers.get("a2a-version", "")
        return version == _A2A_VERSION

    # -- Signature verification -------------------------------------------

    from bastion.a2a_signing import verify_card_signed

    _sender_key_cache: dict[str, tuple[str, float]] = {}  # url -> (pem, expiry)
    _signature_cache_ttl = 86400  # 24 hours
    _signature_cache_maxsize = 100  # prevent unbounded memory growth (DoS)
    _strict_auth = os.environ.get("BASTION_A2A_STRICT", "").lower() in ("true", "1", "yes")

    async def _verify_sender_signature(request: Request, body: bytes) -> bool:
        """Verify Ed25519 signature on incoming SendMessage requests."""
        sender_url = request.headers.get("X-Sender-URL", "")
        signature_b64 = request.headers.get("X-Sender-Signature", "")

        # If no signature headers, allow (backwards compatible)
        if not sender_url or not signature_b64:
            return True

        # Check cache
        now = time.time()
        cached = _sender_key_cache.get(sender_url)
        if cached and cached[1] > now:
            pubkey_pem = cached[0]
        else:
            # Fetch sender's agent card
            try:
                import httpx

                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{sender_url.rstrip('/')}/.well-known/agent-card.json")
                    if resp.status_code != 200:
                        logger.warning("Failed to fetch sender agent card", extra={"sender_url": sender_url})
                        return False
                    card = resp.json()
                    if not verify_card_signed(card):
                        logger.warning("Sender card signature verification FAILED", extra={"sender_url": sender_url})
                        return False
                    sig_info = card.get("signature", {})
                    pubkey_pem = sig_info.get("publicKeyPem", "")
                    if not pubkey_pem:
                        logger.warning("Sender card missing publicKeyPem", extra={"sender_url": sender_url})
                        return False
                    _sender_key_cache[sender_url] = (pubkey_pem, now + _signature_cache_ttl)
                    # Evict oldest entry if cache exceeds max size
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

    _push_notifications: dict[str, str] = {}  # task_id -> callback_url

    # -- Authentication ----------------------------------------------------

    _api_key = os.environ.get("BASTION_API_KEY", "")
    if not _api_key:
        logger.warning(
            "BASTION_API_KEY is not set — authentication is DISABLED. "
            "Set BASTION_API_KEY in your environment or .env file."
        )

    def _verify_api_key(provided: str) -> bool:
        import secrets as _secrets
        if not _api_key:
            return True  # No key configured = open (with warning)
        return _secrets.compare_digest(provided, _api_key)

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
        if _api_key and request.url.path not in ("/healthz", "/readyz"):
            auth = request.headers.get("Authorization", "")
            token = auth.removeprefix("Bearer ") if auth.startswith("Bearer ") else ""
            if not token or not _verify_api_key(token):
                return JSONResponse({"error": "Unauthorized"}, status_code=401)
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex)
        request.state.request_id = request_id

        forwarded = request.headers.get("X-Forwarded-For", "")
        client_ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
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
            return _rpc_error(_JSONRPC_PARSE_ERROR, f"Parse error: {exc}")

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
        await _update_task(task_id, "CANCELED")
        task = (await _get_task(task_id)) or task
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

    async def _handle_send_message(
        params: dict[str, Any],
        rid: str,
        req_id: Any,
        raw_body: bytes = b"",
        request: Request | None = None,
    ) -> JSONResponse:
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

        if not skill_params:
            skill_params = _infer_params(text)

        method = skill_map.get(skill_id)

        if not method:
            task = await _store_task(uuid.uuid4().hex, "FAILED")
            return _rpc_result(_strip_internal(task), req_id)

        task_id = uuid.uuid4().hex
        await _store_task(task_id, "WORKING")

        try:
            result = await anyio.to_thread.run_sync(_execute_skill, memory, method, skill_params)
            parts_out = [{"text": json.dumps(result, default=str)}]
            await _update_task(task_id, "COMPLETED", [{"parts": parts_out}])
        except Exception:
            logger.exception("Skill execution failed", extra={"request_id": rid, "skill": skill_id})
            await _update_task(task_id, "FAILED")

        task = (await _get_task(task_id)) or _tasks.get(task_id, {"id": task_id, "status": {"state": "FAILED"}})
        return _rpc_result(_strip_internal(task), req_id)

    async def _handle_get_task(params: dict[str, Any], req_id: Any) -> JSONResponse:
        if isinstance(params, list):
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "params must be an object", req_id)
        task_id = params.get("id", "") if isinstance(params, dict) else ""
        task = await _get_task(task_id)
        if not task:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"Task not found: {task_id}", req_id)
        return _rpc_result(_strip_internal(task), req_id)

    async def _handle_cancel_task(params: dict[str, Any], req_id: Any) -> JSONResponse:
        task_id = params.get("id", "")
        task = await _get_task(task_id)
        if not task:
            return _rpc_error(_A2A_TASK_NOT_FOUND, f"Task not found: {task_id}", req_id)
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
        _push_notifications[task_id] = callback_url
        if not memory._mock:
            await anyio.to_thread.run_sync(
                partial(memory.update_a2a_task, task_id, "WORKING", callback_url=callback_url),
            )
        logger.info("Push notification registered", extra={"task_id": task_id, "callback_url": callback_url})
        return _rpc_result({"task_id": task_id, "url": callback_url}, req_id)

    def _handle_get_push_notification(params: dict[str, Any], req_id: Any) -> JSONResponse:
        task_id = params.get("id", "")
        if not task_id:
            return _rpc_error(_JSONRPC_INVALID_PARAMS, "Missing task id", req_id)
        url = _push_notifications.get(task_id)
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
    if method in ("store", "resolve_conflict", "broadcast"):
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
        if _content_to_check:
            try:
                from bastion.guard import MemoryGuard as BastionGuard
                _guard = BastionGuard()
                _guard_result = _guard.check(_content_to_check)
                if not _guard_result.is_safe:
                    findings = [f.__dict__ for f in _guard_result.findings]
                    return {"error": "Blocked by OWASP ASI06 guard", "findings": findings}
            except Exception:
                logger.warning("Guard screening failed — skill will proceed unchecked", exc_info=True)

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
