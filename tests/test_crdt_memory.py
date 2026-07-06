from __future__ import annotations

import pytest

from bastion.crdt_memory import RGA, CRDTMemory, LWWRegister, ORMap, ORSet, PNCounter, VectorClock
from bastion.memory import BastionMemory


class TestVectorClock:
    def test_tick_increments_agent(self):
        clock = VectorClock()
        advanced = clock.tick("alice")
        assert advanced.to_dict() == {"alice": 1}

    def test_tick_preserves_existing(self):
        clock = VectorClock({"alice": 3, "bob": 1})
        advanced = clock.tick("alice")
        assert advanced.to_dict() == {"alice": 4, "bob": 1}

    def test_merge_takes_max(self):
        a = VectorClock({"alice": 3, "bob": 1})
        b = VectorClock({"alice": 1, "bob": 2})
        merged = a.merge(b)
        assert merged.to_dict() == {"alice": 3, "bob": 2}

    def test_happens_before(self):
        earlier = VectorClock({"alice": 1, "bob": 1})
        later = VectorClock({"alice": 2, "bob": 1})
        assert earlier.happens_before(later)
        assert not later.happens_before(earlier)

    def test_concurrent_detection(self):
        a = VectorClock({"alice": 2, "bob": 1})
        b = VectorClock({"alice": 1, "bob": 2})
        assert a.is_concurrent_with(b)
        assert b.is_concurrent_with(a)

    def test_not_concurrent_when_ordered(self):
        earlier = VectorClock({"alice": 2, "bob": 1})
        later = VectorClock({"alice": 3, "bob": 1})
        assert not earlier.is_concurrent_with(later)

    def test_json_roundtrip(self):
        clock = VectorClock({"alice": 5, "bob": 3})
        restored = VectorClock.from_json(clock.to_json())
        assert restored == clock

    def test_empty_clock(self):
        clock = VectorClock()
        assert clock.to_dict() == {}
        assert clock.tick("alice").to_dict() == {"alice": 1}


class TestCRDTMemory:
    @pytest.fixture
    def memory(self):
        return BastionMemory(agent_id="crdt-test", mock=True)

    def test_store_adds_vector_clock(self, memory):
        crdt = CRDTMemory(memory)
        record = crdt.store("fact", "hello")
        assert record.metadata is not None
        assert "_vector_clock" in record.metadata
        assert record.metadata["_vector_clock"] == {"crdt-test": 1}

    def test_clock_increments_on_each_store(self, memory):
        crdt = CRDTMemory(memory)
        crdt.store("fact", "first")
        crdt.store("fact", "second")
        assert crdt.get_clock().to_dict() == {"crdt-test": 2}

    def test_search_delegates(self, memory):
        crdt = CRDTMemory(memory)
        crdt.store("fact", "searchable content")
        results = crdt.search("searchable")
        assert len(results) == 1

    def test_get_memory_delegates(self, memory):
        crdt = CRDTMemory(memory)
        record = crdt.store("fact", "gettable")
        fetched = crdt.get_memory(record.memory_id)
        assert fetched is not None
        assert fetched.content == "gettable"

    def test_no_conflict_with_single_candidate(self, memory):
        crdt = CRDTMemory(memory)
        record = crdt.store("fact", "single")
        resolved = crdt.resolve_conflicts("key", [record])
        assert resolved.memory_id == record.memory_id

    def test_lww_resolves_concurrent_writes(self, memory):
        crdt = CRDTMemory(memory)
        # Force concurrency by creating fake records with different clocks
        from bastion.models import MemoryRecord

        r1 = MemoryRecord(content="alice: Python", metadata={"_vector_clock": {"alice": 2, "bob": 1}})
        r2 = MemoryRecord(content="bob: Rust", metadata={"_vector_clock": {"alice": 1, "bob": 2}})

        resolved = crdt.resolve_conflicts("language", [r1, r2])
        assert resolved.content in ("alice: Python", "bob: Rust")
        # LWW picks whichever has higher sum — both sums are 3, so either is OK

    def test_semantic_merge_callback(self, memory):
        def merge_fn(contents, fact_key):
            return f"MERGED: {'; '.join(contents)}"

        crdt = CRDTMemory(memory, strategy="semantic", llm_merge_callback=merge_fn)
        from bastion.models import MemoryRecord

        r1 = MemoryRecord(content="alice: Python", metadata={"_vector_clock": {"alice": 2, "bob": 1}})
        r2 = MemoryRecord(content="bob: Rust", metadata={"_vector_clock": {"alice": 1, "bob": 2}})

        resolved = crdt.resolve_conflicts("language", [r1, r2])
        assert "MERGED:" in resolved.content
        assert "alice: Python" in resolved.content
        assert "bob: Rust" in resolved.content

    def test_resolved_record_has_merged_clock(self, memory):
        crdt = CRDTMemory(memory)
        from bastion.models import MemoryRecord

        r1 = MemoryRecord(content="a", metadata={"_vector_clock": {"alice": 2, "bob": 1}})
        r2 = MemoryRecord(content="b", metadata={"_vector_clock": {"alice": 1, "bob": 2}})
        resolved = crdt.resolve_conflicts("test", [r1, r2])
        assert resolved.metadata is not None
        clock = resolved.metadata["_vector_clock"]
        assert clock["alice"] >= 2
        assert clock["bob"] >= 2
        assert clock["crdt-test"] >= 1  # resolution tick

    def test_store_with_graph_still_works(self, memory):
        crdt = CRDTMemory(memory)
        record = crdt._memory.store_with_graph("Bastion uses CockroachDB")
        assert record is not None

    def test_broadcast_still_works(self, memory):
        crdt = CRDTMemory(memory)
        msg = crdt._memory.broadcast("test_event", {"data": 1})
        assert msg.event_type == "test_event"

    def test_clock_for_namespace_isolation(self, memory):
        """Agent clock should be independent of other agents."""
        crdt_a = CRDTMemory(memory)
        crdt_a.store("fact", "from alice")
        assert crdt_a.get_clock().to_dict() == {"crdt-test": 1}


