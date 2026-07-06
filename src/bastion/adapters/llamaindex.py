from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from bastion.memory import BastionMemory
from bastion.models import MemoryRecord


class BastionVectorStore:
    stores_text: bool = True
    is_embedding_query: bool = False

    def __init__(self, agent_id: str, connection_string: str | None = None, mock: bool = False):
        self.bastion = BastionMemory(agent_id, connection_string=connection_string, mock=mock)

    def add(self, nodes: Sequence[dict[str, Any]]) -> list[MemoryRecord]:
        results = []
        for node in nodes:
            text = node.get("text", node.get("content", ""))
            meta = {k: v for k, v in node.items() if k not in ("text", "content")}
            results.append(self.bastion.store("llama_index", text, meta))
        return results

    def query(self, query: str, similarity_top_k: int = 2) -> list[dict[str, Any]]:
        results = self.bastion.search(query, k=similarity_top_k)
        return [r.to_dict() for r in results]

    def delete(self, ref_doc_id: str) -> None:
        pass
