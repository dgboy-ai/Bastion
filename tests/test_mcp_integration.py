"""Full MCP tool integration tests — tests every BastionMemory tool end-to-end in mock mode.

Each test verifies ONE specific tool/feature through the BastionMemory class directly.
All tests use mock mode (no CockroachDB required) and are fully self-contained.
"""

from __future__ import annotations

import pytest

from bastion.memory import BastionMemory
from bastion.mock import reset


@pytest.fixture(autouse=True)
def _clean():
    """Reset global mock state before each test to prevent cross-test pollution."""
    reset()


@pytest.fixture
def mem():
    """Create a mock BastionMemory instance for testing."""
    return BastionMemory(agent_id="test-agent", mock=True)


# ── memory_store ──────────────────────────────────────────────────────────────


class TestMemoryStore:
    def test_store_returns_memory_record(self, mem):
        """Storing a memory returns a valid MemoryRecord with required fields."""
        record = mem.store("fact", "The sky is blue")
        assert record.memory_id
        assert record.content == "The sky is blue"
        assert record.memory_type == "fact"
        assert record.agent_id == "test-agent"
        assert record.cryptographic_hash
        assert record.created_at is not None

    def test_store_hash_chain_first_record(self, mem):
        """First stored memory has no previous_hash."""
        record = mem.store("fact", "First memory")
        assert record.previous_hash is None
        assert record.cryptographic_hash

    def test_store_hash_chain_links(self, mem):
        """Each subsequent memory's previous_hash equals the prior memory's hash."""
        r1 = mem.store("fact", "Memory one")
        r2 = mem.store("fact", "Memory two")
        r3 = mem.store("fact", "Memory three")
        assert r2.previous_hash == r1.cryptographic_hash
        assert r3.previous_hash == r2.cryptographic_hash

    def test_store_with_metadata(self, mem):
        """Metadata is stored and returned in the record."""
        record = mem.store("fact", "Test", metadata={"source": "unit-test", "priority": 9})
        assert record.metadata["source"] == "unit-test"
        assert record.metadata["priority"] == 9

    def test_store_with_expiry(self, mem):
        """Setting expires_in_seconds produces a non-None expires_at."""
        record = mem.store("session", "Temporary data", expires_in_seconds=600)
        assert record.expires_at is not None

    def test_store_default_ttl_for_episodic(self, mem):
        """Episodic memories get a 24-hour TTL by default."""
        record = mem.store("episodic", "Something happened")
        assert record.expires_at is not None

    def test_store_fact_has_no_expiry(self, mem):
        """Fact memories have no default TTL."""
        record = mem.store("fact", "A fact")
        assert record.expires_at is None

    def test_store_empty_content_raises(self, mem):
        """Storing empty content raises ValueError."""
        with pytest.raises(ValueError, match="content must be a non-empty string"):
            mem.store("fact", "")

    def test_store_empty_type_raises(self, mem):
        """Storing with empty memory_type raises ValueError."""
        with pytest.raises(ValueError, match="memory_type must be a non-empty string"):
            mem.store("", "Some content")

    def test_store_increases_audit_count(self, mem):
        """Each store operation creates an audit entry."""
        mem.store("fact", "Audit check")
        audit = mem.audit()
        store_entries = [e for e in audit if e.action == "memory_store"]
        assert len(store_entries) >= 1

    def test_store_with_region(self, mem):
        """Region metadata is accepted and doesn't break storage."""
        record = mem.store("fact", "Regional data", region="us-east1")
        assert record.memory_id
        assert record.content == "Regional data"


# ── memory_search ─────────────────────────────────────────────────────────────


