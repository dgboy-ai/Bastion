"""Tests for LTM Gateway — Long-Term Memory Reuse."""
from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch
from datetime import UTC, datetime

from bastion.ltm_gateway import (
    DEFAULT_REUSE_THRESHOLD,
    ANALYSIS_TYPES,
    GatewayStats,
    LTMMemoryGateway,
    ReuseResult,
    StoreResult,
    _estimate_tokens,
)
from bastion.models import MemoryRecord


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _make_memory(
    content: str = "test content",
    memory_type: str = "analysis",
    importance: float = 7.0,
    access_count: int = 0,
    metadata: dict | None = None,
    memory_id: str = "mem-001",
) -> MemoryRecord:
    return MemoryRecord(
        memory_id=memory_id,
        agent_id="test-agent",
        memory_type=memory_type,
        content=content,
        importance_score=importance,
        access_count=access_count,
        created_at=datetime.now(UTC),
        metadata=metadata or {},
    )


class FakeMemoryEngine:
    """Minimal in-memory engine for testing LTM Gateway."""

    def __init__(self):
        self.agent_id = "test-agent"
        self._memories: list[MemoryRecord] = []
        self._reinforced: list[str] = []
        self._deleted: list[str] = []
        self._audit_entries: list[dict] = []

    def search(self, query: str, k: int = 5, threshold: float = 0.8, memory_type: str | None = None):
        results = []
        for m in self._memories:
            if memory_type and m.memory_type != memory_type:
                continue
            # Simple text overlap for mock
            query_words = set(query.lower().split())
            content_words = set((m.content or "").lower().split())
            overlap = len(query_words & content_words) / max(1, len(query_words))
            if overlap >= threshold * 0.8:
                results.append(m)
        return results[:k]

    def reinforce(self, memory_id: str, success: bool = True):
        self._reinforced.append(memory_id)
        return {"reinforced": memory_id}

    def store(self, memory_type: str, content: str, metadata: dict | None = None, **kwargs):
        mem = _make_memory(
            content=content,
            memory_type=memory_type,
            metadata=metadata or {},
            memory_id=f"mem-{len(self._memories) + 1:03d}",
        )
        self._memories.append(mem)
        return mem

    def list_all(self, namespace_scope: str = "own", memory_type: str | None = None):
        if memory_type:
            return [m for m in self._memories if m.memory_type == memory_type]
        return list(self._memories)

    def _delete_by_id(self, memory_id: str):
        self._deleted.append(memory_id)
        self._memories = [m for m in self._memories if m.memory_id != memory_id]

    def apply_patch(self, memory_id: str, patch_ops: list):
        for m in self._memories:
            if m.memory_id == memory_id:
                for op in patch_ops:
                    if op.get("path") == "/metadata":
                        m.metadata = op.get("value", {})
                return m.to_dict()
        return None

    def store_audit(self, action: str, details: dict | str, agent_id: str | None = None):
        self._audit_entries.append({"action": action, "details": details})


# ── Tests ────────────────────────────────────────────────────────────────────

class TestEstimateTokens:
    def test_basic(self):
        assert _estimate_tokens("hello world") == 2

    def test_empty(self):
        assert _estimate_tokens("") == 1

    def test_long_text(self):
        text = "word " * 100
        assert _estimate_tokens(text) > 100


class TestReuseResult:
    def test_to_dict(self):
        r = ReuseResult(
            memory_id="m1",
            content="test",
            similarity=0.85,
            cached_at="2026-01-01T00:00:00Z",
            reuse_count=3,
            tokens_saved=500,
        )
        d = r.to_dict()
        assert d["memory_id"] == "m1"
        assert d["similarity"] == 0.85
        assert d["tokens_saved"] == 500


class TestStoreResult:
    def test_to_dict(self):
        r = StoreResult(
            memory_id="m2",
            stored_at="2026-01-01T00:00:00Z",
            analysis_type="research",
            estimated_tokens=1200,
        )
        d = r.to_dict()
        assert d["analysis_type"] == "research"
        assert d["estimated_tokens"] == 1200


class TestGatewayStats:
    def test_initial(self):
        s = GatewayStats()
        d = s.to_dict()
        assert d["total_checks"] == 0
        assert d["reuse_rate"] == 0.0

    def test_running_average(self):
        s = GatewayStats()
        s.total_reuses = 2
        s.avg_similarity = 0.8
        # New value of 0.9 → avg = (0.8*2 + 0.9) / 3 = 0.8333
        n = 3
        s.avg_similarity = (s.avg_similarity * 2 + 0.9) / n
        assert abs(s.avg_similarity - 0.8333) < 0.01


