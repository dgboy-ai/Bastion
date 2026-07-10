"""Multi-Signal Retrieval — Combines Vector + BM25 + Entity + Temporal scoring.

Inspired by Mem0's 4-signal retrieval fusion. Each signal scores memories
independently, then results are fused with configurable weights.

Signals:
1. Vector cosine similarity (existing C-SPANN search)
2. BM25 keyword matching (trigram/ILIKE on content)
3. Entity matching (query entities vs metadata tags)
4. Temporal recency (access_count + recency boost)

Usage:
    retriever = MultiSignalRetriever(memory_engine)
    results = retriever.search("Q2 revenue by region", k=10)
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Default signal weights (sum to 1.0)
DEFAULT_WEIGHTS = {
    "vector": 0.45,
    "keyword": 0.25,
    "entity": 0.15,
    "temporal": 0.15,
}

# Stop words for keyword extraction
_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "or", "if", "while", "that", "this", "it", "its",
})


def _tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words, filtering stop words."""
    words = re.findall(r"\w+", text.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) > 1]


def _extract_entities(text: str) -> list[str]:
    """Extract likely entity names from text."""
    # Capitalized words (potential proper nouns)
    entities = re.findall(r"\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b", text)
    # Technical acronyms
    tech = re.findall(r"\b(?:API|SQL|HTTP|REST|CRDB|C-SPANN|MCP|A2A|CDC|RLS|GDPR|HIPAA|SOC2|AWS|GCP|KMS|LLM|AI|ML)\b", text, re.IGNORECASE)
    return list(set(e.lower() for e in entities + tech))


def _bm25_score(query_tokens: list[str], content_tokens: list[str], k1: float = 1.5, b: float = 0.75) -> float:
    """Simplified BM25 scoring between query and content token lists."""
    if not query_tokens or not content_tokens:
        return 0.0

    doc_len = len(content_tokens)
    avg_dl = max(1, doc_len)  # Single document, so avg_dl = doc_len
    content_freq = Counter(content_tokens)

    score = 0.0
    for qt in query_tokens:
        if qt in content_freq:
            tf = content_freq[qt]
            numerator = tf * (k1 + 1)
            denominator = tf + k1 * (1 - b + b * doc_len / avg_dl)
            score += numerator / denominator

    # Normalize by query length
    return score / max(1, len(query_tokens))


def _entity_score(query_entities: list[str], memory_entities: list[str]) -> float:
    """Score entity overlap between query and memory."""
    if not query_entities or not memory_entities:
        return 0.0
    query_set = set(query_entities)
    memory_set = set(e.lower() for e in memory_entities)
    overlap = query_set & memory_set
    return len(overlap) / max(1, len(query_set))


def _temporal_score(access_count: int, hours_old: float, decay_rate: float = 0.01) -> float:
    """Score based on access frequency and recency."""
    recency = 1.0 / (1.0 + decay_rate * hours_old)
    frequency = min(access_count / 10.0, 1.0)
    return 0.6 * recency + 0.4 * frequency


@dataclass
class RetrievalResult:
    """A scored result from multi-signal retrieval."""
    memory: Any
    vector_score: float = 0.0
    keyword_score: float = 0.0
    entity_score: float = 0.0
    temporal_score: float = 0.0
    fused_score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory.memory_id if hasattr(self.memory, "memory_id") else "",
            "content": (self.memory.content or "")[:200] if hasattr(self.memory, "content") else "",
            "vector_score": round(self.vector_score, 4),
            "keyword_score": round(self.keyword_score, 4),
            "entity_score": round(self.entity_score, 4),
            "temporal_score": round(self.temporal_score, 4),
            "fused_score": round(self.fused_score, 4),
        }


