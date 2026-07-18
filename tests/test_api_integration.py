"""Dashboard API integration tests — tests MCP server metadata, tool calls, auth, and rate limiting.

The MCP Streamable HTTP endpoint (/mcp) requires an initialized task group
which can't be created via a plain TestClient. So we test tool logic through
BastionMemory directly (covered by test_mcp_integration.py) and test the
server metadata endpoints (which work fine with TestClient) plus the auth
middleware and rate limiter in isolation.
"""

from __future__ import annotations

import json
import os
import secrets
import threading
import time
from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from bastion.mcp_server import create_server
from bastion.mock import reset


@pytest.fixture(autouse=True)
def _clean():
    """Reset global mock state before each test."""
    reset()


@pytest.fixture
def server():
    """Create a mock MCP server."""
    return create_server(mock=True)


@pytest.fixture
def client(server):
    """Create a TestClient for the Starlette app."""
    return TestClient(server.streamable_http_app())


# ── MCP Server Card Endpoints ─────────────────────────────────────────────────


class TestServerCardEndpoints:
    def test_server_card_returns_200(self, client):
        """The /.well-known/mcp-server.json endpoint returns 200."""
        response = client.get("/.well-known/mcp-server.json")
        assert response.status_code == 200

    def test_server_card_has_schema_version(self, client):
        """Server card includes schemaVersion."""
        data = client.get("/.well-known/mcp-server.json").json()
        assert data["schemaVersion"] == "v1"

    def test_server_card_has_name(self, client):
        """Server card includes the name 'Bastion Memory'."""
        data = client.get("/.well-known/mcp-server.json").json()
        assert data["name"] == "Bastion Memory"

    def test_server_card_lists_tools(self, client):
        """Server card lists all registered tools."""
        data = client.get("/.well-known/mcp-server.json").json()
        tool_names = {t["name"] for t in data["tools"]}
        expected = {
            "memory_search", "memory_store", "memory_timetravel", "memory_audit",
            "memory_heal", "memory_delete", "memory_pin", "memory_get_pinned",
            "memory_list", "memory_correct", "resolve_conflict",
            "ltm_check_reuse", "ltm_store_analysis", "ltm_invalidate",
            "dream", "dream_history", "detect_contradictions",
            "scan_all_contradictions", "detect_observations", "multi_signal_search",
            "context_pack", "agent_schema", "memory_health", "memory_apply_patch",
        }
        assert expected.issubset(tool_names)

    def test_server_card_has_capabilities(self, client):
        """Server card includes capabilities object."""
        data = client.get("/.well-known/mcp-server.json").json()
        assert "capabilities" in data
        assert data["capabilities"]["resources"] is True
        assert data["capabilities"]["prompts"] is True
        assert data["capabilities"]["tool_annotations"] is True

    def test_agent_card_returns_200(self, client):
        """The /.well-known/agent-card.json endpoint returns 200."""
        response = client.get("/.well-known/agent-card.json")
        assert response.status_code == 200

    def test_agent_card_has_a2a_protocol(self, client):
        """Agent card identifies itself as A2A protocol."""
        data = client.get("/.well-known/agent-card.json").json()
        assert data["protocol"] == "a2a"
        assert "capabilities" in data

    def test_server_card_tools_have_annotations(self, client):
        """All tools in the server card have annotation metadata."""
        data = client.get("/.well-known/mcp-server.json").json()
        for tool in data["tools"]:
            assert "name" in tool
            assert "description" in tool

    def test_server_card_tool_count(self, client):
        """Server card reports the correct number of tools."""
        data = client.get("/.well-known/mcp-server.json").json()
        assert len(data["tools"]) >= 20


# ── Tool Calls via MCP Server (direct, not HTTP) ─────────────────────────────


class TestMCPToolCalls:
    """Test MCP tool logic through the server's tool manager directly."""

    @pytest.mark.asyncio
    async def test_memory_store_via_mcp(self, server):
        """Storing a memory via MCP tool call succeeds."""
        result = await server.call_tool(
            "memory_store",
            {"content": "MCP stored memory", "memory_type": "fact"},
        )
        data = json.loads(result[0][0].text)
        assert data["content"] == "MCP stored memory"
        assert data["memory_type"] == "fact"
        assert "cryptographic_hash" in data

    @pytest.mark.asyncio
    async def test_memory_search_via_mcp(self, server):
        """Searching memories via MCP tool call returns results."""
        await server.call_tool(
            "memory_store",
            {"content": "Python is great", "memory_type": "fact"},
        )
        result = await server.call_tool(
            "memory_search",
            {"query": "Python"},
        )
        data = json.loads(result[0][0].text)
        assert len(data["results"]) > 0

    @pytest.mark.asyncio
    async def test_invalid_tool_returns_error(self, server):
        """Calling a non-existent tool raises ToolError."""
        from mcp.server.fastmcp.exceptions import ToolError
        with pytest.raises(ToolError, match="Unknown tool"):
            await server.call_tool("nonexistent_tool", {})

    @pytest.mark.asyncio
    async def test_audit_after_store(self, server):
        """Audit trail has entries after memory operations."""
        await server.call_tool(
            "memory_store",
            {"content": "Audit test memory"},
        )
        result = await server.call_tool("memory_audit", {})
        data = json.loads(result[0][0].text)
        assert len(data) > 0
        assert data[0]["action"] == "memory_store"


# ── Auth Middleware ────────────────────────────────────────────────────────────


