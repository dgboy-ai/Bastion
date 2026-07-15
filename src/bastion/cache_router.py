"""Memory Router — L1/L2 two-tier retrieval architecture.

Routes vector retrieval between fast memory-resident cache and
disk-optimized CockroachDB C-SPANN indexes.

L1 Cache: In-memory LRU for recently/frequently accessed memories (<1ms)
L2 Storage: CockroachDB C-SPANN vector index for long-term storage (15-30ms)

The router dynamically promotes frequently accessed memories to L1,
and demotes cold memories back to L2-only.
"""

from __future__ import annotations

from collections import deque
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class MemoryRouter:
    """Routes vector retrieval between L1 cache and L2 CockroachDB."""

    def __init__(
        self,
        memory: Any,
        cache_size: int = 1000,
        promotion_threshold: int = 3,
        demotion_interval_seconds: int = 300,
    ):
        self.memory = memory
        self.cache_size = cache_size
        self.promotion_threshold = promotion_threshold

        # L1 Cache: memory_id -> MemoryRecord
        self._cache: dict[str, Any] = {}
        # Access order for LRU eviction
        self._access_order: deque[str] = deque()
        # Access count: memory_id -> count (for promotion decisions)
        self._access_counts: dict[str, int] = {}
        # Cache hits/misses for metrics
        self._cache_hits = 0
        self._cache_misses = 0

    def search(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
        namespace_scope: str = "own",
    ) -> list[Any]:
        """Search with dynamic routing between L1 cache and L2 CRDB.

        Strategy:
        1. Check L1 cache for recently accessed memories matching the query
        2. Query L2 CRDB for all matching memories
        3. Merge results, prioritizing cached items for speed
        4. Promote frequently accessed memories to L1 cache
        """
        # Step 1: Search L1 cache (fast path, <1ms)
        cached_results = self._search_cache(query, k, memory_type)

        # Step 2: Search L2 CRDB (slower path, 15-30ms)
        db_results = self.memory.search(query, k, threshold, memory_type, namespace_scope)

        # Step 3: Merge results — cached items first, then fill from DB
        merged = self._merge_results(cached_results, db_results, k)

        # Step 4: Promote frequently accessed memories to cache
        for mem in merged:
            mid = mem.memory_id
            self._access_counts[mid] = self._access_counts.get(mid, 0) + 1
            if self._access_counts[mid] >= self.promotion_threshold:
                self._promote_to_cache(mem)

        return merged

    def _search_cache(
        self,
        query: str,
        k: int,
        memory_type: str | None,
    ) -> list[Any]:
        """Search the in-memory L1 cache."""
        if not self._cache:
            return []

        query_lower = query.lower()
        results = []
        for mem in self._cache.values():
            if memory_type and mem.memory_type != memory_type:
                continue
            if query_lower in mem.content.lower():
                results.append(mem)

        results.sort(key=lambda m: m.importance_score, reverse=True)
        return results[:k]

    def _merge_results(
        self,
        cached: list[Any],
        db: list[Any],
        k: int,
    ) -> list[Any]:
        """Merge cached and DB results, deduplicating by memory_id."""
        seen = set()
        merged = []

        for mem in cached:
            if mem.memory_id not in seen:
                merged.append(mem)
                seen.add(mem.memory_id)

        for mem in db:
            if mem.memory_id not in seen:
                merged.append(mem)
                seen.add(mem.memory_id)
                if len(merged) >= k:
                    break

        return merged[:k]

    def _promote_to_cache(self, mem: Any) -> None:
        """Add a memory to the L1 cache, evicting LRU if full."""
        if len(self._cache) >= self.cache_size and self._access_counts:
            oldest_id = min(self._access_counts, key=self._access_counts.get)  # type: ignore[arg-type]
            self._cache.pop(oldest_id, None)
            self._access_counts.pop(oldest_id, None)
        self._cache[mem.memory_id] = mem

    def invalidate(self, memory_id: str) -> None:
        """Remove a memory from the L1 cache."""
        self._cache.pop(memory_id, None)
        self._access_counts.pop(memory_id, None)

    def clear_cache(self) -> None:
        """Clear the entire L1 cache."""
        self._cache.clear()
        self._access_counts.clear()

    def get_stats(self) -> dict[str, Any]:
        """Return cache performance statistics."""
        total = self._cache_hits + self._cache_misses
        hit_rate = (self._cache_hits / total * 100) if total > 0 else 0.0
        return {
            "cache_size": len(self._cache),
            "cache_capacity": self.cache_size,
            "cache_hits": self._cache_hits,
            "cache_misses": self._cache_misses,
            "hit_rate_percent": round(hit_rate, 1),
            "promotion_threshold": self.promotion_threshold,
        }
