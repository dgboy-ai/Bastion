"""Cognitive Rules Engine — Learning from Agent Failures.

Inspired by Google's ReasoningBank, this module distills generalizable
cognitive strategies and guardrails from agent execution logs.

The engine monitors agent behavior, identifies failure patterns,
and extracts rules that can prevent future failures. Rules are stored
with dynamic weights that increase when the rule prevents a failure
and decrease when it's bypassed.

Usage:
    engine = CognitiveRulesEngine(memory)
    engine.ingest_execution_log(log_entry)
    rules = engine.get_active_rules()
    recommendation = engine.recommend_action(context)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class RuleCategory(StrEnum):
    """Categories of cognitive rules."""

    SAFETY = "safety"
    EFFICIENCY = "efficiency"
    CORRECTNESS = "correctness"
    COORDINATION = "coordination"
    COST = "cost"
    RELIABILITY = "reliability"


class RuleStatus(StrEnum):
    """Rule lifecycle status."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"


@dataclass
class CognitiveRule:
    """A learned rule extracted from agent execution patterns."""

    rule_id: str
    category: RuleCategory
    pattern: str  # Natural language description of the rule
    trigger: str  # When this rule should fire
    action: str  # What the agent should do
    weight: float = 1.0  # Dynamic weight (0.0-10.0)
    confidence: float = 0.5  # How confident we are in this rule
    status: RuleStatus = RuleStatus.ACTIVE
    created_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    last_fired: str | None = None
    fire_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    source_pattern: str = ""  # The failure pattern that generated this rule

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "category": self.category,
            "pattern": self.pattern,
            "trigger": self.trigger,
            "action": self.action,
            "weight": round(self.weight, 2),
            "confidence": round(self.confidence, 2),
            "status": self.status,
            "created_at": self.created_at,
            "last_fired": self.last_fired,
            "fire_count": self.fire_count,
            "success_count": self.success_count,
            "failure_count": self.failure_count,
            "source_pattern": self.source_pattern,
        }


@dataclass
class ExecutionLog:
    """A single agent execution event for rule extraction."""

    agent_id: str
    action: str
    outcome: str  # "success" | "failure" | "timeout" | "error"
    context: dict[str, Any] = field(default_factory=dict)
    error_message: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())


@dataclass
class RuleRecommendation:
    """A rule-based action recommendation for the current context."""

    rule_id: str
    category: RuleCategory
    action: str
    confidence: float
    reason: str


