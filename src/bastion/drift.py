from __future__ import annotations

import json
import logging
import threading
from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.memory import BastionMemory

logger = logging.getLogger(__name__)

DRIFT_DIMENSIONS = [
    "memory_access_pattern",
    "semantic_similarity",
    "conflict_resolution_rate",
    "hash_chain_gap_ratio",
    "retrieval_to_store_ratio",
    "namespace_isolation",
]


@dataclass
class DriftReport:
    agent_id: str
    overall_drift_score: float
    dimensions: dict[str, float]
    baseline_sessions: int
    alert_threshold: float = 0.3
    status: str = "HEALTHY"
    top_drift_signals: list[str] = field(default_factory=list)
    recommendation: str = ""


def _classify_drift(score: float, threshold: float) -> str:
    if score >= threshold * 2:
        return "CRITICAL"
    if score >= threshold:
        return "DRIFTING"
    return "HEALTHY"


def _generate_recommendation(dimensions: dict[str, float], threshold: float) -> str:
    high = [(dim, val) for dim, val in dimensions.items() if val >= threshold]
    if not high:
        return "No action needed. Agent behavior is stable."
    parts = []
    for dim, _ in high:
        if dim == "memory_access_pattern":
            parts.append("Investigate shifting memory access patterns")
        elif dim == "semantic_similarity":
            parts.append("Review query topic divergence")
        elif dim == "conflict_resolution_rate":
            parts.append("Check for increased CRDT merge conflicts")
        elif dim == "hash_chain_gap_ratio":
            parts.append("Verify Merkle chain integrity")
        elif dim == "retrieval_to_store_ratio":
            parts.append("Agent is reading more than writing — check for loop behavior")
        elif dim == "namespace_isolation":
            parts.append("Namespace isolation violations detected")
    return "; ".join(parts)


