"""Tests for Multi-Signal Retrieval."""
from __future__ import annotations

import pytest
from datetime import UTC, datetime, timedelta

from bastion.retrieval import (
    MultiSignalRetriever,
    RetrievalResult,
    _bm25_score,
    _entity_score,
    _extract_entities,
    _temporal_score,
    _tokenize,
)
from bastion.models import MemoryRecord


def _mem(content: str, memory_id: str = "m1", importance: float = 5.0, access_count: int = 0, created_at: datetime | None = None, metadata: dict | None = None) -> MemoryRecord:
    return MemoryRecord(
        memory_id=memory_id,
        agent_id="test-agent",
        memory_type="fact",
        content=content,
        importance_score=importance,
        access_count=access_count,
        created_at=created_at or datetime.now(UTC),
        metadata=metadata or {},
    )


class FakeEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._memories: list[MemoryRecord] = []

    def list_all(self, namespace_scope="own", memory_type=None):
        if memory_type:
            return [m for m in self._memories if m.memory_type == memory_type]
        return list(self._memories)


class TestTokenize:
    def test_basic(self):
        tokens = _tokenize("The quick brown fox")
        assert "quick" in tokens
        assert "brown" in tokens
        assert "fox" in tokens
        assert "the" not in tokens  # stop word

    def test_empty(self):
        assert _tokenize("") == []


class TestExtractEntities:
    def test_capitalized(self):
        entities = _extract_entities("CockroachDB and Bedrock are used")
        assert "cockroachdb" in entities
        assert "bedrock" in entities

    def test_acronyms(self):
        entities = _extract_entities("The API uses SQL and HTTP")
        assert "api" in entities
        assert "sql" in entities


class TestBM25Score:
    def test_perfect_match(self):
        score = _bm25_score(["revenue", "q2"], ["q2", "revenue", "analysis"])
        assert score > 0

    def test_no_match(self):
        score = _bm25_score(["quantum", "physics"], ["revenue", "analysis"])
        assert score == 0.0

    def test_empty(self):
        assert _bm25_score([], ["hello"]) == 0.0
        assert _bm25_score(["hello"], []) == 0.0


class TestEntityScore:
    def test_perfect_match(self):
        score = _entity_score(["cockroachdb", "bedrock"], ["CockroachDB", "Bedrock", "extra"])
        assert score == 1.0

    def test_partial_match(self):
        score = _entity_score(["cockroachdb", "bedrock"], ["CockroachDB"])
        assert 0.0 < score < 1.0

    def test_no_match(self):
        score = _entity_score(["quantum"], ["CockroachDB"])
        assert score == 0.0


class TestTemporalScore:
    def test_recent_high_access(self):
        score = _temporal_score(access_count=10, hours_old=1)
        assert score > 0.5

    def test_old_low_access(self):
        score = _temporal_score(access_count=0, hours_old=1000)
        assert score < 0.3


class TestMultiSignalRetriever:
    def setup_method(self):
        self.engine = FakeEngine()
        self.retriever = MultiSignalRetriever(self.engine)

    def test_empty_search(self):
        assert self.retriever.search("") == []
        assert self.retriever.search("  ") == []

    def test_no_memories(self):
        assert self.retriever.search("test query") == []

    def test_basic_search(self):
        self.engine._memories.extend([
            _mem("Q2 revenue analysis shows growth", memory_id="m1", importance=8.0),
            _mem("User prefers dark mode", memory_id="m2", importance=5.0),
            _mem("Q2 financial results by region", memory_id="m3", importance=7.0),
        ])
        results = self.retriever.search("Q2 revenue analysis", k=3)
        assert len(results) > 0
        # Revenue-related memories should rank higher
        top_ids = [r.memory.memory_id for r in results]
        assert "m1" in top_ids or "m3" in top_ids

    def test_entity_boost(self):
        self.engine._memories.extend([
            _mem("CockroachDB vector search is fast", memory_id="m1", importance=5.0),
            _mem("PostgreSQL is a relational database", memory_id="m2", importance=5.0),
        ])
        results = self.retriever.search("CockroachDB search", k=2)
        assert len(results) > 0
        # CockroachDB memory should rank higher due to entity match
        assert results[0].memory.memory_id == "m1"

    def test_weights_configurable(self):
        retriever = MultiSignalRetriever(self.engine, weights={"vector": 0.1, "keyword": 0.9, "entity": 0.0, "temporal": 0.0})
        assert abs(retriever._weights["vector"] - 0.1) < 0.01
        assert abs(retriever._weights["keyword"] - 0.9) < 0.01

    def test_search_with_vector(self):
        self.engine._memories.extend([
            _mem("Q2 revenue growth analysis", memory_id="m1", importance=8.0),
            _mem("User prefers Python", memory_id="m2", importance=5.0),
        ])
        results = self.retriever.search_with_vector(
            "Q2 revenue",
            [self.engine._memories[0], self.engine._memories[1]],
            k=2,
        )
        assert len(results) > 0

    def test_result_to_dict(self):
        self.engine._memories.append(_mem("test content", memory_id="m1"))
        results = self.retriever.search("test", k=1)
        if results:
            d = results[0].to_dict()
            assert "fused_score" in d
            assert "vector_score" in d
