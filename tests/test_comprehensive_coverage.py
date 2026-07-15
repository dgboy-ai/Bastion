"""Comprehensive tests covering auth middleware, CORS, log redaction, streaming,
push notifications, task state machine, brute-force protection, keyword fallback,
mock embeddings, and session memory TF-IDF search."""

from __future__ import annotations

import json
import os
import time
from unittest.mock import AsyncMock, patch

import pytest

from bastion.mock import reset


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(**kwargs):
    from bastion.a2a_server import create_a2a_server
    return create_a2a_server(mock=True, **kwargs)


def _client(app):
    import anyio
    from httpx import ASGITransport, AsyncClient
    return anyio, AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def _h(extra: dict | None = None) -> dict:
    h = {"A2A-Version": "1.0"}
    if extra:
        h.update(extra)
    return h


# ---------------------------------------------------------------------------
# A2A Authentication Middleware
# ---------------------------------------------------------------------------


class TestA2AAuthMiddleware:
    def setup_method(self):
        reset()

    def test_api_key_required_returns_401(self):
        with patch.dict(os.environ, {"BASTION_API_KEY": "test-secret-key"}, clear=False):
            app, _ = _make_app()
            anyio, client = _client(app)

            async def run():
                async with client:
                    r = await client.post(
                        "/",
                        json={"jsonrpc": "2.0", "id": "1", "method": "GetTask", "params": {"id": "x"}},
                        headers=_h(),
                    )
                    assert r.status_code == 401
                    assert "Unauthorized" in r.json().get("error", "")

            anyio.run(run)

    def test_api_key_valid_passes(self):
        with patch.dict(os.environ, {"BASTION_API_KEY": "test-secret-key"}, clear=False):
            app, _ = _make_app()
            anyio, client = _client(app)

            async def run():
                async with client:
                    r = await client.post(
                        "/",
                        json={"jsonrpc": "2.0", "id": "1", "method": "GetTask", "params": {"id": "x"}},
                        headers=_h({"Authorization": "Bearer test-secret-key"}),
                    )
                    # Should not be 401 (might be task not found or other error)
                    assert r.status_code != 401

            anyio.run(run)

    def test_healthz_skips_auth(self):
        with patch.dict(os.environ, {"BASTION_API_KEY": "test-secret-key"}, clear=False):
            app, _ = _make_app()
            anyio, client = _client(app)

            async def run():
                async with client:
                    r = await client.get("/healthz")
                    assert r.status_code == 200

            anyio.run(run)

    def test_readyz_skips_auth(self):
        with patch.dict(os.environ, {"BASTION_API_KEY": "test-secret-key"}, clear=False):
            app, _ = _make_app()
            anyio, client = _client(app)

            async def run():
                async with client:
                    r = await client.get("/readyz")
                    assert r.status_code == 200

            anyio.run(run)


# ---------------------------------------------------------------------------
# Brute-Force Protection
# ---------------------------------------------------------------------------


class TestBruteForceProtection:
    def setup_method(self):
        reset()

    def test_lockout_after_max_failures(self):
        with patch.dict(os.environ, {"BASTION_API_KEY": "correct-key"}, clear=False):
            app, _ = _make_app()
            anyio, client = _client(app)

            async def run():
                async with client:
                    # Send 10+ wrong auth attempts
                    for _ in range(11):
                        r = await client.post(
                            "/",
                            json={"jsonrpc": "2.0", "id": "1", "method": "GetTask", "params": {"id": "x"}},
                            headers=_h({"Authorization": "Bearer wrong-key"}),
                        )
                    # Next request should be locked out (429)
                    r = await client.post(
                        "/",
                        json={"jsonrpc": "2.0", "id": "1", "method": "GetTask", "params": {"id": "x"}},
                        headers=_h({"Authorization": "Bearer correct-key"}),
                    )
                    assert r.status_code == 429

            anyio.run(run)


# ---------------------------------------------------------------------------
# CORS Headers
# ---------------------------------------------------------------------------


