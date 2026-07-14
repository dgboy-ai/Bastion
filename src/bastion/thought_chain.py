from __future__ import annotations

import json
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class ThoughtType(StrEnum):
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
    ACTIVE = "active"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    SUPERSEDED = "superseded"


class GraphCycleError(ValueError):
    """Raised when a cycle is detected in the thought graph."""


@dataclass
class ThoughtNode:
    """A single node in the hierarchical thought graph."""

    thought_id: str
    thought_type: ThoughtType
    content: str
    parent_id: str | None = None
    status: ThoughtStatus = ThoughtStatus.ACTIVE
    confidence: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    agent_id: str = ""
    session_id: str = ""

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
            "session_id": self.session_id,
        }


class ThoughtChain:
    """Captures hierarchical reasoning traces as a traversable graph.

    Each thought node is a reasoning step. The chain builds a directed
    tree where ``begin()`` creates the root, and all subsequent calls
    attach children. The graph can be traversed, analysed for cycles,
    queried for downstream impact, and mined for reasoning patterns.

    Usage::

        chain = ThoughtChain(memory, agent_id="optimizer")
        root = chain.begin("Analyze slow queries")
        t1 = chain.think("Missing index on created_at", parent_id=root)
        d1 = chain.decide("Add index", parent_id=t1)
        chain.complete("Done", parent_id=d1)

        graph = chain.get_graph(root)
        impact = chain.get_downstream(t1)
        patterns = chain.extract_patterns()
    """

    def __init__(self, memory: Any, agent_id: str = ""):
        self.memory = memory
        self.agent_id = agent_id
        self._current_root: str | None = None
        self._current_session: str | None = None

    # ── Node creation ──────────────────────────────────────────────────────

    def begin(
        self, content: str, metadata: dict[str, Any] | None = None
    ) -> str:
        thought_id = str(uuid.uuid4())
        session_id = str(uuid.uuid4())
        node = ThoughtNode(
            thought_id=thought_id,
            thought_type=ThoughtType.BEGIN,
            content=content,
            agent_id=self.agent_id,
            session_id=session_id,
            metadata=metadata or {},
        )
        self._store_node(node)
        self._current_root = thought_id
        self._current_session = session_id
        return thought_id

    def think(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.HYPOTHESIS, content, parent_id, confidence)

    def decide(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.DECISION, content, parent_id, confidence)

    def reject(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.REJECTION, content, parent_id, confidence)

    def observe(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.OBSERVATION, content, parent_id, confidence)

    def question(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.QUESTION, content, parent_id, confidence)

    def action(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.ACTION, content, parent_id, confidence)

    def result(
        self,
        content: str,
        parent_id: str | None = None,
        confidence: float = 1.0,
    ) -> str:
        return self._add_thought(ThoughtType.RESULT, content, parent_id, confidence)

    def complete(
        self, content: str, parent_id: str | None = None
    ) -> str:
        return self._add_thought(ThoughtType.COMPLETE, content, parent_id, 1.0)

    # ── Graph queries ──────────────────────────────────────────────────────

    def get_graph(
        self, root_id: str | None = None, max_depth: int = 50
    ) -> dict[str, Any]:
        """BFS traversal from ``root_id`` returning nodes, edges, and metadata.

        Raises ``GraphCycleError`` if a cycle is detected during traversal.
        """
        root = root_id or self._current_root
        if not root:
            return {"nodes": [], "edges": [], "root": None, "total_nodes": 0, "total_edges": 0}

        all_nodes = self._load_nodes()
        node_map = {n.thought_id: n for n in all_nodes}

        if root not in node_map:
            return {
                "nodes": [], "edges": [], "root": root, "error": "root_not_found",
                "total_nodes": 0, "total_edges": 0,
            }

        visited: set[str] = set()
        queue: deque[tuple[str, int]] = deque()
        queue.append((root, 0))
        collected: list[ThoughtNode] = []
        edges: list[dict[str, Any]] = []

        while queue:
            nid, depth = queue.popleft()
            if nid in visited:
                raise GraphCycleError(
                    f"Cycle detected: node {nid} visited twice during BFS "
                    f"from root {root}"
                )
            if depth > max_depth:
                logger.warning("Max depth %s reached during graph traversal", max_depth)
                break
            visited.add(nid)
            node = node_map.get(nid)
            if node is None:
                continue
            collected.append(node)

            for other in all_nodes:
                if other.parent_id == nid:
                    if other.thought_id in visited:
                        raise GraphCycleError(
                            f"Cycle detected: node {other.thought_id} is already visited "
                            f"but also a child of {nid} (root {root})"
                        )
                    queue.append((other.thought_id, depth + 1))
                    edges.append({
                        "source": nid,
                        "target": other.thought_id,
                        "type": "derives_from",
                    })

        collected.sort(key=lambda n: n.created_at)
        return {
            "nodes": [n.to_dict() for n in collected],
            "edges": edges,
            "root": root,
            "total_nodes": len(collected),
            "total_edges": len(edges),
        }

    def get_path_to_root(self, node_id: str) -> list[dict[str, Any]]:
        """Walk parent pointers from ``node_id`` back to the root."""
        all_nodes = self._load_nodes()
        node_map = {n.thought_id: n for n in all_nodes}
        path: list[ThoughtNode] = []
        current = node_id
        visited: set[str] = set()
        while current and current in node_map:
            if current in visited:
                raise GraphCycleError(f"Cycle detected walking parent chain from {node_id}")
            visited.add(current)
            node = node_map[current]
            path.append(node)
            current = node.parent_id or ""
        path.reverse()
        return [n.to_dict() for n in path]

    def get_downstream(self, node_id: str) -> dict[str, Any]:
        """BFS from ``node_id`` to find all descendants (impact analysis)."""
        all_nodes = self._load_nodes()
        node_map = {n.thought_id: n for n in all_nodes}
        if node_id not in node_map:
            return {"error": f"Node {node_id} not found", "node_id": node_id}

        children_map: dict[str, list[ThoughtNode]] = {}
        for n in all_nodes:
            if n.parent_id:
                children_map.setdefault(n.parent_id, []).append(n)

        visited: set[str] = set()
        queue: deque[str] = deque([node_id])
        descendants: list[ThoughtNode] = []
        edges: list[dict[str, Any]] = []

        while queue:
            nid = queue.popleft()
            if nid in visited:
                raise GraphCycleError(f"Cycle detected during downstream traversal from {node_id}")
            visited.add(nid)
            if nid != node_id:
                node = node_map.get(nid)
                if node:
                    descendants.append(node)
            for child in children_map.get(nid, []):
                if child.thought_id not in visited:
                    queue.append(child.thought_id)
                    edges.append({
                        "source": nid,
                        "target": child.thought_id,
                        "type": "derives_from",
                    })

        descendants.sort(key=lambda n: n.created_at)
        return {
            "source": node_id,
            "descendants": [n.to_dict() for n in descendants],
            "edges": edges,
            "total_descendants": len(descendants),
        }

    def detect_cycles(self, root_id: str | None = None) -> dict[str, Any]:
        """DFS-based cycle detection. Returns first cycle found or empty."""
        root = root_id or self._current_root
        if not root:
            return {"has_cycle": False, "cycle": []}

        all_nodes = self._load_nodes()
        node_map = {n.thought_id: n for n in all_nodes}
        children_map: dict[str, list[ThoughtNode]] = {}
        for n in all_nodes:
            if n.parent_id:
                children_map.setdefault(n.parent_id, []).append(n)

        visited: set[str] = set()
        rec_stack: set[str] = set()
        parent_track: dict[str, str] = {}

        def dfs(nid: str) -> list[str]:
            visited.add(nid)
            rec_stack.add(nid)
            for child in children_map.get(nid, []):
                cid = child.thought_id
                if cid not in visited:
                    parent_track[cid] = nid
                    result = dfs(cid)
                    if result:
                        return result
                elif cid in rec_stack:
                    # Reconstruct cycle
                    cycle = [cid, nid]
                    cur = nid
                    while cur != cid:
                        cur = parent_track.get(cur, "")
                        if not cur:
                            break
                        cycle.append(cur)
                    cycle.reverse()
                    return cycle
            rec_stack.discard(nid)
            return []

        if root in node_map and root not in visited:
            cycle = dfs(root)
            if cycle:
                return {"has_cycle": True, "cycle": cycle}

        # Check remaining components
        for nid in node_map:
            if nid not in visited:
                cycle = dfs(nid)
                if cycle:
                    return {"has_cycle": True, "cycle": cycle}

        return {"has_cycle": False, "cycle": []}

    def extract_patterns(
        self, root_id: str | None = None
    ) -> dict[str, Any]:
        """Analyse the thought graph for reasoning patterns.

        Detects:
        - Decision backtracking: decision → rejection → decision chains
        - Abandoned branches: nodes with REJECTED status that have no accept path
        - Deep reasoning: chains longer than the median depth
        - Frequent question types: most common question subjects
        """
        graph = self.get_graph(root_id)
        nodes = graph["nodes"]
        if not nodes:
            return {"patterns": [], "summary": {}}

        patterns: list[dict[str, Any]] = []

        children_map: dict[str, list[dict]] = {}
        for n in nodes:
            pid = n.get("parent_id")
            if pid:
                children_map.setdefault(pid, []).append(n)

        # 1. Backtrack detection: decision -> rejection -> decision
        for n in nodes:
            if n["thought_type"] != "decision":
                continue
            nid = n["thought_id"]
            for child in children_map.get(nid, []):
                if child["thought_type"] == "rejection":
                    for grandchild in children_map.get(child["thought_id"], []):
                        if grandchild["thought_type"] == "decision":
                            patterns.append({
                                "type": "backtrack",
                                "description": "Decision was reconsidered after rejection",
                                "path": [n["thought_id"], child["thought_id"], grandchild["thought_id"]],
                                "severity": "info",
                            })

        # 2. Abandoned branches
        for n in nodes:
            if n.get("status") == "rejected" or n["thought_type"] == "rejection":
                nid = n["thought_id"]
                if nid not in children_map:
                    patterns.append({
                        "type": "abandoned_branch",
                        "description": f"Rejected/abandoned node with no follow-up: {n.get('content', '')[:80]}",
                        "node_id": nid,
                        "severity": "warning",
                    })

        # 3. Deep reasoning chains
        depths = self._compute_depths(nodes)
        if depths:
            median_depth = sorted(depths.values())[len(depths) // 2]
            deep_chains = [
                {"node_id": nid, "depth": d}
                for nid, d in depths.items()
                if d > median_depth and d >= 3
            ]
            if deep_chains:
                patterns.append({
                    "type": "deep_reasoning",
                    "description": f"Found {len(deep_chains)} nodes with depth > median ({median_depth})",
                    "nodes": deep_chains,
                    "severity": "info",
                })

        # 4. Question frequency
        questions = [n for n in nodes if n["thought_type"] == "question"]
        if questions:
            patterns.append({
                "type": "question_frequency",
                "description": f"Agent asked {len(questions)} questions in this chain",
                "count": len(questions),
                "severity": "info",
            })

        # 5. Decision efficiency ratio
        decisions = [n for n in nodes if n["thought_type"] == "decision"]
        rejections = [n for n in nodes if n["thought_type"] == "rejection"]
        total = len(nodes) or 1
        patterns.append({
            "type": "decision_efficiency",
            "description": (
                f"{len(decisions)} decisions, {len(rejections)} rejections "
                f"out of {len(nodes)} total nodes"
            ),
            "decision_ratio": round(len(decisions) / total, 3),
            "rejection_ratio": round(len(rejections) / total, 3),
            "severity": "info",
        })

        return {
            "patterns": patterns,
            "summary": {
                "total_patterns": len(patterns),
                "total_nodes": len(nodes),
                "unique_types": list({n["thought_type"] for n in nodes}),
            },
        }

    def get_summary(self, root_id: str | None = None) -> dict[str, Any]:
        """Get a concise summary of the thought chain."""
        graph = self.get_graph(root_id)
        nodes = graph["nodes"]
        by_type: dict[str, int] = {}
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

    # ── Cross-session ──────────────────────────────────────────────────────

    def list_sessions(self) -> list[dict[str, Any]]:
        """Return all unique session IDs with node counts."""
        all_nodes = self._load_nodes()
        sessions: dict[str, int] = {}
        for n in all_nodes:
            sid = n.session_id or "default"
            sessions[sid] = sessions.get(sid, 0) + 1
        return [
            {"session_id": sid, "node_count": count}
            for sid, count in sorted(sessions.items(), key=lambda x: -x[1])
        ]

    def get_session(
        self, session_id: str
    ) -> dict[str, Any]:
        """Return the graph for a specific session."""
        all_nodes = self._load_nodes()
        session_nodes = [n for n in all_nodes if n.session_id == session_id]
        if not session_nodes:
            return {"nodes": [], "edges": [], "session_id": session_id, "error": "session_not_found"}

        roots = [n for n in session_nodes if n.thought_type == ThoughtType.BEGIN]
        root_id = roots[0].thought_id if roots else session_nodes[0].thought_id
        return self.get_graph(root_id)

    # ── Internal ───────────────────────────────────────────────────────────

    def _add_thought(
        self,
        thought_type: ThoughtType,
        content: str,
        parent_id: str | None,
        confidence: float,
    ) -> str:
        thought_id = str(uuid.uuid4())
        parent = parent_id or self._current_root
        node = ThoughtNode(
            thought_id=thought_id,
            thought_type=thought_type,
            content=content,
            parent_id=parent,
            agent_id=self.agent_id,
            session_id=self._current_session or "",
            confidence=confidence,
        )
        self._store_node(node)
        return thought_id

    def _store_node(self, node: ThoughtNode) -> None:
        self.memory.store(
            "thought_node",
            json.dumps(node.to_dict()),
            metadata={
                "thought_id": node.thought_id,
                "thought_type": node.thought_type,
                "parent_id": node.parent_id or "",
                "agent_id": node.agent_id,
                "session_id": node.session_id,
            },
            _skip_guard=True,  # Thought nodes are internally generated, not user content
        )

    def _load_nodes(self) -> list[ThoughtNode]:
        results = self.memory.list_all(memory_type="thought_node")
        nodes: list[ThoughtNode] = []
        for r in results:
            try:
                data = json.loads(r.content)
                if data.get("agent_id") == self.agent_id:
                    nodes.append(
                        ThoughtNode(
                            thought_id=data["thought_id"],
                            thought_type=ThoughtType(data["thought_type"]),
                            content=data["content"],
                            parent_id=data.get("parent_id"),
                            status=ThoughtStatus(data.get("status", "active")),
                            confidence=data.get("confidence", 1.0),
                            metadata=data.get("metadata", {}),
                            created_at=data.get("created_at", ""),
                            agent_id=data.get("agent_id", ""),
                            session_id=data.get("session_id", ""),
                        )
                    )
            except (json.JSONDecodeError, KeyError, ValueError) as exc:
                logger.warning("Failed to load thought node: %s", exc)
                continue
        return nodes

    @staticmethod
    def _compute_depths(nodes: list[dict]) -> dict[str, int]:
        node_map = {n["thought_id"]: n for n in nodes}
        depths: dict[str, int] = {}

        def get_depth(nid: str) -> int:
            if nid in depths:
                return depths[nid]
            node = node_map.get(nid)
            if not node:
                return 0
            pid = node.get("parent_id")
            if pid and pid in node_map:
                d = get_depth(pid) + 1
            else:
                d = 0
            depths[nid] = d
            return d

        for n in nodes:
            get_depth(n["thought_id"])
        return depths
