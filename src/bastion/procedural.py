"""Procedural Memory — Learns recurring workflows and decision patterns.

While episodic memory stores "what happened" and semantic memory stores
"what is true", procedural memory stores "how to do things" — recurring
workflows, decision patterns, and learned procedures.

Usage:
    proc = ProceduralMemory(memory_engine)
    proc.record_workflow("deploy", ["lint", "test", "build", "deploy"])
    workflows = proc.find_similar_workflows("deploy to production")
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


@dataclass
class WorkflowPattern:
    """A detected recurring workflow pattern."""
    pattern_id: str = ""
    name: str = ""
    steps: list[str] = field(default_factory=list)
    frequency: int = 0
    tools_used: list[str] = field(default_factory=list)
    avg_duration_ms: float = 0.0
    success_rate: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_id": self.pattern_id,
            "name": self.name,
            "steps": self.steps,
            "frequency": self.frequency,
            "tools_used": self.tools_used,
            "avg_duration_ms": self.avg_duration_ms,
            "success_rate": self.success_rate,
        }


@dataclass
class DecisionPattern:
    """A learned decision pattern."""
    pattern_id: str = ""
    condition: str = ""
    action: str = ""
    confidence: float = 0.0
    times_applied: int = 0
    success_rate: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "pattern_id": self.pattern_id,
            "condition": self.condition,
            "action": self.action,
            "confidence": self.confidence,
            "times_applied": self.times_applied,
            "success_rate": self.success_rate,
        }


class ProceduralMemory:
    """Learns and retrieves recurring workflows and decision patterns.

    Stores "how to do things" — extracted from episodic memories
    and user corrections. Enables agents to follow established
    procedures without re-learning each time.
    """

    def __init__(self, memory_engine: Any):
        self._memory = memory_engine

    def record_workflow(
        self,
        name: str,
        steps: list[str],
        tools_used: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Record a workflow pattern for future reference.

        Args:
            name: Human-readable workflow name (e.g., "deploy", "code review").
            steps: Ordered list of steps in the workflow.
            tools_used: Tools used in this workflow.
            metadata: Additional metadata.

        Returns:
            Stored workflow metadata.
        """
        content = f"Workflow '{name}': {' → '.join(steps)}"
        meta = {
            "procedural": True,
            "workflow_name": name,
            "steps": steps,
            "tools_used": tools_used or [],
            "frequency": 1,
            "recorded_at": datetime.now(UTC).isoformat(),
            **(metadata or {}),
        }

        record = self._memory.store(
            memory_type="procedural",
            content=content,
            metadata=meta,
            _skip_guard=True,
        )

        return {
            "workflow_id": record.memory_id,
            "name": name,
            "steps": len(steps),
        }

    def find_similar_workflows(
        self,
        query: str,
        k: int = 5,
    ) -> list[WorkflowPattern]:
        """Find workflows similar to a query.

        Args:
            query: Description of what the agent needs to do.
            k: Number of results to return.

        Returns:
            List of matching WorkflowPattern objects.
        """
        results = self._memory.search(query=query, k=k, memory_type="procedural")
        patterns = []

        for record in results:
            meta = record.metadata or {}
            if not meta.get("procedural"):
                continue

            patterns.append(WorkflowPattern(
                pattern_id=record.memory_id,
                name=meta.get("workflow_name", "unknown"),
                steps=meta.get("steps", []),
                frequency=meta.get("frequency", 1),
                tools_used=meta.get("tools_used", []),
                metadata=meta,
            ))

        return patterns

    def get_workflow_by_name(self, name: str) -> WorkflowPattern | None:
        """Get a specific workflow by name."""
        results = self._memory.search(
            query=f"workflow {name}",
            k=5,
            memory_type="procedural",
        )
        for record in results:
            meta = record.metadata or {}
            if meta.get("workflow_name", "").lower() == name.lower():
                return WorkflowPattern(
                    pattern_id=record.memory_id,
                    name=meta.get("workflow_name", name),
                    steps=meta.get("steps", []),
                    frequency=meta.get("frequency", 1),
                    tools_used=meta.get("tools_used", []),
                    metadata=meta,
                )
        return None

    def record_decision(
        self,
        condition: str,
        action: str,
        confidence: float = 0.8,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Record a decision pattern for future reference.

        Args:
            condition: When this decision applies (e.g., "file > 1000 lines").
            action: What action was taken (e.g., "split into modules").
            confidence: Confidence in this pattern (0.0-1.0).
            metadata: Additional metadata.

        Returns:
            Stored decision metadata.
        """
        content = f"When {condition}, then {action}"
        meta = {
            "procedural": True,
            "decision": True,
            "condition": condition,
            "action": action,
            "confidence": confidence,
            "times_applied": 1,
            "recorded_at": datetime.now(UTC).isoformat(),
            **(metadata or {}),
        }

        record = self._memory.store(
            memory_type="procedural",
            content=content,
            metadata=meta,
            _skip_guard=True,
        )

        return {
            "decision_id": record.memory_id,
            "condition": condition,
            "action": action,
        }

    def get_stats(self) -> dict[str, Any]:
        """Get procedural memory statistics."""
        all_proc = self._memory.list_all(namespace_scope="own", memory_type="procedural")
        workflows = [m for m in all_proc if (m.metadata or {}).get("workflow_name")]
        decisions = [m for m in all_proc if (m.metadata or {}).get("decision")]

        return {
            "total_procedural": len(all_proc),
            "workflows": len(workflows),
            "decisions": len(decisions),
            "workflow_names": list({(m.metadata or {}).get("workflow_name", "") for m in workflows}),
        }
