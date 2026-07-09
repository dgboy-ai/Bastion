"""Tests for the mem0-compatible bridge adapter."""

from __future__ import annotations

from bastion.bridge_mem0 import BastionMem0Bridge
from bastion.mock import reset


class TestBastionMem0Bridge:
    def setup_method(self):
        reset()
        self.bridge = BastionMem0Bridge("test-agent", mock=True)

    def test_add_string_infer_false(self):
        result = self.bridge.add("hello world", infer=False)
        assert len(result["results"]) == 1
        assert result["results"][0]["event"] == "ADD"
        assert result["results"][0]["memory"] == "hello world"

    def test_add_list_infer_false(self):
        result = self.bridge.add([
            {"role": "user", "content": "msg1"},
            {"role": "assistant", "content": "msg2"},
        ], infer=False)
        assert len(result["results"]) == 2

    def test_add_infer_true_no_infer_fn(self):
        import pytest
        with pytest.raises(NotImplementedError):
            self.bridge.add("test", infer=True)

    def test_add_with_infer_fn(self):
        def fake_infer(text):
            return [{"content": f"fact: {text}"}]
        bridge = BastionMem0Bridge("test-agent", mock=True, infer_fn=fake_infer)
        result = bridge.add("the user likes python", infer=True)
        assert len(result["results"]) == 1
        assert "python" in result["results"][0]["memory"]

    def test_search(self):
        self.bridge.add("Python is great", infer=False)
        self.bridge.add("TypeScript is also good", infer=False)
        result = self.bridge.search("Python", top_k=3, threshold=0.0)
        assert len(result["results"]) >= 1

    def test_get(self):
        add_result = self.bridge.add("unique memory", infer=False)
        mem_id = add_result["results"][0]["id"]
        result = self.bridge.get(mem_id)
        assert result is not None
        assert result["memory"] == "unique memory"

    def test_get_missing(self):
        assert self.bridge.get("nonexistent") is None

    def test_get_all(self):
        self.bridge.add("a", infer=False)
        self.bridge.add("b", infer=False)
        result = self.bridge.get_all()
        assert len(result["results"]) == 2

    def test_update(self):
        add_result = self.bridge.add("original", infer=False)
        mem_id = add_result["results"][0]["id"]
        result = self.bridge.update(mem_id, data="updated")
        assert result["message"] == "Memory updated successfully!"

    def test_delete(self):
        add_result = self.bridge.add("to delete", infer=False)
        mem_id = add_result["results"][0]["id"]
        result = self.bridge.delete(mem_id)
        assert result["message"] == "Memory deleted successfully!"
        assert self.bridge.get(mem_id) is None

    def test_delete_missing(self):
        import pytest
        with pytest.raises(ValueError):
            self.bridge.delete("nonexistent")

    def test_delete_all(self):
        self.bridge.add("x", infer=False)
        self.bridge.add("y", infer=False)
        self.bridge.delete_all(agent_id="test-agent")
        assert len(self.bridge.get_all()["results"]) == 0

    def test_reset(self):
        self.bridge.add("keep me", infer=False)
        self.bridge.reset()
        assert len(self.bridge.get_all()["results"]) == 0


# ---------------------------------------------------------------------------
# DB-mode tests (mocked connection pool)
# ---------------------------------------------------------------------------


def _make_db_bridge():
    from unittest.mock import MagicMock

    memory = MagicMock()
    memory._mock = False
    memory.is_mock = False
    memory.agent_id = "db-test"
    memory.get_memory.return_value = None
    memory.delete_memory.return_value = True
    memory.list_all.return_value = []

    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    pool = MagicMock()
    pool.acquire.return_value = conn
    memory.get_pool.return_value = pool

    bridge = BastionMem0Bridge.__new__(BastionMem0Bridge)
    bridge._memory = memory
    bridge._agent_id = "db-test"
    bridge._infer_fn = None
    return bridge, memory, conn, cur


class TestBastionMem0BridgeDB:
    def test_delete_db_calls_memory_delete(self):
        bridge, memory, conn, cur = _make_db_bridge()
        memory.get_memory.return_value = {"memory_id": "mem-1", "agent_id": "db-test"}
        memory.delete_memory.return_value = True

        result = bridge.delete("mem-1")
        assert result["message"] == "Memory deleted successfully!"
        memory.delete_memory.assert_called_once_with("mem-1")

    def test_delete_db_not_found(self):
        bridge, memory, conn, cur = _make_db_bridge()
        memory.delete_memory.return_value = False

        import pytest
        with pytest.raises(ValueError, match="not found"):
            bridge.delete("nonexistent")

    def test_delete_all_db_executes_sql(self):
        bridge, memory, conn, cur = _make_db_bridge()
        cur.rowcount = 3

        result = bridge.delete_all(agent_id="some-agent")
        cur.execute.assert_any_call(
            "DELETE FROM agent_memory WHERE agent_id = %s",
            ("some-agent",),
        )
        conn.commit.assert_called()
        assert "3 memories deleted" in result["message"]

    def test_update_db(self):
        bridge, memory, conn, cur = _make_db_bridge()

        # Simulate get() returning an existing memory
        from bastion.models import MemoryRecord
        memory.get_memory.return_value = MemoryRecord(
            memory_id="mem-1", agent_id="db-test",
            content="original", memory_type="fact",
        )
        memory.delete_memory.return_value = True
        new_rec = MemoryRecord(memory_id="new-id", agent_id="db-test", content="updated")
        memory.store.return_value = new_rec

        result = bridge.update("mem-1", data="updated")
        assert result["message"] == "Memory updated successfully!"
        assert result["new_id"] == "new-id"

    def test_update_db_no_changes(self):
        bridge, memory, conn, cur = _make_db_bridge()
        result = bridge.update("mem-1")
        assert result["message"] == "No updates provided"

    def test_update_db_not_found(self):
        bridge, memory, conn, cur = _make_db_bridge()
        memory.get_memory.return_value = None

        import pytest
        with pytest.raises(ValueError, match="not found"):
            bridge.update("mem-1", data="updated")

    def test_delete_all_db_cross_agent(self):
        bridge, memory, conn, cur = _make_db_bridge()
        cur.rowcount = 2

        result = bridge.delete_all(agent_id="other-agent")
        cur.execute.assert_any_call(
            "DELETE FROM agent_memory WHERE agent_id = %s",
            ("other-agent",),
        )
        assert "2 memories deleted" in result["message"]

    def test_delete_all_mock_cross_agent(self):
        from bastion.mock import _agent_data, reset
        reset()
        _agent_data["other-agent"] = [
            {"memory_id": "m1", "agent_id": "other-agent", "content": "a"},
            {"memory_id": "m2", "agent_id": "other-agent", "content": "b"},
        ]
        bridge = BastionMem0Bridge("test-agent", mock=True)
        result = bridge.delete_all(agent_id="other-agent")
        assert "2 memories deleted" in result["message"]
        assert "other-agent" not in _agent_data
