"""Tests for expanded CaptureHooks, ProceduralMemory, and Private Tags."""
from __future__ import annotations

import pytest

from bastion.capture_hooks import CaptureHooks, CaptureEvent
from bastion.procedural import ProceduralMemory, WorkflowPattern, DecisionPattern
from bastion.tags import TagPreprocessor, TagExtraction


class FakeEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._stored = []
        self._memories = []

    def store(self, memory_type, content, metadata=None, **kwargs):
        record = type("R", (), {
            "memory_id": f"mem-{len(self._stored)}",
            "content": content,
            "memory_type": memory_type,
            "metadata": metadata or {},
        })()
        self._stored.append(record)
        self._memories.append(record)
        return record

    def search(self, query, k=5, threshold=0.0, memory_type=None):
        results = list(self._memories)
        if memory_type:
            results = [m for m in results if getattr(m, "memory_type", "") == memory_type]
        return results[:k]

    def list_all(self, namespace_scope="own", memory_type=None):
        results = list(self._memories)
        if memory_type:
            results = [m for m in results if getattr(m, "memory_type", "") == memory_type]
        return results


class TestExpandedCaptureHooks:
    def setup_method(self):
        self.engine = FakeEngine()
        self.hooks = CaptureHooks(self.engine)

    def test_after_file_read(self):
        event = self.hooks.after_file_read("/src/app.py", "import flask")
        assert event is not None
        assert event.event_type == "file_read"
        assert "/src/app.py" in event.content

    def test_after_file_write(self):
        event = self.hooks.after_file_write("/src/new.py", "def hello(): pass")
        assert event is not None
        assert event.event_type == "file_write"

    def test_after_command(self):
        event = self.hooks.after_command("pytest tests/", exit_code=0, output_preview="12 passed")
        assert event is not None
        assert "pytest" in event.content

    def test_after_checkpoint(self):
        event = self.hooks.after_checkpoint("cp-001", "Saved before deploy")
        assert event is not None
        assert event.event_type == "checkpoint"

    def test_after_network_request(self):
        event = self.hooks.after_network_request("https://api.example.com/data", "GET", 200)
        assert event is not None
        assert "200" in event.content

    def test_after_db_query(self):
        event = self.hooks.after_db_query("SELECT * FROM users", rows_affected=5)
        assert event is not None
        assert "SELECT" in event.content


class TestProceduralMemory:
    def setup_method(self):
        self.engine = FakeEngine()
        self.proc = ProceduralMemory(self.engine)

    def test_record_workflow(self):
        result = self.proc.record_workflow("deploy", ["lint", "test", "build", "deploy"])
        assert result["name"] == "deploy"
        assert result["steps"] == 4
        assert len(self.engine._stored) == 1

    def test_find_similar_workflows(self):
        self.proc.record_workflow("deploy", ["lint", "test", "build", "deploy"])
        self.proc.record_workflow("release", ["bump", "tag", "push"])
        results = self.proc.find_similar_workflows("deploy to production")
        assert len(results) >= 0

    def test_get_workflow_by_name(self):
        self.proc.record_workflow("test", ["run pytest", "check coverage"])
        wf = self.proc.get_workflow_by_name("test")
        assert wf is not None
        assert wf.name == "test"

    def test_record_decision(self):
        result = self.proc.record_decision("file > 1000 lines", "split into modules", 0.9)
        assert result["condition"] == "file > 1000 lines"
        assert len(self.engine._stored) == 1

    def test_get_stats(self):
        self.proc.record_workflow("deploy", ["lint", "test"])
        self.proc.record_decision("error", "retry with backoff")
        stats = self.proc.get_stats()
        assert stats["workflows"] == 1
        assert stats["decisions"] == 1


class TestPrivateTags:
    def setup_method(self):
        self.pp = TagPreprocessor()

    def test_extract_private(self):
        r = self.pp.extract("Hello <private>secret data</private> world")
        assert r.has_private is True
        assert "secret data" in r.private_content

    def test_strip_private(self):
        clean = self.pp.strip_tags("Hello <private>API_KEY=abc123</private> world")
        assert "API_KEY" not in clean
        assert "Hello" in clean
        assert "world" in clean

    def test_no_private(self):
        r = self.pp.extract("No private content here")
        assert r.has_private is False
        assert r.private_content == []


class TestWorkflowPattern:
    def test_to_dict(self):
        wp = WorkflowPattern(name="deploy", steps=["a", "b"], frequency=5)
        d = wp.to_dict()
        assert d["name"] == "deploy"
        assert d["frequency"] == 5


class TestDecisionPattern:
    def test_to_dict(self):
        dp = DecisionPattern(condition="if error", action="retry", confidence=0.9)
        d = dp.to_dict()
        assert d["condition"] == "if error"
        assert d["confidence"] == 0.9
