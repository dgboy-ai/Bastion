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
