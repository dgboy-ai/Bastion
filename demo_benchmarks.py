#!/usr/bin/env python3
"""
Latency & Recall Benchmarks — Bastion vs baseline expectations.

Measures:
- Store latency (p50, p95, p99)
- Search latency (p50, p95, p99)
- Recall@k for semantic search
- Memory overhead

Run: python demo_benchmarks.py
"""

import time
import statistics
from bastion.memory import BastionMemory


def percentile(data, p):
    """Calculate percentile."""
    if not data:
        return 0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * p / 100
    f = int(k)
    c = min(f + 1, len(sorted_data) - 1)
    if f == c:
        return sorted_data[int(k)]
    return sorted_data[f] + (sorted_data[c] - sorted_data[f]) * (k - f)


def run_benchmarks():
    print("=" * 70)
    print("LATENCY & RECALL BENCHMARKS")
    print("=" * 70)
    print()

    agent = BastionMemory("benchmark-agent", mock=True)

    # Test data
    test_memories = [
        "User prefers dark mode theme",
        "Project deadline is next Friday",
        "Server runs on port 8080",
        "API key stored in vault",
        "Database connection pool size: 20",
        "Customer prefers email communication",
        "Refund policy: 30 days",
        "Invoice INV-001 paid",
        "Meeting with client at 10 AM",
        "System admin is John",
    ] * 10  # 100 memories

    search_queries = [
        "dark mode preference",
        "project deadline",
        "server port",
        "API key location",
        "database pool",
        "email preference",
        "refund policy",
        "invoice payment",
        "client meeting",
        "system administrator",
    ]

    # ===== STORE BENCHMARK =====
    print("1. STORE LATENCY BENCHMARK")
    print("-" * 40)

    store_times = []
    for i, mem in enumerate(test_memories):
        start = time.perf_counter()
        agent.store("fact", mem, metadata={"importance_score": 5 + (i % 5)})
        elapsed = (time.perf_counter() - start) * 1000  # ms
        store_times.append(elapsed)

    print(f"   Samples: {len(store_times)}")
    print(f"   p50: {percentile(store_times, 50):.2f} ms")
    print(f"   p95: {percentile(store_times, 95):.2f} ms")
    print(f"   p99: {percentile(store_times, 99):.2f} ms")
    print(f"   mean: {statistics.mean(store_times):.2f} ms")
    print(f"   max: {max(store_times):.2f} ms")

    # ===== SEARCH BENCHMARK =====
    print("\n2. SEARCH LATENCY BENCHMARK")
    print("-" * 40)

    search_times = []
    for query in search_queries:
        start = time.perf_counter()
        results = agent.search(query, k=5)
        elapsed = (time.perf_counter() - start) * 1000  # ms
        search_times.append(elapsed)

    print(f"   Samples: {len(search_times)}")
    print(f"   p50: {percentile(search_times, 50):.2f} ms")
    print(f"   p95: {percentile(search_times, 95):.2f} ms")
    print(f"   p99: {percentile(search_times, 99):.2f} ms")
    print(f"   mean: {statistics.mean(search_times):.2f} ms")
    print(f"   max: {max(search_times):.2f} ms")

    # ===== RECALL@K BENCHMARK =====
    print("\n3. RECALL@K BENCHMARK")
    print("-" * 40)

    # Ground truth: each query should find its corresponding memory
    recall_at_1 = 0
    recall_at_3 = 0
    recall_at_5 = 0
    total_queries = len(search_queries)

    for i, query in enumerate(search_queries):
        results = agent.search(query, k=5)
        result_contents = [r.content.lower() for r in results]

        # Check if expected memory is in results
        expected = test_memories[i].lower()
        found_at_1 = any(expected in r for r in result_contents[:1])
        found_at_3 = any(expected in r for r in result_contents[:3])
        found_at_5 = any(expected in r for r in result_contents[:5])

        if found_at_1:
            recall_at_1 += 1
        if found_at_3:
            recall_at_3 += 1
        if found_at_5:
            recall_at_5 += 1

    print(f"   Recall@1: {recall_at_1}/{total_queries} = {recall_at_1/total_queries*100:.1f}%")
    print(f"   Recall@3: {recall_at_3}/{total_queries} = {recall_at_3/total_queries*100:.1f}%")
    print(f"   Recall@5: {recall_at_5}/{total_queries} = {recall_at_5/total_queries*100:.1f}%")

    # ===== DREAM CONSOLIDATION BENCHMARK =====
    print("\n4. DREAM CONSOLIDATION BENCHMARK")
    print("-" * 40)

    from bastion.dreaming import MemoryDreamer

    dreamer = MemoryDreamer(agent, lookback_hours=24, enable_llm=False)

    dream_times = []
    for _ in range(5):
        start = time.perf_counter()
        journal = dreamer.dream()
        elapsed = (time.perf_counter() - start) * 1000
        dream_times.append(elapsed)

    print(f"   Samples: {len(dream_times)}")
    print(f"   p50: {percentile(dream_times, 50):.2f} ms")
    print(f"   p95: {percentile(dream_times, 95):.2f} ms")
    print(f"   mean: {statistics.mean(dream_times):.2f} ms")

    # ===== SUMMARY =====
    print("\n" + "=" * 70)
    print("BENCHMARK SUMMARY")
    print("=" * 70)
    print(f"""
Store Latency:
  p50: {percentile(store_times, 50):.2f} ms | p95: {percentile(store_times, 95):.2f} ms | p99: {percentile(store_times, 99):.2f} ms

Search Latency:
  p50: {percentile(search_times, 50):.2f} ms | p95: {percentile(search_times, 95):.2f} ms | p99: {percentile(search_times, 99):.2f} ms

Recall:
  @1: {recall_at_1/total_queries*100:.1f}% | @3: {recall_at_3/total_queries*100:.1f}% | @5: {recall_at_5/total_queries*100:.1f}%

Dream Consolidation:
  p50: {percentile(dream_times, 50):.2f} ms | p95: {percentile(dream_times, 95):.2f} ms

Baseline Expectations (from literature):
  - mem0: ~50-100ms store, ~30-80ms search, Recall@5 ~85%
  - Letta: ~100-200ms store, ~50-150ms search, Recall@5 ~80%
  - Zep: ~20-50ms store, ~10-30ms search, Recall@5 ~90%

Bastion Target: Sub-100ms store/search, Recall@5 > 90%
""")


if __name__ == "__main__":
    run_benchmarks()