"""Tests for the distributed RequestLimiter."""

from __future__ import annotations

import os
import threading
import time

import pytest

from bastion.limiter import RequestLimiter

# ---------------------------------------------------------------------------
# Validation tests (no mock env needed)
# ---------------------------------------------------------------------------


class TestValidation:
    def test_max_concurrent_below_one_raises(self):
        with pytest.raises(ValueError, match="max_concurrent must be >= 1"):
            RequestLimiter(max_concurrent=0)

    def test_max_concurrent_negative_raises(self):
        with pytest.raises(ValueError, match="max_concurrent must be >= 1"):
            RequestLimiter(max_concurrent=-1)

    def test_max_queue_negative_raises(self):
        with pytest.raises(ValueError, match="max_queue must be >= 0"):
            RequestLimiter(max_queue=-1)

    def test_timeout_seconds_negative_raises(self):
        with pytest.raises(ValueError, match="timeout_seconds must be >= 0"):
            RequestLimiter(timeout_seconds=-1)


# ---------------------------------------------------------------------------
# Mock-mode helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_env(monkeypatch):
    monkeypatch.setenv("BASTION_MOCK", "true")
    yield


@pytest.fixture
def limiter(mock_env):
    inst = RequestLimiter(
        max_concurrent=5,
        max_queue=10,
        timeout_seconds=2,
        instance_id="test-instance",
    )
    yield inst
    inst.close()

# ---------------------------------------------------------------------------
# Mock-mode tests
# ---------------------------------------------------------------------------


class TestMockMode:
    def test_acquire_release(self, limiter):
        assert limiter.acquire() is True
        assert limiter._active_count == 1
        limiter.release()
        assert limiter._active_count == 0

    def test_acquire_release_multiple(self, limiter):
        held = []
        for _ in range(5):
            assert limiter.acquire() is True
            held.append(1)
        assert limiter._active_count == 5
        for _ in range(5):
            limiter.release()
        assert limiter._active_count == 0

    def test_reject_when_queue_full(self, limiter):
        limiter.max_queue = 2
        limiter.timeout_seconds = 5
        # Hold all 5 slots on background threads so main-thread acquires block
        acquired = [threading.Event() for _ in range(5)]
        hold_events = [threading.Event() for _ in range(5)]
        workers = []
        for i in range(5):
            t = threading.Thread(
                target=lambda idx=i: (
                    limiter.acquire(),
                    acquired[idx].set(),
                    hold_events[idx].wait(10),
                    limiter.release(),
                ),
            )
            t.daemon = True
            t.start()
            workers.append(t)
        for e in acquired:
            e.wait(5)
        # Now all 5 slots held. Queue capacity is 2.
        # Fill the queue: 2 blocking acquires
        for i in range(2):
            t = threading.Thread(
                target=lambda idx=i: (
                    limiter.acquire(timeout=3),
                    limiter.release(),
                ),
            )
            t.daemon = True
            t.start()
            workers.append(t)
        time.sleep(0.5)  # Allow blocking acquires to start and fill queue
        # Queue is full — next acquire should reject immediately
        assert limiter.acquire(timeout=0.1) is False
        assert limiter._total_rejected == 1
        # Clean up
        for e in hold_events:
            e.set()
        for t in workers:
            t.join(2)

    def test_acquire_zero_timeout_returns_immediately(self, limiter):
        for _ in range(5):
            limiter.acquire()
        start = time.time()
        assert limiter.acquire(timeout=0) is False
        assert time.time() - start < 0.1

    def test_timeout_when_all_slots_busy(self, limiter):
        for _ in range(5):
            limiter.acquire()
        started = time.time()
        assert limiter.acquire(timeout=0.5) is False
        elapsed = time.time() - started
        assert elapsed >= 0.4
        assert limiter._total_timeout == 1

    def test_max_concurrent_respected(self, limiter):
        for _ in range(5):
            assert limiter.acquire() is True
        start = time.time()
        # Should block and then timeout
        assert limiter.acquire(timeout=0.3) is False
        assert time.time() - start >= 0.2

    def test_release_noop_when_empty(self, limiter):
        limiter.release()
        limiter.release()
        assert limiter._active_count == 0

    def test_stats_shape(self, limiter):
        limiter.acquire()
        stats = limiter.get_stats()
        assert stats["max_concurrent"] == 5
        assert stats["max_queue"] == 10
        assert stats["timeout_seconds"] == 2
        assert stats["instance_id"] == "test-instance"
        assert stats["distributed"] is False
        assert isinstance(stats["utilization"], float)
        assert stats["active_requests"] == 1
        assert "occupied_slots" not in stats

    def test_stats_utilization(self, limiter):
        stats = limiter.get_stats()
        assert stats["utilization"] == 0.0
        limiter.acquire()
        stats = limiter.get_stats()
        assert stats["utilization"] == 20.0

    def test_context_manager_success(self, limiter):
        with limiter:
            assert limiter._active_count == 1
        assert limiter._active_count == 0

    def test_context_manager_raises_when_full(self, limiter):
        for _ in range(5):
            limiter.acquire()
        with pytest.raises(RuntimeError, match="Could not acquire request slot"), limiter:
            pass

    def test_instance_id_set(self, limiter):
        assert limiter._instance_id == "test-instance"

    def test_default_instance_id(self, mock_env):
        inst = RequestLimiter(max_concurrent=2)
        assert inst._instance_id is not None
        assert len(inst._instance_id) == 16
        inst.close()

    def test_held_slots_tracking(self, limiter):
        assert limiter._held_slots == []
        limiter.acquire()
        assert len(limiter._held_slots) == 0  # mock mode doesn't track slots
        limiter.release()

    def test_concurrent_acquires(self, limiter):
        results: list[bool] = []
        errors: list[Exception] = []
        barrier = threading.Barrier(10, timeout=2)

        def worker():
            try:
                barrier.wait()
                ok = limiter.acquire(timeout=1)
                results.append(ok)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors
        assert sum(results) == 5
        for _ in range(5):
            limiter.release()
        assert limiter._active_count == 0

    def test_close_idempotent(self, limiter):
        limiter.close()
        limiter.close()  # should not raise

    def test_call_counters(self, limiter):
        limiter.acquire()
        limiter.acquire()
        limiter.release()
        assert limiter._total_requests == 2
        assert limiter._total_rejected == 0
        assert limiter._total_timeout == 0
        assert limiter._active_count == 1


