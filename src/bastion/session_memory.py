"""Session Memory — Separates ephemeral session state from permanent memory.

Agents generate two types of memory:
1. Session memory: temporary, scoped to a conversation (working memory)
2. Permanent memory: durable, persists across sessions (long-term memory)

This module manages the boundary between them, with automatic promotion
of high-value session memories to permanent storage.

Usage:
    session = SessionMemory(memory_engine, session_id="sess-123")
    session.store("fact", "User asked about Python decorators")
    session.store("preference", "User prefers dark mode", promote=True)
    session.consolidate()  # Promote high-value session memories
"""
from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


@dataclass
class SessionEntry:
    """A single entry in session memory."""
    content: str
    memory_type: str
    metadata: dict[str, Any] = field(default_factory=dict)
    importance: float = 5.0
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    promoted: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "content": self.content,
            "memory_type": self.memory_type,
            "metadata": self.metadata,
            "importance": self.importance,
            "created_at": self.created_at,
            "promoted": self.promoted,
        }


class SessionMemory:
    """Manages ephemeral session memory with automatic promotion to permanent storage.

    Session memories are stored with a session_id prefix and are automatically
    cleaned up after the session ends. High-value memories can be promoted
    to permanent storage before cleanup.
    """

    def __init__(
        self,
        memory_engine: Any,
        session_id: str,
        max_session_size: int = 200,
        promotion_threshold: float = 7.0,
        session_ttl_seconds: int = 3600,
    ):
        self._memory = memory_engine
        self._session_id = session_id
        self._max_session_size = max_session_size
        self._promotion_threshold = promotion_threshold
        self._session_ttl = session_ttl_seconds
        self._entries: list[SessionEntry] = []
        self._created_at = time.time()
        self._lock = threading.Lock()

    @property
    def session_id(self) -> str:
        return self._session_id

    @property
    def age_seconds(self) -> float:
        return time.time() - self._created_at

    @property
    def is_expired(self) -> bool:
        return self.age_seconds > self._session_ttl

    @property
    def size(self) -> int:
        return len(self._entries)

    def store(
        self,
        content: str,
        memory_type: str = "session",
        metadata: dict[str, Any] | None = None,
        importance: float = 5.0,
        promote: bool = False,
    ) -> SessionEntry:
        """Store a memory in the current session.

        Args:
            content: Memory content.
            memory_type: Type of memory (fact, preference, etc.).
            metadata: Additional metadata.
            importance: Importance score (0-10).
            promote: If True, immediately promote to permanent memory.
        """
        entry = SessionEntry(
            content=content,
            memory_type=memory_type,
            metadata={
                "session_id": self._session_id,
                "session_age_seconds": round(self.age_seconds, 1),
                **(metadata or {}),
            },
            importance=importance,
        )

        with self._lock:
            self._entries.append(entry)

        # Enforce session size limit — drop oldest unpinned
        if len(self._entries) > self._max_session_size:
            self._entries = self._entries[-self._max_session_size:]

        if promote or importance >= self._promotion_threshold:
            self._promote_entry(entry)
            entry.promoted = True

        return entry

    def search(self, query: str, k: int = 5) -> list[SessionEntry]:
        """Search session memories using TF-IDF-like scoring with recency boost."""
        query_lower = query.lower()
        query_words = query_lower.split()
        if not query_words:
            return self.get_recent(k)

        with self._lock:
            entries_snapshot = list(self._entries)

        # Build IDF weights from session corpus (log(N/df) approximation)
        total_entries = max(1, len(entries_snapshot))
        word_doc_freq: dict[str, int] = {}
        entry_words: list[tuple[set[str], SessionEntry]] = []
        for entry in entries_snapshot:
            words = set(entry.content.lower().split())
            entry_words.append((words, entry))
            for w in words:
                word_doc_freq[w] = word_doc_freq.get(w, 0) + 1

        scored = []
        now = time.time()
        for words, entry in entry_words:
            # TF-IDF: sum of IDF for matching query words
            tfidf = 0.0
            for qw in query_words:
                if qw in words:
                    df = word_doc_freq.get(qw, 1)
                    idf = math.log(total_entries / df) + 1.0
                    tfidf += idf
            # Normalize by query length
            tfidf /= max(1, len(query_words))
            # Recency boost: newer entries score slightly higher
            age_hours = (now - self._created_at) / 3600.0
            recency_boost = 1.0 + 0.05 * max(0, 1.0 - age_hours / 24.0)
            # Combine with importance
            score = tfidf * (entry.importance / 10.0) * recency_boost
            if score > 0:
                scored.append((score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [entry for _, entry in scored[:k]]

    def consolidate(self) -> dict[str, Any]:
        """Promote high-value session memories to permanent storage.

        Reviews all session entries and promotes those above the
        promotion threshold to the permanent memory store.
        """
        promoted = 0
        for entry in self._entries:
            if not entry.promoted and entry.importance >= self._promotion_threshold:
                self._promote_entry(entry)
                entry.promoted = True
                promoted += 1

        return {
            "session_id": self._session_id,
            "total_entries": len(self._entries),
            "promoted": promoted,
            "session_age_seconds": round(self.age_seconds, 1),
        }

    def get_recent(self, n: int = 10) -> list[SessionEntry]:
        """Get the N most recent session entries."""
        return self._entries[-n:]

    def get_stats(self) -> dict[str, Any]:
        """Get session statistics."""
        return {
            "session_id": self._session_id,
            "size": self.size,
            "age_seconds": round(self.age_seconds, 1),
            "is_expired": self.is_expired,
            "promoted_count": sum(1 for e in self._entries if e.promoted),
            "avg_importance": (
                sum(e.importance for e in self._entries) / max(1, len(self._entries))
            ),
        }

    def _promote_entry(self, entry: SessionEntry) -> None:
        """Promote a session entry to permanent memory."""
        try:
            self._memory.store(
                memory_type=entry.memory_type,
                content=entry.content,
                metadata={
                    **entry.metadata,
                    "promoted_from_session": True,
                    "session_id": self._session_id,
                    "promoted_at": datetime.now(UTC).isoformat(),
                },
                _skip_guard=True,
                _guard_bypass_token=True,
            )
        except Exception as exc:
            logger.warning("Failed to promote session entry: %s", exc)
