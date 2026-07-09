from __future__ import annotations

from unittest import mock

import pytest

from bastion.rules import (
    CognitiveRule,
    CognitiveRulesEngine,
    ExecutionLog,
    RuleCategory,
    RuleRecommendation,
    RuleStatus,
)


class TestRuleCategory:
    def test_all_categories_defined(self):
        assert RuleCategory.SAFETY == "safety"
        assert RuleCategory.EFFICIENCY == "efficiency"
        assert RuleCategory.CORRECTNESS == "correctness"
        assert RuleCategory.COORDINATION == "coordination"
        assert RuleCategory.COST == "cost"
        assert RuleCategory.RELIABILITY == "reliability"


class TestCognitiveRule:
    def test_to_dict_shape(self):
        rule = CognitiveRule(
            rule_id="abc123",
            category=RuleCategory.SAFETY,
            pattern="test pattern",
            trigger="test trigger",
            action="test action",
        )
        d = rule.to_dict()
        assert d["rule_id"] == "abc123"
        assert d["category"] == "safety"
        assert d["weight"] == 1.0
        assert d["confidence"] == 0.5

    def test_active_by_default(self):
        rule = CognitiveRule(
            rule_id="r1", category=RuleCategory.SAFETY, pattern="p", trigger="t", action="a",
        )
        assert rule.status == RuleStatus.ACTIVE


class TestCognitiveRulesEngine:
    @pytest.fixture
    def engine(self):
        mem = mock.MagicMock()
        return CognitiveRulesEngine(memory=mem)

    def test_ingest_success_log(self, engine):
        log = ExecutionLog(agent_id="agent-1", action="search", outcome="success")
        rules = engine.ingest_execution_log(log)
        assert len(rules) == 0

    def test_ingest_failure_creates_rule(self, engine):
        log = ExecutionLog(agent_id="agent-1", action="search", outcome="failure", error_message="timeout occurred")
        rules = engine.ingest_execution_log(log)
        assert len(rules) == 1
        assert rules[0].pattern.startswith("timeout:")

    def test_ingest_repeated_failure_updates_weight(self, engine):
        log = ExecutionLog(agent_id="agent-1", action="search", outcome="failure", error_message="timeout occurred")
        engine.ingest_execution_log(log)
        engine.ingest_execution_log(log)
        active = engine.get_active_rules()
        assert len(active) == 1
        assert active[0].weight > 1.0
        assert active[0].fire_count == 2
        assert active[0].failure_count == 1

    def test_get_active_rules(self, engine):
        log = ExecutionLog(agent_id="a1", action="search", outcome="failure", error_message="timeout")
        engine.ingest_execution_log(log)
        active = engine.get_active_rules()
        assert len(active) == 1

    def test_get_active_rules_filter_category(self, engine):
        log = ExecutionLog(agent_id="a1", action="search", outcome="failure", error_message="timeout")
        engine.ingest_execution_log(log)
        filtered = engine.get_active_rules(category=RuleCategory.SAFETY)
        assert len(filtered) == 0

    def test_recommend_action(self, engine):
        log = ExecutionLog(agent_id="a1", action="search", outcome="failure", error_message="timeout")
        engine.ingest_execution_log(log)
        rec = engine.recommend_action({"action": "search"})
        assert rec is not None
        assert isinstance(rec, RuleRecommendation)
        assert rec.action != ""

    def test_recommend_no_match(self, engine):
        rec = engine.recommend_action({"action": "unknown"})
        assert rec is None

    def test_stats_shape(self, engine):
        log = ExecutionLog(agent_id="a1", action="search", outcome="failure", error_message="timeout")
        engine.ingest_execution_log(log)
        stats = engine.get_stats()
        assert stats["total_rules"] == 1
        assert stats["active_rules"] == 1
        assert "by_category" in stats

    def test_extract_pattern_timeout(self, engine):
        log = ExecutionLog(agent_id="a1", action="search", outcome="failure", error_message="connection timed out")
        pattern = engine._extract_pattern(log)
        assert "timeout" in pattern

    def test_extract_pattern_connection(self, engine):
        log = ExecutionLog(agent_id="a1", action="sync", outcome="failure", error_message="connection refused")
        pattern = engine._extract_pattern(log)
        assert "connection_error" in pattern

    def test_extract_pattern_rate_limit(self, engine):
        log = ExecutionLog(agent_id="a1", action="api_call", outcome="failure", error_message="rate limit exceeded")
        pattern = engine._extract_pattern(log)
        assert "rate_limit" in pattern
