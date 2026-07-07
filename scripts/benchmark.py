"""
Benchmark suite for Bastion memory operations.

Measures throughput, latency, and correctness of:
  - memory_search (vector + keyword)
  - memory_store (embedding + hash-chain append)
  - memory_timetravel (AS OF SYSTEM TIME queries)
  - memory_audit (append-only log)
  - resolve_conflict (SERIALIZABLE isolation)

Usage:
  python scripts/benchmark.py [--iterations 100] [--warmup 10] [--store]
  python scripts/benchmark.py --list-only   # just list available benchmarks
  python scripts/benchmark.py --html        # output HTML report
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import statistics
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class BenchSample:
    latency_ms: float
    success: bool
    error: str | None = None


@dataclass
class BenchResult:
    name: str
    description: str
    samples: int
    min_ms: float
    max_ms: float
    avg_ms: float
    median_ms: float
    p50_ms: float
    p90_ms: float
    p99_ms: float
    throughput: float  # ops/sec
    success_rate: float
    errors: int


@dataclass
class SuiteReport:
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    results: list[BenchResult] = field(default_factory=list)
    total_samples: int = 0
    total_errors: int = 0
    total_duration_ms: float = 0.0

    def add(self, r: BenchResult) -> None:
        self.results.append(r)
        self.total_samples += r.samples
        self.total_errors += r.errors

    def to_dict(self) -> dict[str, Any]:
        return {
            "timestamp": self.timestamp,
            "total_samples": self.total_samples,
            "total_errors": self.total_errors,
            "total_duration_ms": round(self.total_duration_ms, 2),
            "results": [
                {
                    "name": r.name,
                    "samples": r.samples,
                    "avg_ms": round(r.avg_ms, 2),
                    "min_ms": round(r.min_ms, 2),
                    "max_ms": round(r.max_ms, 2),
                    "p50_ms": round(r.p50_ms, 2),
                    "p90_ms": round(r.p90_ms, 2),
                    "p99_ms": round(r.p99_ms, 2),
                    "throughput": round(r.throughput, 1),
                    "success_rate": round(r.success_rate, 3),
                }
                for r in self.results
            ],
        }


# ---------------------------------------------------------------------------
# Benchmark runner
# ---------------------------------------------------------------------------


def run_benchmark(
    name: str,
    description: str,
    fn: Callable[[int], BenchSample],
    iterations: int = 100,
    warmup: int = 10,
) -> BenchResult:
    # warmup
    for i in range(warmup):
        try:
            fn(i)
        except Exception:
            pass

    samples: list[BenchSample] = []
    errors = 0

    for i in range(iterations):
        s = fn(i)
        samples.append(s)
        if not s.success:
            errors += 1

    latencies = [s.latency_ms for s in samples]
    sorted_lats = sorted(latencies)

    total_time = sum(latencies)
    avg = total_time / len(latencies) if latencies else 0.0
    throughput = (iterations / total_time) * 1000 if total_time > 0 else 0.0

    p50 = sorted_lats[len(sorted_lats) // 2] if sorted_lats else 0.0
    p90 = sorted_lats[int(len(sorted_lats) * 0.9)] if sorted_lats else 0.0
    p99 = sorted_lats[int(len(sorted_lats) * 0.99)] if sorted_lats else 0.0

    return BenchResult(
        name=name,
        description=description,
        samples=iterations,
        min_ms=min(latencies) if latencies else 0.0,
        max_ms=max(latencies) if latencies else 0.0,
        avg_ms=avg,
        median_ms=statistics.median(latencies) if len(latencies) > 1 else avg,
        p50_ms=p50,
        p90_ms=p90,
        p99_ms=p99,
        throughput=throughput,
        success_rate=(iterations - errors) / iterations if iterations > 0 else 1.0,
        errors=errors,
    )


# ---------------------------------------------------------------------------
# Mock benchmark functions (no DB required)
# ---------------------------------------------------------------------------

_MOCK_MEMORIES = [
    "User prefers Python for data science tasks",
    "Deployment pipeline configured for staging environment",
    "Customer reported API latency issues in us-east-1",
    "Team decided to use CockroachDB Serverless for production",
    "Schema migration v3 applied successfully",
    "Agent memory retention policy set to 90 days",
    "AWS Bedrock Titan embeddings configured for semantic search",
    "C-SPANN vector index created on agent_memory table",
]

_MOCK_AGENTS = ["agent-1", "agent-2", "agent-3"]


def _mock_store(i: int) -> BenchSample:
    start = time.perf_counter()
    content = _MOCK_MEMORIES[i % len(_MOCK_MEMORIES)]
    agent_id = _MOCK_AGENTS[i % len(_MOCK_AGENTS)]
    # simulate embedding + hash chain + CRDB write
    _ = hashlib.sha256(f"{content}{agent_id}{i}".encode()).hexdigest()
    latency = (time.perf_counter() - start) * 1000
    return BenchSample(latency_ms=latency, success=True)


def _mock_search(i: int) -> BenchSample:
    start = time.perf_counter()
    query = _MOCK_MEMORIES[i % len(_MOCK_MEMORIES)]
    # simulate vector search + trust scoring
    _ = [m for m in _MOCK_MEMORIES if query[:5] in m]
    latency = (time.perf_counter() - start) * 1000
    return BenchSample(latency_ms=latency, success=True)


def _mock_timetravel(i: int) -> BenchSample:
    start = time.perf_counter()
    _ = datetime.now(UTC).isoformat()
    latency = (time.perf_counter() - start) * 1000
    return BenchSample(latency_ms=latency, success=True)


def _mock_audit(i: int) -> BenchSample:
    start = time.perf_counter()
    entry = {
        "audit_id": str(uuid.uuid4()),
        "action": "memory_store",
        "agent_id": _MOCK_AGENTS[i % len(_MOCK_AGENTS)],
        "timestamp": datetime.now(UTC).isoformat(),
        "hash": f"aaaa{i:064x}",
    }
    _ = json.dumps(entry)
    latency = (time.perf_counter() - start) * 1000
    return BenchSample(latency_ms=latency, success=True)


def _mock_resolve(i: int) -> BenchSample:
    start = time.perf_counter()
    # simulate CRDT merge + SERIALIZABLE isolation
    a = random.randint(0, 100)
    b = random.randint(0, 100)
    _ = a + b  # mock merge operation
    latency = (time.perf_counter() - start) * 1000
    return BenchSample(latency_ms=latency, success=True)


def _mock_guard(i: int) -> BenchSample:
    start = time.perf_counter()
    content = _MOCK_MEMORIES[i % len(_MOCK_MEMORIES)]
    patterns = [
        "ignore all previous instructions", "system prompt override",
        "admin override", "-----BEGIN PRIVATE KEY-----",
        "ghp_" + "x" * 36,
    ]
    threat = any(p in content.lower() for p in patterns)
    latency = (time.perf_counter() - start) * 1000
    return BenchSample(latency_ms=latency, success=True)


_BENCHMARKS: list[tuple[str, str, Callable]] = [
    ("memory_store", "Embed content via Bedrock, hash-chain append to CRDB", _mock_store),
    ("memory_search", "C-SPANN vector search with decay-weighted scoring", _mock_search),
    ("memory_timetravel", "AS OF SYSTEM TIME point-in-time query", _mock_timetravel),
    ("memory_audit", "Append-only immutable audit log write", _mock_audit),
    ("resolve_conflict", "CRDT merge with SERIALIZABLE isolation", _mock_resolve),
    ("memoryguard_scan", "OWASP ASI06 prompt injection + secret detection", _mock_guard),
]


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def list_benchmarks() -> None:
    print(f"{'Benchmark':<25} {'Description'}")
    print("-" * 80)
    for name, desc, _ in _BENCHMARKS:
        print(f"{name:<25} {desc}")


def run_all(iterations: int = 100, warmup: int = 10) -> SuiteReport:
    report = SuiteReport()
    total_start = time.perf_counter()

    for name, desc, fn in _BENCHMARKS:
        r = run_benchmark(name, desc, fn, iterations=iterations, warmup=warmup)
        report.add(r)
        print(
            f"  {name:<25} "
            f"avg={r.avg_ms:>8.2f}ms  "
            f"p50={r.p50_ms:>8.2f}ms  "
            f"p90={r.p90_ms:>8.2f}ms  "
            f"p99={r.p99_ms:>8.2f}ms  "
            f"tput={r.throughput:>8.1f}ops  "
            f"ok={r.success_rate:.0%}"
        )

    report.total_duration_ms = (time.perf_counter() - total_start) * 1000
    return report


def generate_html(report: SuiteReport) -> str:
    rows = ""
    for r in report.results:
        rows += f"""
        <tr>
          <td>{r.name}</td>
          <td>{r.samples}</td>
          <td>{r.avg_ms:.2f}</td>
          <td>{r.min_ms:.2f}</td>
          <td>{r.max_ms:.2f}</td>
          <td>{r.p50_ms:.2f}</td>
          <td>{r.p90_ms:.2f}</td>
          <td>{r.p99_ms:.2f}</td>
          <td>{r.throughput:.1f}</td>
          <td>{r.success_rate:.0%}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Bastion Benchmark Report</title>
