from __future__ import annotations

import time

import pytest

from bastion.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError, CircuitState


class TestCircuitBreaker:
    def test_initial_state_closed(self):
        cb = CircuitBreaker()
        assert cb.state == CircuitState.CLOSED

    def test_call_success(self):
        cb = CircuitBreaker()
        result = cb.call(lambda x: x + 1, 2)
        assert result == 3

    def test_call_failure_opens_after_threshold(self):
        cb = CircuitBreaker(name="test", failure_threshold=3, recovery_timeout=60)

        def _fail():
            raise ValueError("boom")

        for _ in range(3):
            with pytest.raises(ValueError):
                cb.call(_fail)

        assert cb.state == CircuitState.OPEN

    def test_open_raises_immediately(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=60)

        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))

        with pytest.raises(CircuitBreakerOpenError):
            cb.call(lambda: "should not reach")

    def test_half_open_recovery(self):
        cb = CircuitBreaker(name="test", failure_threshold=1, recovery_timeout=0.01, success_threshold=1)

        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))

        assert cb.state == CircuitState.OPEN

        time.sleep(0.02)

        result = cb.call(lambda: "recovered")
        assert result == "recovered"
        assert cb.state == CircuitState.CLOSED

    def test_stats_shape(self):
        cb = CircuitBreaker(name="stats-test", failure_threshold=3)
        stats = cb.get_stats()
        assert stats["name"] == "stats-test"
        assert stats["state"] == "closed"
        assert stats["total_calls"] == 0
        assert stats["total_failures"] == 0

    def test_stats_tracks_calls(self):
        cb = CircuitBreaker()
        cb.call(lambda: 42)
        assert cb.get_stats()["total_calls"] == 1

    def test_concurrent_safety(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=60)
        import threading

        errors: list[Exception] = []

        def _fail():
            raise ValueError("concurrent")

        def worker():
            try:
                cb.call(_fail)
            except (ValueError, CircuitBreakerOpenError) as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 10

    def test_recovery_timeout_state_transition(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.01)

        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))

        assert cb.state == CircuitState.OPEN

        time.sleep(0.02)
        assert cb.state == CircuitState.HALF_OPEN

    def test_circuit_breaker_open_error_message(self):
        cb = CircuitBreaker(name="my-cb", failure_threshold=1, recovery_timeout=60)

        with pytest.raises(ValueError):
            cb.call(lambda: (_ for _ in ()).throw(ValueError("fail")))

        with pytest.raises(CircuitBreakerOpenError, match="my-cb"):
            cb.call(lambda: None)

    def test_default_values(self):
        cb = CircuitBreaker()
        assert cb.failure_threshold == 5
        assert cb.recovery_timeout == 30
        assert cb.success_threshold == 2
