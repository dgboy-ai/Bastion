from __future__ import annotations

import os

from bastion.memory import BastionMemory


def create_server(connection_string: str | None = None, mock: bool | None = None):
    conn = connection_string or os.environ.get("BASTION_CONN", "")
    is_mock = mock if mock is not None else (not conn)
    memory = BastionMemory("mcp-agent", conn, mock=is_mock)

    def handle_tool(name: str, arguments: dict) -> list[dict]:
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

    return memory, handle_tool