# ---------------------------------------------------------------------------
# Integration tests (require a live CockroachDB)
# ---------------------------------------------------------------------------


@pytest.mark.integration
class TestDistributedMode:
    @pytest.fixture(autouse=True)
    def _check_integration(self):
        conn = os.environ.get("BASTION_CONN", "")
        if not conn:
            pytest.skip("BASTION_CONN not set — skipping integration test")

    @pytest.fixture
    def d_limiter(self):
        inst = RequestLimiter(
            max_concurrent=5,
            max_queue=10,
            timeout_seconds=2,
            instance_id="test-integration",
        )
        yield inst
        inst.close()

    def test_bootstrap(self, d_limiter):
        """Table should exist and have the right number of slots."""
        pool = d_limiter._pool
        conn = pool.acquire()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM agent_limiter")
                assert cur.fetchone()[0] == 5
        finally:
            pool.release(conn)

    def test_acquire_release(self, d_limiter):
        assert d_limiter.acquire() is True
        assert len(d_limiter._held_slots) == 1
        d_limiter.release()
        assert len(d_limiter._held_slots) == 0

    def test_acquire_multiple(self, d_limiter):
        slots = []
        for _ in range(5):
            assert d_limiter.acquire() is True
            slots.append(d_limiter._held_slots[-1])
        assert len(set(slots)) == 5  # all different slot_ids
        for _ in range(5):
            d_limiter.release()
        assert d_limiter._active_count == 0

    def test_max_concurrent_blocked(self, d_limiter):
        for _ in range(5):
            assert d_limiter.acquire() is True
        start = time.time()
        assert d_limiter.acquire(timeout=1) is False
        assert time.time() - start >= 0.9

    def test_ttl_reclaim(self, d_limiter):
        """Expired slots should be reclaimed."""
        d_limiter.timeout_seconds = 1
        assert d_limiter.acquire() is True
        slot_id = d_limiter._held_slots[0]
        pool = d_limiter._pool
        conn = pool.acquire()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_limiter SET acquired_at = NOW() - INTERVAL '2 seconds' "
                    "WHERE slot_id = %s",
                    (slot_id,),
                )
            conn.commit()
        finally:
            pool.release(conn)
        d_limiter.release()
        # Slot should still be claimable by next acquire
        assert d_limiter.acquire() is True
        d_limiter.release()

    def test_concurrent_instances(self, d_limiter):
        """Two different instance_ids should compete for the same 5 slots."""
        other = RequestLimiter(
            max_concurrent=5,
            max_queue=10,
            timeout_seconds=2,
            instance_id="other-instance",
        )
        # Fill all 5 from d_limiter
        for _ in range(5):
            assert d_limiter.acquire() is True
        # other should find no free slot
        assert other.acquire(timeout=1) is False
        # Release one from d_limiter
        d_limiter.release()
        # Now other should get it
        assert other.acquire(timeout=1) is True
        other.release()
        # Cleanup
        for _ in range(4):
            d_limiter.release()
        other.close()

    def test_stats_occupied(self, d_limiter):
        stats = d_limiter.get_stats()
        assert stats["distributed"] is True
        assert "occupied_slots" in stats
        assert stats["occupied_slots"] == 0
        d_limiter.acquire()
        stats = d_limiter.get_stats()
        assert stats["occupied_slots"] == 1
        d_limiter.release()

    def test_instance_isolation(self, d_limiter):
        """One instance should never release another instance's slot."""
        other = RequestLimiter(
            max_concurrent=5,
            max_queue=10,
            timeout_seconds=2,
            instance_id="other",
        )
        d_limiter.acquire()
        slot_id = d_limiter._held_slots[0]
        pool = other._pool
        conn = pool.acquire()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_limiter SET instance_id = NULL, acquired_at = NULL "
                    "WHERE slot_id = %s",
                    (slot_id,),
                )
                assert cur.rowcount == 1
            conn.commit()
        finally:
            pool.release(conn)
        other.close()
        # Now release from d_limiter — should be a no-op (slot already free)
        d_limiter.release()
        assert d_limiter._active_count == 0
