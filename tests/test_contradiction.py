"""Tests for Contradiction Detection — Auto Temporal Fact Invalidation."""

from __future__ import annotations

from datetime import UTC, datetime

from bastion.contradiction import (
    Contradiction,
    ContradictionDetector,
    ContradictionScanResult,
    _detect_negation_contradiction,
    _detect_temporal_contradiction,
    _normalize_text,
    _word_overlap,
)
from bastion.models import MemoryRecord

# ── Helpers ──────────────────────────────────────────────────────────────────


def _mem(
    content: str,
    memory_id: str = "m1",
    importance: float = 5.0,
    trust: int = 2,
    pinned: bool = False,
    metadata: dict | None = None,
) -> MemoryRecord:
    return MemoryRecord(
        memory_id=memory_id,
        agent_id="test-agent",
        memory_type="fact",
        content=content,
        importance_score=importance,
        trust_level=trust,
        is_pinned=pinned,
        created_at=datetime.now(UTC),
        metadata=metadata or {},
    )


class FakeEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._memories: list[MemoryRecord] = []
        self._patches: list[tuple[str, list]] = []
        self._reinforced: list[tuple[str, bool]] = []
        self._audits: list[dict] = []

    def search(self, query, k=5, threshold=0.8, memory_type=None):
        results = []
        for m in self._memories:
            words_q = set(query.lower().split())
            words_c = set((m.content or "").lower().split())
            overlap = len(words_q & words_c) / max(1, len(words_q))
            if overlap >= threshold * 0.7:
                results.append(m)
        return results[:k]

    def list_all(self, namespace_scope="own", memory_type=None):
        return list(self._memories)

    def apply_patch(self, memory_id, patch_ops):
        self._patches.append((memory_id, patch_ops))
        return True

    def reinforce(self, memory_id, success=True):
        self._reinforced.append((memory_id, success))

    def store_audit(self, action, details, agent_id=None):
        self._audits.append({"action": action, "details": details})

    def get_memory(self, memory_id):
        for m in self._memories:
            if m.memory_id == memory_id:
                return m
        return None


# ── Unit Tests ───────────────────────────────────────────────────────────────


class TestNormalizeText:
    def test_basic(self):
        assert _normalize_text("Hello, World!") == "hello world"

    def test_whitespace(self):
        assert _normalize_text("  lots   of   spaces  ") == "lots of spaces"

    def test_punctuation(self):
        assert _normalize_text("user@example.com is valid") == "user example com is valid"


class TestWordOverlap:
    def test_identical(self):
        assert _word_overlap("the cat sat", "the cat sat") == 1.0

    def test_disjoint(self):
        assert _word_overlap("apple banana", "xyz qwerty") == 0.0

    def test_partial(self):
        # "the cat sat on mat" vs "the dog sat on mat" → 4/6 words overlap
        overlap = _word_overlap("the cat sat on mat", "the dog sat on mat")
        assert 0.6 < overlap < 0.8


class TestNegationDetection:
    def test_is_vs_is_not(self):
        conf = _detect_negation_contradiction(
            "The API is enabled by default",
            "The API is not enabled by default",
        )
        assert conf > 0.7

    def test_uses_vs_does_not_use(self):
        conf = _detect_negation_contradiction(
            "Bastion uses CockroachDB for storage",
            "Bastion does not use CockroachDB for storage",
        )
        assert conf > 0.7

    def test_no_contradiction_different_topics(self):
        conf = _detect_negation_contradiction(
            "The weather is nice today",
            "The database is not responding",
        )
        assert conf == 0.0

    def test_same_statement(self):
        conf = _detect_negation_contradiction(
            "The server is running",
            "The server is running",
        )
        assert conf == 0.0

    def test_increases_vs_decreases(self):
        conf = _detect_negation_contradiction(
            "The cache hit rate increases over time",
            "The cache hit rate decreases over time",
        )
        assert conf > 0.5


class TestTemporalDetection:
    def test_now_vs_old(self):
        conf = _detect_temporal_contradiction(
            "The API is now deprecated and should not be used for new projects",
            "The API is stable and should be used for new projects",
        )
        assert conf > 0.5

    def test_no_temporal_signals(self):
        conf = _detect_temporal_contradiction(
            "CockroachDB is a distributed SQL database",
            "PostgreSQL is a relational database",
        )
        assert conf == 0.0

    def test_updated_signal(self):
        conf = _detect_temporal_contradiction(
            "The config was updated to use TLS 1.3 for all connections",
            "The config uses TLS 1.2 for all connections",
        )
        assert conf > 0.4