class CognitiveRulesEngine:
    """Learns cognitive rules from agent execution patterns.

    Inspired by Google's ReasoningBank, this engine:
    1. Ingests execution logs from agent runs
    2. Identifies failure patterns (repeated failures, specific error types)
    3. Extracts rules that would prevent similar failures
    4. Stores rules with dynamic weights that increase on success
    5. Recommends actions based on active rules and current context

    Rules are stored as memory records with type="cognitive_rule" and
    can be queried, reinforced, and pruned like any other memory.
    """

    def __init__(self, memory: Any, max_rules: int = 500):
        self.memory = memory
        self.max_rules = max_rules
        # In-memory rule cache for fast lookup
        self._rules: dict[str, CognitiveRule] = {}
        # Failure pattern tracking
        self._failure_patterns: dict[str, list[str]] = {}  # pattern -> list of rule_ids

    def ingest_execution_log(self, log: ExecutionLog) -> list[CognitiveRule]:
        """Process an execution log and extract/update rules.

        Returns newly created or updated rules.
        """
        new_rules = []

        if log.outcome == "failure" or log.outcome == "error":
            # Extract failure pattern
            pattern = self._extract_pattern(log)
            if pattern:
                # Check if we already have a rule for this pattern
                existing = self._find_rule_by_pattern(pattern)
                if existing:
                    # Update existing rule
                    existing.failure_count += 1
                    existing.fire_count += 1
                    existing.weight = min(10.0, existing.weight + 0.1)
                    existing.confidence = min(1.0, existing.confidence + 0.05)
                    existing.last_fired = log.timestamp
                    self._update_rule(existing)
                    new_rules.append(existing)
                else:
                    # Create new rule
                    rule = self._create_rule_from_failure(log, pattern)
                    self._store_rule(rule)
                    new_rules.append(rule)

        elif log.outcome == "success":
            # Reinforce rules that were applicable
            for rule in self._rules.values():
                if rule.status == RuleStatus.ACTIVE:
                    rule.success_count += 1
                    rule.weight = max(0.1, rule.weight - 0.01)  # Slight decay on non-use

        return new_rules

    def get_active_rules(
        self,
        category: RuleCategory | None = None,
        min_weight: float = 0.5,
    ) -> list[CognitiveRule]:
        """Get active rules, optionally filtered by category and minimum weight."""
        rules = [r for r in self._rules.values() if r.status == RuleStatus.ACTIVE and r.weight >= min_weight]
        if category:
            rules = [r for r in rules if r.category == category]
        return sorted(rules, key=lambda r: r.weight, reverse=True)

    def recommend_action(self, context: dict[str, Any]) -> RuleRecommendation | None:
        """Recommend an action based on current context and active rules.

        Matches context against rule triggers and returns the highest-weighted
        applicable recommendation.
        """
        best: RuleRecommendation | None = None
        best_weight = 0.0

        for rule in self.get_active_rules():
            if self._rule_matches_context(rule, context) and rule.weight > best_weight:
                best = RuleRecommendation(
                    rule_id=rule.rule_id,
                    category=rule.category,
                    action=rule.action,
                    confidence=rule.confidence,
                    reason=rule.pattern,
                )
                best_weight = rule.weight

        return best

    def get_stats(self) -> dict[str, Any]:
        """Return engine statistics."""
        active = [r for r in self._rules.values() if r.status == RuleStatus.ACTIVE]
        return {
            "total_rules": len(self._rules),
            "active_rules": len(active),
            "by_category": {cat.value: len([r for r in active if r.category == cat]) for cat in RuleCategory},
            "avg_weight": round(sum(r.weight for r in active) / len(active), 2) if active else 0.0,
            "total_fire_count": sum(r.fire_count for r in self._rules.values()),
        }

    # ── Internal methods ──────────────────────────────────────────────────

    def _extract_pattern(self, log: ExecutionLog) -> str | None:
        """Extract a failure pattern from an execution log."""
        # Classify the failure type
        error_lower = log.error_message.lower() if log.error_message else ""

        if "timeout" in error_lower or "timed out" in error_lower:
            return f"timeout:{log.action}"
        elif "connection" in error_lower or "network" in error_lower:
            return f"connection_error:{log.action}"
        elif "rate limit" in error_lower or "throttl" in error_lower:
            return f"rate_limit:{log.action}"
        elif "permission" in error_lower or "forbidden" in error_lower:
            return f"permission_error:{log.action}"
        elif "memory" in error_lower or "oom" in error_lower:
            return f"memory_error:{log.action}"
        elif "syntax" in error_lower or "parse" in error_lower:
            return f"parse_error:{log.action}"
        elif "timeout" in log.context.get("error_type", ""):
            return f"timeout:{log.action}"
        else:
            return f"generic_failure:{log.action}"

    def _find_rule_by_pattern(self, pattern: str) -> CognitiveRule | None:
        """Find an existing rule matching the failure pattern."""
        rule_ids = self._failure_patterns.get(pattern, [])
        for rid in rule_ids:
            rule = self._rules.get(rid)
            if rule and rule.status == RuleStatus.ACTIVE:
                return rule
        return None

    def _create_rule_from_failure(
        self,
        log: ExecutionLog,
        pattern: str,
    ) -> CognitiveRule:
        """Create a new cognitive rule from a failure pattern."""
        rule_id = hashlib.sha256(pattern.encode()).hexdigest()[:16]

        # Generate rule based on pattern type
        if "timeout" in pattern:
            category = RuleCategory.EFFICIENCY
            trigger = f"Action '{log.action}' is taking too long"
            action = "Add retry with exponential backoff, or increase timeout"
        elif "connection_error" in pattern:
            category = RuleCategory.RELIABILITY
            trigger = f"Connection to external service failed during '{log.action}'"
            action = "Retry with circuit breaker, or use cached fallback"
        elif "rate_limit" in pattern:
            category = RuleCategory.COST
            trigger = f"Rate limit hit during '{log.action}'"
            action = "Implement request queuing with exponential backoff"
        elif "permission_error" in pattern:
            category = RuleCategory.SAFETY
            trigger = f"Permission denied during '{log.action}'"
            action = "Verify agent credentials and scope before retrying"
        elif "memory_error" in pattern:
            category = RuleCategory.RELIABILITY
            trigger = f"Memory allocation failed during '{log.action}'"
            action = "Reduce batch size or implement streaming"
        elif "parse_error" in pattern:
            category = RuleCategory.CORRECTNESS
            trigger = f"Parse error during '{log.action}'"
            action = "Validate input format before processing"
        else:
            category = RuleCategory.CORRECTNESS
            trigger = f"Failure during '{log.action}': {log.error_message[:100]}"
            action = "Review logs and implement appropriate retry/backoff"

        return CognitiveRule(
            rule_id=rule_id,
            category=category,
            pattern=pattern,
            trigger=trigger,
            action=action,
            weight=1.0,
            confidence=0.5,
            source_pattern=pattern,
            last_fired=log.timestamp,
            fire_count=1,
        )

    def _store_rule(self, rule: CognitiveRule) -> None:
        """Store a rule in memory and cache."""
        self._rules[rule.rule_id] = rule
        if rule.source_pattern not in self._failure_patterns:
            self._failure_patterns[rule.source_pattern] = []
        self._failure_patterns[rule.source_pattern].append(rule.rule_id)

        # Persist to memory backend
        self.memory.store(
            "cognitive_rule",
            json.dumps(rule.to_dict()),
            metadata={"rule_id": rule.rule_id, "category": rule.category},
        )

    def _update_rule(self, rule: CognitiveRule) -> None:
        """Update an existing rule in memory."""
        self._rules[rule.rule_id] = rule
        # Re-persist to memory backend
        self.memory.store(
            "cognitive_rule",
            json.dumps(rule.to_dict()),
            metadata={"rule_id": rule.rule_id, "category": rule.category, "updated": True},
        )

    def _rule_matches_context(self, rule: CognitiveRule, context: dict[str, Any]) -> bool:
        """Check if a rule's trigger matches the current context."""
        trigger_lower = rule.trigger.lower()
        # Simple keyword matching against context values
        for value in context.values():
            if isinstance(value, str) and value.lower() in trigger_lower:
                return True
        # Also check if the action name appears in the trigger
        action = context.get("action", "")
        return bool(action and action.lower() in trigger_lower)
