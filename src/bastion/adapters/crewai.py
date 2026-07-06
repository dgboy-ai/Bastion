from __future__ import annotations

from typing import Any

from bastion.memory import BastionMemory
from bastion.models import MemoryRecord


class BastionShortTermMemory:
    def __init__(self, agent_id: str, connection_string: str | None = None, mock: bool = False):
        self.bastion = BastionMemory(agent_id, connection_string=connection_string, mock=mock)

    def add(self, content: str, metadata: dict[str, Any] | None = None) -> MemoryRecord:
        return self.bastion.store("crewai_memory", content, metadata)

    def search(self, query: str, k: int = 5) -> list[dict[str, Any]]:
        return [r.to_dict() for r in self.bastion.search(query, k=k)]

    def clear(self) -> dict[str, Any]:
        return self.bastion.heal()
