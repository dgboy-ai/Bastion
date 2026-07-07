"""Tests for the SerializationRetryEngine."""

from __future__ import annotations

import time
from unittest import mock

import pytest

from bastion.errors import BastionRetryExhaustedError
from bastion.retry import SerializationRetryEngine, _is_serialization_error


class FakeConn:
    """A fake connection that simulates CockroachDB serialization behavior."""

    def __init__(self, fail_count: int = 0, fail_on_attempt: list[int] | None = None):
        self._attempt = 0
        self._fail_count = fail_count
        self._fail_on_attempt = fail_on_attempt or []
        self._rolled_back = False

    def cursor(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, query):
        self._attempt += 1
        if self._attempt in self._fail_on_attempt:
            raise Exception("40001: serialization failure")
        if self._attempt <= self._fail_count:
            raise Exception("40001: serialization failure")
        return "result"

    def commit(self):
        pass

    def rollback(self):
        self._rolled_back = True

    def close(self):
        pass


class TestSerializationRetryEngine:
    def test_execute_succeeds_first_time(self):
        engine = SerializationRetryEngine()
        conn = FakeConn()
        result = engine.execute(conn, lambda cur: cur.execute("SELECT 1"))
        assert result == "result"
        stats = engine.get_stats()
        assert stats["total_successes"] == 1
        assert stats["total_retries"] == 0

    def test_execute_retries_on_40001_error(self):
        engine = SerializationRetryEngine(max_retries=3, base_delay_ms=1)
        conn = FakeConn(fail_count=2)
        result = engine.execute(conn, lambda cur: cur.execute("SELECT 1"))
        assert result == "result"
        stats = engine.get_stats()
        assert stats["total_successes"] == 1
        assert stats["total_retries"] == 2

    def test_max_retries_exhausted_raises(self):
        engine = SerializationRetryEngine(max_retries=2, base_delay_ms=1)
        conn = FakeConn(fail_count=99)
        with pytest.raises(Exception, match="40001"):
            engine.execute(conn, lambda cur: cur.execute("SELECT 1"))
        stats = engine.get_stats()
        assert stats["total_successes"] == 0
        assert stats["total_retries"] == 2

    def test_non_serialization_error_does_not_retry(self):
        engine = SerializationRetryEngine(max_retries=5)
        conn = FakeConn(fail_on_attempt=[1])
        conn._fail_on_attempt = []
        conn._attempt = 0

        def _raise_other(cur):
            raise ValueError("some other error")

        with pytest.raises(ValueError, match="some other error"):
            engine.execute(conn, _raise_other)
        stats = engine.get_stats()
        assert stats["total_successes"] == 0
        assert stats["total_retries"] == 0

    def test_compute_delay_exponential_backoff(self):
        engine = SerializationRetryEngine(base_delay_ms=10, max_delay_ms=2000, jitter_factor=0)
        delays = [engine._compute_delay(i) for i in range(5)]
        assert delays[0] == 10.0
        assert delays[1] == 20.0
        assert delays[2] == 40.0
        assert delays[3] == 80.0
        assert delays[4] == 160.0

    def test_compute_delay_caps_at_max(self):
        engine = SerializationRetryEngine(base_delay_ms=10, max_delay_ms=100, jitter_factor=0)
        delay = engine._compute_delay(10)
        assert delay == 100.0

    def test_jitter_factor_affects_delay(self):
        engine_no_jitter = SerializationRetryEngine(base_delay_ms=100, max_delay_ms=1000, jitter_factor=0)
        engine_with_jitter = SerializationRetryEngine(base_delay_ms=100, max_delay_ms=1000, jitter_factor=0.5)

        d1 = engine_no_jitter._compute_delay(0)
        d2_vals = [engine_with_jitter._compute_delay(0) for _ in range(10)]
        assert d1 == 100.0
        assert all(100.0 <= d <= 150.0 for d in d2_vals)
        assert len(set(d2_vals)) > 1, "jitter should produce varying delays"

    def test_get_stats_returns_correct_counts(self):
        engine = SerializationRetryEngine(max_retries=2, base_delay_ms=1)

        stats = engine.get_stats()
        assert stats["total_attempts"] == 0
        assert stats["total_retries"] == 0
        assert stats["total_successes"] == 0
        assert stats["retry_rate"] == 0.0

        conn = FakeConn()
        engine.execute(conn, lambda cur: cur.execute("SELECT 1"))

        stats = engine.get_stats()
        assert stats["total_attempts"] == 1
        assert stats["total_successes"] == 1
        assert stats["total_retries"] == 0
        assert stats["retry_rate"] == 0.0

    def test_retry_rate_calculation(self):
        engine = SerializationRetryEngine(max_retries=2, base_delay_ms=1)
        conn = FakeConn(fail_count=1)
        engine.execute(conn, lambda cur: cur.execute("SELECT 1"))
        stats = engine.get_stats()
        assert stats["retry_rate"] == 50.0

    def test_rollback_called_on_failure(self):
        engine = SerializationRetryEngine(max_retries=2, base_delay_ms=1)
        conn = FakeConn(fail_count=1)
        engine.execute(conn, lambda cur: cur.execute("SELECT 1"))
        assert conn._rolled_back is True


class TestIsSerializationError:
    @pytest.mark.parametrize("msg,expected", [
        ("40001: serialization failure", True),
        ("the query experienced a 40001 error", True),
        ("Serialization failure occurred", True),
        ("restart transaction: write conflict", True),
        ("RESTART TRANSACTION", True),
        ("something else entirely", False),
        ("", False),
        ("42", False),
    ])
    def test_detect_serialization_error(self, msg, expected):
        assert _is_serialization_error(Exception(msg)) is expected

    def test_actual_sleep_called(self):
        engine = SerializationRetryEngine(max_retries=1, base_delay_ms=5, jitter_factor=0)
        conn = FakeConn(fail_count=1)
        start = time.time()
        engine.execute(conn, lambda cur: cur.execute("SELECT 1"))
        elapsed = (time.time() - start) * 1000
        assert elapsed >= 5

    def test_constructor_defaults(self):
        engine = SerializationRetryEngine()
        assert engine.max_retries == 5
        assert engine.base_delay_ms == 10
        assert engine.max_delay_ms == 2000
        assert engine.jitter_factor == 0.5

    def test_constructor_custom_values(self):
        engine = SerializationRetryEngine(
            max_retries=3, base_delay_ms=50, max_delay_ms=1000, jitter_factor=0.1,
        )
        assert engine.max_retries == 3
        assert engine.base_delay_ms == 50
        assert engine.max_delay_ms == 1000
        assert engine.jitter_factor == 0.1
