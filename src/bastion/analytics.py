"""
Memory Analytics — Understand what your agent is learning.

Provides insights into:
- Memory growth over time
- Topic distribution (what does the agent know about?)
- Importance decay curves
- Cache hit rates
- Anomaly detection alerts
- Memory health score
- Agent behavior patterns

Usage:
    from bastion.analytics import MemoryAnalytics

    analytics = MemoryAnalytics(memory)
    report = analytics.full_report()
    print(f"Health: {report['health_score']}/100")
    print(f"Topics: {report['topic_distribution']}")
"""

from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any, cast

from bastion.memory import BastionMemory


class MemoryAnalytics:
    """
    Analytics engine for agent memory.
    Provides insights into memory health, growth, and patterns.
    """

    def __init__(self, memory: BastionMemory):
        self.memory = memory

    def full_report(self) -> dict[str, Any]:
        """Generate a comprehensive analytics report."""
        all_memories = self.memory.list_all()
        return {
            "agent_id": self.memory.agent_id,
            "generated_at": datetime.now(UTC).isoformat(),
            "summary": self.summary(all_memories),
            "health_score": self.health_score(all_memories),
            "growth": self.growth_analysis(all_memories),
            "topics": self.topic_distribution(all_memories),
            "decay": self.decay_analysis(all_memories),
            "quality": self.quality_metrics(all_memories),
            "anomalies": self.memory.detect_anomalies(),
        }

    def summary(self, all_memories: list | None = None) -> dict[str, Any]:
        """Get memory summary statistics."""
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return {
                "total_memories": 0,
                "memory_types": {},
                "avg_importance": 0.0,
                "avg_age_hours": 0.0,
            }

        # Count by type
        type_counts = Counter(m.memory_type for m in all_memories)

        # Calculate average importance
        importance_scores = [m.importance_score for m in all_memories]
        avg_importance = sum(importance_scores) / len(importance_scores) if importance_scores else 0.0

        # Calculate average age
        now = datetime.now(UTC)
        ages = []
        for m in all_memories:
            if m.created_at:
                age = (now - m.created_at).total_seconds() / 3600
                ages.append(age)
        avg_age = sum(ages) / len(ages) if ages else 0.0

        return {
            "total_memories": len(all_memories),
            "memory_types": dict(type_counts),
            "avg_importance": round(avg_importance, 2),
            "avg_age_hours": round(avg_age, 2),
            "oldest_memory": min((m.created_at for m in all_memories if m.created_at), default=None),
            "newest_memory": max((m.created_at for m in all_memories if m.created_at), default=None),
        }

    def health_score(self, all_memories: list | None = None) -> int:
        """
        Calculate memory health score (0-100).

        Factors:
        - Memory count (too few = bad, too many = bad)
        - Importance distribution (should be balanced)
        - Age distribution (should have mix of old and new)
        - Duplicate rate (should be low)
        """
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return 0

        score = 100

        # Factor 1: Memory count (ideal: 10-500)
        count = len(all_memories)
        if count < 5:
            score -= 30
        elif count < 10:
            score -= 15
        elif count > 1000:
            score -= 10  # Too many memories = bloat
        elif count > 500:
            score -= 5

        # Factor 2: Importance distribution (should have variety)
        importance_scores = [m.importance_score for m in all_memories]
        if importance_scores:
            avg_imp = sum(importance_scores) / len(importance_scores)
            if avg_imp < 3.0:
                score -= 20  # Most memories are low importance
            elif avg_imp > 9.0:
                score -= 10  # Everything is "important" = nothing is

        # Factor 3: Duplicate rate
        contents = [m.content.strip().lower() for m in all_memories]
        unique_contents = set(contents)
        duplicate_rate = 1 - (len(unique_contents) / len(contents)) if contents else 0
        if duplicate_rate > 0.3:
            score -= 20  # Too many duplicates
        elif duplicate_rate > 0.1:
            score -= 10

        # Factor 4: Memory type diversity
        type_counts = Counter(m.memory_type for m in all_memories)
        if len(type_counts) < 2:
            score -= 10  # Only one type of memory

        return max(0, min(100, score))

    def growth_analysis(self, all_memories: list | None = None) -> dict[str, Any]:
        """Analyze memory growth over time."""
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return {"hourly": [], "daily": [], "trend": "stable"}

        now = datetime.now(UTC)

        # Hourly breakdown (last 24 hours)
        hourly_counts = [0] * 24
        for m in all_memories:
            if m.created_at:
                hours_ago = int((now - m.created_at).total_seconds() / 3600)
                if 0 <= hours_ago < 24:
                    hourly_counts[23 - hours_ago] += 1

        # Daily breakdown (last 7 days)
        daily_counts = [0] * 7
        for m in all_memories:
            if m.created_at:
                days_ago = int((now - m.created_at).total_seconds() / 86400)
                if 0 <= days_ago < 7:
                    daily_counts[6 - days_ago] += 1

        # Trend
        if len(daily_counts) >= 2:
            recent = daily_counts[-1]
            previous = daily_counts[-2]
            if recent > previous * 1.5:
                trend = "growing"
            elif recent < previous * 0.5:
                trend = "shrinking"
            else:
                trend = "stable"
        else:
            trend = "stable"

        return {
            "hourly": hourly_counts,
            "daily": daily_counts,
            "trend": trend,
            "total_24h": sum(hourly_counts),
            "total_7d": sum(daily_counts),
        }

    def topic_distribution(self, all_memories: list | None = None) -> dict[str, Any]:
        """Analyze what topics the agent knows about."""
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return {"topics": {}, "top_topics": []}

        # Simple keyword extraction
        word_counts: Counter = Counter()
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

        for mem in all_memories:
            words = mem.content.lower().split()
            for word in words:
                cleaned = word.strip(".,!?;:\"'()[]{}")
                if cleaned and len(cleaned) > 2 and cleaned not in stop_words:
                    word_counts[cleaned] += 1

        # Get top topics
        top_topics = word_counts.most_common(20)

        return {
            "topics": dict(top_topics),
            "top_topics": [t[0] for t in top_topics[:10]],
            "unique_words": len(word_counts),
        }

    def decay_analysis(self, all_memories: list | None = None) -> dict[str, Any]:
        """Analyze memory importance decay patterns."""
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return {"avg_decay_rate": 0, "memories_at_risk": 0, "decay_curve": []}

        now = datetime.now(UTC)
        decay_data = []

        for mem in all_memories:
            if mem.created_at:
                age_hours = (now - mem.created_at).total_seconds() / 3600
                # Decay formula: importance / (1 + 0.01 * hours)
                decayed_score = mem.importance_score / (1 + 0.01 * age_hours)
                decay_data.append({
                    "memory_id": mem.memory_id,
                    "original_score": mem.importance_score,
                    "decayed_score": round(decayed_score, 2),
                    "age_hours": round(age_hours, 1),
                    "at_risk": decayed_score < 2.0,
                })

        scores: list[float] = [cast(float, d["decayed_score"]) for d in decay_data]
        avg_decay = sum(scores) / len(scores) if scores else 0.0
        memories_at_risk = sum(1 for d in decay_data if d["at_risk"])

        return {
            "avg_decay_rate": round(avg_decay, 2),
            "memories_at_risk": memories_at_risk,
            "total_memories": len(decay_data),
            "decay_curve": decay_data[:20],  # Sample for visualization
        }

    def quality_metrics(self, all_memories: list | None = None) -> dict[str, Any]:
        """Assess memory quality metrics."""
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return {
                "avg_content_length": 0,
                "empty_memories": 0,
                "metadata_coverage": 0,
                "hash_chain_valid": True,
            }

        # Content quality
        content_lengths = [len(m.content) for m in all_memories]
        avg_length = sum(content_lengths) / len(content_lengths) if content_lengths else 0
        empty_count = sum(1 for length in content_lengths if length == 0)

        # Metadata coverage
        with_metadata = sum(1 for m in all_memories if m.metadata)
        metadata_coverage = (with_metadata / len(all_memories) * 100) if all_memories else 0

        # Hash chain validity
        hash_chain_valid = self._check_hash_chain(all_memories)

        return {
            "avg_content_length": round(avg_length, 1),
            "empty_memories": empty_count,
            "metadata_coverage": round(metadata_coverage, 1),
            "hash_chain_valid": hash_chain_valid,
        }

    def _check_hash_chain(self, memories: list) -> bool:
        """Verify hash chain integrity with HMAC-SHA256 verification."""
        from bastion.crypto import verify_hash
        sorted_memories = sorted(memories, key=lambda m: m.created_at or datetime.min.replace(tzinfo=UTC))
        prev_hash = None
        for mem in sorted_memories:
            if not verify_hash(mem.content, mem.metadata, mem.previous_hash, mem.cryptographic_hash):
                return False
            if mem.previous_hash != prev_hash:
                return False
            prev_hash = mem.cryptographic_hash
        return True

    def memory_flow(self) -> dict[str, Any]:
        """Analyze memory flow patterns (what's being stored vs retrieved)."""
        audit_entries = self.memory.audit()

        store_count = sum(1 for e in audit_entries if "store" in e.action)
        search_count = sum(1 for e in audit_entries if "search" in e.action)

        return {
            "total_operations": len(audit_entries),
            "store_operations": store_count,
            "search_operations": search_count,
            "store_to_search_ratio": round(store_count / max(search_count, 1), 2),
        }

    def importance_distribution(self, all_memories: list | None = None) -> dict[str, Any]:
        """Analyze importance score distribution."""
        if all_memories is None:
            all_memories = self.memory.list_all()
        if not all_memories:
            return {"distribution": {}, "percentiles": {}}

        scores = [m.importance_score for m in all_memories]
        scores.sort()

        # Create histogram buckets
        buckets = {"0-2": 0, "2-4": 0, "4-6": 0, "6-8": 0, "8-10": 0}
        for s in scores:
            if s < 2:
                buckets["0-2"] += 1
            elif s < 4:
                buckets["2-4"] += 1
            elif s < 6:
                buckets["4-6"] += 1
            elif s < 8:
                buckets["6-8"] += 1
            else:
                buckets["8-10"] += 1

        # Percentiles
        n = len(scores)
        percentiles = {}
        for p in [25, 50, 75, 90]:
            idx = int(n * p / 100)
            percentiles[f"p{p}"] = scores[idx] if idx < n else 0

        return {
            "distribution": buckets,
            "percentiles": percentiles,
            "min": scores[0] if scores else 0,
            "max": scores[-1] if scores else 0,
            "avg": round(sum(scores) / len(scores), 2) if scores else 0,
        }