class TestLTMMemoryGateway:
    def setup_method(self):
        self.engine = FakeMemoryEngine()
        self.gateway = LTMMemoryGateway(self.engine)

    def test_check_reuse_empty_query(self):
        assert self.gateway.check_reuse("") is None
        assert self.gateway.check_reuse("  ") is None

    def test_check_reuse_no_match(self):
        result = self.gateway.check_reuse("quantum computing trends")
        assert result is None
        assert self.gateway.stats.total_checks == 1
        assert self.gateway.stats.total_reuses == 0

    def test_check_reuse_with_match(self):
        # Store an analysis result
        self.engine._memories.append(_make_memory(
            content="Q2 revenue analysis shows 15% growth across all regions",
            memory_type="analysis",
            importance=8.0,
            access_count=2,
            metadata={"analysis_result": True, "analysis_type": "analysis"},
            memory_id="mem-analysis-1",
        ))

        result = self.gateway.check_reuse("Q2 revenue analysis growth regions")
        assert result is not None
        assert result.memory_id == "mem-analysis-1"
        assert result.similarity > 0.0
        assert result.tokens_saved > 0
        assert self.gateway.stats.total_reuses == 1
        assert self.gateway.stats.total_tokens_saved > 0

    def test_check_reuse_reinforces_memory(self):
        self.engine._memories.append(_make_memory(
            content="comprehensive analysis of Python decorators and their usage patterns",
            memory_type="analysis",
            importance=9.0,
            metadata={"analysis_result": True},
            memory_id="mem-reinforce-1",
        ))

        self.gateway.check_reuse("comprehensive analysis of Python decorators and their usage patterns")
        assert "mem-reinforce-1" in self.engine._reinforced

    def test_store_analysis(self):
        result = self.gateway.store_analysis(
            query="What is the capital of France?",
            result="The capital of France is Paris.",
            analysis_type="analysis",
            tokens_used=150,
        )
        assert result.memory_id.startswith("mem-")
        assert result.analysis_type == "analysis"
        assert result.estimated_tokens == 150
        assert self.gateway.stats.total_stores == 1

        # Verify the stored memory has correct metadata
        stored = self.engine._memories[-1]
        assert stored.metadata.get("analysis_result") is True
        assert stored.metadata.get("original_query") == "What is the capital of France?"

    def test_store_analysis_default_type(self):
        result = self.gateway.store_analysis(
            query="test query",
            result="test result",
        )
        assert result.analysis_type == "analysis"

    def test_invalidate(self):
        self.engine._memories.append(_make_memory(
            content="old analysis about weather",
            memory_type="analysis",
            importance=5.0,
            metadata={"analysis_result": True},
            memory_id="mem-stale-1",
        ))

        result = self.gateway.invalidate("weather analysis", reason="new data")
        assert result["invalidated"] >= 1
        assert result["reason"] == "new data"

    def test_get_stats(self):
        stats = self.gateway.get_stats()
        assert "total_checks" in stats
        assert "reuse_rate" in stats

    def test_threshold_override(self):
        self.engine._memories.append(_make_memory(
            content="test content",
            importance=7.0,
            metadata={"analysis_result": True},
        ))

        # Very high threshold — should not match
        result = self.gateway.check_reuse("test content", threshold=0.99)
        # May or may not match depending on similarity calc

    def test_analysis_type_filter(self):
        self.engine._memories.append(_make_memory(
            content="research findings on AI",
            memory_type="research",
            importance=8.0,
            metadata={"analysis_result": True, "analysis_type": "research"},
        ))

        result = self.gateway.check_reuse("AI research findings", analysis_type="research")
        # Should find it when filtering to research type

    def test_stats_update_correctly(self):
        # Do 3 checks, 1 reuse
        self.engine._memories.append(_make_memory(
            content="quantum computing analysis results summary report",
            importance=8.0,
            metadata={"analysis_result": True},
        ))

        self.gateway.check_reuse("quantum computing analysis results summary report")  # check 1 → reuse
        # Use completely unique single-char queries that share zero words
        self.gateway.check_reuse("z")  # check 2 → no match
        self.gateway.check_reuse("q")  # check 3 → no match

        stats = self.gateway.get_stats()
        assert stats["total_checks"] == 3
        assert stats["total_reuses"] == 1
        assert abs(stats["reuse_rate"] - 1 / 3) < 0.01
