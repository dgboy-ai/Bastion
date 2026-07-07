"""
Bastion MCP Server — Production-Grade MCP Protocol Implementation

Provides tools for AI agents to interact with their persistent memory:
- memory_search, memory_store, memory_timetravel, memory_audit
- memory_heal, memory_delete, resolve_conflict, a2a_bridge

Supports stdio (local) and Streamable HTTP (remote) transports.
API key authentication and rate limiting included.
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
from typing import Any

from bastion.memory import BastionMemory

logger = logging.getLogger("bastion-mcp")

_API_KEYS: set[str] | None = None


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


_RATE_LIMITER: Any | None = None


def _get_limiter():
    global _RATE_LIMITER
    if _RATE_LIMITER is None:
        from bastion.limiter import RequestLimiter

        _RATE_LIMITER = RequestLimiter(
            max_concurrent=int(os.environ.get("BASTION_MCP_MAX_CONCURRENT", "20")),
            max_queue=int(os.environ.get("BASTION_MCP_MAX_QUEUE", "200")),
            timeout_seconds=int(os.environ.get("BASTION_MCP_TIMEOUT", "60")),
        )
    return _RATE_LIMITER


def _get_tools():
    from mcp.types import Tool

    return [
        Tool(
            name="memory_search",
            title="Search Agent Memories",
            description=(
                "Search agent memories using C-SPANN vector similarity search with "
                "cognitive decay weighting. Returns memories ranked by relevance and "
                "importance. Uses CockroachDB's distributed vector index for "
                "sub-linear similarity search."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Natural language search query"},
                    "k": {"type": "integer", "description": "Number of results (default: 5)", "default": 5},
                    "threshold": {"type": "number", "description": "Min similarity 0.0-1.0 (default: 0.8)", "default": 0.8},
                    "memory_type": {"type": "string", "description": "Filter by memory type: fact, task, preference, learned, procedure"},
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="memory_store",
            title="Store Agent Memory",
            description=(
                "Store a memory with automatic SHA-256 hash chain integrity. "
                "Content is embedded via AWS Bedrock Titan V2 and indexed in "
                "CockroachDB's C-SPANN distributed vector index."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "The memory content to store"},
                    "memory_type": {"type": "string", "description": "Type: fact, task, preference, learned, procedure", "default": "fact"},
                    "metadata": {"type": "object", "description": "Optional metadata key-value pairs"},
                    "expires_in_seconds": {"type": "integer", "description": "Optional TTL in seconds"},
                },
                "required": ["content"],
            },
        ),
        Tool(
            name="memory_timetravel",
            title="Time Travel Query",
            description=(
                "Query agent memory state at any past timestamp using "
                "CockroachDB's AS OF SYSTEM TIME."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "timestamp": {"type": "string", "description": "ISO 8601 timestamp (e.g., '2026-07-03T14:47:00Z')"},
                    "agent_id": {"type": "string", "description": "Agent ID to query"},
                },
                "required": ["timestamp"],
            },
        ),
        Tool(
            name="memory_audit",
            title="Memory Audit Log",
            description="Retrieve the append-only, hash-chained audit log for an agent.",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string", "description": "Agent ID to audit"},
                },
            },
        ),
        Tool(
            name="memory_heal",
            title="Memory Self-Healing",
            description="Trigger CDC-triggered self-healing: removes expired memories, detects anomalies, compacts storage.",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string", "description": "Agent ID to heal"},
                },
            },
        ),
        Tool(
            name="memory_delete",
            title="Delete Memory",
            description="Delete a single memory by ID. Requires confirmation flag. Uses CockroachDB SERIALIZABLE isolation.",
            inputSchema={
                "type": "object",
                "properties": {
                    "memory_id": {"type": "string", "description": "Memory ID to delete"},
                    "confirmed": {"type": "boolean", "description": "Must be true to proceed"},
                },
                "required": ["memory_id", "confirmed"],
            },
        ),
        Tool(
            name="resolve_conflict",
            title="Resolve Memory Conflict",
            description="Resolve conflicting memories from multiple agents using SERIALIZABLE isolation.",
            inputSchema={
                "type": "object",
                "properties": {
                    "fact_a": {"type": "string", "description": "First conflicting fact"},
                    "fact_b": {"type": "string", "description": "Second conflicting fact"},
                    "context": {"type": "string", "description": "Optional resolution context"},
                },
                "required": ["fact_a", "fact_b"],
            },
        ),
        Tool(
            name="a2a_bridge",
            title="A2A Agent Bridge",
            description="Retrieve the A2A Agent Card for inter-agent discovery. Returns A2A-compliant metadata.",
            inputSchema={
                "type": "object",
                "properties": {
                    "agent_id": {"type": "string", "description": "Agent ID to retrieve card for"},
                },
            },
        ),
    ]


def create_server(connection_string: str | None = None, mock: bool | None = None):
    from mcp.server import Server

    conn = connection_string or os.environ.get("BASTION_CONN", "")
    is_mock = mock if mock is not None else (not conn)
    memory = BastionMemory("mcp-agent", connection_string=conn, mock=is_mock)

    tools = _get_tools()
    server = Server("bastion-memory")

    @server.list_tools()
    async def list_tools():
        return tools

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]):
        from mcp.types import TextContent

        limiter = _get_limiter()
        if not limiter.acquire():
            return [TextContent(type="text", text=json.dumps({"error": "Rate limit exceeded. Please retry later."}))]
        try:
            result = _handle_tool_call(memory, name, arguments)
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]
        except ValueError as e:
            return [TextContent(type="text", text=json.dumps({"error": str(e)}))]
        except Exception:
            logger.exception("Tool call failed: %s", name)
            return [TextContent(type="text", text=json.dumps({"error": "Internal error"}))]
        finally:
            limiter.release()

    return server, memory


def _handle_tool_call(memory: BastionMemory, name: str, arguments: dict[str, Any]):
    if name == "memory_search":
        results = memory.search(
            query=arguments.get("query", ""),
            k=arguments.get("k", 5),
            threshold=arguments.get("threshold", 0.8),
            memory_type=arguments.get("memory_type"),
        )
        return [r.to_dict() for r in results]

    if name == "memory_store":
        record = memory.store(
            memory_type=arguments.get("memory_type", "fact"),
            content=arguments.get("content", ""),
            metadata=arguments.get("metadata"),
            expires_in_seconds=arguments.get("expires_in_seconds"),
        )
        return [record.to_dict()]

    if name == "memory_timetravel":
        results = memory.get_at_time(
            timestamp=arguments.get("timestamp", ""),
            agent_id=arguments.get("agent_id"),
        )
        return [r.to_dict() for r in results]

    if name == "memory_audit":
        entries = memory.audit(agent_id=arguments.get("agent_id"))
        return [e.to_dict() for e in entries]

    if name == "memory_heal":
        return [memory.heal(agent_id=arguments.get("agent_id"))]

    if name == "memory_delete":
        confirmed = arguments.get("confirmed", False)
        if not confirmed:
            return [{"error": "Deletion requires confirmed=true"}]
        memory_id = arguments.get("memory_id", "")
        if not memory_id:
            raise ValueError("memory_id is required")
        memory._delete_by_id(memory_id)
        return [{"deleted": memory_id, "status": "ok"}]

    if name == "resolve_conflict":
        merged = memory.resolve_conflict(
            fact_a=arguments.get("fact_a", ""),
            fact_b=arguments.get("fact_b", ""),
            context=arguments.get("context"),
        )
        return [{"merged": merged}]

    if name == "a2a_bridge":
        agent_id = arguments.get("agent_id", "bastion-agent")
        return [_build_a2a_card(agent_id)]

    raise ValueError(f"Unknown tool: {name}")


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


async def _run_stdio(server, memory):
    from mcp.server.stdio import stdio_server

    async with stdio_server() as (read_stream, write_stream):
        try:
            await server.run(read_stream, write_stream, server.create_initialization_options())
        finally:
            memory.close()


def _create_starlette_app(server, memory):
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse
    from starlette.routing import Mount, Route

    transport: Any | None = None

    async def sse_endpoint(request: Request):
        nonlocal transport
        from mcp.server.streamable_http import StreamableHTTPServerTransport

        if transport is None:
            transport = StreamableHTTPServerTransport("/mcp/messages")

        if not _check_auth(dict(request.headers)):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        return await transport.handle_sse(request.scope, request.receive, request.send)

    async def messages_endpoint(request: Request):
        nonlocal transport
        if transport is None:
            from mcp.server.streamable_http import StreamableHTTPServerTransport

            transport = StreamableHTTPServerTransport("/mcp/messages")

        if not _check_auth(dict(request.headers)):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        return await transport.handle_message(request.scope, request.receive, request.send)

    async def healthz(request: Request):
        return JSONResponse({
            "status": "ok",
            "service": "bastion-mcp",
            "tools": len(_get_tools()),
        })

    async def metrics(request: Request):
        limiter = _get_limiter()
        return JSONResponse({
            "rate_limiter": limiter.get_stats(),
            "tools_available": [t.name for t in _get_tools()],
        })

    routes = [
        Route("/healthz", endpoint=healthz),
        Route("/metrics", endpoint=metrics),
        Route("/sse", endpoint=sse_endpoint),
        Route("/messages", endpoint=messages_endpoint),
    ]

    app = Starlette(routes=routes)

    @app.on_event("startup")
    async def startup():
        from mcp.server.models import InitializationOptions

        opts = InitializationOptions(
            server_name="bastion-memory",
            server_version="1.0.0",
            capabilities=server.get_capabilities(),
        )
        await server.connect(transport)
        logger.info("MCP server started with Streamable HTTP transport")

    return app


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Bastion MCP Server")
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio", help="Transport protocol")
    parser.add_argument("--host", default="0.0.0.0", help="HTTP host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=9997, help="HTTP port (default: 9997)")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, stream=sys.stderr)

    if args.transport == "http":
        import uvicorn

        server, memory = create_server(mock=args.mock)
        app = _create_starlette_app(server, memory)
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
    else:
        import anyio

        server, memory = create_server(mock=args.mock)
        anyio.run(_run_stdio, server, memory)


if __name__ == "__main__":
    main()
