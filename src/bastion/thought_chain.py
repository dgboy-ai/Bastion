"""Structured Thought-Chain Graph Logging.

Captures hierarchical reasoning traces as a relational graph stored in
CockroachDB. Each thought node represents a reasoning step, hypothesis,
choice, or rejection. The graph structure enables post-failure debugging
by preserving the full decision path.

Usage:
    chain = ThoughtChain(memory)
    chain.begin("Analyze user request about database optimization")
    chain.think("The user mentioned slow queries — likely index issue")
    chain.decide("Add index on agent_memory.created_at")
    chain.reject("Consider rewriting query — too complex for benefit")
    chain.complete("Added index, query time reduced from 200ms to 5ms")
    graph = chain.get_graph(root_id)
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)


class ThoughtType(StrEnum):
    """Types of thought nodes in the chain."""
    HYPOTHESIS = "hypothesis"
    DECISION = "decision"
    REJECTION = "rejection"
    OBSERVATION = "observation"
    QUESTION = "question"
    ACTION = "action"
    RESULT = "result"
    BEGIN = "begin"
    COMPLETE = "complete"


class ThoughtStatus(StrEnum):
    """Status of a thought node."""
    ACTIVE = "active"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


@dataclass
class ThoughtNode:
    """A single node in the thought-chain graph."""
    thought_id: str
    thought_type: ThoughtType
    content: str
    parent_id: str | None = None
    status: ThoughtStatus = ThoughtStatus.ACTIVE
    confidence: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    agent_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "thought_id": self.thought_id,
            "thought_type": self.thought_type,
            "content": self.content,
            "parent_id": self.parent_id,
            "status": self.status,
            "confidence": self.confidence,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "agent_id": self.agent_id,
        }


class ThoughtChain:
    """Captures hierarchical reasoning traces as a graph.

    Each thought node represents a reasoning step. The chain builds a
    tree structure where:
    - begin() creates the root node
    - think()/decide()/reject() create child nodes
    - complete() marks the chain as finished

    The graph is stored in CockroachDB as memory records with
    type="thought_node" and metadata linking parent/child relationships.

    Usage:
        chain = ThoughtChain(memory, agent_id="optimizer-agent")
        chain.begin("Analyze slow database queries")
        chain.think("Queries are missing indexes on created_at")
        chain.decide("Add index on agent_memory.created_at")
        chain.complete("Index added, query time reduced")
        graph = chain.get_graph(root_id)
    """

    def __init__(self, memory: Any, agent_id: str = ""):
        self.memory = memory
        self.agent_id = agent_id
        self._current_root: str | None = None

    def begin(self, content: str, metadata: dict[str, Any] | None = None) -> str:
        """Start a new thought chain. Returns the root thought_id."""
        thought_id = str(uuid.uuid4())
        node = ThoughtNode(
            thought_id=thought_id,
            thought_type=ThoughtType.BEGIN,
            content=content,
            agent_id=self.agent_id,
            metadata=metadata or {},
        )
        self._store_node(node)
        self._current_root = thought_id
        return thought_id

    def think(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Add a hypothesis/observation to the chain."""
        return self._add_thought(ThoughtType.HYPOTHESIS, content, parent_id, confidence)

    def decide(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Record a decision in the chain."""
        return self._add_thought(ThoughtType.DECISION, content, parent_id, confidence)

    def reject(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Record a rejected alternative."""
        return self._add_thought(ThoughtType.REJECTION, content, parent_id, confidence)

    def observe(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Record an observation."""
        return self._add_thought(ThoughtType.OBSERVATION, content, parent_id, confidence)

    def question(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Record an open question."""
        return self._add_thought(ThoughtType.QUESTION, content, parent_id, confidence)

    def action(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Record an action taken."""
        return self._add_thought(ThoughtType.ACTION, content, parent_id, confidence)

    def result(self, content: str, parent_id: str | None = None, confidence: float = 1.0) -> str:
        """Record the result of an action."""
        return self._add_thought(ThoughtType.RESULT, content, parent_id, confidence)

    def complete(self, content: str, parent_id: str | None = None) -> str:
        """Mark the thought chain as complete."""
        return self._add_thought(ThoughtType.COMPLETE, content, parent_id, 1.0)

    def get_graph(self, root_id: str | None = None) -> dict[str, Any]:
        """Retrieve the full thought-chain graph starting from root_id."""
        root = root_id or self._current_root
        if not root:
            return {"nodes": [], "edges": [], "root": None}

        # Find all thought nodes for this agent
        results = self.memory.list_all(memory_type="thought_node")
        nodes = []
        node_map = {}

        for r in results:
            try:
                data = json.loads(r.content)
                if data.get("agent_id") == self.agent_id:
                    node = ThoughtNode(
                        thought_id=data["thought_id"],
                        thought_type=data["thought_type"],
                        content=data["content"],
                        parent_id=data.get("parent_id"),
                        status=data.get("status", "active"),
                        confidence=data.get("confidence", 1.0),
                        metadata=data.get("metadata", {}),
                        created_at=data.get("created_at", ""),
                        agent_id=data.get("agent_id", ""),
                    )
                    nodes.append(node)
                    node_map[node.thought_id] = node
            except (json.JSONDecodeError, KeyError):
                continue

        # Build edges from parent relationships
        edges = []
        for node in nodes:
            if node.parent_id and node.parent_id in node_map:
                edges.append({
                    "source": node.parent_id,
                    "target": node.thought_id,
                    "type": "derives_from",
                })

        # Sort nodes by creation time
        nodes.sort(key=lambda n: n.created_at)

        return {
            "nodes": [n.to_dict() for n in nodes],
            "edges": edges,
            "root": root,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
        }

    def get_summary(self, root_id: str | None = None) -> dict[str, Any]:
        """Get a summary of the thought chain."""
        graph = self.get_graph(root_id)
        nodes = graph["nodes"]

        by_type = {}
        for node in nodes:
            t = node["thought_type"]
            by_type[t] = by_type.get(t, 0) + 1

        return {
            "root": graph["root"],
            "total_nodes": graph["total_nodes"],
            "total_edges": graph["total_edges"],
            "by_type": by_type,
            "rejections": by_type.get("rejection", 0),
            "decisions": by_type.get("decision", 0),
        }

    # ── Internal methods ──────────────────────────────────────────────────

    def _add_thought(
        self,
        thought_type: ThoughtType,
        content: str,
        parent_id: str | None,
        confidence: float,
    ) -> str:
        """Add a thought node to the chain."""
        thought_id = str(uuid.uuid4())
        parent = parent_id or self._current_root

        node = ThoughtNode(
            thought_id=thought_id,
            thought_type=thought_type,
            content=content,
            parent_id=parent,
            agent_id=self.agent_id,
            confidence=confidence,
        )
        self._store_node(node)
        return thought_id

    def _store_node(self, node: ThoughtNode) -> None:
        """Persist a thought node to memory."""
        self.memory.store(
            "thought_node",
            json.dumps(node.to_dict()),
            metadata={
                "thought_id": node.thought_id,
                "thought_type": node.thought_type,
                "parent_id": node.parent_id or "",
                "agent_id": node.agent_id,
            },
        )
