"""Tests for CircuitBreaker — failure threshold, recovery, half-open state."""

from __future__ import annotations

import threading
import time

import pytest

from bastion.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError, CircuitState


class TestCircuitBreakerBasic:
    def test_initial_state_is_closed(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        assert cb.state == CircuitState.CLOSED

    def test_successful_call_stays_closed(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        result = cb.call(lambda: 42)
        assert result == 42
        assert cb.state == CircuitState.CLOSED

    def test_failure_increments_count(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        stats = cb.get_stats()
        assert stats["failure_count"] == 1
        assert stats["total_failures"] == 1

    def test_opens_after_threshold_failures(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        for _ in range(3):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        assert cb.state == CircuitState.OPEN

    def test_open_rejects_calls(self):
        cb = CircuitBreaker("test", failure_threshold=2)
        for _ in range(2):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        with pytest.raises(CircuitBreakerOpenError):
            cb.call(lambda: 42)

    def test_successful_call_resets_failure_count(self):
        cb = CircuitBreaker("test", failure_threshold=3)
        cb.call(lambda: 1)
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        # 2 failures, but then a success resets
        cb.call(lambda: 1)
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        # Still only 2 consecutive failures, not 3
        assert cb.state == CircuitState.CLOSED


class TestCircuitBreakerRecovery:
    def test_transitions_to_half_open_after_timeout(self):
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=1)
        for _ in range(2):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        assert cb.state == CircuitState.OPEN
        time.sleep(1.1)
        assert cb.state == CircuitState.HALF_OPEN

    def test_half_open_allows_calls(self):
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=1)
        for _ in range(2):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        time.sleep(1.1)
        result = cb.call(lambda: 42)
        assert result == 42

    def test_half_open_recoveres_after_successes(self):
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=1, success_threshold=2)
        for _ in range(2):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        time.sleep(1.1)
        cb.call(lambda: 1)
        assert cb.state == CircuitState.HALF_OPEN
        cb.call(lambda: 2)
        assert cb.state == CircuitState.CLOSED

    def test_half_open_failure_reopens(self):
        cb = CircuitBreaker("test", failure_threshold=2, recovery_timeout=1)
        for _ in range(2):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        time.sleep(1.1)
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        assert cb.state == CircuitState.OPEN


class TestCircuitBreakerStats:
    def test_stats_track_calls(self):
        cb = CircuitBreaker("test", failure_threshold=5)
        cb.call(lambda: 1)
        cb.call(lambda: 2)
        stats = cb.get_stats()
        assert stats["total_calls"] == 2
        assert stats["total_failures"] == 0
        assert stats["total_rejected"] == 0

    def test_stats_track_rejected(self):
        cb = CircuitBreaker("test", failure_threshold=2)
        for _ in range(2):
            with pytest.raises(ValueError):
                cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        with pytest.raises(CircuitBreakerOpenError):
            cb.call(lambda: 42)
        stats = cb.get_stats()
        assert stats["total_rejected"] == 1

    def test_stats_include_metadata(self):
        cb = CircuitBreaker("mybreaker", failure_threshold=5, recovery_timeout=60)
        stats = cb.get_stats()
        assert stats["name"] == "mybreaker"
        assert stats["failure_threshold"] == 5
        assert stats["recovery_timeout"] == 60


class TestCircuitBreakerConcurrency:
    def test_concurrent_failures_open_circuit(self):
        cb = CircuitBreaker("test", failure_threshold=10)
        errors = []

        def fail():
            try:
                cb.call(lambda: (_ for _ in ()).throw(RuntimeError("fail")))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=fail) for _ in range(15)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert cb.state == CircuitState.OPEN
        assert len(errors) == 15

    def test_concurrent_successes(self):
        cb = CircuitBreaker("test", failure_threshold=10)
        results = []

        def succeed():
            results.append(cb.call(lambda: 1))

        threads = [threading.Thread(target=succeed) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert len(results) == 20
        assert all(r == 1 for r in results)


class TestCircuitBreakerEdgeCases:
    def test_zero_failure_threshold_opens_immediately(self):
        cb = CircuitBreaker("test", failure_threshold=0)
        # failure_count 0 >= threshold 0, but call hasn't happened yet
        # After one failure, 1 >= 0, so it should open
        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))
        assert cb.state == CircuitState.OPEN

    def test_exception_propagates_through_breaker(self):
        cb = CircuitBreaker("test", failure_threshold=5)
        with pytest.raises(RuntimeError, match="custom"):
            cb.call(lambda: (_ for _ in ()).throw(RuntimeError("custom")))

    def test_get_stats_returns_dict(self):
        cb = CircuitBreaker("test")
        stats = cb.get_stats()
        assert isinstance(stats, dict)
        assert "name" in stats
        assert "state" in stats
        assert "failure_count" in stats
