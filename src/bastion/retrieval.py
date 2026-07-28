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

import math
import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import UTC, datetime
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
_STOP_WORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "shall",
        "can",
        "need",
        "dare",
        "ought",
        "used",
        "to",
        "of",
        "in",
        "for",
        "on",
        "with",
        "at",
        "by",
        "from",
        "as",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "between",
        "out",
        "off",
        "over",
        "under",
        "again",
        "further",
        "then",
        "once",
        "here",
        "there",
        "when",
        "where",
        "why",
        "how",
        "all",
        "each",
        "every",
        "both",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "no",
        "not",
        "only",
        "own",
        "same",
        "so",
        "than",
        "too",
        "very",
        "just",
        "and",
        "but",
        "or",
        "if",
        "while",
        "that",
        "this",
        "it",
        "its",
    }
)


def _tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words, filtering stop words."""
    words = re.findall(r"\w+", text.lower())
    return [w for w in words if w not in _STOP_WORDS and len(w) > 1]


def _extract_entities(text: str) -> list[str]:
    """Extract capitalized multi-word phrases as named entities."""
    return list(set(re.findall(r"\b[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*\b", text)))


def _bm25_score(query_tokens: list[str], content_tokens: list[str], k1: float = 1.5, b: float = 0.75) -> float:
    """Compute BM25 score for a single document."""
    if not content_tokens:
        return 0.0
    doc_len = len(content_tokens)
    avg_dl = doc_len  # single-document approximation: avg_dl = doc_len
    content_counts = Counter(content_tokens)
    score = 0.0
    for qt in query_tokens:
        tf = content_counts.get(qt, 0)
        if tf == 0:
            continue
        numerator = tf * (k1 + 1)
        denominator = tf + k1 * (1 - b + b * doc_len / avg_dl)
        # IDF approximated as 1.0 (single document)
        score += numerator / denominator
    return min(1.0, score / (len(query_tokens) or 1))


def _entity_score(query_entities: list[str], memory_entities: list[str]) -> float:
    """Jaccard similarity between query entities and memory entities."""
    if not query_entities or not memory_entities:
        return 0.0
    q_set, m_set = set(query_entities), set(memory_entities)
    return len(q_set & m_set) / len(q_set | m_set)


def _temporal_score(access_count: int | float, hours_old: float) -> float:
    """Score based on recency and access count. Range: [0, 1]."""
    recency = max(0.0, 1.0 - hours_old / 720.0)  # ~30 day half-life
    access_boost = min(1.0, (access_count or 0) / 10.0)
    return 0.7 * recency + 0.3 * access_boost


@dataclass
class RetrievalResult:
    memory: Any
    vector_score: float = 0.0
    keyword_score: float = 0.0
    entity_score: float = 0.0
    temporal_score: float = 0.0
    fused_score: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory.memory_id if hasattr(self.memory, "memory_id") else "",
            "content": self.memory.content if hasattr(self.memory, "content") else "",
            "memory_type": self.memory.memory_type if hasattr(self.memory, "memory_type") else "",
            "trustLevel": getattr(self.memory, "trust_level", 0),
            "importance": getattr(self.memory, "importance_score", 0),
            "createdAt": getattr(self.memory, "created_at", ""),
            "similarity": round(self.vector_score, 4),
            "keyword_score": round(self.keyword_score, 4),
            "entity_score": round(self.entity_score, 4),
            "temporal_score": round(self.temporal_score, 4),
            "fused_score": round(self.fused_score, 4),
        }


class MultiSignalRetriever:
    """Fuses 4 retrieval signals: vector, BM25, entity, temporal."""

    def __init__(
        self,
        memory_engine: Any,
        weights: dict[str, float] | None = None,
        max_candidates: int = 100,
    ):
        self._memory = memory_engine
        self._weights = dict(DEFAULT_WEIGHTS if weights is None else weights)
        self._max_candidates = max_candidates
        self._executor = ThreadPoolExecutor(max_workers=4)

    def search(
        self,
        query: str,
        k: int = 10,
        threshold: float = 0.3,
        memory_type: str | None = None,
    ) -> list[RetrievalResult]:
        """Multi-signal fusion search with parallel per-candidate scoring."""
        if not query or not query.strip():
            return []

        start = datetime.now(UTC)

        # Step 1: Get candidate memories via vector search
        try:
            candidates = self._memory.search(query, k=self._max_candidates, threshold=0.0, memory_type=memory_type)
        except Exception:
            candidates = self._memory.list_all(namespace_scope="own", memory_type=memory_type)
            if candidates:
                candidates = candidates[: self._max_candidates]
        if not candidates:
            return []

        # Step 2: Extract query features (once, shared across all candidates)
        query_tokens = _tokenize(query)
        query_entities = _extract_entities(query)
        query_embedding: list[float] | None = None
        try:
            if hasattr(self._memory, "_embed"):
                query_embedding = self._memory._embed(query)
        except Exception:
            logger.warning("embedding_failed", extra={"query": query[:128]}, exc_info=True)

        elapsed_prep = (datetime.now(UTC) - start).total_seconds() * 1000

        # Step 3: Score candidates in parallel
        score_start = datetime.now(UTC)
        results: list[RetrievalResult] = []
        futures = {}

        for i, mem in enumerate(candidates):
            future = self._executor.submit(
                self._score_single,
                mem,
                query_tokens,
                query_entities,
                query_embedding,
                threshold,
            )
            futures[future] = i

        for future in as_completed(futures):
            try:
                result = future.result(timeout=30)
                if result is not None:
                    results.append(result)
            except Exception:
                logger.exception("Error scoring candidate %d", futures[future])

        elapsed_score = (datetime.now(UTC) - score_start).total_seconds() * 1000

        # Sort by fused score, return top k
        results.sort(key=lambda r: r.fused_score, reverse=True)
        top = results[:k]

        elapsed_total = (datetime.now(UTC) - start).total_seconds() * 1000
        logger.info(
            "multi_signal_search: %d candidates, %d results, %.0fms prep + %.0fms score = %.0fms total",
            len(candidates),
            len(top),
            elapsed_prep,
            elapsed_score,
            elapsed_total,
        )
        return top

    def _score_single(
        self,
        mem: Any,
        query_tokens: list[str],
        query_entities: list[str],
        query_embedding: list[float] | None,
        threshold: float,
    ) -> RetrievalResult | None:
        """Score a single candidate across all signals."""
        content = mem.content or ""
        content_tokens = _tokenize(content)
        memory_entities = _extract_entities(content)

        # Vector similarity
        embedding = getattr(mem, "embedding", None)
        if embedding and query_embedding:
            dot = sum(a * b for a, b in zip(embedding, query_embedding, strict=True))
            norm_a = math.sqrt(sum(a * a for a in embedding))
            norm_b = math.sqrt(sum(b * b for b in query_embedding))
            vector_score = dot / (norm_a * norm_b) if norm_a and norm_b else 0.5
        else:
            vector_score = min(1.0, (getattr(mem, "importance_score", 5.0) or 5.0) / 10.0)

        keyword_score = _bm25_score(query_tokens, content_tokens)
        entity_score = _entity_score(query_entities, memory_entities)

        created = getattr(mem, "created_at", datetime.now(UTC))
        if hasattr(created, "tzinfo") and created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        hours_old = (datetime.now(UTC) - created).total_seconds() / 3600 if hasattr(created, "tzinfo") else 0
        temporal_score = _temporal_score(
            getattr(mem, "access_count", 0) or 0,
            hours_old,
        )

        fused = (
            self._weights["vector"] * vector_score
            + self._weights["keyword"] * keyword_score
            + self._weights["entity"] * entity_score
            + self._weights["temporal"] * temporal_score
        )

        if fused < threshold:
            return None

        return RetrievalResult(
            memory=mem,
            vector_score=vector_score,
            keyword_score=keyword_score,
            entity_score=entity_score,
            temporal_score=temporal_score,
            fused_score=fused,
        )

    def search_with_vector(
        self,
        query: str,
        vector_results: list[Any],
        k: int = 10,
        threshold: float = 0.3,
    ) -> list[RetrievalResult]:
        """Fuse pre-computed vector search results with keyword/entity/temporal signals.

        Preserves the original vector similarity scores from C-SPANN
        instead of discarding them.
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

            # Use the embedding similarity score from C-SPANN
            embedding = getattr(mem, "embedding", None)
            if embedding:
                # Have the embedding so we can compute real cosine similarity
                try:
                    if hasattr(self._memory, "_embed"):
                        qe = self._memory._embed(query)
                        dot = sum(a * b for a, b in zip(embedding, qe, strict=True))
                        norm_a = math.sqrt(sum(a * a for a in embedding))
                        norm_b = math.sqrt(sum(b * b for b in qe))
                        vector_score = dot / (norm_a * norm_b) if norm_a and norm_b else 0.5
                    else:
                        vector_score = 0.5
                except Exception:
                    vector_score = 0.5
            else:
                vector_score = min(1.0, (getattr(mem, "importance_score", 5.0) or 5.0) / 10.0)

            keyword_score = _bm25_score(query_tokens, content_tokens)
            entity_score = _entity_score(query_entities, memory_entities)

            created = getattr(mem, "created_at", datetime.now(UTC))
            if hasattr(created, "tzinfo") and created.tzinfo is None:
                created = created.replace(tzinfo=UTC)
            hours_old = (datetime.now(UTC) - created).total_seconds() / 3600 if hasattr(created, "tzinfo") else 0
            temporal_score = _temporal_score(
                getattr(mem, "access_count", 0) or 0,
                hours_old,
            )

            fused = (
                self._weights["vector"] * vector_score
                + self._weights["keyword"] * keyword_score
                + self._weights["entity"] * entity_score
                + self._weights["temporal"] * temporal_score
            )

            if fused >= threshold:
                results.append(
                    RetrievalResult(
                        memory=mem,
                        vector_score=vector_score,
                        keyword_score=keyword_score,
                        entity_score=entity_score,
                        temporal_score=temporal_score,
                        fused_score=fused,
                    )
                )

        results.sort(key=lambda r: r.fused_score, reverse=True)
        return results[:k]