# ── Integration Tests ────────────────────────────────────────────────────────


class TestContradictionDetector:
    def setup_method(self):
        self.engine = FakeEngine()
        self.detector = ContradictionDetector(self.engine)

    def test_no_contradictions(self):
        self.engine._memories.append(
            _mem(
                "CockroachDB is a distributed SQL database",
                memory_id="m1",
            )
        )
        new = _mem("PostgreSQL is a relational database", memory_id="m2")
        result = self.detector.scan_after_store(new)
        assert result.contradictions_found == 0

    def test_negation_contradiction_auto_supersede(self):
        self.engine._memories.append(
            _mem(
                "The API is enabled by default for all new accounts",
                memory_id="m1",
                importance=5.0,
            )
        )
        new = _mem(
            "The API is not enabled by default for new accounts",
            memory_id="m2",
            importance=7.0,
        )
        result = self.detector.scan_after_store(new)
        assert result.contradictions_found >= 1
        assert result.auto_invalidated >= 1
        # Old memory should be patched
        assert len(self.engine._patches) >= 1
        patched_id = self.engine._patches[0][0]
        assert patched_id == "m1"

    def test_temporal_contradiction(self):
        self.engine._memories.append(
            _mem(
                "The cache size is set to 512MB for the application server",
                memory_id="m1",
            )
        )
        new = _mem(
            "The cache size is now updated to 1024MB for the application server",
            memory_id="m2",
            importance=7.0,
        )
        result = self.detector.scan_after_store(new)
        assert result.contradictions_found >= 1

    def test_does_not_contradict_pinned(self):
        self.engine._memories.append(
            _mem(
                "Always validate user input",
                memory_id="m1",
                pinned=True,
            )
        )
        new = _mem(
            "Never validate user input",
            memory_id="m2",
        )
        result = self.detector.scan_after_store(new)
        # Pinned memories should not be contradicted
        assert result.auto_invalidated == 0

    def test_semantic_contradiction_high_importance(self):
        self.engine._memories.append(
            _mem(
                "Use connection pooling for database access in production",
                memory_id="m1",
                importance=4.0,
                trust=1,
            )
        )
        new = _mem(
            "Use connection pooling for database access in production",
            memory_id="m2",
            importance=9.0,
            trust=3,
        )
        result = self.detector.scan_after_store(new)
        assert result.contradictions_found >= 1

    def test_audit_trail_logged(self):
        self.engine._memories.append(
            _mem(
                "The service is enabled by default",
                memory_id="m1",
            )
        )
        new = _mem("The service is not enabled by default", memory_id="m2")
        self.detector.scan_after_store(new)
        audits = [a for a in self.engine._audits if a["action"] == "contradiction_auto_supersede"]
        assert len(audits) >= 1

    def test_scan_all(self):
        self.engine._memories.extend(
            [
                _mem("The feature is enabled", memory_id="m1"),
                _mem("The feature is not enabled", memory_id="m2"),
                _mem("Unrelated content about weather patterns", memory_id="m3"),
            ]
        )
        results = self.detector.scan_all()
        # Should find contradictions between m1 and m2
        total_contradictions = sum(r.contradictions_found for r in results)
        assert total_contradictions >= 1

    def test_scan_all_skips_superseded(self):
        self.engine._memories.extend(
            [
                _mem("The feature is enabled", memory_id="m1"),
                _mem("The feature is not enabled", memory_id="m2", metadata={"superseded": True}),
            ]
        )
        results = self.detector.scan_all()
        # m2 is superseded, so no contradictions should be found
        total = sum(r.contradictions_found for r in results)
        assert total == 0


class TestContradiction:
    def test_to_dict(self):
        c = Contradiction(
            new_memory_id="m2",
            old_memory_id="m1",
            new_content="new content here",
            old_content="old content here",
            similarity=0.85,
            contradiction_type="negation",
            confidence=0.9,
            auto_resolved=True,
            resolution="superseded",
        )
        d = c.to_dict()
        assert d["contradiction_type"] == "negation"
        assert d["auto_resolved"] is True
        assert d["confidence"] == 0.9


class TestContradictionScanResult:
    def test_to_dict(self):
        r = ContradictionScanResult(
            new_memory_id="m2",
            scanned_count=10,
            contradictions_found=2,
            auto_invalidated=1,
            manual_review_needed=1,
        )
        d = r.to_dict()
        assert d["scanned_count"] == 10
        assert d["contradictions_found"] == 2
