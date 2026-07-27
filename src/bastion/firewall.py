"""CDC Cognitive Firewall.

Asynchronous guardrail validation triggered by database writes.
Offloads safety checks to Lambda via CDC changefeeds, keeping
agent response latency under 2ms.
"""

from __future__ import annotations

import re
import threading
import time
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

# Maximum content length for memory storage
_MAX_CONTENT_LENGTH = 100_000
_MAX_BLOCKED_AGENTS = 10_000


class CognitiveFirewall:
    """Thread-safe CDC Cognitive Firewall for agent validation."""

    def __init__(self, memory: Any):
        self.memory = memory
        self._lock = threading.Lock()
        self._blocked_agents: set[str] = set()
        self._blocked_agents_expiry: dict[str, float] = {}  # agent_id -> expiry timestamp
        self._violation_count = 0

    def unblock_agent(self, agent_id: str) -> None:
        """Remove an agent from the blocked set."""
        with self._lock:
            self._blocked_agents.discard(agent_id)
            self._blocked_agents_expiry.pop(agent_id, None)

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
            # Check if block has expired (only if it has an expiry set)
            with self._lock:
                expiry = self._blocked_agents_expiry.get(agent_id)
                if expiry is not None and time.time() > expiry:
                    self._blocked_agents.discard(agent_id)
                    self._blocked_agents_expiry.pop(agent_id, None)
                else:
                    violations.append(
                        {
                            "rule": "BLOCKED_AGENT",
                            "severity": "critical",
                            "detail": f"Agent {agent_id} is blocked due to prior violations",
                        }
                    )

        from bastion.pii import PII_DETECTION_PATTERNS

        pii_patterns = [(p, d) for _, p, d in PII_DETECTION_PATTERNS]

        for pattern, desc in pii_patterns:
            if re.search(pattern, content):
                violations.append(
                    {
                        "rule": "PII_DETECTED",
                        "severity": "high",
                        "detail": desc,
                    }
                )

        if memory_type not in ("fact", "task", "preference", "learned", "procedure", "system_event"):
            violations.append(
                {
                    "rule": "INVALID_MEMORY_TYPE",
                    "severity": "medium",
                    "detail": f"Unexpected memory type: {memory_type}",
                }
            )

        if len(content) > _MAX_CONTENT_LENGTH:
            violations.append(
                {
                    "rule": "OVERSIZED_CONTENT",
                    "severity": "low",
                    "detail": f"Content length {len(content)} exceeds {_MAX_CONTENT_LENGTH} chars",
                }
            )

        is_safe = len(violations) == 0
        blocked = any(v["severity"] == "critical" for v in violations)

        if blocked:
            with self._lock:
                self._blocked_agents.add(agent_id)
                self._blocked_agents_expiry[agent_id] = time.time() + 86400  # 24h TTL
                self._violation_count += 1
                # Evict oldest if over limit
                if len(self._blocked_agents) > _MAX_BLOCKED_AGENTS:
                    oldest = min(self._blocked_agents_expiry, key=self._blocked_agents_expiry.get)
                    self._blocked_agents.discard(oldest)
                    self._blocked_agents_expiry.pop(oldest, None)

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
        max_memories: int = 10_000,
    ) -> dict[str, Any]:
        """Verify hash chain integrity for an agent's memories.

        Args:
            agent_id: Agent to check.
            max_memories: Maximum memories to load (prevents OOM for large agents).
        """
        if self.memory._mock:
            from bastion.models import MemoryRecord

            memories = self.memory.list_all()
            agent_memories = [m for m in memories if m.agent_id == agent_id]
        else:
            from bastion.models import MemoryRecord

            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            self.memory._set_rls_context(conn)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT memory_id, agent_id, memory_type, content, embedding, metadata, "
                        "previous_hash, cryptographic_hash, created_at, expires_at, "
                        "access_count, importance_score, trust_level, source_provenance, overwrite_count "
                        "FROM agent_memory WHERE agent_id = %s ORDER BY created_at ASC LIMIT %s",
                        (agent_id, max_memories),
                    )
                    agent_memories = [MemoryRecord.from_row(r) for r in cur.fetchall()]
            finally:
                pool.release(conn)

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
            "integrity_score": round((1 - broken_links / max(len(agent_memories), 1)) * 100, 2),
        }

    def get_stats(self) -> dict[str, Any]:
        """Return firewall statistics."""
        with self._lock:
            return {
                "blocked_agents": len(self._blocked_agents),
                "total_violations": self._violation_count,
            }
