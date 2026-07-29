"""Context Budget Manager — pack memories into a token budget for LLM injection.

Prioritizes pinned memories, high-importance facts, and query-relevant content.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from bastion.log_setup import get_logger

if TYPE_CHECKING:
    from bastion.memory import BastionMemory

logger = get_logger(__name__)


@dataclass
class PackResult:
    memories: list[dict[str, Any]]
    total_tokens: int
    budget_tokens: int
    utilization: float
    pinned_count: int
    query_relevant_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "memories": self.memories,
            "total_tokens": self.total_tokens,
            "budget_tokens": self.budget_tokens,
            "utilization": round(self.utilization, 4),
            "pinned_count": self.pinned_count,
            "query_relevant_count": self.query_relevant_count,
        }


# Module-level helper function for tests
def _estimate_tokens(text: str) -> int:
    """Estimate token count from character count (4 chars per token heuristic)."""
    if not text:
        return 1
    return max(1, int(len(text) / 4.0))


class ContextBudgetManager:
    """Pack memories into a token budget for LLM context injection."""

    def __init__(self, memory: BastionMemory, chars_per_token: float = 4.0):
        self._mem = memory
        self._cpt = chars_per_token

    def pack(
        self,
        budget_tokens: int = 4000,
        query: str | None = None,
    ) -> PackResult:
        # 1. Get pinned memories (highest priority)
        pinned = self._mem.get_pinned()
        pinned_dicts = []
        pinned_tokens = 0
        for p in pinned:
            est_tokens = int(len(p.content) / self._cpt)
            if pinned_tokens + est_tokens <= budget_tokens:
                pinned_dicts.append({
                    "memory_id": p.memory_id,
                    "content": p.content,
                    "memory_type": getattr(p, "memory_type", "safety_rule"),
                    "priority": "pinned",
                    "estimated_tokens": est_tokens,
                })
                pinned_tokens += est_tokens

        # 2. Get query-relevant memories
        remaining = budget_tokens - pinned_tokens
        query_dicts = []
        query_tokens = 0
        if query and remaining > 0:
            results = self._mem.search(query, k=20)
            for r in results:
                est_tokens = int(len(r.content) / self._cpt)
                if query_tokens + est_tokens <= remaining:
                    query_dicts.append({
                        "memory_id": r.memory_id,
                        "content": r.content,
                        "memory_type": getattr(r, "memory_type", "unknown"),
                        "priority": "query_relevant",
                        "estimated_tokens": est_tokens,
                    })
                    query_tokens += est_tokens

        # 3. Fill remaining with high-importance memories
        remaining = budget_tokens - pinned_tokens - query_tokens
        filler_dicts = []
        filler_tokens = 0
        if remaining > 0:
            list_results = self._mem.list_memories(limit=50)
            existing_ids = {d["memory_id"] for d in pinned_dicts + query_dicts}
            for r in list_results:
                if r.memory_id in existing_ids:
                    continue
                est_tokens = int(len(r.content) / self._cpt)
                if filler_tokens + est_tokens <= remaining:
                    filler_dicts.append({
                        "memory_id": r.memory_id,
                        "content": r.content,
                        "memory_type": getattr(r, "memory_type", "unknown"),
                        "priority": "filler",
                        "estimated_tokens": est_tokens,
                    })
                    filler_tokens += est_tokens

        all_memories = pinned_dicts + query_dicts + filler_dicts
        total_tokens = pinned_tokens + query_tokens + filler_tokens

        return PackResult(
            memories=all_memories,
            total_tokens=total_tokens,
            budget_tokens=budget_tokens,
            utilization=total_tokens / max(budget_tokens, 1),
            pinned_count=len(pinned_dicts),
            query_relevant_count=len(query_dicts),
        )