"""CDC Cognitive Firewall.

Asynchronous guardrail validation triggered by database writes.
Offloads safety checks to Lambda via CDC changefeeds, keeping
agent response latency under 2ms.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

logger = logging.getLogger(__name__)


class CognitiveFirewall:
    """Validates agent actions asynchronously via CDC events."""

    def __init__(self, memory: Any):
        self.memory = memory
        self._blocked_agents: set[str] = set()
        self._violation_count = 0

    def validate_memory_write(
        self,
        agent_id: str,
        content: str,
        memory_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Validate a memory write against security rules."""
        violations = []

        if agent_id in self._blocked_agents:
            violations.append({
                "rule": "BLOCKED_AGENT",
                "severity": "critical",
                "detail": f"Agent {agent_id} is blocked due to prior violations",
            })

        pii_patterns = [
            (r"\b\d{3}-\d{2}-\d{4}\b", "SSN detected"),
            (r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "Email detected"),
            (r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b", "Credit card detected"),
        ]

        for pattern, desc in pii_patterns:
            if re.search(pattern, content):
                violations.append({
                    "rule": "PII_DETECTED",
                    "severity": "high",
                    "detail": desc,
                })

        if memory_type not in ("fact", "task", "preference", "learned", "procedure", "system_event"):
            violations.append({
                "rule": "INVALID_MEMORY_TYPE",
                "severity": "medium",
                "detail": f"Unexpected memory type: {memory_type}",
            })

        if len(content) > 10000:
            violations.append({
                "rule": "OVERSIZED_CONTENT",
                "severity": "low",
                "detail": f"Content length {len(content)} exceeds 10000 chars",
            })

        is_safe = len(violations) == 0
        blocked = any(v["severity"] == "critical" for v in violations)

        if blocked:
            self._blocked_agents.add(agent_id)
            self._violation_count += 1

        return {
            "safe": is_safe,
            "blocked": blocked,
            "violations": violations,
            "agent_id": agent_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    def check_hash_chain_integrity(
        self,
        agent_id: str,
    ) -> dict[str, Any]:
        """Verify hash chain integrity for an agent's memories."""
        memories = self.memory.search("*", k=1000, threshold=0.0)
        agent_memories = [m for m in memories if m.agent_id == agent_id]
        agent_memories.sort(key=lambda m: m.created_at or datetime.min.replace(tzinfo=UTC))

        broken_links = 0
        for i in range(1, len(agent_memories)):
            prev = agent_memories[i - 1]
            curr = agent_memories[i]
            if curr.previous_hash and curr.previous_hash != prev.cryptographic_hash:
                broken_links += 1

        return {
            "agent_id": agent_id,
            "total_memories": len(agent_memories),
            "broken_links": broken_links,
            "chain_intact": broken_links == 0,
            "integrity_score": round(
                (1 - broken_links / max(len(agent_memories), 1)) * 100, 2
            ),
        }

    def get_stats(self) -> dict[str, Any]:
        """Return firewall statistics."""
        return {
            "blocked_agents": len(self._blocked_agents),
            "total_violations": self._violation_count,
            "blocked_agent_ids": list(self._blocked_agents),
        }
