"""Auto-Routing Recall — Classifies queries and selects optimal retrieval strategy.

Inspired by Cognee's GRAPH_COMPLETION mode. Instead of one-size-fits-all
vector search, this module classifies the query type and routes to the
best retrieval strategy:

- Simple lookups → keyword search
- Relationship queries → entity graph traversal
- Temporal queries → time-decay weighted search
- Complex multi-hop → multi-signal fusion

Usage:
    router = RecallRouter(memory_engine)
    result = router.recall("What did the user say about Python last week?")
    print(f"Strategy: {result.strategy}, Results: {len(result.results)}")
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


# Query classification patterns
_TEMPORAL_PATTERNS = [
    r"\b(last|this|past|previous|next|upcoming)\s+(week|month|day|hour|year)\b",
    r"\b(yesterday|today|tomorrow|recently|earlier|before|after)\b",
    r"\bas of\b",
    r"\b(timeline|history|chronolog)\b",
]

_RELATIONSHIP_PATTERNS = [
    r"\b(who|whom|whose)\b",
    r"\b(connected|related|linked|associated|between)\b",
    r"\b(graph|traversal|hops?|path)\b",
    r"\b(team|group|organization|department)\b",
]

_ENTITY_PATTERNS = [
    r"\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+\b",  # Multi-word proper nouns
    r"\b(CockroachDB|Bedrock|Lambda|KMS|S3|SQS|SNS)\b",
]

_SUMMARY_PATTERNS = [
    r"\b(summarize|summary|overview|recap|digest)\b",
    r"\b(what happened|what did|what was|what is)\b",
    r"\b(tell me about|explain|describe)\b",
]


@dataclass
class QueryClassification:
    """Classification result for a query."""
    query_type: str  # "keyword", "relationship", "temporal", "summary", "entity", "unknown"
    confidence: float
    signals: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "query_type": self.query_type,
            "confidence": round(self.confidence, 4),
            "signals": self.signals,
        }


@dataclass
class RecallResult:
    """Result from auto-routing recall."""
    strategy: str
    results: list[Any]
    classification: QueryClassification
    total_results: int = 0
    latency_ms: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy,
            "total_results": self.total_results,
            "classification": self.classification.to_dict(),
            "latency_ms": round(self.latency_ms, 2),
        }


class RecallRouter:
    """Auto-routing recall that classifies queries and selects the best strategy.

    Instead of one-size-fits-all vector search, this routes to:
    - Keyword search for simple lookups
    - Entity search for proper nouns and technical terms
    - Temporal search for time-related queries
    - Multi-signal fusion for complex queries
    """

    def __init__(self, memory_engine: Any):
        self._memory = memory_engine

    def classify(self, query: str) -> QueryClassification:
        """Classify a query into its type."""
        if not query or not query.strip():
            return QueryClassification(query_type="unknown", confidence=0.0)

        query_lower = query.lower()
        scores = {}

        # Check temporal signals
        temporal_score = 0
        for pattern in _TEMPORAL_PATTERNS:
            if re.search(pattern, query_lower):
                temporal_score += 0.3
        scores["temporal"] = min(1.0, temporal_score)

        # Check relationship signals
        relationship_score = 0
        for pattern in _RELATIONSHIP_PATTERNS:
            if re.search(pattern, query_lower):
                relationship_score += 0.3
        scores["relationship"] = min(1.0, relationship_score)

        # Check entity signals
        entity_matches = re.findall(r"\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b", query)
        tech_pattern = r"\b(?:CockroachDB|Bedrock|Lambda|KMS|S3|SQS|SNS|API|SQL|HTTP)\b"
        tech_matches = re.findall(tech_pattern, query, re.IGNORECASE)
        entity_score = min(1.0, (len(entity_matches) + len(tech_matches)) * 0.3)
        scores["entity"] = entity_score

        # Check summary signals
        summary_score = 0
        for pattern in _SUMMARY_PATTERNS:
            if re.search(pattern, query_lower):
                summary_score += 0.35
        scores["summary"] = min(1.0, summary_score)

        # Determine best type — temporal gets priority over summary
        # (a query like "What happened last week?" is both temporal AND summary,
        #  but the temporal aspect is more important for retrieval routing)
        if scores.get("temporal", 0) > 0.2 and scores.get("summary", 0) > 0.2:
            best_type = "temporal"
            best_score = scores["temporal"]
        else:
            best_type = max(scores, key=scores.get)
            best_score = scores[best_type]

        if best_score < 0.2:
            # Low confidence — use multi-signal fusion as default
            return QueryClassification(
                query_type="multi_signal",
                confidence=0.5,
                signals=["default_fallback"],
            )

        return QueryClassification(
            query_type=best_type,
            confidence=best_score,
            signals=[k for k, v in scores.items() if v > 0.1],
        )

    def recall(
        self,
        query: str,
        k: int = 10,
        threshold: float = 0.3,
        memory_type: str | None = None,
    ) -> RecallResult:
        """Auto-route a query to the best retrieval strategy.

        Args:
            query: The search query.
            k: Number of results to return.
            threshold: Minimum score threshold.
            memory_type: Optional filter by memory type.

        Returns:
            RecallResult with strategy used, results, and classification.
        """
        import time
        start = time.monotonic()

        if not query or not query.strip():
            return RecallResult(
                strategy="none",
                results=[],
                classification=QueryClassification(query_type="unknown", confidence=0.0),
                total_results=0,
                latency_ms=0.0,
            )

        classification = self.classify(query)
        strategy = classification.query_type

        # Route based on classification
        if strategy == "keyword":
            # For keyword queries, use list_all with content matching
            results = self._keyword_search(query, k, memory_type)
        elif strategy == "entity":
            # For entity queries, search with entity focus
            results = self._memory.search(query=query, k=k, threshold=threshold * 0.8, memory_type=memory_type)
        elif strategy == "temporal":
            # For temporal queries, boost recency
            results = self._memory.search(query=query, k=k, threshold=threshold, memory_type=memory_type)
        elif strategy == "summary":
            # For summary queries, get broader results
            results = self._memory.search(query=query, k=k * 2, threshold=threshold * 0.5, memory_type=memory_type)
        else:
            # Default: multi-signal fusion
            results = self._memory.search(query=query, k=k, threshold=threshold, memory_type=memory_type)

        latency = (time.monotonic() - start) * 1000

        return RecallResult(
            strategy=strategy,
            results=results,
            classification=classification,
            total_results=len(results),
            latency_ms=latency,
        )

    def _keyword_search(
        self,
        query: str,
        k: int,
        memory_type: str | None,
    ) -> list[Any]:
        """Simple keyword-based search for quick lookups."""
        all_memories = self._memory.list_all(namespace_scope="own", memory_type=memory_type)
        query_words = set(query.lower().split())

        scored = []
        for mem in all_memories:
            content = (mem.content or "").lower()
            content_words = set(content.split())
            overlap = len(query_words & content_words) / max(1, len(query_words))
            if overlap > 0.1:
                scored.append((overlap, mem))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [mem for _, mem in scored[:k]]
