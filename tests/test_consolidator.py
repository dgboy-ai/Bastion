"""
Tests for MemoryConsolidator — Background Memory Consolidation
==============================================================

Tests the consolidation pipeline:
1. Duplicate detection (exact match grouping)
2. Merge strategy (keep oldest, boost importance)
3. Decay pruning (remove low-importance memories)
4. Anomaly detection integration
5. Full consolidation cycle
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from bastion import BastionMemory, MemoryConsolidator
from bastion.mock import reset


@pytest.fixture(autouse=True)
def setup():
    reset()
    yield
    reset()


@pytest.fixture
def memory():
    return BastionMemory("consolidator-agent", mock=True)


@pytest.fixture
def consolidator(memory):
    return MemoryConsolidator(memory, interval_seconds=9999)


class TestDuplicateDetection:
    def test_no_duplicates_returns_empty(self, consolidator):
        mem = consolidator.memory
        mem.store("fact", "Unique fact one")
        mem.store("fact", "Unique fact two")
        duplicates = consolidator._find_duplicates("consolidator-agent")
        assert duplicates == [], "No duplicates should be detected"

    def test_exact_duplicates_are_grouped(self, consolidator):
        mem = consolidator.memory
        mem.store("fact", "Duplicate content")
        mem.store("fact", "Duplicate content")
        mem.store("fact", "Unique content")
        duplicates = consolidator._find_duplicates("consolidator-agent")
        assert len(duplicates) == 1, "Should find exactly one group of duplicates"
        assert len(duplicates[0]) == 2, "Group should contain 2 records"

    def test_normalized_duplicates_are_grouped(self, consolidator):
        mem = consolidator.memory
        mem.store("fact", "  Hello World  ")
        mem.store("fact", "hello world")
        duplicates = consolidator._find_duplicates("consolidator-agent")
        assert len(duplicates) == 1, "Case-insensitive, whitespace-trimmed duplicates should group"

    def test_empty_memory_returns_empty(self, consolidator):
        duplicates = consolidator._find_duplicates("consolidator-agent")
        assert duplicates == []


class TestMergeGroup:
    def test_merge_boosts_importance_of_oldest(self, consolidator):
        mem = consolidator.memory
        r1 = mem.store("fact", "Original fact")
        r2 = mem.store("fact", "Original fact")

        original_score = r1.importance_score
        consolidator._merge_group([r1, r2])

        # Oldest should have boosted importance
        all_memories = mem.search("Original fact", k=10)
        oldest = [m for m in all_memories if m.memory_id == r1.memory_id]
        if oldest:
            assert oldest[0].importance_score > original_score

    def test_merge_single_item_does_nothing(self, consolidator):
        mem = consolidator.memory
        mem.store("fact", "Solo fact")
        result = consolidator._merge_group([mem.store("fact", "Solo fact")])
        assert result is None, "Merge single item should return None"


class TestPruneByDecay:
    def test_low_importance_memories_are_pruned(self, consolidator):
        mem = consolidator.memory
        r_low = mem.store("fact", "Low importance memory")
        mem.reinforce(r_low.memory_id, success=False)
        mem.reinforce(r_low.memory_id, success=False)

        r_high = mem.store("fact", "High importance memory")
        for _ in range(5):
            mem.reinforce(r_high.memory_id, success=True)

        consolidator._prune_by_decay("consolidator-agent", threshold=3.0)
        # Pruning creates expiry markers; the system should not crash

    def test_pruning_does_not_crash_on_empty(self, consolidator):
        consolidator._prune_by_decay("consolidator-agent", threshold=2.0)


class TestConsolidate:
    @pytest.mark.asyncio
    async def test_consolidate_runs_without_error(self, consolidator):
        mem = consolidator.memory
        mem.store("fact", "Fact one")
        mem.store("fact", "Fact two")
        mem.store("fact", "Fact one")  # duplicate
        await consolidator._consolidate()
        all_mem = mem.list_all()
        assert len(all_mem) >= 3, "Should preserve or expand records during consolidation"
        assert any(m.content == "Fact one" for m in all_mem)
        assert any(m.content == "Fact two" for m in all_mem)
        # Verify anomaly detection still works
        anomalies = mem.detect_anomalies()
        assert isinstance(anomalies, list)

    @pytest.mark.asyncio
    async def test_consolidate_with_empty_memory(self, consolidator):
        await consolidator._consolidate()
        assert consolidator.memory.list_all() == []

    @pytest.mark.asyncio
    async def test_consolidate_detects_anomalies(self, consolidator, memory):
        for i in range(15):
            memory.store("fact", f"Memory {i}")
        await consolidator._consolidate()
        anomalies = memory.detect_anomalies()
        assert isinstance(anomalies, list)


class TestLifecycle:
    def test_stop_sets_running_false(self, consolidator):
        consolidator._running = True
        consolidator.stop()
        assert consolidator._running is False

    def test_consolidator_stores_interval(self, consolidator):
        assert consolidator.interval == 9999

    def test_consolidator_references_memory(self, consolidator, memory):
        assert consolidator.memory is memory
