"""Context Budget Manager — Token-aware memory packing for agents.

Agents have limited context windows. This module packs the most relevant
memories into a token budget, prioritizing pinned memories, high-importance
facts, and recent context.

Usage:
    packer = ContextBudgetManager(memory_engine)
    packed = packer.pack(budget_tokens=4000, query="What is the user's preference?")
    print(f"Packed {packed.total_tokens} tokens across {packed.memory_count} memories")
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Approximate tokens per word (English average)
TOKENS_PER_WORD = 1.3


def _estimate_tokens(text: str) -> int:
    """Estimate token count from text.

    Uses a more robust heuristic than simple word count:
    - For CJK characters: each character ≈ 1.5 tokens (no word boundaries)
    - For code/JSON: characters/4 ≈ tokens (dense syntax)
    - For regular English: words × 1.3
    """
    if not text:
        return 1
    # Check for CJK characters (Unicode ranges)
    cjk_count = sum(1 for c in text if '\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u309f' or '\u30a0' <= c <= '\u30ff')
    if cjk_count > len(text) * 0.3:
        # Mostly CJK: each character is roughly a token
        return max(1, int(cjk_count * 1.5 + (len(text) - cjk_count) * 0.3))
    # Check if content looks like code/JSON (high density of special chars)
    special_chars = sum(1 for c in text if c in '{}[](),:;=<>!@#$%^&*')
    if special_chars > len(text) * 0.1:
        # Code-like: characters / 4 is a better estimate
        return max(1, len(text) // 4)
    # Default: word-based estimate
    words = len(text.split())
    return max(1, int(words * 1.3))


@dataclass
class PackedMemory:
    """A memory packed into the context budget."""
    memory_id: str
    content: str
    tokens: int
    importance: float
    is_pinned: bool = False
    memory_type: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "memory_id": self.memory_id,
            "content": self.content[:200],
            "tokens": self.tokens,
            "importance": self.importance,
            "is_pinned": self.is_pinned,
            "memory_type": self.memory_type,
        }


@dataclass
class PackResult:
    """Result of packing memories into a token budget."""
    memories: list[PackedMemory] = field(default_factory=list)
    total_tokens: int = 0
    budget_tokens: int = 0
    memory_count: int = 0
    pinned_count: int = 0
    truncated: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "memories": [m.to_dict() for m in self.memories],
            "total_tokens": self.total_tokens,
            "budget_tokens": self.budget_tokens,
            "memory_count": self.memory_count,
            "pinned_count": self.pinned_count,
            "truncated": self.truncated,
            "utilization": round(self.total_tokens / max(1, self.budget_tokens), 4),
        }

    def to_context_string(self) -> str:
        """Format packed memories as a context string for LLM injection."""
        parts = []
        for m in self.memories:
            prefix = "[PINNED] " if m.is_pinned else ""
            parts.append(f"{prefix}{m.content}")
        return "\n".join(parts)


class ContextBudgetManager:
    """Pack memories into a token budget for LLM context injection.

    Prioritizes:
    1. Pinned memories (safety-critical, always included)
    2. High-importance memories
    3. Recent memories
    4. Query-relevant memories (if query provided)
    """

    def __init__(
        self,
        memory_engine: Any,
        tokens_per_word: float = TOKENS_PER_WORD,
    ):
        self._memory = memory_engine
        self._tokens_per_word = tokens_per_word

    def pack(
        self,
        budget_tokens: int = 4000,
        query: str | None = None,
        min_importance: float = 0.0,
        include_types: list[str] | None = None,
    ) -> PackResult:
        """Pack memories into a token budget.

        Args:
            budget_tokens: Maximum tokens to use.
            query: Optional query for relevance-based ranking.
            min_importance: Minimum importance score to include.
            include_types: Optional filter by memory types.

        Returns:
            PackResult with packed memories and statistics.
        """
        result = PackResult(budget_tokens=budget_tokens)

        # Reserve budget for pinned memories first
        pinned = self._memory.get_pinned(min_priority=1) if hasattr(self._memory, "get_pinned") else []
        pinned_tokens = 0
        for mem in pinned:
            tokens = _estimate_tokens(mem.content or "")
            if pinned_tokens + tokens <= budget_tokens:
                packed = PackedMemory(
                    memory_id=mem.memory_id,
                    content=mem.content or "",
                    tokens=tokens,
                    importance=mem.importance_score,
                    is_pinned=True,
                    memory_type=mem.memory_type,
                )
                result.memories.append(packed)
                pinned_tokens += tokens
                result.pinned_count += 1

        remaining_budget = budget_tokens - pinned_tokens

        # Get candidate memories — use SQL-filtered queries to avoid O(n) loading
        if query and hasattr(self._memory, "search"):
            all_memories = self._memory.search(query, k=min(200, budget_tokens // 10), namespace_scope="own")
        elif hasattr(self._memory, "list_by_importance"):
            all_memories = self._memory.list_by_importance(
                min_importance=min_importance,
                memory_type=include_types[0] if include_types and len(include_types) == 1 else None,
                limit=200,
                exclude_ids={p.memory_id for p in result.memories},
            )
        else:
            all_memories = self._memory.list_all(namespace_scope="own")
        if include_types and not (hasattr(self._memory, "list_by_importance") and len(include_types) != 1):
            all_memories = [m for m in all_memories if m.memory_type in include_types]

        # Score and sort candidates
        scored = []
        for mem in all_memories:
            # Skip if already included as pinned
            if any(p.memory_id == mem.memory_id for p in result.memories):
                continue
            if mem.importance_score < min_importance:
                continue

            tokens = _estimate_tokens(mem.content or "")
            score = mem.importance_score

            # Boost score if query-relevant
            if query:
                query_words = set(query.lower().split())
                content_words = set((mem.content or "").lower().split())
                overlap = len(query_words & content_words) / max(1, len(query_words))
                score += overlap * 5.0

            scored.append((score, tokens, mem))

        # Sort by score descending, pack greedily
        scored.sort(key=lambda x: x[0], reverse=True)
        used_tokens = 0

        for _score, tokens, mem in scored:
            if used_tokens + tokens <= remaining_budget:
                packed = PackedMemory(
                    memory_id=mem.memory_id,
                    content=mem.content or "",
                    tokens=tokens,
                    importance=mem.importance_score,
                    is_pinned=False,
                    memory_type=mem.memory_type,
                )
                result.memories.append(packed)
                used_tokens += tokens
            else:
                result.truncated = True
                break

        result.total_tokens = pinned_tokens + used_tokens
        result.memory_count = len(result.memories)

        return result

    def estimate_context_size(self, query: str | None = None) -> dict[str, Any]:
        """Estimate how many memories would fit in a given budget."""
        all_memories = self._memory.list_all(namespace_scope="own")
        total_tokens = sum(_estimate_tokens(m.content or "") for m in all_memories)
        return {
            "total_memories": len(all_memories),
            "total_tokens": total_tokens,
            "avg_tokens_per_memory": total_tokens // max(1, len(all_memories)),
            "pinned_count": sum(1 for m in all_memories if getattr(m, "is_pinned", False)),
        }
