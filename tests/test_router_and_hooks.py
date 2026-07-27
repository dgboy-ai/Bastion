"""Tests for Auto-Routing Recall and expanded Capture Hooks."""

from __future__ import annotations

from datetime import UTC, datetime

from bastion.capture_hooks import CaptureHooks
from bastion.router import RecallRouter


class FakeEngine:
    def __init__(self):
        self.agent_id = "test-agent"
        self._memories = []
        self._stored = []

    def list_all(self, namespace_scope="own", memory_type=None):
        return list(self._memories)

    def search(self, query, k=5, threshold=0.0, memory_type=None):
        return self._memories[:k]

    def store(self, memory_type, content, metadata=None, **kwargs):
        self._stored.append({"type": memory_type, "content": content})
        return type("R", (), {"memory_id": "m1", "content": content})()

    def store_audit(self, action, details, agent_id=None):
        pass


class TestQueryClassification:
    def setup_method(self):
        self.engine = FakeEngine()
        self.router = RecallRouter(self.engine)

    def test_temporal_query(self):
        c = self.router.classify("What happened last week?")
        assert c.query_type == "temporal"
        assert c.confidence >= 0.2

    def test_relationship_query(self):
        c = self.router.classify("Who is connected to Alice?")
        assert c.query_type == "relationship"
        assert c.confidence >= 0.2

    def test_entity_query(self):
        c = self.router.classify("Tell me about CockroachDB")
        assert c.query_type == "entity"
        assert c.confidence >= 0.2

    def test_summary_query(self):
        c = self.router.classify("Give me a summary of the project")
        assert c.query_type == "summary"
        assert c.confidence >= 0.2

    def test_unknown_query_falls_back(self):
        c = self.router.classify("xyz")
        assert c.query_type == "multi_signal"


class TestRecallRouter:
    def setup_method(self):
        self.engine = FakeEngine()
        self.engine._memories = [
            _mem("User prefers Python for data science", memory_id="m1"),
            _mem("Deployment pipeline uses GitHub Actions", memory_id="m2"),
            _mem("Q2 revenue showed growth in US regions", memory_id="m3"),
        ]
        self.router = RecallRouter(self.engine)

    def test_recall_returns_results(self):
        result = self.router.recall("Python preferences")
        assert result.total_results > 0
        assert result.strategy in ("keyword", "entity", "temporal", "summary", "multi_signal")

    def test_recall_has_classification(self):
        result = self.router.recall("What happened last week?")
        assert result.classification.query_type == "temporal"

    def test_recall_has_latency(self):
        result = self.router.recall("test query")
        assert result.latency_ms >= 0

    def test_recall_empty_query(self):
        result = self.router.recall("")
        assert result.total_results == 0


class TestExpandedCaptureHooks:
    def setup_method(self):
        self.engine = FakeEngine()
        self.hooks = CaptureHooks(self.engine)

    def test_after_session_start(self):
        event = self.hooks.after_session_start("sess-001", "User started coding")
        assert event is not None
        assert event.event_type == "session_start"
        assert "sess-001" in event.content

    def test_after_session_end(self):
        event = self.hooks.after_session_end("sess-001", "Session completed successfully")
        assert event is not None
        assert event.event_type == "session_end"

    def test_after_subagent_start(self):
        event = self.hooks.after_subagent_start("sub-001", "Research competitor features")
        assert event is not None
        assert event.event_type == "subagent_start"
        assert "sub-001" in event.content

    def test_total_hooks_count(self):
        """Verify we have 12 hooks total."""
        hook_methods = [m for m in dir(self.hooks) if m.startswith("after_")]
        assert len(hook_methods) == 12, f"Expected 12 hooks, got {len(hook_methods)}: {hook_methods}"


class TestMemoryTTL:
    def test_store_with_expires_in(self):
        FakeEngine()
        type(
            "M",
            (),
            {
                "agent_id": "test",
                "namespace": "test",
                "_mock": True,
                "_bedrock_cb": None,
                "_retry_engine": None,
                "_guard": type("G", (), {"check": lambda self, c: type("R", (), {"is_safe": True})()})(),
                "_pool": None,
                "_pool_lock": None,
                "_rls_enabled": False,
                "compliance_mode": None,
                "_conn_str": None,
            },
        )()
        # Just verify the parameter exists in the signature
        import inspect

        from bastion.memory import BastionMemory

        sig = inspect.signature(BastionMemory.store)
        assert "expires_in_seconds" in sig.parameters


def _mem(content, memory_id="m1", importance=5.0, metadata=None):
    return type(
        "M",
        (),
        {
            "memory_id": memory_id,
            "content": content,
            "importance_score": importance,
            "is_pinned": False,
            "memory_type": "fact",
            "created_at": datetime.now(UTC),
            "access_count": 0,
            "metadata": metadata or {},
        },
    )()
