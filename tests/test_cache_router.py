"""Tests for bastion.cache_router module."""

from __future__ import annotations


class FakeMemoryRecord:
    def __init__(self, memory_id, content, memory_type="fact", importance_score=5.0):
        self.memory_id = memory_id
        self.content = content
        self.memory_type = memory_type
        self.importance_score = importance_score


class FakeMemory:
    def __init__(self, records=None):
        self._records = records or []
        self._mock = False

    def search(self, query, k=5, threshold=0.0, memory_type=None, namespace_scope="own"):
        results = self._records
        if memory_type:
            results = [r for r in results if r.memory_type == memory_type]
        return results[:k]

    def list_all(self, namespace_scope="own", memory_type=None):
        results = self._records
        if memory_type:
            results = [r for r in results if r.memory_type == memory_type]
        return results


class TestMemoryRouter:
    def test_search_returns_results(self):
        from bastion.cache_router import MemoryRouter

        records = [
            FakeMemoryRecord("m1", "CockroachDB is distributed"),
            FakeMemoryRecord("m2", "Vector search works"),
        ]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem)

        results = router.search("distributed database", k=5)
        assert len(results) == 2

    def test_search_merges_cache_and_db(self):
        from bastion.cache_router import MemoryRouter

        records = [
            FakeMemoryRecord("m1", "Test memory"),
        ]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem, cache_size=10)

        # First search
        results1 = router.search("test", k=5)
        assert len(results1) == 1

        # Second search - results should be same
        results2 = router.search("test", k=5)
        assert len(results2) == 1

    def test_lru_eviction(self):
        from bastion.cache_router import MemoryRouter

        records = [FakeMemoryRecord(f"m{i}", f"Content {i}", importance_score=float(i)) for i in range(5)]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem, cache_size=3, promotion_threshold=1)

        # Access same memory enough times to promote
        for _ in range(3):
            router.search("content 0", k=1)

        # Cache should not exceed capacity
        assert len(router._cache) <= 3

    def test_promotion_threshold(self):
        from bastion.cache_router import MemoryRouter

        records = [FakeMemoryRecord("m1", "Important memory")]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem, promotion_threshold=2)

        # Access same memory multiple times
        for _ in range(3):
            router.search("important", k=1)

        # Memory should be promoted to cache
        assert "m1" in router._cache

    def test_get_stats(self):
        from bastion.cache_router import MemoryRouter

        mem = FakeMemory(records=[])
        router = MemoryRouter(mem)

        router.search("test", k=5)
        stats = router.get_stats()

        assert "cache_hits" in stats
        assert "cache_misses" in stats
        assert "cache_size" in stats
        assert stats["cache_size"] == 0

    def test_search_with_memory_type_filter(self):
        from bastion.cache_router import MemoryRouter

        records = [
            FakeMemoryRecord("m1", "Fact content", "fact"),
            FakeMemoryRecord("m2", "Preference content", "preference"),
        ]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem)

        results = router.search("content", k=5, memory_type="fact")
        assert len(results) == 1
        assert results[0].memory_type == "fact"

    def test_empty_search(self):
        from bastion.cache_router import MemoryRouter

        mem = FakeMemory(records=[])
        router = MemoryRouter(mem)

        results = router.search("anything", k=5)
        assert len(results) == 0

    def test_invalidate(self):
        from bastion.cache_router import MemoryRouter

        records = [FakeMemoryRecord("m1", "Test")]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem, promotion_threshold=1)

        # Promote to cache
        router.search("test", k=1)
        router.search("test", k=1)

        # Invalidate
        router.invalidate("m1")
        assert "m1" not in router._cache

    def test_clear_cache(self):
        from bastion.cache_router import MemoryRouter

        records = [FakeMemoryRecord("m1", "Test")]
        mem = FakeMemory(records=records)
        router = MemoryRouter(mem, promotion_threshold=1)

        router.search("test", k=1)
        router.search("test", k=1)

        router.clear_cache()
        assert len(router._cache) == 0
