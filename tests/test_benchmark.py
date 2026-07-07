"""MCP Tool Latency Benchmarks — p50, p95, p99 statistics."""

import statistics
import time

import pytest

from bastion.mcp_server import create_server

NUM_RUNS = 100
WARMUP = 5


def _percentile(data: list[float], p: float) -> float:
    return statistics.quantiles(data, n=100, method="exclusive")[int(p) - 1]


def _fmt(ns: float) -> str:
    if ns < 1_000:
        return f"{ns:.0f}ns"
    us = ns / 1_000
    if us < 1_000:
        return f"{us:.1f}µs"
    ms = us / 1_000
    if ms < 1_000:
        return f"{ms:.2f}ms"
    return f"{ms / 1_000:.3f}s"


def _stats(label: str, times: list[float]) -> dict:
    times.sort()
    return {
        "label": label,
        "min": _fmt(times[0]),
        "p50": _fmt(_percentile(times, 50)),
        "p95": _fmt(_percentile(times, 95)),
        "p99": _fmt(_percentile(times, 99)),
        "max": _fmt(times[-1]),
        "mean": _fmt(statistics.mean(times)),
        "runs": len(times),
    }


def _print_table(results: list[dict]) -> None:
    header = f"{'Tool':<30} {'min':>10} {'p50':>10} {'p95':>10} {'p99':>10} {'max':>10} {'mean':>10} {'runs':>6}"
    sep = "-" * len(header)
    lines = [header, sep]
    for r in results:
        lines.append(
            f"{r['label']:<30} {r['min']:>10} {r['p50']:>10} {r['p95']:>10} "
            f"{r['p99']:>10} {r['max']:>10} {r['mean']:>10} {r['runs']:>6}"
        )
    print("\n".join(lines))


@pytest.fixture(scope="module")
def bench_mcp():
    return create_server(mock=True)


@pytest.fixture(autouse=True)
def reset_mock():
    from bastion.mock import reset

    reset()


def _warmup(mcp, tool: str, args: dict) -> None:
    for _ in range(WARMUP):
        import anyio

        anyio.from_thread.run(mcp.call_tool, tool, args)


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_memory_store(bench_mcp):
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool("memory_store", {"content": f"Benchmark run {_}", "memory_type": "fact"})
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("memory_store", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_memory_search(bench_mcp):
    for i in range(20):
        await bench_mcp.call_tool("memory_store", {"content": f"Benchmark search memory {i}", "memory_type": "fact"})
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool("memory_search", {"query": "Benchmark", "k": 5})
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("memory_search", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_memory_timetravel(bench_mcp):
    for i in range(10):
        await bench_mcp.call_tool("memory_store", {"content": f"TT memory {i}", "memory_type": "fact"})
    from datetime import UTC, datetime

    ts = datetime.now(UTC).isoformat()
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool("memory_timetravel", {"timestamp": ts})
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("memory_timetravel", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_memory_audit(bench_mcp):
    for i in range(10):
        await bench_mcp.call_tool("memory_store", {"content": f"Audit memory {i}", "memory_type": "fact"})
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool("memory_audit", {})
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("memory_audit", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_memory_heal(bench_mcp):
    for i in range(10):
        await bench_mcp.call_tool("memory_store", {"content": f"Heal memory {i}", "memory_type": "fact"})
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool("memory_heal", {})
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("memory_heal", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_resolve_conflict(bench_mcp):
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool(
            "resolve_conflict",
            {"fact_a": "User likes Python", "fact_b": "User likes Rust", "context": "Backend preference"},
        )
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("resolve_conflict", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_a2a_bridge(bench_mcp):
    times: list[float] = []
    for _ in range(NUM_RUNS + WARMUP):
        t0 = time.perf_counter_ns()
        await bench_mcp.call_tool("a2a_bridge", {"agent_id": "bench-agent"})
        elapsed = time.perf_counter_ns() - t0
        if _ >= WARMUP:
            times.append(elapsed)
    s = _stats("a2a_bridge", times)
    _print_table([s])
    return s


@pytest.mark.asyncio
@pytest.mark.benchmark
async def test_benchmark_all_tools(bench_mcp):
    from datetime import UTC, datetime

    for i in range(20):
        await bench_mcp.call_tool("memory_store", {"content": f"Setup memory {i}", "memory_type": "fact"})
    ts = datetime.now(UTC).isoformat()

    results: list[dict] = []

    for name, args in [
        ("memory_store", {"content": "Benchmark", "memory_type": "fact"}),
        ("memory_search", {"query": "Setup", "k": 5}),
        ("memory_timetravel", {"timestamp": ts}),
        ("memory_audit", {}),
        ("memory_heal", {}),
        ("resolve_conflict", {"fact_a": "A", "fact_b": "B", "context": "C"}),
        ("a2a_bridge", {"agent_id": "bench"}),
    ]:
        times: list[float] = []
        for _ in range(NUM_RUNS + WARMUP):
            t0 = time.perf_counter_ns()
            await bench_mcp.call_tool(name, args)
            elapsed = time.perf_counter_ns() - t0
            if _ >= WARMUP:
                times.append(elapsed)
        results.append(_stats(name, times))

    _print_table(results)
    return results
