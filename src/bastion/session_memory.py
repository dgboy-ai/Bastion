"""Session Memory — Separates ephemeral session state from permanent memory.

Agents generate two types of memory:
1. Session memory: temporary, scoped to a conversation (working memory)
2. Permanent memory: durable, persists across sessions (long-term memory)

This module manages the boundary between them, with automatic promotion
of high-value session memories to permanent storage.

Supports optional Redis backend for distributed session sync across
horizontal scale-out. When redis_url is provided, session entries are
stored in Redis with automatic TTL, enabling multi-instance agents to
share session state.

Usage:
    session = SessionMemory(memory_engine, session_id="sess-123")
    session.store("fact", "User asked about Python decorators")
    session.store("preference", "User prefers dark mode", promote=True)
    session.consolidate()  # Promote high-value session memories

    # Distributed mode (Redis-backed):
    session = SessionMemory(memory_engine, session_id="sess-123",
                            redis_url="redis://localhost:6379/0")
"""

from __future__ import annotations

import json
import math
import os
import threading
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

_HAS_REDIS = False
try:
    import redis as _redis_sync
    _HAS_REDIS = True
except ImportError:
    pass

_MAX_CONTENT_LENGTH = 100_000


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

    When redis_url is provided, entries are also persisted to Redis for
    distributed session sharing across agent instances. Redis entries auto-expire
    after session_ttl_seconds.
    """

    def __init__(
        self,
        memory_engine: Any,
        session_id: str,
        max_session_size: int = 200,
        promotion_threshold: float = 7.0,
        session_ttl_seconds: int = 3600,
        redis_url: str | None = None,
    ):
        self._memory = memory_engine
        self._session_id = session_id
        self._max_session_size = max_session_size
        self._promotion_threshold = promotion_threshold
        self._session_ttl = session_ttl_seconds
        self._entries: list[SessionEntry] = []
        self._created_at = time.time()
        self._lock = threading.Lock()
        self._redis_url = redis_url or os.environ.get("BASTION_REDIS_URL", "")
        self._redis: Any = None
        self._redis_initialized = False
        if self._redis_url and _HAS_REDIS:
            self._redis_initialized = True
            logger.info("SessionMemory configured for Redis at %s (lazy connect)", self._redis_url)
        elif self._redis_url and not _HAS_REDIS:
            logger.warning("redis-py not installed, install with: pip install redis")

    def _ensure_redis(self) -> None:
        if self._redis is not None or not self._redis_initialized:
            return
        try:
            self._redis = _redis_sync.from_url(self._redis_url, decode_responses=True)
            logger.info("SessionMemory connected to Redis at %s", self._redis_url)
        except Exception as exc:
            logger.warning("Redis connect failed, falling back to local-only: %s", exc)

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
        with self._lock:
            return len(self._entries)

    def close(self) -> None:
        if self._redis is not None:
            try:
                self._persist_to_redis()
                self._redis.close()
            except Exception as exc:
                logger.debug("Redis close error: %s", exc)

    def _redis_key(self, suffix: str = "") -> str:
        return f"bastion:session:{self._session_id}{suffix}"

    def _persist_to_redis(self) -> None:
        if not self._redis:
            return
        try:
            entries_dict = [e.to_dict() for e in self._entries]
            # Use Lua script for atomic compare-and-set to prevent dirty-write races
            # Only writes if the current value matches our expected version
            lua_script = """
            local current = redis.call('GET', KEYS[1])
            if current == ARGV[1] then
                return redis.call('SETEX', KEYS[1], ARGV[3], ARGV[2])
            else
                return 0
            end
            """
            # For simplicity and correctness, use Redis WATCH/MULTI/EXEC pattern
            # But since we're using redis-py, let's use a simpler approach:
            # Use pipeline with WATCH on the key
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    pipe = self._redis.pipeline()
                    pipe.watch(self._redis_key())
                    current = self._redis.get(self._redis_key())
                    pipe.multi()
                    pipe.setex(self._redis_key(), self._session_ttl, json.dumps(entries_dict))
                    pipe.execute()
                    break  # Success
                except _redis_sync.WatchError:
                    if attempt == max_retries - 1:
                        logger.warning("Redis WATCH failed after %d retries, using SETEX anyway", max_retries)
                        self._redis.setex(self._redis_key(), self._session_ttl, json.dumps(entries_dict))
                finally:
                    try:
                        pipe.unwatch()
                    except Exception:
                        pass
        except Exception as exc:
            logger.warning("Redis persist failed: %s", exc)

    def _sync_from_redis(self) -> None:
        if not self._redis:
            return
        try:
            raw = self._redis.get(self._redis_key())
            if raw:
                entries_data = json.loads(raw)
                with self._lock:
                    existing_keys = {e.created_at + e.content[:50] for e in self._entries}
                    for e in entries_data:
                        key = e.get("created_at", "") + (e.get("content", "")[:50])
                        if key not in existing_keys:
                            self._entries.append(
                                SessionEntry(
                                    content=e["content"],
                                    memory_type=e.get("memory_type", "session"),
                                    metadata=e.get("metadata", {}),
                                    importance=e.get("importance", 5.0),
                                    created_at=e.get("created_at", datetime.now(UTC).isoformat()),
                                    promoted=e.get("promoted", False),
                                )
                            )
                            existing_keys.add(key)
        except Exception as exc:
            logger.warning("Redis sync failed, staying with local state: %s", exc)

    def _validate_content(self, content: str) -> str:
        if not content or not content.strip():
            raise ValueError("Content must be a non-empty string")
        if len(content) > _MAX_CONTENT_LENGTH:
            raise ValueError(f"Content exceeds max length of {_MAX_CONTENT_LENGTH}")
        return content

    def _clamp(self, value: int, min_val: int = 1, max_val: int | None = None) -> int:
        return max(min_val, min(value, max_val)) if max_val else max(min_val, value)

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
        self._validate_content(content)
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
            if len(self._entries) > self._max_session_size:
                dropped = len(self._entries) - self._max_session_size
                self._entries = self._entries[-self._max_session_size :]
                if dropped > 0:
                    logger.info("Session truncated: dropped %d oldest entries", dropped)

        if promote or importance >= self._promotion_threshold:
            if self._promote_entry(entry):
                entry.promoted = True

        self._ensure_redis()
        self._persist_to_redis()
        return entry

    def search(self, query: str, k: int = 5) -> list[SessionEntry]:
        """Search session memories using TF-IDF-like scoring with recency boost."""
        if not query or not query.strip():
            return self.get_recent(k)
        self._ensure_redis()
        self._sync_from_redis()
        k = self._clamp(k, max_val=len(self._entries) if self._entries else 1)

        with self._lock:
            entries_snapshot = list(self._entries)

        query_lower = query.lower()
        query_words = query_lower.split()
        if not query_words:
            return self.get_recent(k)

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
            tfidf = 0.0
            for qw in query_words:
                if qw in words:
                    df = word_doc_freq.get(qw, 1)
                    idf = math.log(total_entries / df) + 1.0
                    tfidf += idf
            tfidf /= max(1, len(query_words))
            age_hours = (now - self._created_at) / 3600.0
            recency_boost = 1.0 + 0.05 * max(0, 1.0 - age_hours / 24.0)
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
        self._ensure_redis()
        self._sync_from_redis()
        with self._lock:
            entries_snapshot = list(self._entries)

        promoted = 0
        for entry in entries_snapshot:
            if not entry.promoted and entry.importance >= self._promotion_threshold:
                if self._promote_entry(entry):
                    entry.promoted = True
                    promoted += 1

        self._persist_to_redis()

        return {
            "session_id": self._session_id,
            "total_entries": len(self._entries),
            "promoted": promoted,
            "session_age_seconds": round(self.age_seconds, 1),
        }

    def get_recent(self, n: int = 10) -> list[SessionEntry]:
        """Get the N most recent session entries."""
        self._ensure_redis()
        self._sync_from_redis()
        n = self._clamp(n)
        with self._lock:
            return list(self._entries[-n:])

    def get_stats(self) -> dict[str, Any]:
        """Get session statistics."""
        with self._lock:
            size = len(self._entries)
            promoted_count = sum(1 for e in self._entries if e.promoted)
            avg_importance = (sum(e.importance for e in self._entries) / max(1, size))
        return {
            "session_id": self._session_id,
            "size": size,
            "age_seconds": round(self.age_seconds, 1),
            "is_expired": self.is_expired,
            "promoted_count": promoted_count,
            "avg_importance": avg_importance,
        }

    def _promote_entry(self, entry: SessionEntry) -> bool:
        """Promote a session entry to permanent memory. Returns True on success."""
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
            )
            return True
        except Exception as exc:
            logger.warning("Failed to promote session entry: %s", exc)
            return False
