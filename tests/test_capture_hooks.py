"""Tests for Capture Hooks."""
from __future__ import annotations

import pytest
from datetime import UTC, datetime

from bastion.capture_hooks import CaptureHooks, CaptureEvent


class FakeEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._stored: list[dict] = []

    def store(self, memory_type, content, metadata=None, **kwargs):
        self._stored.append({"type": memory_type, "content": content, "metadata": metadata or {}})
        return MagicMock(memory_id="mem-001", content=content)


class MagicMock:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class TestCaptureEvent:
    def test_to_dict(self):
        e = CaptureEvent(event_type="tool_call", content="test", metadata={"key": "val"})
        d = e.to_dict()
        assert d["event_type"] == "tool_call"
        assert d["metadata"]["key"] == "val"
        assert "timestamp" in d


class TestCaptureHooks:
    def setup_method(self):
        self.engine = FakeEngine()
        self.hooks = CaptureHooks(self.engine)

    def test_after_tool_call(self):
        event = self.hooks.after_tool_call("memory_search", {"query": "test"}, {"results": 5})
        assert event is not None
        assert event.event_type == "tool_call"
        assert "memory_search" in event.content
        assert len(self.engine._stored) == 1

    def test_after_tool_call_disabled(self):
        hooks = CaptureHooks(self.engine, auto_capture_tool_calls=False)
        event = hooks.after_tool_call("test", {}, {})
        assert event is None
        assert len(self.engine._stored) == 0

    def test_after_conversation_turn(self):
        event = self.hooks.after_conversation_turn("user", "What is CockroachDB?")
        assert event is not None
        assert event.event_type == "conversation_turn"
        assert "[user]" in event.content

    def test_after_conversation_turn_short_content(self):
        event = self.hooks.after_conversation_turn("user", "hi")
        assert event is None  # Too short

    def test_after_error(self):
        event = self.hooks.after_error("timeout", "Connection timed out", {"host": "db.example.com"})
        assert event is not None
        assert event.event_type == "error"
        assert "timeout" in event.content

    def test_deduplication(self):
        self.hooks.after_tool_call("test_tool", {"a": 1}, {"b": 2})
        # Same tool call again within dedup window
        event2 = self.hooks.after_tool_call("test_tool", {"a": 1}, {"b": 2})
        assert event2 is None  # Should be deduplicated

    def test_stats(self):
        self.hooks.after_tool_call("test", {"q": "x"}, {"r": 1})
        stats = self.hooks.get_stats()
        assert stats["capture_count"] == 1
        assert stats["recent_events"] == 1

    def test_empty_arguments(self):
        event = self.hooks.after_tool_call("test_tool")
        assert event is not None
        assert "test_tool" in event.content
