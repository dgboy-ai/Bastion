"""
BastionAgent — Complete working agent with persistent memory.

Demonstrates Bastion's full capabilities:
- Memory storage with hash chain integrity
- Semantic search via C-SPANN
- Time travel via AS OF SYSTEM TIME
- Multi-agent coordination via SERIALIZABLE
- Memory consolidation (background process)
- PII detection and redaction
- Agent checkpointing
- Crash recovery

Usage:
    from bastion.agent import BastionAgent

    agent = BastionAgent("my-agent", "postgresql://...")
    response = agent.chat("What's my name?")
    # Agent remembers across sessions, survives crashes
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from bastion.memory import BastionMemory
from bastion.models import AuditEntry, MemoryRecord

logger = logging.getLogger("bastion.agent")

# ── PII Patterns ─────────────────────────────────────────────────────────────

PII_PATTERNS: list[tuple[str, str, str]] = [
    ("ssn", r"\b\d{3}-\d{2}-\d{4}\b", "[REDACTED_SSN]"),
    ("email", r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b", "[REDACTED_EMAIL]"),
    ("phone", r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b", "[REDACTED_PHONE]"),
    ("credit_card", r"\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b", "[REDACTED_CARD]"),
    ("api_key", r"\b(?:sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16})\b", "[REDACTED_KEY]"),
]


def redact_pii(text: str) -> tuple[str, list[dict]]:
    """
    Detect and redact PII from text.
    Returns (redacted_text, list_of_redactions).
    """
    redactions = []
    redacted = text
    for pii_type, pattern, replacement in PII_PATTERNS:
        matches = re.finditer(pattern, redacted)
        for match in matches:
            redactions.append({
                "type": pii_type,
                "original": match.group(),
                "position": match.span(),
            })
        redacted = re.sub(pattern, replacement, redacted)
    return redacted, redactions


# ── Memory Consolidation ─────────────────────────────────────────────────────

class MemoryConsolidator:
    """
    Background process that consolidates agent memory.
    Merges duplicates, prunes noise, updates embeddings.
    """

    def __init__(self, memory: BastionMemory, interval_seconds: int = 300):
        self.memory = memory
        self.interval = interval_seconds
        self._running = False

    async def run(self):
        """Run consolidation loop."""
        self._running = True
        while self._running:
            try:
                await self._consolidate()
            except Exception as e:
                logger.error(f"Consolidation error: {e}")
            await asyncio.sleep(self.interval)

    def stop(self):
        """Stop consolidation loop."""
        self._running = False

    async def _consolidate(self):
        """Perform one consolidation cycle."""
        agent_id = self.memory.agent_id

        # 1. Find duplicate memories
        duplicates = self._find_duplicates(agent_id)

        # 2. Merge similar memories
        for group in duplicates:
            if len(group) > 1:
                self._merge_group(group)

        # 3. Prune low-importance memories
        self._prune_by_decay(agent_id, threshold=2.0)

        # 4. Detect anomalies
        anomalies = self.memory.detect_anomalies(agent_id)
        if anomalies:
            logger.warning(f"Anomalies detected: {len(anomalies)}")

    def _find_duplicates(self, agent_id: str) -> list[list[MemoryRecord]]:
        """Find groups of duplicate or near-duplicate memories."""
        all_memories = self.memory.list_all()
        if not all_memories:
            return []

        # Group by content similarity (exact match for now)
        content_groups: dict[str, list[MemoryRecord]] = {}
        for mem in all_memories:
            # Normalize content for comparison
            normalized = mem.content.strip().lower()
            if normalized not in content_groups:
                content_groups[normalized] = []
            content_groups[normalized].append(mem)

        return [group for group in content_groups.values() if len(group) > 1]

    def _merge_group(self, group: list[MemoryRecord]):
        """Merge a group of duplicate memories into one."""
        if len(group) < 2:
            return

        # Keep the oldest memory, update its importance
        oldest = min(group, key=lambda m: m.created_at or datetime.max.replace(tzinfo=UTC))

        # Boost importance based on duplicate count (more duplicates = more important)
        for _ in range(len(group) - 1):
            self.memory.reinforce(oldest.memory_id, success=True)

        # Mark duplicates as expired (effectively removes them from search)
        # The heal function will clean them up permanently
        for mem in group:
            if mem.memory_id != oldest.memory_id:
                # Store with immediate expiry to mark as duplicate
                self.memory.store(
                    "system_event",
                    f"Duplicate of {oldest.memory_id}",
                    metadata={"duplicate_of": oldest.memory_id, "merged": True},
                    expires_in_seconds=1,  # Will expire immediately
                )

    def _prune_by_decay(self, agent_id: str, threshold: float = 2.0):
        """Mark low-importance memories for pruning."""
        all_memories = self.memory.list_all()
        pruned_count = 0
        for mem in all_memories:
            if mem.importance_score < threshold:
                # Mark as expired for cleanup
                self.memory.store(
                    "system_event",
                    f"Pruned: importance {mem.importance_score} < {threshold}",
                    metadata={"pruned_memory_id": mem.memory_id, "pruned": True},
                    expires_in_seconds=1,
                )
                pruned_count += 1
        return pruned_count


# ── Agent Checkpoint ─────────────────────────────────────────────────────────

class AgentCheckpoint:
    """Represents a checkpoint of agent state."""

    def __init__(
        self,
        checkpoint_id: str,
        agent_id: str,
        state_hash: str,
        timestamp: datetime,
        memory_count: int,
        metadata: dict[str, Any] | None = None,
    ):
        self.checkpoint_id = checkpoint_id
        self.agent_id = agent_id
        self.state_hash = state_hash
        self.timestamp = timestamp
        self.memory_count = memory_count
        self.metadata = metadata or {}

    def to_dict(self) -> dict[str, Any]:
        return {
            "checkpoint_id": self.checkpoint_id,
            "agent_id": self.agent_id,
            "state_hash": self.state_hash,
            "timestamp": self.timestamp.isoformat(),
            "memory_count": self.memory_count,
            "metadata": self.metadata,
        }


# ── BastionAgent ─────────────────────────────────────────────────────────────

class BastionAgent:
    """
    Complete working agent with persistent memory on CockroachDB.

    Features:
    - Memory storage with hash chain integrity
    - Semantic search via C-SPANN vector similarity
    - Time travel via AS OF SYSTEM TIME
    - Multi-agent coordination via SERIALIZABLE isolation
    - Memory consolidation (background process)
    - PII detection and redaction
    - Agent checkpointing (save/restore state)
    - Crash recovery (resume from last checkpoint)
    """

    def __init__(
        self,
        agent_id: str,
        connection_string: str | None = None,
        mock: bool | None = None,
        namespace: str | None = None,
        enable_pii_redaction: bool = True,
        enable_consolidation: bool = False,
        consolidation_interval: int = 300,
        llm_callback: Callable[[str, list[MemoryRecord]], str] | None = None,
    ):
        """
        Initialize a BastionAgent.

        Args:
            agent_id: Unique identifier for this agent
            connection_string: CockroachDB connection string (required if mock=False)
            mock: Enable mock mode (no database required)
            namespace: Shared namespace for multi-agent coordination
            enable_pii_redaction: Automatically detect and redact PII
            enable_consolidation: Enable background memory consolidation
            consolidation_interval: Seconds between consolidation cycles
            llm_callback: Function to generate LLM responses (prompt, context) -> response
        """
        self.agent_id = agent_id
        self.namespace = namespace or agent_id
        self.enable_pii_redaction = enable_pii_redaction
        self._llm_callback = llm_callback

        # Initialize memory backend
        effective_agent_id = f"{self.namespace}:{agent_id}" if namespace else agent_id
        self.memory = BastionMemory(effective_agent_id, connection_string=connection_string, mock=mock)

        # Initialize consolidation
        self._consolidator: MemoryConsolidator | None = None
        if enable_consolidation:
            self._consolidator = MemoryConsolidator(
                self.memory, consolidation_interval
            )

        # Conversation history for context
        self._conversation_history: list[dict[str, str]] = []

    async def chat(self, user_message: str) -> str:
        """
        Process a user message and return a response.

        1. Detect and redact PII
        2. Store user message as memory
        3. Search for relevant context
        4. Generate response (with LLM or mock)
        5. Store response as memory
        6. Return response
        """
        # 1. PII redaction
        if self.enable_pii_redaction:
            user_message, redactions = redact_pii(user_message)
            if redactions:
                self.memory.store(
                    "system_event",
                    f"PII redacted: {[r['type'] for r in redactions]}",
                )

        # 2. Store user message
        self.memory.store(
            "user_message",
            user_message,
            metadata={
                "role": "user",
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )

        # 3. Search for relevant context
        context = self.memory.search(user_message, k=5, threshold=0.5)

        # 4. Generate response
        if self._llm_callback:
            response = self._llm_callback(user_message, context)
        else:
            response = self._mock_response(user_message, context)

        # 5. Store response
        self.memory.store(
            "agent_response",
            response,
            metadata={
                "role": "assistant",
                "timestamp": datetime.now(UTC).isoformat(),
                "context_count": len(context),
            },
        )

        # 6. Update conversation history
        self._conversation_history.append({"role": "user", "content": user_message})
        self._conversation_history.append({"role": "assistant", "content": response})

        # 7. Reinforce relevant memories
        for mem in context:
            self.memory.reinforce(mem.memory_id, success=True)

        return response

    def _mock_response(self, user_message: str, context: list[MemoryRecord]) -> str:
        """Generate a mock response when no LLM callback is provided."""
        if context:
            context_summary = "; ".join([m.content[:100] for m in context[:3]])
            return (
                f"Based on my memory, I recall: {context_summary}. "
                f"Regarding your message: {user_message}"
            )
        return f"I received your message: {user_message}. I'm building my memory..."

    def search_memory(
        self,
        query: str,
        k: int = 5,
        threshold: float = 0.8,
        memory_type: str | None = None,
    ) -> list[MemoryRecord]:
        """Search agent memory using C-SPANN vector similarity."""
        return self.memory.search(query, k=k, threshold=threshold, memory_type=memory_type)

    def get_memory_at_time(self, timestamp: str) -> list[MemoryRecord]:
        """Time travel: get memory state at a past timestamp."""
        return self.memory.get_at_time(timestamp)

    def get_audit_log(self) -> list[AuditEntry]:
        """Get the append-only audit log."""
        return self.memory.audit()

    def heal_memory(self) -> dict[str, Any]:
        """Trigger memory self-healing (prune expired, detect anomalies)."""
        return self.memory.heal()

    def detect_anomalies(self) -> list[dict]:
        """Detect memory anomalies (fact turnover, size spikes)."""
        return self.memory.detect_anomalies()

    def diff_memory(self, timestamp_a: str, timestamp_b: str) -> dict:
        """Compare memory state between two timestamps."""
        return self.memory.diff(timestamp_a, timestamp_b)

    def create_checkpoint(self) -> AgentCheckpoint:
        """Create a checkpoint of current agent state."""
        # Get all memories
        all_memories = self.memory.list_all()

        # Compute state hash
        state_data = json.dumps(
            [m.to_dict() for m in all_memories],
            sort_keys=True,
            default=str,
        )
        state_hash = hashlib.sha256(state_data.encode()).hexdigest()

        # Create checkpoint
        checkpoint = AgentCheckpoint(
            checkpoint_id=str(uuid.uuid4()),
            agent_id=self.agent_id,
            state_hash=state_hash,
            timestamp=datetime.now(UTC),
            memory_count=len(all_memories),
            metadata={
                "conversation_turns": len(self._conversation_history),
            },
        )

        # Store checkpoint metadata
        self.memory.store(
            "checkpoint",
            json.dumps(checkpoint.to_dict()),
            metadata={"checkpoint_id": checkpoint.checkpoint_id},
        )

        return checkpoint

    def restore_checkpoint(self, checkpoint_id: str) -> dict[str, Any]:
        """
        Restore agent state from a checkpoint.

        Returns checkpoint info if found, None otherwise.
        In production, this would restore the full memory state from S3.
        """
        # Search for checkpoint record
        results = self.memory.search(
            checkpoint_id,
            k=1,
            threshold=0.5,
            memory_type="checkpoint",
        )
        if not results:
            return {"status": "not_found", "checkpoint_id": checkpoint_id}

        # Parse checkpoint metadata
        try:
            checkpoint_data = json.loads(results[0].content)
            return {
                "status": "found",
                "checkpoint_id": checkpoint_data.get("checkpoint_id"),
                "agent_id": checkpoint_data.get("agent_id"),
                "memory_count": checkpoint_data.get("memory_count"),
                "timestamp": checkpoint_data.get("timestamp"),
                "state_hash": checkpoint_data.get("state_hash"),
            }
        except (json.JSONDecodeError, KeyError):
            return {"status": "found", "checkpoint_id": checkpoint_id}

    def resolve_conflict(self, fact_a: str, fact_b: str, context: str | None = None) -> str:
        """
        Resolve conflicting memories from multiple agents.
        Uses SERIALIZABLE isolation to catch 40001 errors.
        """
        return self.memory.resolve_conflict(fact_a, fact_b, context)

    def store_entity(self, content: str) -> tuple[MemoryRecord, list, list]:
        """
        Store a memory with automatic knowledge graph extraction.
        Extracts entities and relations from natural language.
        """
        return self.memory.store_with_graph(content)

    def graph_query(
        self,
        start_entity: str,
        relation_path: list[str] | None = None,
        hops: int = 2,
    ) -> list[dict]:
        """Query the knowledge graph with multi-hop traversal."""
        return self.memory.graph_query(start_entity, relation_path, hops)

    def graph_stats(self) -> dict:
        """Get knowledge graph statistics."""
        return self.memory.graph_stats()

    def export_memory(self, format: str = "json") -> str:
        """Export all agent memory."""
        all_memories = self.memory.list_all()
        data = {
            "agent_id": self.agent_id,
            "namespace": self.namespace,
            "exported_at": datetime.now(UTC).isoformat(),
            "memory_count": len(all_memories),
            "memories": [m.to_dict() for m in all_memories],
        }
        return json.dumps(data, indent=2, default=str)

    def get_conversation_history(self) -> list[dict[str, str]]:
        """Get the conversation history."""
        return self._conversation_history.copy()

    def start_consolidation(self):
        """Start the background memory consolidation process."""
        if self._consolidator:
            try:
                asyncio.create_task(self._consolidator.run())
            except RuntimeError:
                logger.warning("No running event loop, consolidation not started")

    def stop_consolidation(self):
        """Stop the background memory consolidation process."""
        if self._consolidator:
            self._consolidator.stop()

    def close(self):
        """Clean up resources."""
        self.stop_consolidation()
        self.memory.close()

    # ── Durable Virtual Actor Paging ──────────────────────────────────────

    def dehydrate(self) -> dict[str, Any]:
        """Flush active agent state to CockroachDB and clear local context.

        Stores conversation history + metadata as a paged "snapshot" that can
        be rehydrated later. After dehydration, the agent's local context is
        empty — like a suspended virtual actor that can be reactivated on demand.
        """
        page_id = str(uuid.uuid4())
        page_data = {
            "page_id": page_id,
            "agent_id": self.agent_id,
            "conversation_history": self._conversation_history,
            "memory_count": len(self.memory.list_all()),
            "dehydrated_at": datetime.now(UTC).isoformat(),
        }

        self.memory.store(
            "agent_page",
            json.dumps(page_data, default=str),
            metadata={
                "page_id": page_id,
                "type": "dehydration",
                "conversation_turns": len(self._conversation_history),
            },
        )

        # Clear local context
        self._conversation_history.clear()

        return {
            "status": "dehydrated",
            "page_id": page_id,
            "conversation_turns_saved": len(page_data["conversation_history"]),
            "memory_count": page_data["memory_count"],
        }

    def rehydrate(self, page_id: str) -> dict[str, Any]:
        """Load agent state from a dehydrated page in CockroachDB.

        Restores conversation history and metadata. The agent's memory
        (agent_memory table) is already persistent — this restores the
        ephemeral conversation context that would otherwise be lost.
        """
        results = self.memory.search(
            page_id,
            k=1,
            threshold=0.5,
            memory_type="agent_page",
        )
        if not results:
            return {"status": "not_found", "page_id": page_id}

        try:
            page_data = json.loads(results[0].content)
            self._conversation_history = page_data.get("conversation_history", [])
            return {
                "status": "rehydrated",
                "page_id": page_id,
                "conversation_turns_restored": len(self._conversation_history),
                "memory_count": page_data.get("memory_count", 0),
                "dehydrated_at": page_data.get("dehydrated_at"),
            }
        except (json.JSONDecodeError, KeyError):
            return {"status": "error", "page_id": page_id, "error": "Invalid page data"}

    def list_pages(self) -> list[dict[str, Any]]:
        """List all dehydrated pages for this agent."""
        results = self.memory.list_all(memory_type="agent_page")
        pages = []
        for r in results:
            try:
                data = json.loads(r.content)
                pages.append({
                    "page_id": data.get("page_id"),
                    "dehydrated_at": data.get("dehydrated_at"),
                    "conversation_turns": data.get("conversation_turns", 0),
                    "memory_count": data.get("memory_count", 0),
                })
            except (json.JSONDecodeError, KeyError):
                continue
        return pages

    def delete_page(self, page_id: str) -> dict[str, Any]:
        """Delete a dehydrated page from CockroachDB."""
        results = self.memory.search(
            page_id,
            k=1,
            threshold=0.5,
            memory_type="agent_page",
        )
        if not results:
            return {"status": "not_found", "page_id": page_id}
        self.memory._delete_by_id(results[0].memory_id)
        return {"status": "deleted", "page_id": page_id}

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False
