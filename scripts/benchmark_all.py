"""Comprehensive Performance Benchmark for Bastion.

Measures latency, throughput, and accuracy across all core operations.
Run against real CockroachDB or mock mode.

Usage:
    python scripts/benchmark_all.py --mock
    python scripts/benchmark_all.py --conn "postgresql://..."
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime

from bastion.log_setup import get_logger

logger = get_logger(__name__)


def benchmark_store(mem, iterations: int = 50) -> dict:
    """Benchmark memory store operations."""
    latencies = []
    for i in range(iterations):
        start = time.monotonic()
        mem.store("fact", f"Benchmark test memory {i} with some content for testing", {"bench": True})
        latencies.append((time.monotonic() - start) * 1000)

    return {
        "operation": "store",
        "iterations": iterations,
        "avg_ms": round(sum(latencies) / len(latencies), 2),
        "p50_ms": round(sorted(latencies)[len(latencies) // 2], 2),
        "p95_ms": round(sorted(latencies)[int(len(latencies) * 0.95)], 2),
        "p99_ms": round(sorted(latencies)[int(len(latencies) * 0.99)], 2),
        "total_ms": round(sum(latencies), 2),
    }


def benchmark_search(mem, iterations: int = 50) -> dict:
    """Benchmark memory search operations."""
    queries = [
        "benchmark test memory",
        "agent configuration",
        "deployment pipeline",
        "user preferences",
        "security audit results",
    ]
    latencies = []
    for i in range(iterations):
        query = queries[i % len(queries)]
        start = time.monotonic()
        mem.search(query, k=5, threshold=0.0)
        latencies.append((time.monotonic() - start) * 1000)

    return {
        "operation": "search",
        "iterations": iterations,
        "avg_ms": round(sum(latencies) / len(latencies), 2),
        "p50_ms": round(sorted(latencies)[len(latencies) // 2], 2),
        "p95_ms": round(sorted(latencies)[int(len(latencies) * 0.95)], 2),
        "p99_ms": round(sorted(latencies)[int(len(latencies) * 0.99)], 2),
        "total_ms": round(sum(latencies), 2),
    }


def benchmark_list_all(mem, iterations: int = 20) -> dict:
    """Benchmark list_all operations."""
    latencies = []
    for _i in range(iterations):
        start = time.monotonic()
        mem.list_all()
        latencies.append((time.monotonic() - start) * 1000)

    return {
        "operation": "list_all",
        "iterations": iterations,
        "avg_ms": round(sum(latencies) / len(latencies), 2),
        "p50_ms": round(sorted(latencies)[len(latencies) // 2], 2),
        "total_ms": round(sum(latencies), 2),
    }


def benchmark_concurrent_store(mem, workers: int = 5, per_worker: int = 20) -> dict:
    """Benchmark concurrent store operations."""
    import threading

    latencies = []
    lock = threading.Lock()

    def worker():
        for i in range(per_worker):
            start = time.monotonic()
            mem.store("fact", f"Concurrent benchmark {threading.current_thread().name}-{i}", {"bench": True})
            elapsed = (time.monotonic() - start) * 1000
            with lock:
                latencies.append(elapsed)

    threads = [threading.Thread(target=worker) for _ in range(workers)]
    start = time.monotonic()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    total = (time.monotonic() - start) * 1000

    return {
        "operation": "concurrent_store",
        "workers": workers,
        "total_iterations": workers * per_worker,
        "avg_ms": round(sum(latencies) / len(latencies), 2),
        "p95_ms": round(sorted(latencies)[int(len(latencies) * 0.95)], 2),
        "total_ms": round(total, 2),
        "throughput_ops_sec": round((workers * per_worker) / (total / 1000), 1),
    }


def run_benchmarks(connection_string: str | None = None, mock: bool = False) -> dict:
    """Run all benchmarks and return results."""
    from bastion.memory import BastionMemory

    mem = BastionMemory("benchmark-agent", connection_string=connection_string, mock=mock)

    # Setup: store some data for search benchmarks
    for i in range(20):
        mem.store("fact", f"Setup memory {i} for benchmark testing with various content", {"setup": True})

    results = {}
    results["store"] = benchmark_store(mem, iterations=50)
    results["search"] = benchmark_search(mem, iterations=50)
    results["list_all"] = benchmark_list_all(mem, iterations=20)
    results["concurrent_store"] = benchmark_concurrent_store(mem, workers=5, per_worker=20)

    # Calculate summary
    total_ops = (
        results["store"]["iterations"]
        + results["search"]["iterations"]
        + results["list_all"]["iterations"]
        + results["concurrent_store"]["total_iterations"]
    )
    total_time = (
        results["store"]["total_ms"]
        + results["search"]["total_ms"]
        + results["list_all"]["total_ms"]
        + results["concurrent_store"]["total_ms"]
    )

    results["summary"] = {
        "total_operations": total_ops,
        "total_time_ms": round(total_time, 2),
        "overall_throughput_ops_sec": round(total_ops / (total_time / 1000), 1),
        "timestamp": datetime.now(UTC).isoformat(),
        "mock_mode": mock,
    }

    mem.close()
    return results


def main():
    parser = argparse.ArgumentParser(description="Bastion Performance Benchmark")
    parser.add_argument("--conn", help="CockroachDB connection string")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode")
    parser.add_argument("--output", help="Output JSON file")
    args = parser.parse_args()

    print("Running Bastion performance benchmarks...")
    results = run_benchmarks(connection_string=args.conn, mock=args.mock)

    # Print summary
    s = results["summary"]
    print(f"\n{'=' * 50}")
    print(f"  Total operations: {s['total_operations']}")
    print(f"  Total time: {s['total_time_ms']:.0f}ms")
    print(f"  Throughput: {s['overall_throughput_ops_sec']:.0f} ops/sec")
    print(f"  Store avg: {results['store']['avg_ms']:.1f}ms")
    print(f"  Search avg: {results['search']['avg_ms']:.1f}ms")
    print(f"  Concurrent throughput: {results['concurrent_store']['throughput_ops_sec']:.0f} ops/sec")
    print(f"{'=' * 50}")

    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2, default=str)
        print(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