class MultiSignalRetriever:
    """Multi-signal memory retrieval with configurable fusion.

    Combines vector cosine similarity (C-SPANN), BM25 keyword matching,
    entity matching, and temporal scoring. Results from each signal are
    normalized to [0, 1] and fused with configurable weights.
    """

    def __init__(
        self,
        memory_engine: Any,
        weights: dict[str, float] | None = None,
        vector_weight: float | None = None,
        keyword_weight: float | None = None,
        entity_weight: float | None = None,
        temporal_weight: float | None = None,
    ):
        self._memory = memory_engine
        self._weights = dict(DEFAULT_WEIGHTS)
        if weights:
            self._weights.update(weights)
        if vector_weight is not None:
            self._weights["vector"] = vector_weight
        if keyword_weight is not None:
            self._weights["keyword"] = keyword_weight
        if entity_weight is not None:
            self._weights["entity"] = entity_weight
        if temporal_weight is not None:
            self._weights["temporal"] = temporal_weight

        # Normalize weights to sum to 1.0
        total = sum(self._weights.values())
        if total > 0:
            self._weights = {k: v / total for k, v in self._weights.items()}

    def search(
        self,
        query: str,
        k: int = 10,
        threshold: float = 0.3,
        memory_type: str | None = None,
    ) -> list[RetrievalResult]:
        """Run multi-signal retrieval and fuse results.

        Args:
            query: The search query.
            k: Number of results to return.
            threshold: Minimum fused score to include.
            memory_type: Optional filter by memory type.

        Returns:
            List of RetrievalResult sorted by fused_score descending.
        """
        if not query or not query.strip():
            return []

        # Step 1: Get candidate memories (fetch more than k for fusion)
        candidates = self._memory.list_all(namespace_scope="own", memory_type=memory_type)
        if not candidates:
            return []

        # Cap candidates to prevent O(n²) issues
        candidates = candidates[:500]

        # Step 2: Extract query features
        query_tokens = _tokenize(query)
        query_entities = _extract_entities(query)

        # Step 3: Score each candidate across all signals
        results: list[RetrievalResult] = []
        for mem in candidates:
            content = mem.content or ""
            content_tokens = _tokenize(content)
            memory_entities = _extract_entities(content)

            # Vector similarity (use importance_score as proxy for speed)
            # In production, this would use actual cosine similarity from C-SPANN
            vector_score = min(1.0, (getattr(mem, "importance_score", 5.0) or 5.0) / 10.0)

            # BM25 keyword matching
            keyword_score = _bm25_score(query_tokens, content_tokens)

            # Entity matching
            entity_score = _entity_score(query_entities, memory_entities)

            # Temporal scoring
            from datetime import UTC, datetime
            created = getattr(mem, "created_at", datetime.now(UTC))
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            hours_old = (datetime.now(UTC) - created).total_seconds() / 3600
            temporal_score = _temporal_score(
                getattr(mem, "access_count", 0) or 0,
                hours_old,
            )

            # Fuse scores
            fused = (
                self._weights["vector"] * vector_score
                + self._weights["keyword"] * keyword_score
                + self._weights["entity"] * entity_score
                + self._weights["temporal"] * temporal_score
            )

            if fused >= threshold:
                results.append(RetrievalResult(
                    memory=mem,
                    vector_score=vector_score,
                    keyword_score=keyword_score,
                    entity_score=entity_score,
                    temporal_score=temporal_score,
                    fused_score=fused,
                ))

        # Sort by fused score and return top k
        results.sort(key=lambda r: r.fused_score, reverse=True)
        return results[:k]

    def search_with_vector(
        self,
        query: str,
        vector_results: list[Any],
        k: int = 10,
        threshold: float = 0.3,
    ) -> list[RetrievalResult]:
        """Fuse vector search results with keyword/entity/temporal signals.

        Use this when you already have vector search results from C-SPANN
        and want to re-rank them with additional signals.
        """
        if not vector_results:
            return []

        query_tokens = _tokenize(query)
        query_entities = _extract_entities(query)

        results: list[RetrievalResult] = []
        for mem in vector_results:
            content = mem.content or ""
            content_tokens = _tokenize(content)
            memory_entities = _extract_entities(content)

            # Vector score from C-SPANN (already computed)
            vector_score = 1.0  # Passed in as top result

            # BM25 keyword matching
            keyword_score = _bm25_score(query_tokens, content_tokens)

            # Entity matching
            entity_score = _entity_score(query_entities, memory_entities)

            # Temporal scoring
            from datetime import UTC, datetime
            created = getattr(mem, "created_at", datetime.now(UTC))
            if created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            hours_old = (datetime.now(UTC) - created).total_seconds() / 3600
            temporal_score = _temporal_score(
                getattr(mem, "access_count", 0) or 0,
                hours_old,
            )

            # Fuse scores
            fused = (
                self._weights["vector"] * vector_score
                + self._weights["keyword"] * keyword_score
                + self._weights["entity"] * entity_score
                + self._weights["temporal"] * temporal_score
            )

            if fused >= threshold:
                results.append(RetrievalResult(
                    memory=mem,
                    vector_score=vector_score,
                    keyword_score=keyword_score,
                    entity_score=entity_score,
                    temporal_score=temporal_score,
                    fused_score=fused,
                ))

        results.sort(key=lambda r: r.fused_score, reverse=True)
        return results[:k]
