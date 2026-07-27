"""
Tests for Memory Analytics module.
"""

from __future__ import annotations

import pytest

from bastion.analytics import MemoryAnalytics
from bastion.memory import BastionMemory


@pytest.fixture(autouse=True)
def reset_mock():
    from bastion.mock import reset

    reset()


@pytest.fixture
def memory():
    return BastionMemory("analytics-test", mock=True)


@pytest.fixture
def analytics(memory):
    return MemoryAnalytics(memory)


class TestMemoryAnalytics:
    def test_full_report(self, analytics, memory):
        memory.store("fact", "Test memory for analytics")
        report = analytics.full_report()
        assert "agent_id" in report
        assert "health_score" in report
        assert "summary" in report
        assert "growth" in report
        assert "topics" in report
        assert "decay" in report
        assert "quality" in report
        assert "anomalies" in report

    def test_summary_empty(self, analytics):
        summary = analytics.summary()
        assert summary["total_memories"] == 0
        assert summary["memory_types"] == {}
        assert summary["avg_importance"] == 0.0

    def test_summary_with_memories(self, analytics, memory):
        memory.store("fact", "Fact one")
        memory.store("preference", "Preference one")
        memory.store("fact", "Fact two")
        summary = analytics.summary()
        assert summary["total_memories"] == 3
        assert summary["memory_types"]["fact"] == 2
        assert summary["memory_types"]["preference"] == 1
        assert summary["avg_importance"] == 5.0

    def test_health_score_empty(self, analytics):
        score = analytics.health_score()
        assert score == 0

    def test_health_score_good(self, analytics, memory):
        for i in range(20):
            memory.store("fact", f"Unique memory {i}")
        score = analytics.health_score()
        assert score >= 70

    def test_health_score_too_few(self, analytics, memory):
        memory.store("fact", "Only one memory")
        score = analytics.health_score()
        assert score < 80  # Should be penalized

    def test_health_score_duplicates(self, analytics, memory):
        for _ in range(10):
            memory.store("fact", "Same memory repeated")
        score = analytics.health_score()
        assert score < 80  # Should be penalized for duplicates

    def test_growth_analysis_empty(self, analytics):
        growth = analytics.growth_analysis()
        assert "hourly" in growth
        assert "daily" in growth
        assert growth["trend"] == "stable"

    def test_growth_analysis_with_memories(self, analytics, memory):
        for i in range(5):
            memory.store("fact", f"Growth memory {i}")
        growth = analytics.growth_analysis()
        assert len(growth["hourly"]) == 24
        assert len(growth["daily"]) == 7

    def test_topic_distribution_empty(self, analytics):
        topics = analytics.topic_distribution()
        assert topics["topics"] == {}
        assert topics["top_topics"] == []

    def test_topic_distribution_with_content(self, analytics, memory):
        memory.store("fact", "Python is a programming language")
        memory.store("fact", "Python is used for data science")
        memory.store("fact", "JavaScript is used for web development")
        topics = analytics.topic_distribution()
        assert "python" in topics["topics"]
        assert topics["unique_words"] > 0

    def test_decay_analysis_empty(self, analytics):
        decay = analytics.decay_analysis()
        assert "memories_at_risk" in decay
        assert decay["memories_at_risk"] == 0

    def test_decay_analysis_with_memories(self, analytics, memory):
        memory.store("fact", "Memory for decay")
        decay = analytics.decay_analysis()
        assert decay["total_memories"] == 1
        assert len(decay["decay_curve"]) == 1

    def test_quality_metrics_empty(self, analytics):
        quality = analytics.quality_metrics()
        assert quality["avg_content_length"] == 0
        assert quality["empty_memories"] == 0
        assert quality["hash_chain_valid"] is True

    def test_quality_metrics_with_content(self, analytics, memory):
        memory.store("fact", "This is a test memory with some content")
        quality = analytics.quality_metrics()
        assert quality["avg_content_length"] > 0
        assert quality["metadata_coverage"] >= 0

    def test_memory_flow_empty(self, analytics):
        flow = analytics.memory_flow()
        assert flow["total_operations"] == 0

    def test_memory_flow_with_operations(self, analytics, memory):
        memory.store("fact", "Flow memory")
        memory.search("flow")
        flow = analytics.memory_flow()
        assert flow["store_operations"] > 0

    def test_importance_distribution_empty(self, analytics):
        dist = analytics.importance_distribution()
        assert dist["distribution"] == {}

    def test_importance_distribution_with_memories(self, analytics, memory):
        for i in range(10):
            memory.store("fact", f"Distribution memory {i}")
        dist = analytics.importance_distribution()
        assert sum(dist["distribution"].values()) == 10
        assert dist["avg"] == 5.0