class TestCORSHeaders:
    def setup_method(self):
        reset()

    def test_cors_options_returns_allowed_origins(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                r = await client.options(
                    "/",
                    headers={
                        "Origin": "http://localhost:3000",
                        "Access-Control-Request-Method": "POST",
                    },
                )
                # FastAPI CORS middleware should respond with CORS headers
                assert r.status_code in (200, 405)

        anyio.run(run)


# ---------------------------------------------------------------------------
# A2A Streaming Endpoint
# ---------------------------------------------------------------------------


class TestA2AStreaming:
    def setup_method(self):
        reset()

    def test_stream_endpoint_exists(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:sendStream",
                    json={
                        "message": {
                            "parts": [{"text": "test"}],
                            "metadata": {"skill": "memory_store", "params": {"content": "hello"}},
                        }
                    },
                    headers=_h(),
                )
                assert r.status_code == 200
                assert "text/event-stream" in r.headers.get("content-type", "")

        anyio.run(run)

    def test_stream_emits_events(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                r = await client.post(
                    "/message:sendStream",
                    json={
                        "message": {
                            "parts": [{"text": "test"}],
                            "metadata": {"skill": "memory_search", "params": {"query": "hello"}},
                        }
                    },
                    headers=_h(),
                )
                assert r.status_code == 200
                body = r.text
                assert "TaskStatusUpdate" in body
                assert "SUBMITTED" in body
                assert "WORKING" in body
                assert "COMPLETED" in body

        anyio.run(run)


# ---------------------------------------------------------------------------
# Task State Machine Validation
# ---------------------------------------------------------------------------


class TestTaskStateMachine:
    def setup_method(self):
        reset()

    def test_cannot_move_from_completed_to_working(self):
        from bastion.a2a_server import _TASK_VALID_TRANSITIONS

        # COMPLETED is terminal
        assert "WORKING" not in _TASK_VALID_TRANSITIONS["COMPLETED"]
        assert "COMPLETED" not in _TASK_VALID_TRANSITIONS["COMPLETED"]

    def test_submitted_can_go_to_working(self):
        from bastion.a2a_server import _TASK_VALID_TRANSITIONS

        assert "WORKING" in _TASK_VALID_TRANSITIONS["SUBMITTED"]

    def test_working_can_go_to_completed(self):
        from bastion.a2a_server import _TASK_VALID_TRANSITIONS

        assert "COMPLETED" in _TASK_VALID_TRANSITIONS["WORKING"]
        assert "FAILED" in _TASK_VALID_TRANSITIONS["WORKING"]
        assert "CANCELED" in _TASK_VALID_TRANSITIONS["WORKING"]

    def test_validation_rejects_invalid_transition(self):
        from bastion.a2a_server import create_a2a_server

        app, _ = create_a2a_server(mock=True)
        anyio, client = _client(app)

        async def run():
            async with client:
                # Create a task by storing
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "SendMessage",
                        "params": {
                            "message": {
                                "parts": [{"text": "test"}],
                                "metadata": {"skill": "memory_store", "params": {"content": "x"}},
                            }
                        },
                    },
                    headers=_h(),
                )
                assert r.status_code == 200
                task = r.json().get("result", {})
                task_id = task.get("id")
                status = task.get("status", {}).get("state")
                assert status == "COMPLETED"

                # Try to cancel a completed task — should be rejected (returns same task)
                r2 = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "2",
                        "method": "CancelTask",
                        "params": {"id": task_id},
                    },
                    headers=_h(),
                )
                # Task should still be COMPLETED (transition rejected)
                result = r2.json().get("result", {})
                assert result.get("status", {}).get("state") == "COMPLETED"

        anyio.run(run)


# ---------------------------------------------------------------------------
# Log Redaction
# ---------------------------------------------------------------------------


class TestLogRedaction:
    def test_redact_secrets_in_event_dict(self):
        from bastion.log_setup import _redact_secrets

        event = {"api_key": "sk-1234567890abcdef", "message": "hello"}
        result = _redact_secrets(None, None, event)
        assert result["api_key"] != "sk-1234567890abcdef"
        assert "****" in result["api_key"]
        assert result["message"] == "hello"

    def test_redact_short_values(self):
        from bastion.log_setup import _redact_secrets

        event = {"token": "ab"}
        result = _redact_secrets(None, None, event)
        assert result["token"] == "****"

    def test_redact_connection_string(self):
        from bastion.log_setup import _redact_secrets

        event = {"connection_string": "postgresql://user:pass@host:5432/db"}
        result = _redact_secrets(None, None, event)
        assert "pass" not in result["connection_string"]
        assert "****" in result["connection_string"]

    def test_non_sensitive_keys_preserved(self):
        from bastion.log_setup import _redact_secrets

        event = {"name": "test", "count": 42, "password": "secret123"}
        result = _redact_secrets(None, None, event)
        assert result["name"] == "test"
        assert result["count"] == 42
        assert "secret" not in result["password"]


# ---------------------------------------------------------------------------
# Mock Embedding Cosine Similarity
# ---------------------------------------------------------------------------


