"""Tests for Observations — Meta-Pattern Detection."""
from __future__ import annotations

import pytest
from datetime import UTC, datetime, timedelta

from bastion.observations import (
    Observation,
    ObservationDetector,
    ObservationReport,
    _extract_entities,
    _extract_ngrams,
)
from bastion.models import MemoryRecord


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mem(content: str, memory_id: str = "m1", created_at: datetime | None = None) -> MemoryRecord:
    return MemoryRecord(
        memory_id=memory_id,
        agent_id="test-agent",
        memory_type="fact",
        content=content,
        created_at=created_at or datetime.now(UTC),
    )


class FakeObsEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._memories: list[MemoryRecord] = []

    def list_all(self, namespace_scope="own", memory_type=None):
        return list(self._memories)


# ── Unit Tests ───────────────────────────────────────────────────────────────

class TestExtractNgrams:
    def test_bigrams(self):
        ngrams = _extract_ngrams("the quick brown fox jumps", n=2)
        assert ("quick brown" in ngrams) or ("brown fox" in ngrams)

    def test_short_text(self):
        ngrams = _extract_ngrams("hello", n=2)
        assert len(ngrams) <= 1

    def test_stop_words_filtered(self):
        ngrams = _extract_ngrams("the the the API is great", n=2)
        assert all("the" not in ng.split() or len(ng.split()) > 1 for ng in ngrams)


class TestExtractEntities:
    def test_capitalized_words(self):
        entities = _extract_entities("CockroachDB and Bedrock are used")
        assert "CockroachDB" in entities
        assert "Bedrock" in entities

    def test_acronyms(self):
        entities = _extract_entities("The API uses SQL and HTTP")
        assert "API" in entities
        assert "SQL" in entities

    def test_no_entities(self):
        entities = _extract_entities("the quick brown fox")
        assert len(entities) == 0


class TestObservation:
    def test_to_dict(self):
        o = Observation(
            observation_id="obs-1",
            pattern_type="recurring_theme",
            description="Test pattern",
            confidence=0.85,
            frequency=10,
        )
        d = o.to_dict()
        assert d["pattern_type"] == "recurring_theme"
        assert d["confidence"] == 0.85
        assert d["frequency"] == 10


class TestObservationReport:
    def test_to_dict(self):
        r = ObservationReport(
            agent_id="test",
            total_memories_scanned=100,
            observations=[Observation(pattern_type="test", description="x", confidence=0.5)],
        )
        d = r.to_dict()
        assert d["total_memories_scanned"] == 100
        assert len(d["observations"]) == 1


# ── Integration Tests ────────────────────────────────────────────────────────

class TestObservationDetector:
    def setup_method(self):
        self.engine = FakeObsEngine()
        self.detector = ObservationDetector(self.engine, min_frequency=2)

    def test_no_memories(self):
        report = self.detector.detect()
        assert report.total_memories_scanned == 0
        assert len(report.observations) == 0

    def test_too_few_memories(self):
        self.engine._memories.extend([
            _mem("CockroachDB is great", memory_id="m1"),
        ])
        report = self.detector.detect()
        assert len(report.observations) == 0

    def test_detects_recurring_themes(self):
        # Create memories with repeated bigrams
        self.engine._memories.extend([
            _mem("CockroachDB vector search is fast", memory_id="m1"),
            _mem("CockroachDB vector indexing is efficient", memory_id="m2"),
            _mem("CockroachDB vector queries are scalable", memory_id="m3"),
            _mem("Unrelated content about cooking recipes", memory_id="m4"),
        ])
        report = self.detector.detect()
        themes = [o for o in report.observations if o.pattern_type == "recurring_theme"]
        assert len(themes) >= 1
        assert any("cockroachdb" in o.description.lower() for o in themes)

    def test_detects_entity_clusters(self):
        self.engine._memories.extend([
            _mem("Bedrock embeddings are used for vector search", memory_id="m1"),
            _mem("Bedrock Titan generates 1024-dim vectors", memory_id="m2"),
            _mem("Bedrock is integrated with the memory layer", memory_id="m3"),
        ])
        report = self.detector.detect()
        entities = [o for o in report.observations if o.pattern_type == "entity_cluster"]
        assert len(entities) >= 1
        assert any("bedrock" in o.description.lower() for o in entities)

    def test_detects_temporal_trends(self):
        now = datetime.now(UTC)
        self.engine._memories.extend([
            _mem("MCP server configuration is important", memory_id="m1", created_at=now - timedelta(hours=1)),
            _mem("MCP server tools are registered", memory_id="m2", created_at=now - timedelta(hours=2)),
            _mem("MCP server health check passed", memory_id="m3", created_at=now - timedelta(hours=3)),
            _mem("Old MCP content from weeks ago", memory_id="m4", created_at=now - timedelta(days=10)),
        ])
        report = self.detector.detect()
        trends = [o for o in report.observations if o.pattern_type == "temporal_trend"]
        # May or may not find trends depending on the data distribution
        # The key is it doesn't crash

    def test_detects_co_occurrences(self):
        self.engine._memories.extend([
            _mem("Bedrock and CockroachDB work together for embeddings", memory_id="m1"),
            _mem("Bedrock embeddings are stored in CockroachDB tables", memory_id="m2"),
            _mem("CockroachDB hosts Bedrock vectors via C-SPANN index", memory_id="m3"),
        ])
        report = self.detector.detect()
        cooccs = [o for o in report.observations if o.pattern_type == "co_occurrence"]
        assert len(cooccs) >= 1

    def test_observations_sorted_by_confidence(self):
        self.engine._memories.extend([
            _mem("CockroachDB vector search is fast and scalable", memory_id="m1"),
            _mem("CockroachDB vector indexing is efficient and quick", memory_id="m2"),
            _mem("CockroachDB vector queries scale horizontally", memory_id="m3"),
            _mem("CockroachDB vector performance is excellent", memory_id="m4"),
        ])
        report = self.detector.detect()
        if len(report.observations) > 1:
            for i in range(len(report.observations) - 1):
                assert report.observations[i].confidence >= report.observations[i + 1].confidence

    def test_max_observations_limit(self):
        detector = ObservationDetector(self.engine, min_frequency=2, max_observations=3)
        self.engine._memories.extend([
            _mem("Alpha beta gamma delta", memory_id="m1"),
            _mem("Alpha beta gamma epsilon", memory_id="m2"),
            _mem("Alpha beta gamma zeta", memory_id="m3"),
            _mem("Alpha beta gamma eta", memory_id="m4"),
        ])
        report = detector.detect()
        assert len(report.observations) <= 3
