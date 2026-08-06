"""Long-Term Memory Gateway (LTM Gateway) — The Money Shot

When an agent is about to run an expensive workflow, check if a similar analysis
was already completed. If a match above the threshold exists, return the cached
result instead of re-running the full pipeline.

This is the pattern CockroachDB described in their June 2026 blog post as the
#1 use case for agentic memory:

    "Instead of rerunning the full workflow from scratch, the LTM Gateway
    performs a similarity search against prior completed analyses. It bypassed
    planner, bypassed the SQL execution, bypassed the web search, and
    returned the cached insight instantly."

Retrieval strategy:
    1. Vector search via C-SPANN index (recall candidates)
    2. Overlap-based re-ranking (precision: does the stored analysis cover the query?)
    3. Blended similarity score gates reuse at 80% threshold

Usage:
    gateway = LTMMemoryGateway(memory_engine)
    result = gateway.check_reuse("analyze Q2 revenue trends")
    if result:
        print(f"Found {result.similarity:.1%} match — reusing cached analysis")
    else:
        # Run the expensive workflow, then store the result
        analysis = run_expensive_workflow(...)
        gateway.store_analysis("analyze Q2 revenue trends", analysis)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Default threshold: an 80% match is considered "close enough" to reuse
DEFAULT_REUSE_THRESHOLD = 0.80

# Categories of analysis results we can cache
ANALYSIS_TYPES = frozenset(
    {
        "analysis",
        "research",
        "summary",
        "report",
        "query_result",
        "computation",
        "recommendation",
    }
)


@dataclass
class ReuseResult:
    """Result of an LTM Gateway reuse check."""

    memory_id: str
    content: str
    similarity: float
    cached_at: str
    reuse_count: int
    tokens_saved: int
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "content": self.content,
            "similarity": round(self.similarity, 4),
            "cached_at": self.cached_at,
            "reuse_count": self.reuse_count,
            "tokens_saved": self.tokens_saved,
            "metadata": self.metadata,
        }


@dataclass
class StoreResult:
    """Result of storing an analysis in the LTM Gateway."""

    memory_id: str
    stored_at: str
    analysis_type: str
    estimated_tokens: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "stored_at": self.stored_at,
            "analysis_type": self.analysis_type,
            "estimated_tokens": self.estimated_tokens,
        }


@dataclass
class GatewayStats:
    """Aggregate statistics for the LTM Gateway."""

    total_checks: int = 0
    total_reuses: int = 0
    total_stores: int = 0
    total_tokens_saved: int = 0
    avg_similarity: float = 0.0
    reuse_rate: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_checks": self.total_checks,
            "total_reuses": self.total_reuses,
            "total_stores": self.total_stores,
            "total_tokens_saved": self.total_tokens_saved,
            "avg_similarity": round(self.avg_similarity, 4),
            "reuse_rate": round(self.reuse_rate, 4),
        }


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token for English text."""
    return max(1, len(text) // 4)


class LTMMemoryGateway:
    """Long-Term Memory Gateway for agentic memory reuse.

    Before an agent runs any expensive workflow (LLM call, web search,
    complex computation), check if a similar analysis already exists.
    If a match above the threshold is found, return it instead.

    This is the core pattern that makes CockroachDB's vector indexing
    shine: semantic similarity search to avoid redundant computation.
    """

    def __init__(
        self,
        memory_engine: Any,
        reuse_threshold: float = DEFAULT_REUSE_THRESHOLD,
    ):
        self._memory = memory_engine
        self._reuse_threshold = reuse_threshold
        self._stats = GatewayStats()

    @property
    def stats(self) -> GatewayStats:
        return self._stats

    def check_reuse(
        self,
        query: str,
        threshold: float | None = None,
        analysis_type: str | None = None,
    ) -> ReuseResult | None:
        """Check if a similar analysis already exists in long-term memory.

        Args:
            query: The question or task description to search for.
            threshold: Override the default reuse threshold (0.0-1.0).
            analysis_type: Filter to a specific memory type.

        Returns:
            ReuseResult if a match above threshold exists, None otherwise.
        """
        if not query or not query.strip():
            return None

        threshold = threshold if threshold is not None else self._reuse_threshold
        self._stats.total_checks += 1
        self._stats.reuse_rate = self._stats.total_reuses / max(1, self._stats.total_checks)

        # Search for similar completed analyses via C-SPANN vector index
        results = self._memory.search(
            query=query,
            k=5,
            threshold=threshold,
            memory_type=analysis_type,
        )

        if not results:
            return None

        # Find the best match that's an analysis result (not raw input)
        best = None
        for record in results:
            meta = record.metadata or {}
            # Prefer records tagged as analysis results
            is_analysis = (
                meta.get("analysis_result") is True
                or meta.get("analysis_type") in ANALYSIS_TYPES
                or meta.get("workflow_output") is True
            )
            if not is_analysis:
                continue
            if best is None:
                best = record
                break

        # Fallback: if no explicit analysis record, use the top result
        if best is None and results:
            best = results[0]

        if best is None:
            return None

        # Compute similarity from how much of the query the stored analysis covers.
        # Overlap coefficient (|Q ∩ C| / |Q|) rather than Jaccard: a long stored
        # analysis that fully covers a short query is a reuse candidate, not a mismatch.
        meta = best.metadata or {}
        query_words = set(query.lower().split())
        content_words = set((best.content or "").lower().split())
        if query_words and content_words:
            content_overlap = len(query_words & content_words) / len(query_words)
        else:
            content_overlap = 0.0
        # Also compare against the stored original query (metadata["original_query"]),
        # which captures intent even when the stored result content is long.
        orig_overlap = 0.0
        orig_q = meta.get("original_query") or ""
        if orig_q:
            orig_words = set(str(orig_q).lower().split())
            if query_words and orig_words:
                orig_overlap = len(query_words & orig_words) / len(query_words)
        best_overlap = max(content_overlap, orig_overlap)
        # Blend with importance as a secondary signal
        # Importance only boosts when there's already meaningful overlap (>0.5),
        # preventing high-importance cached results from matching unrelated queries
        importance_signal = min(1.0, max(0.0, best.importance_score / 10.0))
        if best_overlap > 0.5:
            similarity = min(1.0, best_overlap * 0.7 + importance_signal * 0.3)
        else:
            similarity = best_overlap  # No importance boost for low overlap

        if similarity < threshold:
            return None

        # Calculate tokens saved
        cached_tokens = _estimate_tokens(best.content or "")
        query_tokens = _estimate_tokens(query)
        # Estimate: if we reused, we saved the full workflow cost
        # Conservative: assume a workflow costs 3x the query + response
        tokens_saved = cached_tokens * 3 + query_tokens

        self._stats.total_reuses += 1
        self._stats.total_tokens_saved += tokens_saved
        # Running average
        n = self._stats.total_reuses
        self._stats.avg_similarity = (self._stats.avg_similarity * (n - 1) + similarity) / n
        self._stats.reuse_rate = self._stats.total_reuses / max(1, self._stats.total_checks)

        # Reinforce the memory on successful reuse (importance boost)
        self._memory.reinforce(best.memory_id, success=True)

        return ReuseResult(
            memory_id=best.memory_id,
            content=best.content,
            similarity=similarity,
            cached_at=best.created_at.isoformat() if best.created_at else "",
            reuse_count=best.access_count,
            tokens_saved=tokens_saved,
            metadata=best.metadata or {},
        )

    def store_analysis(
        self,
        query: str,
        result: str,
        analysis_type: str = "analysis",
        metadata: dict[str, Any] | None = None,
        tokens_used: int | None = None,
    ) -> StoreResult:
        """Store a completed analysis result for future reuse.

        Args:
            query: The original question/task that was analyzed.
            result: The analysis output to cache.
            analysis_type: Category of analysis (analysis, research, summary, etc.).
            metadata: Additional metadata to attach.
            tokens_used: Number of tokens consumed by the original workflow.

        Returns:
            StoreResult with the memory ID and metadata.
        """
        now = datetime.now(UTC)
        meta = {
            "analysis_result": True,
            "analysis_type": analysis_type,
            "original_query": query,
            "workflow_output": True,
            "ltm_gateway_stored": True,
            "stored_at": now.isoformat(),
        }
        if tokens_used is not None:
            meta["tokens_used"] = tokens_used
        if metadata:
            meta.update(metadata)

        record = self._memory.store(
            memory_type=analysis_type,
            content=f"[LTM] Query: {query}\nResult: {result}",
            metadata=meta,
        )

        self._stats.total_stores += 1

        logger.info(
            "LTM Gateway: stored analysis",
            memory_id=record.memory_id,
            analysis_type=analysis_type,
            query_length=len(query),
            result_length=len(result),
        )

        return StoreResult(
            memory_id=record.memory_id,
            stored_at=now.isoformat(),
            analysis_type=analysis_type,
            estimated_tokens=tokens_used or _estimate_tokens(result),
        )

    def invalidate(self, query: str, reason: str = "outdated") -> dict[str, Any]:
        """Mark cached analyses for a query as stale.

        When new information arrives that contradicts a cached result,
        use this to mark it for re-computation. The memory isn't deleted
        (audit trail is preserved), but it's tagged as stale.

        Args:
            query: The original query whose cached result is now stale.
            reason: Why the cached result is no longer valid.

        Returns:
            Dict with count of invalidated memories.
        """
        results = self._memory.search(query=query, k=10, threshold=0.5)
        invalidated = 0

        for record in results:
            meta = record.metadata or {}
            if meta.get("analysis_result") or meta.get("workflow_output"):
                # Tag as stale via metadata patch
                self._memory.apply_patch(
                    record.memory_id,
                    [
                        {"op": "add", "path": "/stale", "value": True},
                        {"op": "add", "path": "/stale_reason", "value": reason},
                    ],
                )
                invalidated += 1

        log_fn = logger.info if invalidated > 0 else logger.debug
        log_fn(
            "LTM Gateway: invalidated analyses",
            query=query[:80],
            reason=reason,
            count=invalidated,
        )

        return {
            "invalidated": invalidated,
            "reason": reason,
            "query": query[:200],
        }

    def get_stats(self) -> dict[str, Any]:
        """Get aggregate LTM Gateway statistics."""
        return self._stats.to_dict()
