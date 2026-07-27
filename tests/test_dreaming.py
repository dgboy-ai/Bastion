"""Tests for Memory Dreamer — Sleep-Time Consolidation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from bastion.dreaming import (
    EPISODIC,
    SEMANTIC,
    ConsolidationCandidate,
    DreamJournal,
    MemoryDreamer,
)
from bastion.models import AuditEntry, MemoryRecord

# ── Fixtures ─────────────────────────────────────────────────────────────────


def _make_memory(
    content: str = "test content",
    memory_type: str = EPISODIC,
    importance: float = 5.0,
    access_count: int = 0,
    is_pinned: bool = False,
    created_at: datetime | None = None,
    expires_at: datetime | None = None,
    memory_id: str = "mem-001",
    metadata: dict | None = None,
) -> MemoryRecord:
    return MemoryRecord(
        memory_id=memory_id,
        agent_id="test-agent",
        memory_type=memory_type,
        content=content,
        importance_score=importance,
        access_count=access_count,
        is_pinned=is_pinned,
        created_at=created_at or datetime.now(UTC),
        expires_at=expires_at,
        metadata=metadata or {},
    )


class FakeDreamMemoryEngine:
    """Minimal in-memory engine for testing dreaming."""

    def __init__(self):
        self.agent_id = "test-agent"
        self._memories: list[MemoryRecord] = []
        self._audit_entries: list[dict] = []
        self._deleted: list[str] = []

    def list_all(self, namespace_scope: str = "own", memory_type: str | None = None):
        if memory_type:
            return [m for m in self._memories if m.memory_type == memory_type]
        return list(self._memories)

    def _delete_by_id(self, memory_id: str):
        self._deleted.append(memory_id)
        self._memories = [m for m in self._memories if m.memory_id != memory_id]

    def store(self, memory_type: str, content: str, metadata: dict | None = None, **kwargs):
        mem = _make_memory(
            content=content,
            memory_type=memory_type,
            metadata=metadata or {},
            memory_id=f"mem-{len(self._memories) + 1:03d}",
        )
        self._memories.append(mem)
        return mem

    def store_audit(self, action: str, details: dict | str, agent_id: str | None = None):
        self._audit_entries.append({"action": action, "details": details})

    def audit(self, agent_id: str | None = None):
        entries = []
        for e in self._audit_entries:
            entries.append(
                AuditEntry(
                    audit_id=f"audit-{len(entries)}",
                    agent_id=agent_id or self.agent_id,
                    action=e["action"],
                    details=e["details"] if isinstance(e["details"], dict) else {"text": e["details"]},
                    recorded_at=datetime.now(UTC),
                )
            )
        return entries


# ── Tests ────────────────────────────────────────────────────────────────────


class TestDreamJournal:
    def test_initial(self):
        j = DreamJournal(agent_id="test")
        d = j.to_dict()
        assert d["agent_id"] == "test"
        assert d["memories_reviewed"] == 0
        assert d["errors"] == []

    def test_with_data(self):
        j = DreamJournal(
            agent_id="test",
            memories_reviewed=10,
            memories_consolidated=2,
            memories_promoted=1,
            memories_pruned=3,
            lessons_extracted=["lesson 1", "lesson 2"],
        )
        d = j.to_dict()
        assert d["memories_reviewed"] == 10
        assert d["memories_promoted"] == 1
        assert len(d["lessons_extracted"]) == 2


class TestConsolidationCandidate:
    def test_fields(self):
        c = ConsolidationCandidate(
            memory_id="m1",
            content="test",
            memory_type=EPISODIC,
            importance=7.0,
            access_count=3,
            created_at="2026-01-01T00:00:00Z",
            similarity_to_others=0.85,
            recommendation="merge",
        )
        assert c.recommendation == "merge"
        assert c.similarity_to_others == 0.85


class TestMemoryDreamer:
    def setup_method(self):
        self.engine = FakeDreamMemoryEngine()
        self.dreamer = MemoryDreamer(self.engine)

    def test_dream_empty_memories(self):
        journal = self.dreamer.dream()
        assert journal.memories_reviewed == 0
        assert journal.errors == []
        assert journal.duration_ms >= 0

    def test_dream_with_recent_memories(self):
        # Add some recent episodic memories
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="User asked about Python decorators today",
                    memory_type=EPISODIC,
                    importance=6.0,
                    created_at=now - timedelta(hours=1),
                    memory_id="mem-ep-1",
                ),
                _make_memory(
                    content="User learned about Python decorators from tutorial",
                    memory_type=EPISODIC,
                    importance=7.0,
                    created_at=now - timedelta(hours=2),
                    memory_id="mem-ep-2",
                ),
                _make_memory(
                    content="User configured the database connection",
                    memory_type=EPISODIC,
                    importance=4.0,
                    created_at=now - timedelta(hours=3),
                    memory_id="mem-ep-3",
                ),
            ]
        )

        journal = self.dreamer.dream()
        assert journal.memories_reviewed == 3
        assert journal.errors == []

    def test_dream_promotes_high_importance_episodic(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Important lesson: always validate user input before processing",
                    memory_type=EPISODIC,
                    importance=8.0,
                    created_at=now - timedelta(hours=1),
                    memory_id="mem-imp-1",
                ),
            ]
        )

        journal = self.dreamer.dream()
        # Should promote to semantic since importance >= 6.0
        assert journal.memories_promoted >= 1
        # Check that a semantic memory was created
        semantic = [m for m in self.engine._memories if m.memory_type == SEMANTIC]
        assert len(semantic) >= 1
        assert "validate user input" in semantic[-1].content

    def test_dream_does_not_promote_low_importance(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Minor note: used tabs instead of spaces",
                    memory_type=EPISODIC,
                    importance=2.0,
                    created_at=now - timedelta(hours=1),
                    memory_id="mem-low-1",
                ),
            ]
        )

        journal = self.dreamer.dream()
        assert journal.memories_promoted == 0

    def test_dream_prunes_expired_memories(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="This memory is expired",
                    memory_type=EPISODIC,
                    importance=3.0,
                    created_at=now - timedelta(days=10),
                    expires_at=now - timedelta(days=1),  # Expired
                    memory_id="mem-exp-1",
                ),
                _make_memory(
                    content="This memory is valid",
                    memory_type=EPISODIC,
                    importance=5.0,
                    created_at=now - timedelta(hours=1),
                    memory_id="mem-valid-1",
                ),
            ]
        )

        journal = self.dreamer.dream()
        assert journal.memories_pruned >= 1
        assert "mem-exp-1" in self.engine._deleted

    def test_dream_does_not_prune_pinned(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Pinned safety rule",
                    memory_type=EPISODIC,
                    importance=1.0,
                    is_pinned=True,
                    created_at=now - timedelta(days=30),
                    expires_at=now - timedelta(days=1),  # Would be expired
                    memory_id="mem-pinned-1",
                ),
            ]
        )

        self.dreamer.dream()
        assert "mem-pinned-1" not in self.engine._deleted

    def test_dream_prunes_old_unused_low_importance(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                # Recent memory so the dreamer doesn't return early
                _make_memory(
                    content="Recent memory that triggers the dream cycle to run",
                    memory_type=EPISODIC,
                    importance=5.0,
                    created_at=now - timedelta(hours=1),
                    memory_id="mem-recent-trigger",
                ),
                # Old, unused, low-value memory that should be pruned
                _make_memory(
                    content="Old unused low-value memory that should be pruned from the system",
                    memory_type=EPISODIC,
                    importance=1.0,
                    access_count=0,
                    created_at=now - timedelta(days=14),
                    memory_id="mem-old-1",
                ),
            ]
        )

        journal = self.dreamer.dream()
        assert journal.memories_pruned >= 1
        assert "mem-old-1" in self.engine._deleted

    def test_dream_logs_audit_trail(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Test memory for audit trail verification",
                    memory_type=EPISODIC,
                    importance=5.0,
                    created_at=now - timedelta(hours=1),
                ),
            ]
        )

        self.dreamer.dream()
        audits = [a for a in self.engine._audit_entries if a["action"] == "dream_consolidation"]
        assert len(audits) == 1
        details = audits[0]["details"]
        assert "reviewed" in details
        assert "consolidated" in details

    def test_dream_handles_errors_gracefully(self):
        # Make list_all raise an error
        original = self.engine.list_all

        def failing_list_all(*args, **kwargs):
            raise RuntimeError("Database connection lost")

        self.engine.list_all = failing_list_all

        journal = self.dreamer.dream()
        assert len(journal.errors) == 1
        assert "Database connection lost" in journal.errors[0]

        # Restore
        self.engine.list_all = original

    def test_dream_with_custom_lookback(self):
        dreamer = MemoryDreamer(self.engine, lookback_hours=1)
        now = datetime.now(UTC)

        # Memory from 2 hours ago — outside lookback
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Old memory outside lookback window",
                    memory_type=EPISODIC,
                    importance=5.0,
                    created_at=now - timedelta(hours=2),
                ),
            ]
        )

        journal = dreamer.dream()
        assert journal.memories_reviewed == 0  # Outside 1-hour lookback

    def test_get_dream_history(self):
        # Add a dream audit entry
        self.engine._audit_entries.append(
            {
                "action": "dream_consolidation",
                "details": {"reviewed": 5, "consolidated": 1},
            }
        )

        history = self.dreamer.get_dream_history()
        assert len(history) == 1
        assert history[0]["details"]["reviewed"] == 5

    def test_extract_lesson_short_content(self):
        mem = _make_memory(content="short", importance=8.0)
        lesson = self.dreamer._extract_lesson(mem)
        assert lesson is None  # Too short

    def test_extract_lesson_high_importance(self):
        content = "Important discovery: the API rate limit should be set to 1000 requests per minute"
        mem = _make_memory(content=content, importance=8.0)
        lesson = self.dreamer._extract_lesson(mem)
        assert lesson == content

    def test_extract_lesson_with_metadata_hint(self):
        mem = _make_memory(
            content="This is a longer piece of content that exceeds the minimum length for lesson extraction",
            importance=3.0,
            metadata={"lesson": "Always use connection pooling"},
        )
        lesson = self.dreamer._extract_lesson(mem)
        assert lesson == "Always use connection pooling"

    def test_find_consolidation_candidates_similar(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Python decorators are functions that modify other functions by wrapping them",
                    memory_type=EPISODIC,
                    importance=6.0,
                    created_at=now - timedelta(hours=1),
                    memory_id="mem-sim-1",
                ),
                _make_memory(
                    content="Python decorators modify other functions by wrapping them with additional behavior and logic",
                    memory_type=EPISODIC,
                    importance=5.0,
                    created_at=now - timedelta(hours=2),
                    memory_id="mem-sim-2",
                ),
            ]
        )

        candidates = self.dreamer._find_consolidation_candidates(self.engine._memories)
        # These share many words — should be detected as similar
        assert len(candidates) >= 1
        assert candidates[0].recommendation == "merge"

    def test_find_consolidation_candidates_different(self):
        now = datetime.now(UTC)
        self.engine._memories.extend(
            [
                _make_memory(
                    content="Python decorators are functions",
                    memory_type=EPISODIC,
                    importance=6.0,
                    created_at=now - timedelta(hours=1),
                ),
                _make_memory(
                    content="Database connection pooling strategies for production",
                    memory_type=EPISODIC,
                    importance=5.0,
                    created_at=now - timedelta(hours=2),
                ),
            ]
        )

        candidates = self.dreamer._find_consolidation_candidates(self.engine._memories)
        # These are unrelated — should not be candidates
        assert len(candidates) == 0