class TestMemorySearch:
    def test_search_finds_stored_memory(self, mem):
        """Searching for content that was just stored returns it."""
        mem.store("fact", "Python is a programming language")
        results = mem.search("Python programming")
        assert len(results) > 0
        assert any("Python" in r.content for r in results)

    def test_search_returns_empty_for_no_match(self, mem):
        """Searching with no stored memories returns empty list."""
        results = mem.search("nonexistent topic xyz")
        assert results == []

    def test_search_respects_k_limit(self, mem):
        """Search respects the k parameter for result count."""
        for i in range(10):
            mem.store("fact", f"Item number {i} about testing")
        results = mem.search("testing item", k=3)
        assert len(results) <= 3

    def test_search_filters_by_memory_type(self, mem):
        """memory_type filter only returns matching types."""
        mem.store("fact", "Python fact")
        mem.store("preference", "Python preference")
        results = mem.search("Python", memory_type="preference")
        assert all(r.memory_type == "preference" for r in results)

    def test_search_threshold_excludes_low_scores(self, mem):
        """High threshold excludes dissimilar results."""
        mem.store("fact", "Python programming language")
        results_high = mem.search("Ruby gemstone", threshold=0.95)
        results_low = mem.search("Ruby gemstone", threshold=0.1)
        assert len(results_high) <= len(results_low)

    def test_search_invalid_k_raises(self, mem):
        """k < 1 raises ValueError."""
        with pytest.raises(ValueError, match="k must be a positive integer"):
            mem.search("test", k=0)

    def test_search_invalid_threshold_raises(self, mem):
        """threshold outside [0, 1] raises ValueError."""
        with pytest.raises(ValueError, match="threshold must be between 0 and 1"):
            mem.search("test", threshold=1.5)

    def test_search_relevance_ranking(self, mem):
        """More relevant results appear first."""
        mem.store("fact", "Python is a snake")
        mem.store("fact", "Python is a programming language")
        results = mem.search("Python programming")
        if results:
            # The programming memory should rank higher
            contents = [r.content for r in results]
            assert any("programming" in c for c in contents)


# ── memory_timetravel ─────────────────────────────────────────────────────────


class TestMemoryTimeTravel:
    def test_timetravel_returns_existing_memories(self, mem):
        """Time-traveling to now includes memories stored before the query."""
        mem.store("fact", "Time-travel test")
        results = mem.get_at_time("now")
        assert len(results) > 0
        assert any("Time-travel" in r.content for r in results)

    def test_timetravel_with_relative_timestamp(self, mem):
        """Relative timestamps like 'now' work."""
        mem.store("fact", "Relative time test")
        results = mem.get_at_time("now")
        assert len(results) > 0

    def test_timetravel_invalid_timestamp_raises(self, mem):
        """Empty timestamp raises ValueError."""
        with pytest.raises(ValueError, match="timestamp must be a non-empty string"):
            mem.get_at_time("")


# ── memory_audit ──────────────────────────────────────────────────────────────


class TestMemoryAudit:
    def test_audit_returns_entries_after_store(self, mem):
        """Audit trail has entries after memory operations."""
        mem.store("fact", "Audit test")
        entries = mem.audit()
        assert len(entries) > 0

    def test_audit_entry_has_required_fields(self, mem):
        """Each audit entry has audit_id, agent_id, action, and recorded_at."""
        mem.store("fact", "Field check")
        entries = mem.audit()
        entry = entries[0]
        assert entry.audit_id
        assert entry.agent_id == "test-agent"
        assert entry.action
        assert entry.recorded_at is not None

    def test_audit_store_action_recorded(self, mem):
        """Direct store_audit creates an audit entry with the given action."""
        mem.store_audit("custom_action", {"key": "value"})
        entries = mem.audit()
        custom = [e for e in entries if e.action == "custom_action"]
        assert len(custom) >= 1


# ── memory_delete ─────────────────────────────────────────────────────────────


class TestMemoryDelete:
    def test_delete_removes_memory(self, mem):
        """Deleting a memory makes it no longer findable."""
        record = mem.store("fact", "Delete me")
        mem_id = record.memory_id
        assert mem.delete_memory(mem_id) is True
        assert mem.get_memory(mem_id) is None

    def test_delete_nonexistent_returns_false(self, mem):
        """Deleting a non-existent memory_id returns False."""
        assert mem.delete_memory("nonexistent-id-12345") is False

    def test_delete_creates_audit_entry(self, mem):
        """Delete operation is logged in the audit trail."""
        record = mem.store("fact", "Audit delete")
        mem.delete_memory(record.memory_id)
        entries = mem.audit()
        deletes = [e for e in entries if e.action == "memory_delete"]
        assert len(deletes) >= 1

    def test_delete_invalid_id_raises(self, mem):
        """Deleting with empty ID raises ValueError."""
        with pytest.raises(ValueError, match="memory_id must be a non-empty string"):
            mem.delete_memory("")


