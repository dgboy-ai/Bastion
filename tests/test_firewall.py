"""Tests for CognitiveFirewall — PII detection, blocked agents, hash chain."""

from __future__ import annotations

import pytest

from bastion.firewall import CognitiveFirewall
from bastion import BastionMemory


class TestValidateMemoryWrite:
    def test_safe_content_passes(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "The sky is blue", "fact")
        assert result["safe"] is True
        assert result["blocked"] is False
        assert result["violations"] == []

    def test_ssn_detected(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "My SSN is 123-45-6789", "fact")
        assert result["safe"] is False
        assert any(v["rule"] == "PII_DETECTED" for v in result["violations"])
        assert any("SSN" in v["detail"] for v in result["violations"])

    def test_email_detected(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "Contact me at user@example.com", "fact")
        assert result["safe"] is False
        assert any(v["rule"] == "PII_DETECTED" for v in result["violations"])
        assert any("Email" in v["detail"] for v in result["violations"])

    def test_credit_card_detected(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "Card number: 4111 1111 1111 1111", "fact")
        assert result["safe"] is False
        assert any(v["rule"] == "PII_DETECTED" for v in result["violations"])
        assert any("Credit card" in v["detail"] for v in result["violations"])

    def test_invalid_memory_type_flagged(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "Hello", "weird_type")
        assert result["safe"] is False
        assert any(v["rule"] == "INVALID_MEMORY_TYPE" for v in result["violations"])

    def test_valid_memory_types_pass(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        for mt in ("fact", "task", "preference", "learned", "procedure", "system_event"):
            result = fw.validate_memory_write("agent-1", "Content", mt)
            assert result["safe"] is True, f"Memory type {mt} should be valid"

    def test_oversized_content_flagged(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "x" * 100001, "fact")
        assert result["safe"] is False
        assert any(v["rule"] == "OVERSIZED_CONTENT" for v in result["violations"])

    def test_exact_limit_content_passes(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.validate_memory_write("agent-1", "x" * 100000, "fact")
        assert result["safe"] is True


class TestBlockedAgents:
    def test_blocked_agent_rejected(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        # Manually block the agent (critical violations trigger blocking)
        fw._blocked_agents.add("bad-agent")
        result = fw.validate_memory_write("bad-agent", "Hello", "fact")
        assert result["blocked"] is True
        assert any(v["rule"] == "BLOCKED_AGENT" for v in result["violations"])

    def test_non_blocked_agent_allowed(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        fw.validate_memory_write("good-agent", "My SSN is 123-45-6789", "fact")
        result = fw.validate_memory_write("good-agent", "Hello", "fact")
        assert not any(v["rule"] == "BLOCKED_AGENT" for v in result["violations"])


class TestFirewallStats:
    def test_stats_initial(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        stats = fw.get_stats()
        assert stats["blocked_agents"] == 0
        assert stats["total_violations"] == 0

    def test_stats_after_block(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        # Manually block and increment violation count
        fw._blocked_agents.add("bad-agent")
        fw._violation_count += 1
        stats = fw.get_stats()
        assert stats["blocked_agents"] == 1
        assert stats["total_violations"] == 1


class TestHashChainIntegrity:
    def test_intact_chain(self):
        mem = BastionMemory("fw-test", mock=True)
        mem.store("fact", "Memory 1")
        mem.store("fact", "Memory 2")
        mem.store("fact", "Memory 3")
        fw = CognitiveFirewall(mem)
        result = fw.check_hash_chain_integrity("fw-test")
        assert result["chain_intact"] is True
        assert result["total_memories"] == 3
        assert result["broken_links"] == 0
        assert result["integrity_score"] == 100.0

    def test_empty_agent(self):
        mem = BastionMemory("fw-test", mock=True)
        fw = CognitiveFirewall(mem)
        result = fw.check_hash_chain_integrity("nonexistent")
        assert result["total_memories"] == 0
        assert result["chain_intact"] is True