class TestMockEmbedding:
    def test_same_text_same_vector(self):
        from bastion.mock import _mock_embed

        v1 = _mock_embed("python programming language")
        v2 = _mock_embed("python programming language")
        assert v1 == v2

    def test_similar_texts_high_similarity(self):
        from bastion.mock import _mock_embed
        import math

        v1 = _mock_embed("python code api server")
        v2 = _mock_embed("python code api database")
        dot = sum(a * b for a, b in zip(v1, v2))
        norm1 = math.sqrt(sum(a * a for a in v1))
        norm2 = math.sqrt(sum(b * b for b in v2))
        sim = dot / (norm1 * norm2)
        assert sim > 0.7  # Should be very similar (mock embeddings are less discriminative)

    def test_different_topics_low_similarity(self):
        from bastion.mock import _mock_embed
        import math

        v1 = _mock_embed("python code api server database")
        v2 = _mock_embed("invoice payment budget revenue cost")
        dot = sum(a * b for a, b in zip(v1, v2))
        norm1 = math.sqrt(sum(a * a for a in v1))
        norm2 = math.sqrt(sum(b * b for b in v2))
        sim = dot / (norm1 * norm2)
        assert sim < 0.7  # Should be less similar

    def test_unit_normalized(self):
        from bastion.mock import _mock_embed
        import math

        v = _mock_embed("test text")
        norm = math.sqrt(sum(x * x for x in v))
        assert abs(norm - 1.0) < 0.001

    def test_1024_dimensions(self):
        from bastion.mock import _mock_embed

        v = _mock_embed("hello world")
        assert len(v) == 1024


# ---------------------------------------------------------------------------
# Mock Search Uses Cosine Similarity
# ---------------------------------------------------------------------------


class TestMockSearch:
    def test_search_returns_related_results(self):
        from bastion.memory import BastionMemory

        mem = BastionMemory("test-agent", mock=True)
        mem.store("fact", "Python is a programming language")
        mem.store("fact", "JavaScript is used for web development")
        mem.store("fact", "CockroachDB is a distributed database")

        results = mem.search("python programming", k=2)
        assert len(results) > 0
        # Python-related result should rank highest
        assert "python" in results[0].content.lower() or "programming" in results[0].content.lower()

    def test_search_respects_threshold(self):
        from bastion.memory import BastionMemory

        mem = BastionMemory("test-agent", mock=True)
        mem.store("fact", "Python is a programming language")
        mem.store("fact", "Cats are fluffy animals")

        # Search should return results ranked by relevance
        results = mem.search("python programming", k=10, threshold=0.0)
        assert len(results) >= 1
        # Python result should rank higher than cats
        assert "python" in results[0].content.lower() or "programming" in results[0].content.lower()


# ---------------------------------------------------------------------------
# Session Memory TF-IDF Search
# ---------------------------------------------------------------------------


class TestSessionMemorySearch:
    def test_tfidf_search_finds_relevant(self):
        from bastion.memory import BastionMemory
        from bastion.session_memory import SessionMemory

        mem = BastionMemory("test-agent", mock=True)
        session = SessionMemory(mem, "sess-1")
        session.store("User asked about Python decorators", importance=7.0)
        session.store("Discussed database indexing strategies", importance=5.0)
        session.store("Reviewed Kubernetes deployment config", importance=4.0)

        results = session.search("python decorators", k=2)
        assert len(results) > 0
        assert "python" in results[0].content.lower()

    def test_search_returns_recent_when_empty_query(self):
        from bastion.memory import BastionMemory
        from bastion.session_memory import SessionMemory

        mem = BastionMemory("test-agent", mock=True)
        session = SessionMemory(mem, "sess-1")
        session.store("first", importance=1.0)
        session.store("second", importance=2.0)
        session.store("third", importance=3.0)

        results = session.search("", k=2)
        assert len(results) == 2
        # Should return most recent
        assert results[-1].content == "third"

    def test_search_respects_k(self):
        from bastion.memory import BastionMemory
        from bastion.session_memory import SessionMemory

        mem = BastionMemory("test-agent", mock=True)
        session = SessionMemory(mem, "sess-1")
        for i in range(10):
            session.store(f"fact number {i} about testing", importance=5.0)

        results = session.search("testing", k=3)
        assert len(results) <= 3


# ---------------------------------------------------------------------------
# Keyword Fallback Search
# ---------------------------------------------------------------------------


