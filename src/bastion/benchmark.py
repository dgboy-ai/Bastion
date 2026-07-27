"""Recall Benchmark — LongMemEval-style evaluation of memory retrieval quality.

Measures how well the memory system retrieves relevant memories given queries,
with metrics for precision, recall, F1, and MRR (Mean Reciprocal Rank).

Usage:
    benchmark = RecallBenchmark(memory_engine)
    results = benchmark.run(test_cases)
    print(f"Precision@5: {results['precision_at_5']:.3f}")
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


@dataclass
class TestCase:
    """A single benchmark test case."""

    query: str
    expected_memory_ids: list[str]
    description: str = ""


@dataclass
class BenchmarkResult:
    """Results from a benchmark run."""

    total_cases: int = 0
    precision_at_1: float = 0.0
    precision_at_3: float = 0.0
    precision_at_5: float = 0.0
    recall_at_5: float = 0.0
    mrr: float = 0.0
    f1_at_5: float = 0.0
    avg_latency_ms: float = 0.0
    per_case: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_cases": self.total_cases,
            "precision_at_1": round(self.precision_at_1, 4),
            "precision_at_3": round(self.precision_at_3, 4),
            "precision_at_5": round(self.precision_at_5, 4),
            "recall_at_5": round(self.recall_at_5, 4),
            "mrr": round(self.mrr, 4),
            "f1_at_5": round(self.f1_at_5, 4),
            "avg_latency_ms": round(self.avg_latency_ms, 2),
        }


class RecallBenchmark:
    """Evaluate memory retrieval quality using standard IR metrics."""

    def __init__(self, memory_engine: Any):
        self._memory = memory_engine

    def run(
        self,
        test_cases: list[TestCase],
        k: int = 5,
        threshold: float = 0.0,
    ) -> BenchmarkResult:
        """Run benchmark on all test cases.

        Args:
            test_cases: List of TestCase with queries and expected results.
            k: Number of results to retrieve per query.
            threshold: Minimum similarity threshold.

        Returns:
            BenchmarkResult with aggregated metrics.
        """
        result = BenchmarkResult(total_cases=len(test_cases))
        latencies = []

        for tc in test_cases:
            start = time.monotonic()
            retrieved = self._memory.search(
                query=tc.query,
                k=k,
                threshold=threshold,
            )
            latency_ms = (time.monotonic() - start) * 1000
            latencies.append(latency_ms)

            retrieved_ids = [r.memory_id for r in retrieved]
            expected_set = set(tc.expected_memory_ids)

            # Precision@k: fraction of retrieved that are relevant
            relevant_retrieved = [rid for rid in retrieved_ids if rid in expected_set]
            precision = len(relevant_retrieved) / max(1, len(retrieved_ids))

            # Recall@k: fraction of relevant that are retrieved
            recall = len(relevant_retrieved) / max(1, len(expected_set))

            # MRR: reciprocal rank of first relevant result
            mrr = 0.0
            for i, rid in enumerate(retrieved_ids):
                if rid in expected_set:
                    mrr = 1.0 / (i + 1)
                    break

            # F1: harmonic mean of precision and recall
            f1 = 2 * precision * recall / max(0.001, precision + recall)

            result.per_case.append(
                {
                    "query": tc.query[:100],
                    "expected": list(expected_set),
                    "retrieved": retrieved_ids[:k],
                    "precision": round(precision, 4),
                    "recall": round(recall, 4),
                    "mrr": round(mrr, 4),
                    "latency_ms": round(latency_ms, 2),
                }
            )

            # Accumulate for averages
            result.precision_at_1 += 1.0 if retrieved_ids and retrieved_ids[0] in expected_set else 0.0
            result.precision_at_3 += precision
            result.precision_at_5 += precision
            result.recall_at_5 += recall
            result.mrr += mrr
            result.f1_at_5 += f1

        # Average metrics
        n = max(1, len(test_cases))
        result.precision_at_1 /= n
        result.precision_at_3 /= n
        result.precision_at_5 /= n
        result.recall_at_5 /= n
        result.mrr /= n
        result.f1_at_5 /= n
        result.avg_latency_ms = sum(latencies) / max(1, len(latencies))

        logger.info(
            "Benchmark complete: P@5=%.3f R@5=%.3f MRR=%.3f F1@5=%.3f",
            result.precision_at_5,
            result.recall_at_5,
            result.mrr,
            result.f1_at_5,
        )

        return result