class TestLWWRegister:
    @pytest.fixture
    def crdt(self):
        memory = BastionMemory(agent_id="lww-test", mock=True)
        return CRDTMemory(memory)

    def test_set_and_get(self, crdt):
        reg = LWWRegister(crdt, "language")
        reg.set("Python")
        assert reg.get() == "Python"

    def test_get_returns_latest(self, crdt):
        reg = LWWRegister(crdt, "language")
        reg.set("Python")
        reg.set("Rust")
        assert reg.get() == "Rust"

    def test_get_returns_none_when_empty(self, crdt):
        reg = LWWRegister(crdt, "missing")
        assert reg.get() is None

    def test_key_isolation(self, crdt):
        lang = LWWRegister(crdt, "language")
        theme = LWWRegister(crdt, "theme")
        lang.set("Python")
        theme.set("dark")
        assert lang.get() == "Python"
        assert theme.get() == "dark"

    def test_multiple_concurrent_writes_picks_winner(self, crdt):
        reg = LWWRegister(crdt, "mode")
        reg.set("auto")
        from bastion.models import MemoryRecord
        r1 = MemoryRecord(
            content='{"value": "manual"}',
            metadata={"_vector_clock": {"alice": 2, "bob": 1}, "_crdt_key": "mode"},
        )
        r2 = MemoryRecord(
            content='{"value": "auto"}',
            metadata={"_vector_clock": {"alice": 1, "bob": 2}, "_crdt_key": "mode"},
        )
        resolved = reg.merge([r1, r2])
        # Both have sum=3, so LWW may pick either. Verify one wins.
        assert resolved.content in ('{"value": "manual"}', '{"value": "auto"}')


class TestORSet:
    @pytest.fixture
    def crdt(self):
        memory = BastionMemory(agent_id="orset-test", mock=True)
        return CRDTMemory(memory)

    def test_add_and_get(self, crdt):
        s = ORSet(crdt, "tags")
        s.add("python")
        s.add("rust")
        assert s.get() == {"python", "rust"}

    def test_remove_element(self, crdt):
        s = ORSet(crdt, "tags")
        s.add("python")
        s.add("rust")
        s.remove("python")
        assert s.get() == {"rust"}

    def test_add_after_remove(self, crdt):
        s = ORSet(crdt, "tags")
        s.add("python")
        s.remove("python")
        s.add("python")  # re-add
        assert "python" in s.get()

    def test_empty_set(self, crdt):
        s = ORSet(crdt, "empty")
        assert s.get() == set()

    def test_multiple_elements(self, crdt):
        s = ORSet(crdt, "tags")
        for tag in ["a", "b", "c", "d", "e"]:
            s.add(tag)
        assert len(s.get()) == 5


class TestPNCounter:
    @pytest.fixture
    def crdt(self):
        memory = BastionMemory(agent_id="pn-test", mock=True)
        return CRDTMemory(memory)

    def test_initial_zero(self, crdt):
        c = PNCounter(crdt, "writes")
        assert c.value() == 0

    def test_increment(self, crdt):
        c = PNCounter(crdt, "writes")
        c.increment(5)
        assert c.value() == 5

    def test_decrement(self, crdt):
        c = PNCounter(crdt, "writes")
        c.increment(10)
        c.decrement(3)
        assert c.value() == 7

    def test_multiple_operations(self, crdt):
        c = PNCounter(crdt, "ops")
        for _ in range(5):
            c.increment(1)
        assert c.value() == 5

    def test_negative_result(self, crdt):
        c = PNCounter(crdt, "balance")
        c.decrement(10)
        assert c.value() == -10


class TestRGA:
    @pytest.fixture
    def crdt(self):
        memory = BastionMemory(agent_id="rga-test", mock=True)
        return CRDTMemory(memory)

    def test_append_and_list(self, crdt):
        log = RGA(crdt, "conversation")
        log.append("Hello")
        log.append("World")
        assert log.list() == ["Hello", "World"]

    def test_empty_log(self, crdt):
        log = RGA(crdt, "empty")
        assert log.list() == []

    def test_multiple_appends_preserve_order(self, crdt):
        log = RGA(crdt, "events")
        for i in range(10):
            log.append(f"event-{i}")
        result = log.list()
        assert len(result) == 10
        assert result[0] == "event-0"
        assert result[-1] == "event-9"


class TestORMap:
    @pytest.fixture
    def crdt(self):
        memory = BastionMemory(agent_id="ormap-test", mock=True)
        return CRDTMemory(memory)

    def test_set_and_get(self, crdt):
        m = ORMap(crdt, "profile")
        m.set("role", "monitor", "LWWRegister")
        assert m.get("role") == "monitor"

    def test_multiple_keys(self, crdt):
        m = ORMap(crdt, "profile")
        m.set("role", "monitor", "LWWRegister")
        m.set("model", "gpt-4", "LWWRegister")
        assert sorted(m.keys()) == ["model", "role"]

    def test_get_returns_none_for_missing(self, crdt):
        m = ORMap(crdt, "profile")
        assert m.get("nonexistent") is None

    def test_overwrite_value(self, crdt):
        m = ORMap(crdt, "config")
        m.set("timeout", "30", "LWWRegister")
        m.set("timeout", "60", "LWWRegister")
        assert m.get("timeout") == "60"
