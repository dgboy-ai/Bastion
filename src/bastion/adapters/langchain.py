from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from bastion.memory import BastionMemory
from bastion.models import MemoryRecord


class BastionChatMessageHistory:
    def __init__(self, agent_id: str, connection_string: str | None = None, mock: bool = False):
        self.bastion = BastionMemory(agent_id, connection_string, mock=mock)

    def save_context(self, inputs: dict[str, Any], outputs: dict[str, Any]) -> list[MemoryRecord]:
        return [
            self.bastion.store("chat_input", inputs.get("input", ""), {"agent": self.bastion.agent_id}),
            self.bastion.store("chat_output", outputs.get("response", ""), {"agent": self.bastion.agent_id}),
        ]

    def load_memory(self, k: int = 10) -> Sequence[dict[str, Any]]:
        results = self.bastion.search("*", k=k, threshold=0.0)
        return [r.to_dict() for r in results]

    def clear(self) -> None:
        self.bastion.heal()
