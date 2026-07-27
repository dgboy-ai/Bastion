"""Comprehensive tests for all production-readiness fixes.

Covers:
- Error message sanitization (rls.py, locality.py, mcp_server.py, memory.py)
- Messaging cross-agent isolation
- Circuit breaker public API usage
- DDL injection prevention (dba.py)
- Version alignment
- PII deduplication (shared module integration)
- Hash chain invalidation on correction
- Connection pool usage in time-travel
"""

from __future__ import annotations

import contextlib
import re
from unittest.mock import MagicMock

import pytest

from bastion.memory import BastionMemory

# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def mem():
    m = BastionMemory("test-agent", mock=True)
    yield m
    m.close()


@pytest.fixture
def mem_with_data(mem):
    mem.store("fact", "Test memory about databases", {"topic": "db"})
    mem.store("fact", "Test memory about security", {"topic": "sec"})
    return mem


# ── Error message sanitization ────────────────────────────────────────────────


class TestErrorSanitization:
    """Verify no raw exception details leak to clients."""

    def test_rls_enable_rls_no_raw_error(self):
        """rls.py enable_rls should not return raw exception messages."""
        from bastion.rls import RowLevelSecurity

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_conn.cursor.return_value)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        mock_conn.cursor.return_value.execute.side_effect = Exception("connection refused to host:5432")

        rls = RowLevelSecurity(mock_conn)
        result = rls.enable_rls()

        if result.get("status") == "error":
            error_msg = result.get("error", "")
            # Should NOT contain connection details
            assert "host:5432" not in error_msg
            assert "connection refused" not in error_msg
            assert "check server logs" in error_msg.lower() or "failed" in error_msg.lower()

    def test_rls_verify_isolation_no_raw_error(self):
        """rls.py verify_isolation should not return raw exception messages."""
        from bastion.rls import RowLevelSecurity

        mock_conn = MagicMock()
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)
        mock_cursor = MagicMock()
        mock_cursor.__enter__ = MagicMock(return_value=mock_cursor)
        mock_cursor.__exit__ = MagicMock(return_value=False)
        mock_cursor.execute.side_effect = Exception("table agent_memory does not exist")
        mock_conn.cursor.return_value = mock_cursor

        rls = RowLevelSecurity(mock_conn)
        result = rls.verify_isolation("test-agent")

        if "error" in result:
            assert "does not exist" not in result["error"]
            assert "agent_memory" not in result["error"]

    def test_memory_runtime_error_no_raw_exception(self, mem):
        """memory.py RuntimeError messages should not contain raw exceptions."""
        # list_all in mock mode shouldn't error, but verify the pattern
        # by checking the RuntimeError format in the source
        import inspect

        source = inspect.getsource(mem._list_all_real)
        # Should not have f"...{e}" in RuntimeError
        assert 'RuntimeError(f"List all failed for agent {self.agent_id}: {e}")' not in source
        # Should have sanitized version
        assert 'RuntimeError(f"List all failed for agent {self.agent_id}")' in source

    def test_locality_error_messages_sanitized(self):
        """locality.py should not return str(exc) in error responses."""
        import inspect

        from bastion import locality

        source = inspect.getsource(locality)
        # Should not have raw str(exc) returns in API responses
        # Check that error returns use generic messages
        lines = source.split("\n")
        for i, line in enumerate(lines):
            if "return" in line and '"error"' in line and "str(exc)" in line:
                pytest.fail(f"Line {i + 1}: locality.py still leaks str(exc) in error response")


# ── Messaging cross-agent isolation ───────────────────────────────────────────


class TestMessagingIsolation:
    def test_consume_defaults_to_agent_namespace(self, mem):
        """consume() with no namespace should default to agent's own namespace."""
        from bastion.messaging import MessageBroker

        broker = MessageBroker("test-agent", get_pool_fn=lambda: None, is_mock_fn=lambda: True)

        # Broadcast to agent's own namespace
        broker.broadcast("test_event", {"data": "hello"}, namespace="test-agent")

        # Consume without specifying namespace — should get own messages
        messages = broker.consume()
        assert len(messages) >= 1
        assert messages[0].event_type == "test_event"

    def test_consume_does_not_leak_other_namespaces(self, mem):
        """consume() should not return messages from other namespaces."""
        from bastion.messaging import MessageBroker

        broker_a = MessageBroker("agent-a", get_pool_fn=lambda: None, is_mock_fn=lambda: True)
        broker_b = MessageBroker("agent-b", get_pool_fn=lambda: None, is_mock_fn=lambda: True)

        # Agent A broadcasts
        broker_a.broadcast("a_event", {"from": "a"}, namespace="agent-a")

        # Agent B consumes — should NOT see agent A's messages
        messages_b = broker_b.consume()
        for m in messages_b:
            assert m.event_type != "a_event"

    def test_consume_with_explicit_namespace(self, mem):
        """consume() with explicit namespace should filter correctly."""
        from bastion.messaging import MessageBroker

        broker = MessageBroker("test-agent", get_pool_fn=lambda: None, is_mock_fn=lambda: True)

        broker.broadcast("event1", {"data": 1}, namespace="ns1")
        broker.broadcast("event2", {"data": 2}, namespace="ns2")

        messages_ns1 = broker.consume(namespace="ns1")
        assert all(m.namespace == "ns1" for m in messages_ns1)


