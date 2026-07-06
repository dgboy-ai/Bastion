"""
Bastion MCP Server — Real MCP Protocol Implementation

Provides 6 tools for AI agents to interact with their persistent memory:
- memory_search: Semantic vector search via C-SPANN
- memory_store: Store memories with hash chain integrity
- memory_timetravel: AS OF SYSTEM TIME queries
- memory_audit: Append-only audit log
- memory_heal: CDC-triggered self-healing
- resolve_conflict: SERIALIZABLE multi-agent coordination

Usage:
    python -m bastion.mcp_server
    # or
    BASTION_CONN=postgresql://... python -m bastion.mcp_server
"""

from __future__ import annotations

import json
import logging
import os
import sys
from typing import Any

from mcp.server import Server
from mcp.types import TextContent, Tool

from bastion.memory import BastionMemory

logger = logging.getLogger("bastion-mcp")

# ── Tool Definitions ─────────────────────────────────────────────────────────

TOOLS: list[Tool] = [
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
                "query": {
                    "type": "string",
                    "description": "Natural language search query to find relevant memories",
                },
                "k": {
                    "type": "integer",
                    "description": "Number of results to return (default: 5)",
                    "default": 5,
                },
                "threshold": {
                    "type": "number",
                    "description": "Minimum similarity threshold 0.0-1.0 (default: 0.8)",
                    "default": 0.8,
                },
                "memory_type": {
                    "type": "string",
                    "description": "Filter by memory type: fact, task, preference, learned, procedure",
                },
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
            "CockroachDB's C-SPANN distributed vector index. Each memory "
            "links to the previous via cryptographic hash."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "The memory content to store",
                },
                "memory_type": {
                    "type": "string",
                    "description": "Type of memory: fact, task, preference, learned, procedure",
                    "default": "fact",
                },
                "metadata": {
                    "type": "object",
                    "description": "Optional metadata key-value pairs",
                },
                "expires_in_seconds": {
                    "type": "integer",
                    "description": "Optional TTL in seconds. Null = never expires.",
                },
            },
            "required": ["content"],
        },
    ),
    Tool(
        name="memory_timetravel",
        title="Time Travel Query",
        description=(
            "Query agent memory state at any past timestamp using "
            "CockroachDB's AS OF SYSTEM TIME. Reconstruct the exact "
            "cognitive state of the agent at any historical moment."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "timestamp": {
                    "type": "string",
                    "description": "ISO 8601 timestamp to query (e.g., '2026-07-03T14:47:00Z')",
                },
                "agent_id": {
                    "type": "string",
                    "description": "Agent ID to query (defaults to current agent)",
                },
            },
            "required": ["timestamp"],
        },
    ),
    Tool(
        name="memory_audit",
        title="Memory Audit Log",
        description=(
            "Retrieve the append-only audit log for an agent. Every memory "
            "operation (store, search, heal, conflict resolution) is recorded "
            "with full context. Log is immutable and hash-chained."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Agent ID to audit (defaults to current agent)",
                },
            },
        },
    ),
    Tool(
        name="memory_heal",
        title="Memory Self-Healing",
        description=(
            "Trigger the CDC-triggered self-healing pipeline. Removes expired "
            "memories, detects anomalies (fact turnover, size spikes, rapid "
            "forgetting), and compacts the memory store."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Agent ID to heal (defaults to current agent)",
                },
            },
        },
    ),
    Tool(
        name="resolve_conflict",
        title="Resolve Memory Conflict",
        description=(
            "Resolve conflicting memories from multiple agents using "
            "SERIALIZABLE isolation. Catches 40001 serialization errors, "
            "merges contradictory facts via LLM, and atomic re-commits."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "fact_a": {
                    "type": "string",
                    "description": "First conflicting fact or memory",
                },
                "fact_b": {
                    "type": "string",
                    "description": "Second conflicting fact or memory",
                },
                "context": {
                    "type": "string",
                    "description": "Optional context for the conflict resolution",
                },
            },
            "required": ["fact_a", "fact_b"],
        },
    ),
]

# ── Tool Input Schemas (for backward compatibility) ──────────────────────────

TOOL_SCHEMAS: dict[str, dict[str, Any]] = {tool.name: tool.inputSchema for tool in TOOLS}


def create_server(connection_string: str | None = None, mock: bool | None = None):
    """
    Create a Bastion MCP server instance.

    Returns:
        Tuple of (Server, BastionMemory) for programmatic use,
        or just the Server for stdio transport.
    """
    conn = connection_string or os.environ.get("BASTION_CONN", "")
    is_mock = mock if mock is not None else (not conn)
    memory = BastionMemory("mcp-agent", conn, mock=is_mock)

    server = Server("bastion-memory")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return TOOLS

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
        try:
            result = _handle_tool_call(memory, name, arguments)
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]
        except Exception as e:
            logger.error(f"Tool call failed: {name} - {e}")
            return [TextContent(type="text", text=json.dumps({"error": str(e)}))]

    return server, memory


def _handle_tool_call(
    memory: BastionMemory, name: str, arguments: dict[str, Any]
) -> list[dict] | dict:
    """Route tool calls to the appropriate memory method."""

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
        result = memory.heal(agent_id=arguments.get("agent_id"))
        return [result]

    if name == "resolve_conflict":
        merged = memory.resolve_conflict(
            fact_a=arguments.get("fact_a", ""),
            fact_b=arguments.get("fact_b", ""),
            context=arguments.get("context"),
        )
        return [{"merged": merged}]

    raise ValueError(f"Unknown tool: {name}")


# ── Stdio Entry Point ────────────────────────────────────────────────────────

async def _run_stdio():
    """Run the MCP server over stdio transport (for Claude Code, Cursor, etc.)."""
    from mcp.server.stdio import stdio_server

    server, _memory = create_server()

    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options(),
        )


def main():
    """Entry point for `python -m bastion.mcp_server`."""
    import anyio
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    anyio.run(_run_stdio)


if __name__ == "__main__":
    main()
