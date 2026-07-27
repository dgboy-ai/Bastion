"""Tests for CognitiveRulesEngine — rule extraction, recommendation, stats."""

from __future__ import annotations

from bastion import BastionMemory
from bastion.rules import (
    CognitiveRule,
    CognitiveRulesEngine,
    ExecutionLog,
    RuleCategory,
    RuleRecommendation,
)


class TestRuleCategory:
    def test_has_reliability(self):
        assert RuleCategory.RELIABILITY == "reliability"

    def test_all_categories(self):
        assert len(RuleCategory) == 6
        assert RuleCategory.SAFETY == "safety"
        assert RuleCategory.EFFICIENCY == "efficiency"
        assert RuleCategory.CORRECTNESS == "correctness"
        assert RuleCategory.COORDINATION == "coordination"
        assert RuleCategory.COST == "cost"


class TestCognitiveRule:
    def test_to_dict(self):
        rule = CognitiveRule(
            rule_id="r1",
            category=RuleCategory.SAFETY,
            pattern="test pattern",
            trigger="test trigger",
            action="test action",
        )
        d = rule.to_dict()
        assert d["rule_id"] == "r1"
        assert d["category"] == "safety"
        assert d["status"] == "active"
        assert d["weight"] == 1.0
        assert d["fire_count"] == 0


class TestExecutionLog:
    def test_creation(self):
        log = ExecutionLog(agent_id="a1", action="search", outcome="success")
        assert log.agent_id == "a1"
        assert log.outcome == "success"
        assert log.timestamp is not None


class TestCognitiveRulesEngine:
    def _make_engine(self):
        mem = BastionMemory("rules-test", mock=True)
        return CognitiveRulesEngine(mem)

    def test_initial_state(self):
        engine = self._make_engine()
        assert len(engine._rules) == 0
        assert engine.get_active_rules() == []

    def test_ingest_failure_creates_rule(self):
        engine = self._make_engine()
        log = ExecutionLog(
            agent_id="a1",
            action="search",
            outcome="failure",
            error_message="Connection timeout",
        )
        rules = engine.ingest_execution_log(log)
        assert len(rules) == 1
        assert rules[0].category == RuleCategory.EFFICIENCY
        assert rules[0].fire_count == 1

    def test_ingest_success_does_not_create_rule(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="search", outcome="success")
        rules = engine.ingest_execution_log(log)
        assert len(rules) == 0

    def test_repeated_failure_updates_rule(self):
        engine = self._make_engine()
        for _ in range(3):
            log = ExecutionLog(
                agent_id="a1",
                action="search",
                outcome="failure",
                error_message="Connection timeout",
            )
            engine.ingest_execution_log(log)
        assert len(engine._rules) == 1
        rule = list(engine._rules.values())[0]
        # fire_count: created with 1, incremented twice = 3
        # failure_count: created with 0, incremented twice = 2
        assert rule.fire_count == 3
        assert rule.failure_count == 2

    def test_rule_weight_increases_on_failure(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="x", outcome="failure", error_message="timeout")
        engine.ingest_execution_log(log)
        rule = list(engine._rules.values())[0]
        initial_weight = rule.weight
        engine.ingest_execution_log(log)
        assert rule.weight > initial_weight

    def test_recommend_action(self):
        engine = self._make_engine()
        log = ExecutionLog(
            agent_id="a1",
            action="connect_db",
            outcome="failure",
            error_message="Connection refused",
        )
        engine.ingest_execution_log(log)
        rec = engine.recommend_action({"action": "connect_db"})
        assert rec is not None
        assert isinstance(rec, RuleRecommendation)
        assert "connect_db" in rec.action.lower() or "retry" in rec.action.lower()

    def test_recommend_no_match(self):
        engine = self._make_engine()
        rec = engine.recommend_action({"unrelated": "context"})
        assert rec is None

    def test_get_active_rules_filter(self):
        engine = self._make_engine()
        for _outcome in ["failure", "failure", "failure"]:
            engine.ingest_execution_log(
                ExecutionLog(agent_id="a1", action="timeout_op", outcome="failure", error_message="timeout")
            )
        engine.ingest_execution_log(
            ExecutionLog(agent_id="a1", action="perm_op", outcome="failure", error_message="permission denied")
        )
        all_rules = engine.get_active_rules()
        assert len(all_rules) >= 2
        eff_rules = engine.get_active_rules(category=RuleCategory.EFFICIENCY)
        assert all(r.category == RuleCategory.EFFICIENCY for r in eff_rules)

    def test_get_stats(self):
        engine = self._make_engine()
        engine.ingest_execution_log(ExecutionLog(agent_id="a1", action="x", outcome="failure", error_message="timeout"))
        stats = engine.get_stats()
        assert stats["total_rules"] == 1
        assert stats["active_rules"] == 1
        assert stats["total_fire_count"] == 1
        assert "by_category" in stats
        assert stats["by_category"]["efficiency"] == 1

    def test_pattern_extraction_timeout(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="query", outcome="failure", error_message="Request timed out")
        pattern = engine._extract_pattern(log)
        assert "timeout" in pattern

    def test_pattern_extraction_connection(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="connect", outcome="failure", error_message="Connection refused")
        pattern = engine._extract_pattern(log)
        assert "connection_error" in pattern

    def test_pattern_extraction_rate_limit(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="api_call", outcome="failure", error_message="Rate limit exceeded")
        pattern = engine._extract_pattern(log)
        assert "rate_limit" in pattern

    def test_pattern_extraction_permission(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="access", outcome="failure", error_message="Permission forbidden")
        pattern = engine._extract_pattern(log)
        assert "permission_error" in pattern

    def test_pattern_extraction_memory(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="process", outcome="error", error_message="Out of memory")
        pattern = engine._extract_pattern(log)
        assert "memory_error" in pattern

    def test_pattern_extraction_generic(self):
        engine = self._make_engine()
        log = ExecutionLog(agent_id="a1", action="do_thing", outcome="failure", error_message="Something weird")
        pattern = engine._extract_pattern(log)
        assert "generic_failure" in pattern