# ── Circuit breaker public API ────────────────────────────────────────────────


class TestCircuitBreakerAPI:
    def test_memory_uses_public_call_api(self):
        """_embed_bedrock should use cb.call(), not _on_success/_on_failure."""
        import inspect

        from bastion.memory import BastionMemory

        source = inspect.getsource(BastionMemory._embed_bedrock)
        # Should NOT have private method calls
        assert "_on_success()" not in source
        assert "_on_failure()" not in source
        # Should use public call() method
        assert "self._bedrock_cb.call(" in source

    def test_circuit_breaker_call_counts(self):
        """Public call() should properly track stats."""
        from bastion.circuit_breaker import CircuitBreaker

        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=1)

        # Successful calls
        for _ in range(5):
            cb.call(lambda: "ok")

        stats = cb.get_stats()
        assert stats["total_calls"] == 5
        assert stats["total_failures"] == 0

    def test_circuit_breaker_failure_counts(self):
        from bastion.circuit_breaker import CircuitBreaker

        cb = CircuitBreaker("test", failure_threshold=3, recovery_timeout=1)

        for _ in range(2):
            with contextlib.suppress(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))

        stats = cb.get_stats()
        assert stats["total_failures"] == 2


# ── DDL injection prevention ─────────────────────────────────────────────────


class TestDdlInjectionPrevention:
    def test_safe_default_values_accepted(self):
        """Common safe DEFAULT values should pass validation."""
        from bastion.dba import SchemaEvolution

        se = SchemaEvolution("test-cluster")

        safe_values = [
            "NULL",
            "TRUE",
            "FALSE",
            "NOW()",
            "0",
            "42",
            "3.14",
            "'hello'",
            "'default value'",
        ]
        for val in safe_values:
            result = se._validate_default_value(val)
            assert result is None, f"'{val}' should be valid but got: {result}"

    def test_dangerous_default_values_rejected(self):
        """SQL injection attempts should be rejected."""
        from bastion.dba import SchemaEvolution

        se = SchemaEvolution("test-cluster")

        dangerous_values = [
            "'; DROP TABLE agent_memory; --",
            "0; DELETE FROM agent_memory",
            "1 OR 1=1",
            "' OR '1'='1",
            "1; EXEC xp_cmdshell('format c:')",
            "$(rm -rf /)",
            "`rm -rf /`",
        ]
        for val in dangerous_values:
            result = se._validate_default_value(val)
            assert result is not None, f"'{val}' should be rejected but was accepted"

    def test_empty_default_rejected(self):
        from bastion.dba import SchemaEvolution

        se = SchemaEvolution("test-cluster")
        assert se._validate_default_value("") is not None
        assert se._validate_default_value(None) is not None

    def test_long_default_rejected(self):
        from bastion.dba import SchemaEvolution

        se = SchemaEvolution("test-cluster")
        long_val = "'" + "a" * 300 + "'"
        assert se._validate_default_value(long_val) is not None


# ── Version alignment ─────────────────────────────────────────────────────────


class TestVersionAlignment:
    def test_config_matches_pyproject(self):
        """config.py VERSION should match pyproject.toml version."""
        # Read pyproject.toml
        import tomllib

        from bastion.config import VERSION

        with open("pyproject.toml", "rb") as f:
            pyproject = tomllib.load(f)

        assert pyproject["project"]["version"] == VERSION

    def test_version_is_semver(self):
        from bastion.config import VERSION

        assert re.match(r"^\d+\.\d+\.\d+$", VERSION)


# ── PII deduplication integration ─────────────────────────────────────────────


class TestPiiDeduplication:
    def test_agent_uses_shared_pii(self):
        """agent.py should import from shared pii module."""
        import inspect

        from bastion import agent

        source = inspect.getsource(agent)
        assert "from bastion.pii import" in source

    def test_guard_uses_shared_pii(self):
        """guard.py should import from shared pii module."""
        import inspect

        from bastion import guard

        source = inspect.getsource(guard)
        assert "from bastion.pii import" in source

    def test_firewall_uses_shared_pii(self):
        """firewall.py should import from shared pii module."""
        import inspect

        from bastion import firewall

        source = inspect.getsource(firewall)
        assert "from bastion.pii import" in source

    def test_agent_redact_pii_consistent_with_shared(self, mem):
        """agent.redact_pii should produce same redaction labels as shared module."""
        from bastion.agent import redact_pii as agent_redact
        from bastion.pii import redact_pii as shared_redact

        text = "SSN 123-45-6789 and email user@test.com"
        agent_redacted, _ = agent_redact(text)
        shared_redacted, _ = shared_redact(text)

        # Both should redact the same PII
        assert "123-45-6789" not in agent_redacted
        assert "123-45-6789" not in shared_redacted
        assert "user@test.com" not in agent_redacted
        assert "user@test.com" not in shared_redacted

    def test_guard_pii_scan_uses_shared(self):
        """guard.pii_scan should detect same PII as shared module."""
        from bastion.guard import pii_scan
        from bastion.pii import scan_pii

        text = "Email user@test.com and SSN 123-45-6789"
        guard_redacted, guard_detected = pii_scan(text)
        shared_detected = scan_pii(text)

        assert set(guard_detected) == set(shared_detected)


