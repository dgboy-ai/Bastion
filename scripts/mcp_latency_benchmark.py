#!/usr/bin/env python3
"""
MCP Tool Latency Benchmark Suite for Bastion.

Measures latency distribution (p50, p90, p95, p99) and throughput
of individual MCP tools running on a FastMCP instance.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from bastion.mcp_server import create_server


@dataclass
class LatencySample:
    latency_ms: float
    success: bool
    error: str | None = None


@dataclass
class ToolResult:
    name: str
    samples: int
    min_ms: float
    max_ms: float
    avg_ms: float
    p50_ms: float
    p90_ms: float
    p95_ms: float
    p99_ms: float
    throughput: float
    success_rate: float


async def run_tool_benchmark(
    mcp: Any,
    tool_name: str,
    arguments: dict[str, Any],
    iterations: int = 100,
    warmup: int = 10,
) -> ToolResult:
    # Warmup
    for _ in range(warmup):
        with contextlib.suppress(Exception):
            await mcp.call_tool(tool_name, arguments)

    samples: list[LatencySample] = []
    errors = 0

    for _ in range(iterations):
        start = time.perf_counter()
        try:
            res = await mcp.call_tool(tool_name, arguments)
            # Ensure return has some expected structure
            success = len(res) > 0
            err_msg = None
        except Exception as e:
            success = False
            err_msg = str(e)
            errors += 1

        latency = (time.perf_counter() - start) * 1000
        samples.append(LatencySample(latency_ms=latency, success=success, error=err_msg))

    latencies = [s.latency_ms for s in samples]
    sorted_lats = sorted(latencies)

    total_time = sum(latencies)
    avg = total_time / len(latencies) if latencies else 0.0
    throughput = (iterations / total_time) * 1000 if total_time > 0 else 0.0

    p50 = sorted_lats[int(len(sorted_lats) * 0.5)] if sorted_lats else 0.0
    p90 = sorted_lats[int(len(sorted_lats) * 0.9)] if sorted_lats else 0.0
    p95 = sorted_lats[int(len(sorted_lats) * 0.95)] if sorted_lats else 0.0
    p99 = sorted_lats[int(len(sorted_lats) * 0.99)] if sorted_lats else 0.0

    return ToolResult(
        name=tool_name,
        samples=iterations,
        min_ms=min(latencies) if latencies else 0.0,
        max_ms=max(latencies) if latencies else 0.0,
        avg_ms=avg,
        p50_ms=p50,
        p90_ms=p90,
        p95_ms=p95,
        p99_ms=p99,
        throughput=throughput,
        success_rate=(iterations - errors) / iterations if iterations > 0 else 1.0,
    )


async def main_async() -> None:
    import os

    parser = argparse.ArgumentParser(description="Bastion MCP Tool Latency Benchmark")
    parser.add_argument("--iterations", type=int, default=100, help="Iterations per tool")
    parser.add_argument("--warmup", type=int, default=10, help="Warmup iterations")
    parser.add_argument("--conn", type=str, default=None, help="CockroachDB connection string")
    parser.add_argument(
        "--mock", type=str, default=None, help="Set to 'true' or 'false' to override database mock status"
    )
    parser.add_argument("--json", action="store_true", help="Output raw JSON results")
    args = parser.parse_args()

    # Determine connection string
    conn = args.conn or os.environ.get("BASTION_CONN", "")

    # Determine mock status
    mock_env = args.mock or os.environ.get("BASTION_MOCK", "")
    if mock_env.lower() in ("true", "1", "yes"):
        is_mock = True
    elif mock_env.lower() in ("false", "0", "no"):
        is_mock = False
    else:
        is_mock = not conn  # default to real mode if connection string is present

    mode_label = "Mock Mode (in-memory)" if is_mock else "Real Mode (CockroachDB)"

    # Initialize server dynamically based on resolved configuration
    mcp = create_server(connection_string=conn, mock=is_mock)

    # Basic setup: seed a memory so search has something to find
    await mcp.call_tool(
        "memory_store",
        {
            "content": "Python is a high-level general-purpose programming language.",
            "memory_type": "fact",
        },
    )
    await mcp.call_tool(
        "memory_store",
        {
            "content": "User prefers dark mode configuration for UI.",
            "memory_type": "preference",
        },
    )

    benchmarks = [
        (
            "memory_store",
            {
                "content": "Persistent vector indexing using C-SPANN with Bedrock embeddings.",
                "memory_type": "fact",
                "metadata": {"source": "benchmark"},
            },
        ),
        (
            "memory_search",
            {
                "query": "programming language",
                "memory_type": "fact",
                "k": 5,
            },
        ),
        (
            "memory_timetravel",
            {
                "timestamp": datetime.now(UTC).isoformat(),
            },
        ),
        (
            "memory_audit",
            {
                "agent_id": "mcp-agent",
            },
        ),
        (
            "memory_heal",
            {
                "agent_id": "mcp-agent",
            },
        ),
        (
            "resolve_conflict",
            {
                "fact_a": "The service runs on port 8080.",
                "fact_b": "The service was re-mapped to port 9090.",
                "context": "Port binding collision during staging deployment.",
            },
        ),
    ]

    results: list[ToolResult] = []

    if not args.json:
        print("=========================================================================")
        print(f" Bastion MCP Latency Benchmark ({mode_label}): {args.iterations} runs ({args.warmup} warmup)")
        print("=========================================================================\n")

    for tool_name, params in benchmarks:
        res = await run_tool_benchmark(mcp, tool_name, params, iterations=args.iterations, warmup=args.warmup)
        results.append(res)
        if not args.json:
            print(
                f"Tool: {res.name:<18} | Avg: {res.avg_ms:6.2f}ms | p50: {res.p50_ms:6.2f}ms | p95: {res.p95_ms:6.2f}ms | p99: {res.p99_ms:6.2f}ms | rate: {res.success_rate:.0%}"
            )

    if args.json:
        data = [
            {
                "tool": r.name,
                "samples": r.samples,
                "avg_ms": round(r.avg_ms, 3),
                "min_ms": round(r.min_ms, 3),
                "max_ms": round(r.max_ms, 3),
                "p50_ms": round(r.p50_ms, 3),
                "p90_ms": round(r.p90_ms, 3),
                "p95_ms": round(r.p95_ms, 3),
                "p99_ms": round(r.p99_ms, 3),
                "throughput": round(r.throughput, 1),
                "success_rate": round(r.success_rate, 3),
            }
            for r in results
        ]
        print(json.dumps(data, indent=2))
        return

    # Print markdown table
    print("\n### MCP Tool Latency Performance Summary (Markdown)")
    print(
        "\n| MCP Tool Name | Runs | Avg Latency | Min Latency | Max Latency | P50 (Median) | P90 | P95 | P99 | Throughput |"
    )
    print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    for r in results:
        print(
            f"| `{r.name}` | {r.samples} | {r.avg_ms:.2f} ms | {r.min_ms:.2f} ms | {r.max_ms:.2f} ms | {r.p50_ms:.2f} ms | {r.p90_ms:.2f} ms | {r.p95_ms:.2f} ms | {r.p99_ms:.2f} ms | {r.throughput:.1f} ops/s |"
        )
    print()


def main() -> None:
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
