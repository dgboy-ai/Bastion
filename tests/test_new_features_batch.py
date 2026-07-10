"""Tests for Capture Hooks, Tags, CLI, and Benchmark."""
from __future__ import annotations

import json
import pytest
from pathlib import Path

from bastion.capture_hooks import CaptureHooks, CaptureEvent
from bastion.tags import TagPreprocessor, TagExtraction
from bastion.benchmark import RecallBenchmark, TestCase, BenchmarkResult


class FakeEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._stored: list[dict] = []
        self._memories: list = []

    def store(self, memory_type, content, metadata=None, **kwargs):
        self._stored.append({"type": memory_type, "content": content, "metadata": metadata or {}})
        return type("R", (), {"memory_id": "mem-001", "content": content})()

    def search(self, query, k=5, threshold=0.0, memory_type=None):
        return self._memories[:k]

    def list_all(self, namespace_scope="own", memory_type=None):
        return self._memories


class TestCaptureHooks:
    def setup_method(self):
        self.engine = FakeEngine()
        self.hooks = CaptureHooks(self.engine)

    def test_tool_call(self):
        event = self.hooks.after_tool_call("search", {"q": "test"}, {"n": 5})
        assert event is not None
        assert len(self.engine._stored) == 1

    def test_conversation_turn(self):
        event = self.hooks.after_conversation_turn("user", "Hello world test message")
        assert event is not None

    def test_error(self):
        event = self.hooks.after_error("timeout", "Connection failed")
        assert event is not None
        assert "timeout" in event.content

    def test_disabled(self):
        hooks = CaptureHooks(self.engine, auto_capture_tool_calls=False)
        assert hooks.after_tool_call("t", {}, {}) is None

    def test_dedup(self):
        self.hooks.after_tool_call("t", {"a": 1}, {"b": 2})
        assert self.hooks.after_tool_call("t", {"a": 1}, {"b": 2}) is None


class TestTagPreprocessor:
    def setup_method(self):
        self.pp = TagPreprocessor()

    def test_hashtags(self):
        r = self.pp.extract("Deploy #api to #prod")
        assert "api" in r.hashtags
        assert "prod" in r.hashtags

    def test_mentions(self):
        r = self.pp.extract("Ask @john for help")
        assert "john" in r.mentions

    def test_strip_tags(self):
        clean = self.pp.strip_tags("Deploy #api to @aws !urgent")
        assert "#api" not in clean
        assert "@aws" not in clean
        assert "!urgent" not in clean

    def test_as_metadata(self):
        meta = self.pp.extract_as_metadata("Task #deploy !urgent")
        assert "inline_tags" in meta

    def test_no_tags(self):
        meta = self.pp.extract_as_metadata("Just text")
        assert meta == {}


class TestBenchmark:
    def setup_method(self):
        self.engine = FakeEngine()

    def test_empty_cases(self):
        bench = RecallBenchmark(self.engine)
        result = bench.run([])
        assert result.total_cases == 0

    def test_with_cases(self):
        class Mem:
            def __init__(self, **kwargs):
                for k, v in kwargs.items():
                    setattr(self, k, v)

        self.engine._memories = [
            Mem(memory_id="m1", content="revenue analysis"),
            Mem(memory_id="m2", content="user preferences"),
        ]

        bench = RecallBenchmark(self.engine)
        cases = [
            TestCase(query="revenue", expected_memory_ids=["m1"]),
        ]
        result = bench.run(cases, k=2)
        assert result.total_cases == 1
        assert result.avg_latency_ms >= 0


class TestRecallBenchmarkResult:
    def test_to_dict(self):
        r = BenchmarkResult(
            total_cases=10,
            precision_at_5=0.8,
            mrr=0.9,
        )
        d = r.to_dict()
        assert d["total_cases"] == 10
        assert d["precision_at_5"] == 0.8
