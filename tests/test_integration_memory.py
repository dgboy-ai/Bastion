"""Integration tests against a live CockroachDB cluster.

Run with: pytest --integration tests/test_integration_memory.py
Requires BASTION_CONN environment variable set to a live CockroachDB connection string.
"""

from __future__ import annotations

import os

import pytest

from bastion import BastionMemory, MemoryRecord


@pytest.mark.integration
class TestRealCockroachDB:
    """Real CockroachDB integration tests for BastionMemory.

    These tests verify that the production DB backend works correctly.
    All tests are skipped unless --integration flag is passed and BASTION_CONN is set.
    """

    @pytest.fixture(autouse=True)
    def _check_integration(self):
        conn = os.environ.get("BASTION_CONN", "")
        if not conn:
            pytest.skip("BASTION_CONN not set — skipping integration test")
        if conn == "postgresql://user:password@localhost:26257/defaultdb?sslmode=disable":
            pytest.skip("BASTION_CONN has placeholder value — set a real connection string")

    @pytest.fixture
    def memory(self):
        conn = os.environ["BASTION_CONN"]
        inst = BastionMemory(
            agent_id="integration-test",
            connection_string=conn,
            mock=False,
        )
        yield inst
        inst.close()

    def test_store_and_search(self, memory):
        """Store a memory and verify it can be searched."""
        record = memory.store("fact", "CockroachDB is a distributed SQL database")
        assert isinstance(record, MemoryRecord)
        assert record.agent_id == "integration-test"
        assert record.memory_type == "fact"
        assert record.content == "CockroachDB is a distributed SQL database"
        assert record.cryptographic_hash is not None

        results = memory.search("CockroachDB")
        assert len(results) >= 1
        assert any("CockroachDB" in r.content for r in results)

    def test_hash_chain_sequential(self, memory):
        """Verify sequential stores form a valid hash chain."""
        r1 = memory.store("fact", "First memory in chain")
        r2 = memory.store("fact", "Second memory in chain")
        r3 = memory.store("fact", "Third memory in chain")

        assert r1.previous_hash is None
        assert r2.previous_hash == r1.cryptographic_hash
        assert r3.previous_hash == r2.cryptographic_hash

    def test_search_by_memory_type(self, memory):
        """Verify filtered search by memory type."""
        memory.store("fact", "Python is great for AI")
        memory.store("fact", "Rust is great for systems")
        memory.store("preference", "Dark mode is preferred")

        facts = memory.search("great", memory_type="fact")
        assert len(facts) == 2
        assert all(r.memory_type == "fact" for r in facts)

        pref = memory.search("preferred", memory_type="preference")
        assert len(pref) == 1
        assert pref[0].memory_type == "preference"

    def test_list_all(self, memory):
        """Verify list_all returns stored memories."""
        memory.store("fact", "First item")
        memory.store("fact", "Second item")

        all_memories = memory.list_all()
        contents = [r.content for r in all_memories]
        assert "First item" in contents
        assert "Second item" in contents

    def test_delete_memory(self, memory):
        """Verify memory deletion removes the record."""
        record = memory.store("fact", "Will be deleted")
        memory_id = record.memory_id

        before = memory.list_all()
        assert any(r.memory_id == memory_id for r in before)

        memory.delete_memory(memory_id)

        after = memory.list_all()
        assert not any(r.memory_id == memory_id for r in after)

    def test_cross_agent_isolation(self, memory):
        """Verify memories from different agents are isolated."""
        conn = os.environ["BASTION_CONN"]
        agent_a = BastionMemory(agent_id="agent-alpha", connection_string=conn, mock=False)
        agent_b = BastionMemory(agent_id="agent-beta", connection_string=conn, mock=False)

        try:
            agent_a.store("fact", "Secret of agent alpha")
            agent_b.store("fact", "Secret of agent beta")

            a_results = agent_a.search("secret")
            b_results = agent_b.search("secret")

            a_content = [r.content for r in a_results]
            b_content = [r.content for r in b_results]

            assert any("agent alpha" in c for c in a_content)
            assert any("agent beta" in c for c in b_content)
            assert not any("agent beta" in c for c in a_content)
        finally:
            agent_a.close()
            agent_b.close()

    def test_audit_log(self, memory):
        """Verify audit log captures store operations."""
        memory.store("fact", "Auditable memory")
        entries = memory.get_audit_log()

        assert len(entries) >= 1
        assert any(
            e.action == "memory_store"
            and e.agent_id == "integration-test"
            for e in entries
        )

    def test_memory_update(self, memory):
        """Verify memory content can be updated."""
        record = memory.store("fact", "Original content")
        mid = record.memory_id

        updated = memory.store(
            "fact", "Updated content",
            memory_id=mid,
        )
        assert updated.memory_id == mid

        results = memory.search("Updated")
        assert any("Updated content" in r.content for r in results)

        old_results = memory.search("Original")
        assert not any("Original content" in r.content for r in old_results)

    def test_export_memory(self, memory):
        """Verify memory export produces valid JSON."""
        memory.store("fact", "Exportable memory")
        exported = memory.export_memory()
        assert isinstance(exported, str)

        import json
        data = json.loads(exported)
        assert "agent_id" in data
        assert data["agent_id"] == "integration-test"
        assert "memories" in data
        assert len(data["memories"]) >= 1