# ── Hash chain invalidation ──────────────────────────────────────────────────


class TestHashChainInvalidation:
    def test_correction_updates_hash(self, mem):
        """correct_memory should update cryptographic_hash with new hash."""
        import inspect

        from bastion.memory import BastionMemory

        source = inspect.getsource(BastionMemory._correct_memory_real)
        assert "cryptographic_hash = %s" in source  # Sets new hash, not NULL

    def test_correction_logs_warning(self, mem):
        """correct_memory should log a warning about hash chain."""
        import inspect

        from bastion.memory import BastionMemory

        source = inspect.getsource(BastionMemory._correct_memory_real)
        assert "hash chain invalidated" in source.lower() or "hash chain" in source.lower()

    def test_correction_still_works(self, mem):
        """correct_memory should still function despite hash invalidation."""
        record = mem.store("fact", "Original content")
        result = mem.correct_memory(record.memory_id, "Updated content")
        assert result is not None
        assert result.content == "Updated content"


# ── Connection pool in time-travel ────────────────────────────────────────────


class TestTimeTravelPool:
    def test_time_travel_uses_pool(self):
        """_get_at_time_real should use get_pool(), not raw psycopg.connect."""
        import inspect

        from bastion.memory import BastionMemory

        source = inspect.getsource(BastionMemory._get_at_time_real)
        # Should use pool
        assert "self.get_pool()" in source
        # Should NOT use raw psycopg.connect
        assert "psycopg.connect(" not in source

    def test_time_travel_releases_connection(self, mem_with_data):
        """Time-travel should properly release connection."""
        result = mem_with_data.get_at_time("1 hour ago")
        assert isinstance(result, list)
        # Pool should not be exhausted
        pool = mem_with_data.get_pool()
        stats = pool.get_stats()
        assert stats.get("active", 0) == 0


# ── Duplicate logger.exception removal ────────────────────────────────────────


class TestDuplicateLoggerRemoval:
    def test_no_duplicate_logger_exception(self):
        """mcp_server.py should not have consecutive duplicate logger.exception calls."""
        import inspect

        from bastion import mcp_server

        source = inspect.getsource(mcp_server)
        lines = source.split("\n")

        for i in range(len(lines) - 1):
            line1 = lines[i].strip()
            line2 = lines[i + 1].strip()
            if line1.startswith("logger.exception(") and line2.startswith("logger.exception(") and line1 == line2:
                pytest.fail(f"Duplicate logger.exception at lines {i + 1}-{i + 2}: {line1}")


# ── MCP error sanitization ───────────────────────────────────────────────────


class TestMcpErrorSanitization:
    def test_no_type_e_name_in_errors(self):
        """mcp_server.py should not leak type(e).__name__ to clients."""
        import inspect

        from bastion import mcp_server

        source = inspect.getsource(mcp_server)
        # Should not have type(e).__name__ in error returns
        lines = source.split("\n")
        for i, line in enumerate(lines):
            if "return json.dumps" in line and "type(e).__name__" in line:
                pytest.fail(f"Line {i + 1}: MCP server leaks type(e).__name__")


# ── Integration: full workflow ────────────────────────────────────────────────


class TestFullWorkflow:
    def test_store_search_correct_verify(self, mem):
        """Full workflow: store → search → correct → verify count."""
        # Store
        record = mem.store("fact", "CockroachDB is fast", {"topic": "db"})
        assert record is not None

        # Count
        assert mem.count_by_agent() == 1

        # Search
        results = mem.keyword_search("CockroachDB")
        assert len(results) >= 1

        # Correct
        corrected = mem.correct_memory(record.memory_id, "CockroachDB is very fast")
        assert corrected is not None
        assert corrected.content == "CockroachDB is very fast"

        # List by importance
        important = mem.list_by_importance(min_importance=0)
        assert len(important) >= 1

    def test_concurrent_store_and_query(self, mem):
        """Multiple stores followed by queries should be consistent."""
        for i in range(10):
            mem.store("fact", f"Memory number {i}", {"index": i})

        assert mem.count_by_agent() == 10
        recent = mem.list_recent(hours=24)
        assert len(recent) == 10
        pinned = mem.list_pinned()
        assert len(pinned) == 0  # No pins yet

    def test_pin_and_query(self, mem):
        """Pin a memory and verify it appears in pinned list."""
        mem.store("fact", "Important fact")
        mem.pin("fact", "Critical pinned fact", pin_priority=2)

        pinned = mem.list_pinned()
        assert len(pinned) >= 1
        assert any(p.content == "Critical pinned fact" for p in pinned)
