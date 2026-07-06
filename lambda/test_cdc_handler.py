"""
Tests for Bastion CDC Lambda Handler.
Run with: python -m pytest test_cdc_handler.py -v
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))


@pytest.fixture(autouse=True)
def reset_circuit_breaker():
    """Reset circuit breaker state between tests."""
    import cdc_handler
    cdc_handler._failure_count = 0
    cdc_handler._circuit_open_until = 0.0
    yield


def _compute_hash(content: str, metadata: dict, previous_hash: str | None) -> str:
    meta_str = json.dumps(metadata, sort_keys=True)
    raw = content + meta_str + (previous_hash or "")
    return hashlib.sha256(raw.encode()).hexdigest()


class TestHashChainVerification:
    def test_empty_agent_returns_empty(self):
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        import cdc_handler
        result = cdc_handler.verify_hash_chain("empty-agent", mock_conn)
        assert result["status"] == "empty"
        assert result["chain_length"] == 0

    def test_valid_chain_returns_valid(self):
        # Build a valid chain of 3 memories
        h1 = _compute_hash("First memory", {}, None)
        h2 = _compute_hash("Second memory", {}, h1)
        h3 = _compute_hash("Third memory", {}, h2)

        rows = [
            ("id1", "First memory", {}, None, h1, datetime.now(UTC)),
            ("id2", "Second memory", {}, h1, h2, datetime.now(UTC)),
            ("id3", "Third memory", {}, h2, h3, datetime.now(UTC)),
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        import cdc_handler
        result = cdc_handler.verify_hash_chain("test-agent", mock_conn)
        assert result["status"] == "valid"
        assert result["chain_length"] == 3
        assert len(result["breaks"]) == 0

    def test_broken_chain_detected(self):
        h1 = _compute_hash("First memory", {}, None)
        h2 = _compute_hash("Second memory", {}, h1)

        # Third memory has wrong previous_hash (should be h2)
        rows = [
            ("id1", "First memory", {}, None, h1, datetime.now(UTC)),
            ("id2", "Second memory", {}, h1, h2, datetime.now(UTC)),
            ("id3", "Third memory", {}, "wrong_hash", "fake_hash", datetime.now(UTC)),
        ]

        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = rows
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        import cdc_handler
        result = cdc_handler.verify_hash_chain("test-agent", mock_conn)
        assert result["status"] == "broken"
        assert len(result["breaks"]) > 0


class TestAnomalyDetection:
    def test_no_anomalies_on_empty(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (0,)
        mock_cursor.fetchall.return_value = []
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        import cdc_handler
        alerts = cdc_handler.detect_anomalies("clean-agent", mock_conn)
        assert len(alerts) == 0

    def test_size_spike_detected(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (150,)  # > 100
        mock_cursor.fetchall.return_value = [("content", datetime.now(UTC), "hash")] * 10
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        import cdc_handler
        alerts = cdc_handler.detect_anomalies("spike-agent", mock_conn)
        types = [a["type"] for a in alerts]
        assert "size_spike" in types

    def test_fact_turnover_detected(self):
        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (5,)
        # Duplicate content in recent memories
        mock_cursor.fetchall.return_value = [
            ("same content", datetime.now(UTC), "h1"),
            ("same content", datetime.now(UTC), "h2"),
            ("unique content", datetime.now(UTC), "h3"),
        ] * 5
        mock_conn = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        import cdc_handler
        alerts = cdc_handler.detect_anomalies("turnover-agent", mock_conn)
        types = [a["type"] for a in alerts]
        assert "fact_turnover" in types


class TestCircuitBreaker:
    def test_circuit_starts_closed(self):
        import cdc_handler
        assert not cdc_handler._circuit_is_open()

    def test_circuit_opens_after_threshold(self):
        import cdc_handler
        for _ in range(5):
            cdc_handler._record_failure()
        assert cdc_handler._circuit_is_open()

    def test_circuit_resets_on_success(self):
        import cdc_handler
        cdc_handler._record_failure()
        cdc_handler._record_failure()
        cdc_handler._record_success()
        assert not cdc_handler._circuit_is_open()
        assert cdc_handler._failure_count == 0


class TestHandler:
    def test_handler_returns_503_when_circuit_open(self):
        import cdc_handler
        cdc_handler._failure_count = 10
        cdc_handler._circuit_open_until = 9999999999.0

        result = cdc_handler.handler({}, None)
        assert result["statusCode"] == 503

    def test_handler_returns_500_without_conn(self):
        import cdc_handler
        old_conn = cdc_handler.CONN_STR
        cdc_handler.CONN_STR = ""
        try:
            result = cdc_handler.handler({"value": {"after": {}}}, None)
            assert result["statusCode"] == 500
        finally:
            cdc_handler.CONN_STR = old_conn

    def test_health_check_returns_200(self):
        import cdc_handler
        result = cdc_handler.health_check({}, None)
        assert result["statusCode"] == 200
        body = json.loads(result["body"])
        assert body["status"] == "healthy"