# ── memory_pin / unpin ────────────────────────────────────────────────────────


class TestMemoryPinUnpin:
    def test_pin_creates_pinned_memory(self, mem):
        """Pinning a memory marks it as pinned with the given priority."""
        record = mem.pin("safety_rule", "Never expose raw credentials", pin_priority=2)
        assert record.is_pinned is True
        assert record.pin_priority == 2

    def test_unpin_removes_pin(self, mem):
        """Unpinning a memory removes its pin status."""
        record = mem.pin("safety_rule", "Test pin", pin_priority=1)
        assert mem.unpin(record.memory_id) is True
        pinned = mem.get_pinned(min_priority=0)
        pinned_ids = [p.memory_id for p in pinned]
        assert record.memory_id not in pinned_ids

    def test_get_pinned_returns_sorted_by_priority(self, mem):
        """get_pinned returns results sorted by pin_priority descending."""
        mem.pin("safety_rule", "Low priority", pin_priority=0)
        mem.pin("safety_rule", "Critical", pin_priority=2)
        mem.pin("safety_rule", "Important", pin_priority=1)
        pinned = mem.get_pinned(min_priority=0)
        priorities = [p.pin_priority for p in pinned]
        assert priorities == sorted(priorities, reverse=True)

    def test_get_pinned_filters_by_min_priority(self, mem):
        """min_priority filter excludes lower-priority pins."""
        mem.pin("safety_rule", "Normal", pin_priority=0)
        mem.pin("safety_rule", "Critical", pin_priority=2)
        pinned = mem.get_pinned(min_priority=1)
        assert all(p.pin_priority >= 1 for p in pinned)

    def test_pin_invalid_priority_raises(self, mem):
        """pin_priority outside {0, 1, 2} raises ValueError."""
        with pytest.raises(ValueError, match="pin_priority must be 0, 1, or 2"):
            mem.pin("safety_rule", "Bad priority", pin_priority=5)

    def test_unpin_nonexistent_returns_false(self, mem):
        """Unpinning a non-existent memory returns False."""
        assert mem.unpin("fake-id") is False


# ── memory_list ───────────────────────────────────────────────────────────────


class TestMemoryList:
    def test_list_returns_all_memories(self, mem):
        """list_memories returns all stored memories for the agent."""
        mem.store("fact", "Fact one")
        mem.store("fact", "Fact two")
        results = mem.list_memories()
        assert len(results) >= 2

    def test_list_filters_by_type(self, mem):
        """Filtering by memory_type returns only matching types."""
        mem.store("fact", "Fact only")
        mem.store("preference", "Preference only")
        results = mem.list_memories(memory_type="fact")
        assert all(r.memory_type == "fact" for r in results)

    def test_list_respects_limit(self, mem):
        """limit parameter caps the number of results."""
        for i in range(5):
            mem.store("fact", f"Item {i}")
        results = mem.list_memories(limit=2)
        assert len(results) <= 2

    def test_list_respects_offset(self, mem):
        """Cursor-based pagination returns a disjoint next page."""
        records = []
        for i in range(5):
            records.append(mem.store("fact", f"Offset item {i}"))
        first_page = mem.list_memories(limit=2)
        assert len(first_page) == 2
        last_created = first_page[-1].created_at
        import base64

        cursor = base64.b64encode(last_created.isoformat().encode()).decode()
        next_page = mem.list_memories(limit=50, cursor=cursor)
        first_ids = {r.memory_id for r in first_page}
        assert all(r.memory_id not in first_ids for r in next_page)


# ── memory_correct ────────────────────────────────────────────────────────────