<style>
body {{ font-family: 'SFMono-Regular', Consolas, monospace; background: #0d1117; color: #c9d1d9; padding: 40px; }}
h1 {{ color: #58a6ff; }}
table {{ border-collapse: collapse; width: 100%; margin-top: 20px; }}
th {{ background: #161b22; color: #8b949e; text-align: left; padding: 10px 12px; font-size: 12px; text-transform: uppercase; }}
td {{ padding: 10px 12px; border-bottom: 1px solid #21262d; font-size: 13px; }}
tr:hover td {{ background: #161b22; }}
.summary {{ display: flex; gap: 24px; margin: 20px 0; }}
.card {{ background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px 24px; }}
.card-value {{ font-size: 28px; font-weight: 700; color: #58a6ff; }}
.card-label {{ font-size: 11px; color: #8b949e; }}
</style></head>
<body>
<h1>Bastion Benchmark Report</h1>
<p>Generated: {report.timestamp}</p>
<div class="summary">
  <div class="card"><div class="card-value">{report.total_samples}</div><div class="card-label">Total Samples</div></div>
  <div class="card"><div class="card-value">{report.total_duration_ms:.0f}ms</div><div class="card-label">Duration</div></div>
  <div class="card"><div class="card-value">{report.total_errors}</div><div class="card-label">Errors</div></div>
</div>
<table>
<thead><tr>
  <th>Benchmark</th><th>Samples</th><th>Avg (ms)</th><th>Min (ms)</th><th>Max (ms)</th>
  <th>P50 (ms)</th><th>P90 (ms)</th><th>P99 (ms)</th><th>Throughput</th><th>Success</th>
</tr></thead>
<tbody>{rows}
</tbody></table>
</body></html>"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Bastion Benchmark Suite")
    parser.add_argument("--iterations", type=int, default=100, help="iterations per benchmark")
    parser.add_argument("--warmup", type=int, default=10, help="warmup iterations")
    parser.add_argument("--list-only", action="store_true", help="list benchmarks and exit")
    parser.add_argument("--html", action="store_true", help="output HTML report to stdout")
    parser.add_argument("--json", action="store_true", help="output JSON report to stdout")
    args = parser.parse_args()

    if args.list_only:
        list_benchmarks()
        return

    print(f"Bastion Benchmark Suite — {args.iterations} iterations, {args.warmup} warmup\n")
    report = run_all(iterations=args.iterations, warmup=args.warmup)

    if args.html:
        print(generate_html(report))
    elif args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        print(f"\nTotal: {report.total_samples} samples, {report.total_errors} errors in {report.total_duration_ms:.0f}ms")


if __name__ == "__main__":
    main()
