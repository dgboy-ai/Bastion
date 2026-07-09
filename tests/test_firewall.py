from __future__ import annotations

from unittest import mock

import pytest

from bastion.firewall import CognitiveFirewall


@pytest.fixture
def mock_memory():
    mem = mock.MagicMock()
    mem._mock = True
    mem.list_all.return_value = []
    return mem


@pytest.fixture
def firewall(mock_memory):
    return CognitiveFirewall(mock_memory)


class TestCognitiveFirewall:
    def test_validate_safe_content(self, firewall):
        result = firewall.validate_memory_write("agent-1", "Hello world", "fact")
        assert result["safe"] is True
        assert result["blocked"] is False

    def test_validate_ssn_detected(self, firewall):
        result = firewall.validate_memory_write("agent-1", "My SSN is 123-45-6789", "fact")
        assert result["safe"] is False
        assert any(v["rule"] == "PII_DETECTED" for v in result["violations"])

    def test_validate_email_detected(self, firewall):
        result = firewall.validate_memory_write("agent-1", "email: test@example.com", "fact")
        violations = [v for v in result["violations"] if v["rule"] == "PII_DETECTED"]
        assert len(violations) > 0

    def test_validate_credit_card_detected(self, firewall):
        result = firewall.validate_memory_write("agent-1", "Card: 4111-1111-1111-1111", "fact")
        violations = [v for v in result["violations"] if v["rule"] == "PII_DETECTED"]
        assert len(violations) > 0

    def test_validate_invalid_memory_type(self, firewall):
        result = firewall.validate_memory_write("agent-1", "content", "invalid_type")
        assert result["safe"] is False
        assert any(v["rule"] == "INVALID_MEMORY_TYPE" for v in result["violations"])

    def test_validate_oversized_content(self, firewall):
        result = firewall.validate_memory_write("agent-1", "x" * 20000, "fact")
        assert any(v["rule"] == "OVERSIZED_CONTENT" for v in result["violations"])

    def test_validate_blocked_agent(self, firewall):
        firewall._blocked_agents.add("bad-agent")
        result = firewall.validate_memory_write("bad-agent", "content", "fact")
        assert result["blocked"] is True

    def test_check_hash_chain_empty(self, firewall):
        result = firewall.check_hash_chain_integrity("agent-1")
        assert result["chain_intact"] is True
        assert result["total_memories"] == 0

    def test_get_stats(self, firewall):
        stats = firewall.get_stats()
        assert "blocked_agents" in stats
        assert "total_violations" in stats
        assert stats["blocked_agents"] == 0