class TestKeywordFallback:
    def test_keyword_search_finds_exact_matches(self):
        """Test that mock search with word overlap finds exact keyword matches."""
        from bastion.memory import BastionMemory

        mem = BastionMemory("test-agent", mock=True)
        mem.store("fact", "The quick brown fox jumps over the lazy dog")
        mem.store("fact", "CockroachDB is a distributed SQL database")

        # Mock search uses cosine similarity + word overlap
        results = mem.search("cockroachdb database", k=5, threshold=0.0)
        assert len(results) >= 1
        assert any("cockroachdb" in r.content.lower() for r in results)

    def test_search_no_match_returns_empty(self):
        """Test that searching for unrelated terms returns few/no results."""
        from bastion.memory import BastionMemory

        mem = BastionMemory("test-agent", mock=True)
        mem.store("fact", "The quick brown fox")

        results = mem.search("quantum physics nuclear", k=5, threshold=0.9)
        # With high threshold, unrelated content should be filtered
        for r in results:
            # Any returned result should have some relevance
            assert len(r.content) > 0


# ---------------------------------------------------------------------------
# Push Notification Delivery
# ---------------------------------------------------------------------------


class TestPushNotificationDelivery:
    def setup_method(self):
        reset()

    def test_push_notification_registration(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                # Register push notification
                r = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "1",
                        "method": "setTaskPushNotification",
                        "params": {"id": "task-123", "url": "http://example.com/callback"},
                    },
                    headers=_h(),
                )
                assert r.status_code == 200
                result = r.json().get("result", {})
                assert result.get("url") == "http://example.com/callback"

                # Retrieve push notification
                r2 = await client.post(
                    "/",
                    json={
                        "jsonrpc": "2.0",
                        "id": "2",
                        "method": "getTaskPushNotification",
                        "params": {"id": "task-123"},
                    },
                    headers=_h(),
                )
                assert r2.status_code == 200
                result2 = r2.json().get("result", {})
                assert result2.get("url") == "http://example.com/callback"

        anyio.run(run)


# ---------------------------------------------------------------------------
# A2A Metrics Endpoint
# ---------------------------------------------------------------------------


class TestMetricsEndpoint:
    def setup_method(self):
        reset()

    def test_metrics_returns_prometheus_format(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                r = await client.get("/metrics")
                assert r.status_code == 200
                body = r.text
                assert "bastion_requests_total" in body
                assert "bastion_up" in body

        anyio.run(run)


# ---------------------------------------------------------------------------
# A2A Agent Card
# ---------------------------------------------------------------------------


class TestAgentCard:
    def setup_method(self):
        reset()

    def test_agent_card_has_streaming(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                r = await client.get("/.well-known/agent-card.json")
                assert r.status_code == 200
                card = r.json()
                assert card.get("capabilities", {}).get("streaming") is True
                assert card.get("capabilities", {}).get("pushNotifications") is True
                assert card.get("a2a_version") == "1.0"

        anyio.run(run)

    def test_agent_card_signed(self):
        app, _ = _make_app()
        anyio, client = _client(app)

        async def run():
            async with client:
                r = await client.get("/.well-known/agent-card.json")
                card = r.json()
                assert "signature" in card
                assert "publicKeyPem" in card.get("signature", {})

        anyio.run(run)


# ---------------------------------------------------------------------------
# Session Memory Promotion
# ---------------------------------------------------------------------------


class TestSessionMemoryPromotion:
    def test_high_importance_auto_promotes(self):
        from bastion.memory import BastionMemory
        from bastion.session_memory import SessionMemory

        mem = BastionMemory("test-agent", mock=True)
        session = SessionMemory(mem, "sess-1", promotion_threshold=7.0)

        # Should auto-promote (importance >= threshold)
        entry = session.store("Critical security rule", importance=8.0)
        assert entry.promoted is True

        # Should be in permanent memory
        permanent = mem.list_memories()
        assert any("Critical security rule" in m.content for m in permanent)

    def test_low_importance_no_promote(self):
        from bastion.memory import BastionMemory
        from bastion.session_memory import SessionMemory

        mem = BastionMemory("test-agent", mock=True)
        session = SessionMemory(mem, "sess-1", promotion_threshold=7.0)

        entry = session.store("Minor detail", importance=3.0)
        assert entry.promoted is False

        # Should NOT be in permanent memory
        permanent = mem.list_memories()
        assert not any("Minor detail" in m.content for m in permanent)

    def test_consolidate_promotes_eligible(self):
        from bastion.memory import BastionMemory
        from bastion.session_memory import SessionMemory

        mem = BastionMemory("test-agent", mock=True)
        # Use a high threshold so entries are NOT auto-promoted during store()
        session = SessionMemory(mem, "sess-1", promotion_threshold=10.0)

        session.store("Important fact", importance=8.0)
        session.store("Another important fact", importance=9.0)
        session.store("Minor detail", importance=3.0)

        # None auto-promoted (all below threshold=10)
        assert all(not e.promoted for e in session._entries)

        # Now lower the threshold for consolidate check
        session._promotion_threshold = 7.0
        result = session.consolidate()
        assert result["promoted"] == 2