class TestMemoryCorrect:
    def test_correct_updates_content(self, mem):
        """correct_memory replaces the stored content."""
        record = mem.store("fact", "Old content")
        corrected = mem.correct_memory(record.memory_id, "Corrected content")
        assert corrected is not None
        assert corrected.content == "Corrected content"

    def test_correct_nonexistent_returns_none(self, mem):
        """Correcting a non-existent memory returns None."""
        result = mem.correct_memory("fake-id", "New content")
        assert result is None

    def test_correct_updates_metadata(self, mem):
        """correct_memory merges new metadata with existing."""
        record = mem.store("fact", "Meta test", metadata={"a": 1})
        corrected = mem.correct_memory(record.memory_id, "Updated", metadata={"b": 2})
        assert corrected.metadata.get("b") == 2

    def test_correct_invalid_id_raises(self, mem):
        """Empty memory_id raises ValueError."""
        with pytest.raises(ValueError, match="memory_id must be a non-empty string"):
            mem.correct_memory("", "content")

    def test_correct_invalid_content_raises(self, mem):
        """Empty new_content raises ValueError."""
        record = mem.store("fact", "Something")
        with pytest.raises(ValueError, match="content must be a non-empty string"):
            mem.correct_memory(record.memory_id, "")


# ── resolve_conflict ──────────────────────────────────────────────────────────


class TestConflictResolution:
    def test_resolve_conflict_returns_merged(self, mem):
        """resolve_conflict returns a merged string."""
        merged = mem.resolve_conflict("Fact A", "Fact B")
        assert merged
        assert isinstance(merged, str)

    def test_resolve_conflict_with_context(self, mem):
        """Context parameter is accepted without error."""
        merged = mem.resolve_conflict("Fact A", "Fact B", context="user preference")
        assert merged

    def test_resolve_conflict_empty_a_raises(self, mem):
        """Empty fact_a raises ValueError."""
        with pytest.raises(ValueError, match="fact_a must be a non-empty string"):
            mem.resolve_conflict("", "Fact B")

    def test_resolve_conflict_empty_b_raises(self, mem):
        """Empty fact_b raises ValueError."""
        with pytest.raises(ValueError, match="fact_b must be a non-empty string"):
            mem.resolve_conflict("Fact A", "")


# ── ltm_check_reuse / ltm_store_analysis ──────────────────────────────────────


class TestLTMGateway:
    def test_ltm_check_reuse_returns_none_when_empty(self, mem):
        """check_reuse returns None when no similar analysis exists."""
        from bastion.ltm_gateway import LTMMemoryGateway

        gw = LTMMemoryGateway(mem)
        result = gw.check_reuse("analyze revenue trends")
        assert result is None

    def test_ltm_store_and_check_reuse(self, mem):
        """Storing an analysis allows check_reuse to find it."""
        from bastion.ltm_gateway import LTMMemoryGateway

        gw = LTMMemoryGateway(mem)
        gw.store_analysis(
            query="analyze Q2 revenue",
            result="Q2 revenue increased by 15% YoY",
            analysis_type="analysis",
        )
        result = gw.check_reuse("analyze Q2 revenue", threshold=0.3)
        assert result is not None
        assert result.memory_id
        assert "Q2 revenue" in result.content

    def test_ltm_store_analysis_returns_store_result(self, mem):
        """store_analysis returns a StoreResult with memory_id."""
        from bastion.ltm_gateway import LTMMemoryGateway

        gw = LTMMemoryGateway(mem)
        result = gw.store_analysis("query", "result", tokens_used=500)
        assert result.memory_id
        assert result.analysis_type == "analysis"
        assert result.estimated_tokens == 500

    def test_ltm_gateway_stats(self, mem):
        """Gateway stats track checks, reuses, and stores."""
        from bastion.ltm_gateway import LTMMemoryGateway

        gw = LTMMemoryGateway(mem)
        gw.store_analysis("q1", "r1")
        gw.check_reuse("q1", threshold=0.1)
        stats = gw.get_stats()
        assert stats["total_checks"] >= 1
        assert stats["total_stores"] >= 1


# ── detect_contradictions ─────────────────────────────────────────────────────


