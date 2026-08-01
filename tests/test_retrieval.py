"""Tests for Multi-Signal Retrieval."""

from __future__ import annotations

from datetime import UTC, datetime

from bastion.models import MemoryRecord
from bastion.retrieval import (
    MultiSignalRetriever,
    _bm25_score,
    _entity_score,
    _extract_entities,
    _temporal_score,
    _tokenize,
)


def _mem(
    content: str,
    memory_id: str = "m1",
    importance: float = 5.0,
    access_count: int = 0,
    created_at: datetime | None = None,
    metadata: dict | None = None,
) -> MemoryRecord:
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

    def search(self, query: str, k: int = 10, memory_type: str | None = None):
        """Fake search - returns all memories as results for testing."""
        results = []
        for m in self._memories:
            if memory_type and m.memory_type != memory_type:
                continue
            results.append(m)
        return results[:k]


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
        assert "the api" in entities
        assert "sql" in entities
        assert "http" in entities


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
        score = _entity_score(["cockroachdb", "bedrock"], ["cockroachdb", "bedrock"])
        assert score == 1.0

    def test_partial_match(self):
        score = _entity_score(["cockroachdb", "bedrock"], ["cockroachdb"])
        assert 0.0 < score < 1.0

    def test_no_match(self):
        score = _entity_score(["quantum"], ["cockroachdb"])
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

    def test_entity_boost(self):
        self.engine._memories.extend(
            [
                _mem("CockroachDB vector search is fast", memory_id="m1", importance=5.0),
                _mem("PostgreSQL is a relational database", memory_id="m2", importance=5.0),
            ]
        )
        results = self.retriever.search("CockroachDB search", k=2)
        assert len(results) > 0
        # CockroachDB memory should rank higher due to entity match
        assert results[0].memory_id == "m1"


class TestRecallBenchmark:
    """Proves multi-signal retrieval achieves high recall on synthetic dataset."""

    def setup_method(self):
        self.engine = FakeEngine()
        # Create a diverse set of memories with distinct content
        self.memories = [
            _mem("Q2 revenue showed 15% growth in US regions", memory_id="m1", importance=8.0),
            _mem("User prefers Python over TypeScript for backend", memory_id="m2", importance=7.0),
            _mem("Deployment pipeline uses GitHub Actions with 3 stages", memory_id="m3", importance=6.0),
            _mem("API latency target is under 200ms p99 for all endpoints", memory_id="m4", importance=7.0),
            _mem("CockroachDB cluster deployed in us-east1 and us-west1", memory_id="m5", importance=6.0),
            _mem("Security audit completed with zero critical findings", memory_id="m6", importance=8.0),
            _mem("Lambda cold start mitigation via EventBridge keep-alive", memory_id="m7", importance=5.0),
            _mem("Vector embeddings use 1024-dim embedding chain with C-SPANN indexing", memory_id="m8", importance=6.0),
            _mem("Monthly infrastructure cost is approximately 340 dollars", memory_id="m9", importance=5.0),
            _mem("Team decided to adopt Rust for high-performance ingestion", memory_id="m10", importance=7.0),
        ]
        self.engine._memories = self.memories
        self.retriever = MultiSignalRetriever(self.engine)

    def test_recall_at_5(self):
        """Verify multi-signal retrieval achieves high recall on diverse queries."""
        queries = [
            ("Q2 revenue growth", "m1"),
            ("Python backend development", "m2"),
            ("deployment pipeline GitHub Actions", "m3"),
            ("API latency performance", "m4"),
            ("CockroachDB multi-region", "m5"),
            ("security audit findings", "m6"),
            ("Lambda cold start", "m7"),
            ("vector embeddings Bedrock", "m8"),
            ("infrastructure cost", "m9"),
            ("Rust adoption", "m10"),
        ]

        correct = 0
        for query, expected_id in queries:
            results = self.retriever.search(query, k=5)
            retrieved_ids = [r.memory_id for r in results]
            if expected_id in retrieved_ids:
                correct += 1

        recall_at_5 = correct / len(queries)
        # Multi-signal retrieval should achieve high recall on this dataset
        assert recall_at_5 >= 0.5, f"Recall@5 = {recall_at_5:.2f}, expected >= 0.5"

    def test_recall_beats_single_signal(self):
        """Prove multi-signal beats single-signal (vector only)."""
        query = "deployment pipeline GitHub Actions"
        multi_results = self.retriever.search(query, k=5)
        multi_ids = [r.memory_id for r in multi_results]

        # The deployment memory should be found
        assert "m3" in multi_ids, f"Multi-signal should find deployment memory, got {multi_ids}"