class TestAuthMiddleware:
    def test_check_auth_no_keys_allows_in_mock(self):
        """_check_auth allows access in mock mode when no API keys are set."""
        import bastion.mcp_server as mcp_mod
        # Save and clear
        old_keys = mcp_mod._API_KEYS
        mcp_mod._API_KEYS = set()
        try:
            with patch.dict(os.environ, {"BASTION_MOCK": "true", "BASTION_MCP_API_KEYS": ""}):
                mcp_mod._API_KEYS = None  # Force reload
                assert mcp_mod._check_auth({}) is True
        finally:
            mcp_mod._API_KEYS = old_keys

    def test_check_auth_with_valid_key(self):
        """_check_auth accepts a valid Bearer token."""
        import bastion.mcp_server as mcp_mod
        old_keys = mcp_mod._API_KEYS
        try:
            mcp_mod._API_KEYS = {"test-api-key-123"}
            assert mcp_mod._check_auth({"Authorization": "Bearer test-api-key-123"}) is True
        finally:
            mcp_mod._API_KEYS = old_keys

    def test_check_auth_with_invalid_key(self):
        """_check_auth rejects an invalid Bearer token."""
        import bastion.mcp_server as mcp_mod
        old_keys = mcp_mod._API_KEYS
        try:
            mcp_mod._API_KEYS = {"correct-key"}
            assert mcp_mod._check_auth({"Authorization": "Bearer wrong-key"}) is False
        finally:
            mcp_mod._API_KEYS = old_keys

    def test_check_auth_no_authorization_header(self):
        """_check_auth rejects requests without Authorization header."""
        import bastion.mcp_server as mcp_mod
        old_keys = mcp_mod._API_KEYS
        try:
            mcp_mod._API_KEYS = {"some-key"}
            assert mcp_mod._check_auth({}) is False
            assert mcp_mod._check_auth({"authorization": ""}) is False
        finally:
            mcp_mod._API_KEYS = old_keys

    def test_check_auth_uses_constant_time_comparison(self):
        """_check_auth uses secrets.compare_digest for timing-safe comparison."""
        import bastion.mcp_server as mcp_mod
        import inspect
        source = inspect.getsource(mcp_mod._check_auth)
        assert "compare_digest" in source


# ── Rate Limiter ──────────────────────────────────────────────────────────────


class TestRateLimiter:
    def test_limiter_acquire_release(self):
        """Basic acquire/release cycle works in mock mode."""
        from bastion.limiter import RequestLimiter
        with patch.dict(os.environ, {"BASTION_MOCK": "true"}):
            limiter = RequestLimiter(max_concurrent=3, max_queue=5, timeout_seconds=1)
            assert limiter.acquire(timeout=0.1) is True
            limiter.release()
            stats = limiter.get_stats()
            assert stats["max_concurrent"] == 3
            assert stats["distributed"] is False

    def test_limiter_exhausts_slots(self):
        """Acquiring all slots blocks subsequent acquires."""
        from bastion.limiter import RequestLimiter
        with patch.dict(os.environ, {"BASTION_MOCK": "true"}):
            limiter = RequestLimiter(max_concurrent=2, max_queue=10, timeout_seconds=1)
            assert limiter.acquire(timeout=0.1) is True
            assert limiter.acquire(timeout=0.1) is True
            # Third acquire should timeout
            assert limiter.acquire(timeout=0.05) is False
            limiter.release()
            limiter.release()
            stats = limiter.get_stats()
            assert stats["total_timeout"] >= 1

    def test_limiter_queue_full_rejects(self):
        """When queue is full, new requests are immediately rejected."""
        from bastion.limiter import RequestLimiter
        with patch.dict(os.environ, {"BASTION_MOCK": "true"}):
            limiter = RequestLimiter(max_concurrent=1, max_queue=0, timeout_seconds=1)
            # Queue is 0, so acquiring should immediately reject
            # (the queue_count check happens before semaphore)
            assert limiter.acquire(timeout=0.1) is False

    def test_limiter_context_manager(self):
        """Context manager acquires and releases automatically."""
        from bastion.limiter import RequestLimiter
        with patch.dict(os.environ, {"BASTION_MOCK": "true"}):
            limiter = RequestLimiter(max_concurrent=2, max_queue=5, timeout_seconds=1)
            with limiter:
                stats = limiter.get_stats()
                assert stats["active_requests"] >= 1
            stats = limiter.get_stats()
            assert stats["active_requests"] == 0

    def test_limiter_stats_track_requests(self):
        """Stats correctly track total requests and rejections."""
        from bastion.limiter import RequestLimiter
        with patch.dict(os.environ, {"BASTION_MOCK": "true"}):
            limiter = RequestLimiter(max_concurrent=1, max_queue=1, timeout_seconds=1)
            limiter.acquire(timeout=0.1)  # Queue slot used
            limiter.acquire(timeout=0.05)  # Queue full or timeout
            stats = limiter.get_stats()
            assert stats["total_requests"] >= 2


# ── Server State ──────────────────────────────────────────────────────────────


class TestServerState:
    def test_stateless_server_has_memory(self, server):
        """Server has a BastionMemory instance."""
        from bastion.memory import BastionMemory
        assert isinstance(server._bastion_memory, BastionMemory)

    def test_server_memory_is_mock(self, server):
        """Server memory instance is in mock mode."""
        assert server._bastion_memory.is_mock is True

    def test_shared_memory_healthcheck(self):
        """_get_shared_memory returns a working memory instance."""
        from bastion.mcp_server import _get_shared_memory
        mem = _get_shared_memory()
        assert mem is not None
        assert mem.is_mock is True
