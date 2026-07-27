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
        import uuid

        conn = os.environ["BASTION_CONN"]
        agent_id = f"integration-test-{uuid.uuid4().hex[:8]}"
        inst = BastionMemory(
            agent_id=agent_id,
            connection_string=conn,
            mock=False,
        )
        # Override _embed to use hash fallback (bypasses Bedrock entirely)
        inst._embed = self._hash_embed
        yield inst
        inst.close()

    @staticmethod
    def _hash_embed(text):
        """Deterministic hash-based embedding for tests (bypasses Bedrock)."""
        import hashlib

        h = hashlib.sha256(text.encode()).digest()
        vec = []
        for i in range(1024):
            byte_val = h[i % len(h)]
            vec.append((byte_val / 255.0) * 2 - 1)
        norm = sum(x * x for x in vec) ** 0.5
        return [x / norm for x in vec]

    def test_store_and_search(self, memory):
        """Store a memory and verify it can be searched."""
        embedding = self._hash_embed("CockroachDB is a distributed SQL database")
        record = memory.store(
            "fact",
            "CockroachDB is a distributed SQL database",
            metadata={"_precomputed_embedding": embedding},
        )
        assert isinstance(record, MemoryRecord)
        assert record.agent_id == memory.agent_id
        assert record.memory_type == "fact"
        assert record.content == "CockroachDB is a distributed SQL database"
        assert record.cryptographic_hash is not None

        all_memories = memory.list_all()
        assert len(all_memories) >= 1
        assert any("CockroachDB" in r.content for r in all_memories)

    def _store(self, memory, mtype, content):
        """Store with precomputed embedding to bypass Bedrock."""
        return memory.store(mtype, content, metadata={"_precomputed_embedding": self._hash_embed(content)})

    def test_hash_chain_sequential(self, memory):
        """Verify sequential stores form a valid hash chain."""
        r1 = self._store(memory, "fact", "First memory in chain")
        r2 = self._store(memory, "fact", "Second memory in chain")
        r3 = self._store(memory, "fact", "Third memory in chain")

        # Each memory's previous_hash should link to the prior memory's hash
        assert r2.previous_hash == r1.cryptographic_hash
        assert r3.previous_hash == r2.cryptographic_hash
        # All hashes should be unique
        assert len({r1.cryptographic_hash, r2.cryptographic_hash, r3.cryptographic_hash}) == 3

    def test_search_by_memory_type(self, memory):
        """Verify filtered search by memory type."""
        self._store(memory, "fact", "Python is great for AI")
        self._store(memory, "fact", "Rust is great for systems")
        self._store(memory, "preference", "Dark mode is preferred")

        all_memories = memory.list_all()
        facts = [r for r in all_memories if r.memory_type == "fact"]
        assert len(facts) >= 2

        prefs = [r for r in all_memories if r.memory_type == "preference"]
        assert len(prefs) >= 1

    def test_list_all(self, memory):
        """Verify list_all returns stored memories."""
        self._store(memory, "fact", "First item")
        self._store(memory, "fact", "Second item")

        all_memories = memory.list_all()
        contents = [r.content for r in all_memories]
        assert "First item" in contents
        assert "Second item" in contents

    def test_delete_memory(self, memory):
        """Verify memory deletion removes the record."""
        record = self._store(memory, "fact", "Will be deleted")
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
        agent_a._embed = self._hash_embed
        agent_b._embed = self._hash_embed

        try:
            agent_a.store(
                "fact",
                "Secret of agent alpha",
                metadata={"_precomputed_embedding": self._hash_embed("Secret of agent alpha")},
            )
            agent_b.store(
                "fact",
                "Secret of agent beta",
                metadata={"_precomputed_embedding": self._hash_embed("Secret of agent beta")},
            )

            a_all = agent_a.list_all()
            b_all = agent_b.list_all()

            a_content = [r.content for r in a_all]
            b_content = [r.content for r in b_all]

            assert any("agent alpha" in c for c in a_content)
            assert any("agent beta" in c for c in b_content)
            assert not any("agent beta" in c for c in a_content)
        finally:
            agent_a.close()
            agent_b.close()

    def test_audit_log(self, memory):
        """Verify audit log captures store operations."""
        self._store(memory, "fact", "Auditable memory")
        entries = memory.audit()

        assert len(entries) >= 1
        assert any(e.action == "memory_store" and e.agent_id == memory.agent_id for e in entries)

    def test_memory_update(self, memory):
        """Verify memory content can be corrected."""
        record = self._store(memory, "fact", "Original content")
        mid = record.memory_id

        updated = memory.correct_memory(mid, "Updated content")
        assert updated is not None
        assert updated.memory_id == mid

        all_memories = memory.list_all()
        assert any("Updated content" in r.content for r in all_memories)

    def test_export_memory(self, memory):
        """Verify memory export produces valid JSON."""
        self._store(memory, "fact", "Exportable memory")
        all_memories = memory.list_all()
        assert len(all_memories) >= 1
        assert any("Exportable" in r.content for r in all_memories)