class BehavioralDriftDetector:
    def __init__(self, memory: BastionMemory):
        self.memory = memory
        self._watch_thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def establish_baseline(self, agent_id: str, window: str = "7d") -> dict[str, dict[str, float]]:
        all_memories = self.memory.list_all(namespace_scope="shared")
        agent_memories = [m for m in all_memories if m.agent_id == agent_id]
        audit_entries = self.memory.audit(agent_id)

        baseline: dict[str, dict[str, float]] = {}

        access_types = Counter(m.memory_type for m in agent_memories)
        total = len(agent_memories) or 1
        baseline["memory_access_pattern"] = {
            "mean": sum(access_types.values()) / max(len(access_types), 1),
            "stddev": _stddev(list(access_types.values())),
        }

        all_contents = [m.content for m in agent_memories]
        word_counts = _word_frequencies(all_contents)
        baseline["semantic_similarity"] = {
            "mean": len(word_counts) / total,
            "stddev": sum(word_counts.values()) / max(len(word_counts), 1),
        }

        store_count = sum(1 for e in audit_entries if "store" in e.action)
        search_count = sum(1 for e in audit_entries if "search" in e.action)
        total_ops = store_count + search_count or 1
        baseline["retrieval_to_store_ratio"] = {
            "mean": search_count / total_ops,
            "stddev": abs(search_count - store_count) / max(total_ops, 1),
        }

        conflict_count = sum(1 for e in audit_entries if "conflict" in e.action or "resolve" in e.action)
        baseline["conflict_resolution_rate"] = {
            "mean": conflict_count / max(total_ops, 1),
            "stddev": 0.05,
        }

        hash_gaps = _count_hash_gaps(agent_memories)
        baseline["hash_chain_gap_ratio"] = {
            "mean": hash_gaps / max(len(agent_memories), 1),
            "stddev": 0.02,
        }

        ns_violations_baseline = 0
        for m in all_memories:
            if m.agent_id != agent_id and hasattr(self.memory, "namespace") and self.memory.namespace:
                ns_violations_baseline += 1
        baseline["namespace_isolation"] = {
            "mean": ns_violations_baseline / max(len(all_memories), 1),
            "stddev": 0.1,
        }

        mem_count = len(agent_memories)
        baseline["_meta"] = {
            "total_memories": mem_count,
            "total_audit_entries": len(audit_entries),
            "agent_id": agent_id,
        }

        return baseline

    def score_drift(
        self,
        agent_id: str,
        baseline: dict[str, dict[str, float]] | None = None,
        alert_threshold: float = 0.3,
    ) -> DriftReport:
        if baseline is None:
            baseline = self.establish_baseline(agent_id)

        all_memories = self.memory.list_all(namespace_scope="shared")
        agent_memories = [m for m in all_memories if m.agent_id == agent_id]
        audit_entries = self.memory.audit(agent_id)

        dim_scores: dict[str, float] = {}
        top_signals: list[str] = []
        total = len(agent_memories) or 1
        total_ops = len(audit_entries) or 1
        search_count = sum(1 for e in audit_entries if "search" in e.action)

        access_types = Counter(m.memory_type for m in agent_memories)
        current_access_mean = sum(access_types.values()) / max(len(access_types), 1)
        bl_access = baseline.get("memory_access_pattern", {})
        bl_access_mean = bl_access.get("mean", current_access_mean)
        bl_access_std = bl_access.get("stddev", 0.1) or 0.01
        access_drift = abs(current_access_mean - bl_access_mean) / bl_access_std
        dim_scores["memory_access_pattern"] = round(min(max(access_drift / 3.0, 0.0), 1.0), 4)
        if dim_scores["memory_access_pattern"] >= alert_threshold:
            top_signals.append("memory_access_pattern")

        all_contents = [m.content for m in agent_memories]
        word_counts = _word_frequencies(all_contents)
        current_sem_mean = len(word_counts) / total
        bl_sem = baseline.get("semantic_similarity", {})
        bl_sem_mean = bl_sem.get("mean", current_sem_mean)
        bl_sem_std = bl_sem.get("stddev", 0.1) or 0.01
        sem_drift = abs(current_sem_mean - bl_sem_mean) / bl_sem_std
        dim_scores["semantic_similarity"] = round(min(max(sem_drift / 3.0, 0.0), 1.0), 4)
        if dim_scores["semantic_similarity"] >= alert_threshold:
            top_signals.append("semantic_similarity")

        current_rtr = search_count / total_ops
        bl_rtr = baseline.get("retrieval_to_store_ratio", {})
        bl_rtr_mean = bl_rtr.get("mean", current_rtr)
        bl_rtr_std = bl_rtr.get("stddev", 0.1) or 0.01
        rtr_drift = abs(current_rtr - bl_rtr_mean) / bl_rtr_std
        dim_scores["retrieval_to_store_ratio"] = round(min(max(rtr_drift / 3.0, 0.0), 1.0), 4)
        if dim_scores["retrieval_to_store_ratio"] >= alert_threshold:
            top_signals.append("retrieval_to_store_ratio")

        conflict_count = sum(1 for e in audit_entries if "conflict" in e.action or "resolve" in e.action)
        current_conflict = conflict_count / total_ops
        bl_conflict = baseline.get("conflict_resolution_rate", {})
        bl_conflict_mean = bl_conflict.get("mean", current_conflict)
        bl_conflict_std = bl_conflict.get("stddev", 0.05) or 0.01
        conflict_drift = abs(current_conflict - bl_conflict_mean) / bl_conflict_std
        dim_scores["conflict_resolution_rate"] = round(min(max(conflict_drift / 3.0, 0.0), 1.0), 4)
        if dim_scores["conflict_resolution_rate"] >= alert_threshold:
            top_signals.append("conflict_resolution_rate")

        hash_gaps = _count_hash_gaps(agent_memories)
        current_gap_ratio = hash_gaps / total
        bl_gap = baseline.get("hash_chain_gap_ratio", {})
        bl_gap_mean = bl_gap.get("mean", current_gap_ratio)
        bl_gap_std = bl_gap.get("stddev", 0.02) or 0.01
        gap_drift = abs(current_gap_ratio - bl_gap_mean) / bl_gap_std
        dim_scores["hash_chain_gap_ratio"] = round(min(max(gap_drift / 3.0, 0.0), 1.0), 4)
        if dim_scores["hash_chain_gap_ratio"] >= alert_threshold:
            top_signals.append("hash_chain_gap_ratio")

        ns_violations = 0
        for m in all_memories:
            if m.agent_id != agent_id and hasattr(self.memory, "namespace") and self.memory.namespace:
                ns_violations += 1
        current_ns = ns_violations / max(len(all_memories), 1)
        bl_ns = baseline.get("namespace_isolation", {})
        bl_ns_mean = bl_ns.get("mean", current_ns)
        bl_ns_std = bl_ns.get("stddev", 0.1) or 0.01
        ns_drift = abs(current_ns - bl_ns_mean) / bl_ns_std
        dim_scores["namespace_isolation"] = round(min(max(ns_drift / 3.0, 0.0), 1.0), 4)
        if dim_scores["namespace_isolation"] >= alert_threshold:
            top_signals.append("namespace_isolation")

        overall = sum(dim_scores.values()) / max(len(dim_scores), 1)
        overall = round(min(max(overall, 0.0), 1.0), 4)

        bl_meta = baseline.get("_meta", {})
        baseline_sessions = bl_meta.get("total_memories", 0)

        status = _classify_drift(overall, alert_threshold)
        recommendation = _generate_recommendation(dim_scores, alert_threshold)

        return DriftReport(
            agent_id=agent_id,
            overall_drift_score=overall,
            dimensions=dim_scores,
            baseline_sessions=baseline_sessions,
            alert_threshold=alert_threshold,
            status=status,
            top_drift_signals=top_signals,
            recommendation=recommendation,
        )

    def watch(self, agent_id: str, interval_seconds: int = 300) -> None:
        baseline = self.establish_baseline(agent_id)

        def _loop():
            logger.info("Drift watch started for agent %s (interval=%ds)", agent_id, interval_seconds)
            while not self._stop_event.is_set():
                try:
                    report = self.score_drift(agent_id, baseline)
                    self._store_drift_score(agent_id, report)
                except Exception:
                    logger.exception("Drift watch iteration failed for agent %s", agent_id)
                self._stop_event.wait(interval_seconds)
            logger.info("Drift watch stopped for agent %s", agent_id)

        self._watch_thread = threading.Thread(target=_loop, daemon=True)
        self._watch_thread.start()

    def stop_watch(self) -> None:
        self._stop_event.set()
        if self._watch_thread and self._watch_thread.is_alive():
            self._watch_thread.join(timeout=5)

    def _store_drift_score(self, agent_id: str, report: DriftReport) -> None:
        if self.memory._mock:
            _mock_store_drift_score(agent_id, report)
        else:
            self._store_drift_score_real(agent_id, report)

    def _store_drift_score_real(self, agent_id: str, report: DriftReport) -> None:
        conn = self.memory._conn
        if conn is None or conn.closed:
            logger.warning("Cannot store drift score: no DB connection")
            return
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO agent_drift_scores
                        (agent_id, overall_drift_score, dimensions, baseline_sessions,
                         alert_threshold, status, top_drift_signals, recommendation)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        agent_id, report.overall_drift_score,
                        json.dumps(report.dimensions),
                        report.baseline_sessions,
                        report.alert_threshold,
                        report.status,
                        json.dumps(report.top_drift_signals),
                        report.recommendation,
                    ),
                )
                conn.commit()
        except Exception:
            logger.exception("Failed to store drift score for agent %s", agent_id)

    def recent_scores(self, agent_id: str, limit: int = 100) -> list[dict[str, Any]]:
        if self.memory._mock:
            return _mock_recent_drift_scores(agent_id, limit)
        return self._recent_scores_real(agent_id, limit)

    def _recent_scores_real(self, agent_id: str, limit: int = 100) -> list[dict[str, Any]]:
        conn = self.memory._conn
        if conn is None or conn.closed:
            return []
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT score_id, overall_drift_score, dimensions, baseline_sessions,
                           alert_threshold, status, top_drift_signals, recommendation,
                           scorable_at
                    FROM agent_drift_scores
                    WHERE agent_id = %s
                    ORDER BY scorable_at DESC
                    LIMIT %s
                    """,
                    (agent_id, limit),
                )
                rows = cur.fetchall()
                results = []
                for row in rows:
                    rm = row._mapping if hasattr(row, '_mapping') else {
                        "score_id": row[0], "overall_drift_score": row[1],
                        "dimensions": row[2], "baseline_sessions": row[3],
                        "alert_threshold": row[4], "status": row[5],
                        "top_drift_signals": row[6], "recommendation": row[7],
                        "scorable_at": row[8],
                    }
                    results.append({
                        "score_id": str(rm["score_id"]),
                        "overall_drift_score": float(rm["overall_drift_score"]),
                        "dimensions": _parse_json_field(rm["dimensions"]),
                        "baseline_sessions": int(rm["baseline_sessions"]),
                        "alert_threshold": float(rm["alert_threshold"]),
                        "status": str(rm["status"]),
                        "top_drift_signals": _parse_json_field(rm["top_drift_signals"]),
                        "recommendation": str(rm["recommendation"]),
                        "scorable_at": rm["scorable_at"].isoformat()
                            if hasattr(rm["scorable_at"], "isoformat")
                            else str(rm["scorable_at"]),
                    })
                return results
        except Exception:
            logger.exception("Failed to fetch recent drift scores for agent %s", agent_id)
            return []


def _parse_json_field(v: Any) -> Any:
    return json.loads(v) if isinstance(v, str) else v


_MOCK_DRIFT_SCORES: dict[str, list[dict[str, Any]]] = {}


def _mock_store_drift_score(agent_id: str, report: DriftReport) -> None:
    if agent_id not in _MOCK_DRIFT_SCORES:
        _MOCK_DRIFT_SCORES[agent_id] = []
    _MOCK_DRIFT_SCORES[agent_id].append({
        "score_id": str(hash(report.overall_drift_score) & 0xFFFFFFFF ^ hash(agent_id) & 0xFFFFFFFF),
        "agent_id": report.agent_id,
        "overall_drift_score": report.overall_drift_score,
        "dimensions": report.dimensions,
        "baseline_sessions": report.baseline_sessions,
        "alert_threshold": report.alert_threshold,
        "status": report.status,
        "top_drift_signals": report.top_drift_signals,
        "recommendation": report.recommendation,
        "scorable_at": datetime.now(UTC).isoformat(),
    })


def _mock_recent_drift_scores(agent_id: str, limit: int = 100) -> list[dict[str, Any]]:
    scores = _MOCK_DRIFT_SCORES.get(agent_id, [])
    return scores[-limit:]


def _word_frequencies(contents: list[str]) -> Counter:
    stop_words = {
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "need", "dare", "ought",
        "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above", "below",
        "between", "out", "off", "over", "under", "again", "further", "then",
        "once", "here", "there", "when", "where", "why", "how", "all", "each",
        "every", "both", "few", "more", "most", "other", "some", "such", "no",
        "not", "only", "own", "same", "so", "than", "too", "very", "just",
        "don't", "now", "and", "but", "or", "if", "while", "that", "this",
        "it", "its", "i", "my", "me", "we", "our", "you", "your", "he", "she",
        "they", "them", "what", "which", "who", "whom",
    }
    counts: Counter = Counter()
    for text in contents:
        for word in text.lower().split():
            cleaned = word.strip(".,!?;:\"'()[]{}")
            if cleaned and len(cleaned) > 2 and cleaned not in stop_words:
                counts[cleaned] += 1
    return counts


def _stddev(values: list[float | int]) -> float:
    n = len(values)
    if n < 2:
        return 0.1
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / max(n - 1, 1)
    std = variance ** 0.5
    return std if std > 0 else 0.1


def _count_hash_gaps(memories: list) -> int:
    sorted_mems = sorted(memories, key=lambda m: m.created_at or datetime.min.replace(tzinfo=UTC))
    gaps = 0
    prev_hash = None
    for mem in sorted_mems:
        if mem.previous_hash != prev_hash and prev_hash is not None:
            gaps += 1
        prev_hash = mem.cryptographic_hash
    return gaps
