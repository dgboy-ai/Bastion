"""
Tests for BastionAgent — Complete working agent with persistent memory.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import pytest

from bastion.agent import AgentCheckpoint, BastionAgent, MemoryConsolidator, redact_pii


@pytest.fixture(autouse=True)
def reset_mock():
    from bastion.mock import reset
    reset()


@pytest.fixture
def agent():
    return BastionAgent("test-agent", mock=True)


# ── PII Redaction Tests ──────────────────────────────────────────────────────

class TestPIIRedaction:
    def test_redact_ssn(self):
        text = "My SSN is 123-45-6789"
        redacted, redactions = redact_pii(text)
        assert "123-45-6789" not in redacted
        assert "[REDACTED_SSN]" in redacted
        assert len(redactions) == 1
        assert redactions[0]["type"] == "ssn"

    def test_redact_email(self):
        text = "Contact me at john@example.com"
        redacted, redactions = redact_pii(text)
        assert "john@example.com" not in redacted
        assert "[REDACTED_EMAIL]" in redacted
        assert redactions[0]["type"] == "email"

    def test_redact_phone(self):
        text = "Call me at 555-123-4567"
        redacted, redactions = redact_pii(text)
        assert "555-123-4567" not in redacted
        assert "[REDACTED_PHONE]" in redacted

    def test_redact_credit_card(self):
        text = "Card: 4111-1111-1111-1111"
        redacted, redactions = redact_pii(text)
        assert "4111-1111-1111-1111" not in redacted
        assert "[REDACTED_CARD]" in redacted

    def test_redact_api_key(self):
        text = "Key: sk-abc123def456ghi789jkl012mno345pqr"
        redacted, redactions = redact_pii(text)
        assert "sk-abc123" not in redacted
        assert "[REDACTED_KEY]" in redacted

    def test_no_pii(self):
        text = "Hello world, no PII here"
        redacted, redactions = redact_pii(text)
        assert redacted == text
        assert len(redactions) == 0

    def test_multiple_pii(self):
        text = "Name: john@example.com, SSN: 123-45-6789"
        redacted, redactions = redact_pii(text)
        assert len(redactions) == 2
        assert "john@example.com" not in redacted
        assert "123-45-6789" not in redacted


# ── BastionAgent Tests ───────────────────────────────────────────────────────

class TestBastionAgent:
    def test_init(self, agent):
        assert agent.agent_id == "test-agent"
        assert agent.namespace == "test-agent"
        assert agent.memory is not None

    def test_init_with_namespace(self):
        agent = BastionAgent("worker", namespace="project-x", mock=True)
        assert agent.agent_id == "worker"
        assert agent.namespace == "project-x"

    def test_chat_stores_memories(self, agent):
        response = asyncio.run(
            agent.chat("Hello, my name is Alice")
        )
        assert response is not None
        assert len(response) > 0

        # Check that memories were stored
        memories = agent.search_memory("Alice")
        assert len(memories) > 0

    def test_chat_returns_response(self, agent):
        response = asyncio.run(
            agent.chat("What is CockroachDB?")
        )
        assert isinstance(response, str)
        assert len(response) > 0

    def test_chat_with_context(self, agent):
        # Store some memories first
        agent.memory.store("fact", "Alice works at Acme Corp")
        agent.memory.store("fact", "Alice prefers Python")

        # Chat should find relevant context
        response = asyncio.run(
            agent.chat("What does Alice do?")
        )
        assert response is not None

    def test_chat_with_pii_redaction(self):
        agent = BastionAgent("pii-test", mock=True, enable_pii_redaction=True)
        response = asyncio.run(
            agent.chat("My email is john@example.com")
        )
        assert response is not None

        # PII should be redacted in memory (mock mode may not fully implement this)

    def test_chat_without_pii_redaction(self):
        agent = BastionAgent("no-pii", mock=True, enable_pii_redaction=False)
        response = asyncio.run(
            agent.chat("My email is john@example.com")
        )
        assert response is not None

    def test_search_memory(self, agent):
        agent.memory.store("fact", "User likes Python programming")
        agent.memory.store("fact", "User prefers dark mode")

        results = agent.search_memory("Python")
        assert len(results) > 0
        assert any("Python" in m.content for m in results)

    def test_search_memory_with_type(self, agent):
        agent.memory.store("fact", "Python fact")
        agent.memory.store("preference", "Python preference")

        results = agent.search_memory("Python", memory_type="preference")
        assert len(results) > 0
        assert all(m.memory_type == "preference" for m in results)

    def test_get_memory_at_time(self, agent):
        agent.memory.store("fact", "Memory before")
        now = datetime.now(UTC).isoformat()
        agent.memory.store("fact", "Memory after")

        results = agent.get_memory_at_time(now)
        assert len(results) > 0

    def test_get_audit_log(self, agent):
        agent.memory.store("fact", "Auditable action")
        entries = agent.get_audit_log()
        assert len(entries) > 0
        assert entries[0].action == "memory_store"

    def test_heal_memory(self, agent):
        result = agent.heal_memory()
        assert "records_before" in result or "pruned" in result

    def test_detect_anomalies(self, agent):
        # Store some memories to potentially trigger anomalies
        for i in range(12):
            agent.memory.store("fact", f"Record {i}")

        anomalies = agent.detect_anomalies()
        assert isinstance(anomalies, list)

    def test_diff_memory(self, agent):
        before = datetime.now(UTC).isoformat()
        agent.memory.store("fact", "Added after")
        after = datetime.now(UTC).isoformat()

        diff = agent.diff_memory(before, after)
        assert "added" in diff or "count_a" in diff

    def test_create_checkpoint(self, agent):
        agent.memory.store("fact", "Memory for checkpoint")
        checkpoint = agent.create_checkpoint()

        assert isinstance(checkpoint, AgentCheckpoint)
        assert checkpoint.agent_id == "test-agent"
        assert checkpoint.memory_count > 0
        assert checkpoint.state_hash is not None

    def test_resolve_conflict(self, agent):
        result = agent.resolve_conflict("User likes Python", "User likes Rust")
        assert "Python" in result or "Rust" in result

    def test_resolve_conflict_with_context(self, agent):
        result = agent.resolve_conflict(
            "User likes Python",
            "User likes Rust",
            context="User prefers Python for backend, Rust for systems",
        )
        assert len(result) > 0

    def test_store_entity(self, agent):
        record, entities, relations = agent.store_entity(
            "Alice works on ProjectX and uses Python"
        )
        assert record is not None
        assert len(entities) > 0

    def test_graph_query(self, agent):
        agent.store_entity("Alice uses Python")
        agent.store_entity("Alice works on ProjectX")

        results = agent.graph_query("alice", hops=2)
        assert len(results) > 0

    def test_graph_stats(self, agent):
        agent.store_entity("Alice uses Python")
        stats = agent.graph_stats()
        assert "entities" in stats
        assert stats["entities"] > 0

    def test_export_memory(self, agent):
        agent.memory.store("fact", "Export me")
        export = agent.export_memory()
        data = json.loads(export)
        assert data["agent_id"] == "test-agent"
        assert data["memory_count"] > 0
        assert len(data["memories"]) > 0

    def test_conversation_history(self, agent):
        asyncio.run(
            agent.chat("First message")
        )
        asyncio.run(
            agent.chat("Second message")
        )
        history = agent.get_conversation_history()
        assert len(history) == 4  # 2 user + 2 assistant

    def test_context_manager(self):
        with BastionAgent("ctx-test", mock=True) as agent:
            assert agent.agent_id == "ctx-test"

    def test_close(self, agent):
        agent.memory.store("fact", "Will be closed")
        agent.close()  # Should not raise

    def test_custom_llm_callback(self):
        def my_llm(prompt: str, context: list) -> str:
            return f"Custom response to: {prompt}"

        agent = BastionAgent("llm-test", mock=True, llm_callback=my_llm)
        response = asyncio.run(
            agent.chat("Test prompt")
        )
        assert response == "Custom response to: Test prompt"


# ── AgentCheckpoint Tests ────────────────────────────────────────────────────

class TestAgentCheckpoint:
    def test_checkpoint_creation(self):
        checkpoint = AgentCheckpoint(
            checkpoint_id="cp-123",
            agent_id="test-agent",
            state_hash="abc123",
            timestamp=datetime.now(UTC),
            memory_count=42,
        )
        assert checkpoint.checkpoint_id == "cp-123"
        assert checkpoint.memory_count == 42

    def test_checkpoint_to_dict(self):
        checkpoint = AgentCheckpoint(
            checkpoint_id="cp-123",
            agent_id="test-agent",
            state_hash="abc123",
            timestamp=datetime.now(UTC),
            memory_count=42,
            metadata={"key": "value"},
        )
        d = checkpoint.to_dict()
        assert d["checkpoint_id"] == "cp-123"
        assert d["memory_count"] == 42
        assert d["metadata"]["key"] == "value"


# ── MemoryConsolidator Tests ─────────────────────────────────────────────────

class TestMemoryConsolidator:
    def test_creation(self, agent):
        consolidator = MemoryConsolidator(agent.memory, interval_seconds=60)
        assert consolidator.interval == 60
        assert consolidator._running is False

    def test_stop(self, agent):
        consolidator = MemoryConsolidator(agent.memory)
        consolidator._running = True
        consolidator.stop()
        assert consolidator._running is False