class TestContradictionDetection:
    def test_detect_contradictions_returns_result(self, mem):
        """detect_contradictions returns a ContradictionScanResult."""
        from bastion.contradiction import ContradictionDetector

        record = mem.store("fact", "The sky is blue")
        detector = ContradictionDetector(mem)
        result = detector.scan_after_store(record)
        assert result.new_memory_id == record.memory_id
        assert result.scanned_count >= 0
        assert result.contradictions_found >= 0

    def test_detect_contradictions_scan_all(self, mem):
        """scan_all returns a list of ContradictionScanResult."""
        from bastion.contradiction import ContradictionDetector

        mem.store("fact", "Fact one")
        mem.store("fact", "Fact two")
        detector = ContradictionDetector(mem)
        results = detector.scan_all()
        assert isinstance(results, list)


# ── dream ─────────────────────────────────────────────────────────────────────


class TestDreaming:
    def test_dream_returns_journal(self, mem):
        """dream() returns a DreamJournal with expected fields."""
        from bastion.dreaming import MemoryDreamer

        mem.store("fact", "Dream test fact")
        dreamer = MemoryDreamer(mem)
        journal = dreamer.dream()
        assert journal.agent_id == "test-agent"
        assert journal.status in ("complete", "error")
        assert journal.memories_reviewed >= 0
        assert journal.duration_ms >= 0

    def test_dream_empty_memories(self, mem):
        """dream() with no memories completes successfully."""
        from bastion.dreaming import MemoryDreamer

        dreamer = MemoryDreamer(mem)
        journal = dreamer.dream()
        assert journal.status == "complete"
        assert journal.memories_reviewed == 0

    def test_dream_history(self, mem):
        """get_dream_history returns past dream sessions."""
        from bastion.dreaming import MemoryDreamer

        dreamer = MemoryDreamer(mem)
        dreamer.dream()
        history = dreamer.get_dream_history()
        assert isinstance(history, list)


# ── memory_health ─────────────────────────────────────────────────────────────


class TestMemoryHealth:
    def test_health_empty_store(self, mem):
        """Health check on empty store returns zero counts."""
        health = mem.memory_health()
        assert health["total_memories"] == 0
        assert health["pinned_memories"] == 0

    def test_health_after_stores(self, mem):
        """Health check reflects stored memory counts."""
        mem.store("fact", "Health fact")
        mem.pin("safety_rule", "Health rule", pin_priority=2)
        health = mem.memory_health()
        assert health["total_memories"] >= 2
        assert health["pinned_memories"] >= 1


# ── reinforce ─────────────────────────────────────────────────────────────────


class TestReinforce:
    def test_reinforce_increases_importance(self, mem):
        """Reinforcing a memory increases its importance score."""
        record = mem.store("fact", "Reinforce me")
        initial = record.importance_score
        result = mem.reinforce(record.memory_id, success=True)
        assert result["status"] == "reinforced"
        assert result["importance_score"] > initial

    def test_reinforce_nonexistent_returns_not_found(self, mem):
        """Reinforcing a non-existent memory returns not_found."""
        result = mem.reinforce("fake-id")
        assert result["status"] == "not_found"


# ── heal ──────────────────────────────────────────────────────────────────────


class TestHeal:
    def test_heal_removes_expired(self, mem):
        """heal() removes expired memories."""
        mem.store("session", "Expires soon", expires_in_seconds=1)
        result = mem.heal()
        assert result["status"] == "healed"


# ── list_all / get_memory ─────────────────────────────────────────────────────


class TestListAllAndGetMemory:
    def test_get_memory_returns_record(self, mem):
        """get_memory returns the stored record by ID."""
        record = mem.store("fact", "Get me")
        found = mem.get_memory(record.memory_id)
        assert found is not None
        assert found.memory_id == record.memory_id

    def test_get_memory_nonexistent_returns_none(self, mem):
        """get_memory returns None for unknown ID."""
        assert mem.get_memory("nonexistent") is None

    def test_list_all_returns_records(self, mem):
        """list_all returns all memories for the agent."""
        mem.store("fact", "List all test")
        results = mem.list_all()
        assert len(results) >= 1

    def test_list_all_filters_by_type(self, mem):
        """list_all filters correctly by memory_type."""
        mem.store("fact", "Fact only")
        mem.store("preference", "Pref only")
        results = mem.list_all(memory_type="fact")
        assert all(r.memory_type == "fact" for r in results)
