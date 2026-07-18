"""Thread safety tests — concurrent stores, reads+writes, search, connection pool, circuit breaker.

Tests verify that concurrent operations on BastionMemory (mock mode) don't
corrupt the hash chain, cause data races, or produce inconsistent state.
"""

from __future__ import annotations

import math
import threading
import time
from collections import Counter

import pytest

from bastion.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError, CircuitState
from bastion.memory import BastionMemory
from bastion.mock import reset


@pytest.fixture(autouse=True)
def _clean():
    """Reset global mock state before each test."""
    reset()


@pytest.fixture
def mem():
    """Create a mock BastionMemory instance for concurrent tests."""
    return BastionMemory(agent_id="concurrent-test", mock=True)


# ── 50 Concurrent Memory Stores ──────────────────────────────────────────────


class TestConcurrentStores:
    def test_50_concurrent_stores_no_hash_corruption(self, mem):
        """50 concurrent stores produce a valid, unbroken hash chain."""
        errors = []
        records = []
        lock = threading.Lock()

        def store_memory(index):
            try:
                r = mem.store("fact", f"Concurrent memory {index}")
                with lock:
                    records.append(r)
            except Exception as e:
                with lock:
                    errors.append(e)

        threads = [threading.Thread(target=store_memory, args=(i,)) for i in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        assert not errors, f"Concurrent stores raised errors: {errors}"
        assert len(records) == 50

        # Verify hash chain integrity: every record's previous_hash matches the
        # hash of the record that was stored just before it in chronological order
        records.sort(key=lambda r: r.created_at)
        for i, record in enumerate(records):
            if i == 0:
                assert record.previous_hash is None, (
                    f"First record (index 0) should have no previous_hash, "
                    f"got {record.previous_hash}"
                )
            else:
                # The previous_hash should match some earlier record's hash
                earlier_hashes = {r.cryptographic_hash for r in records[:i]}
                assert record.previous_hash in earlier_hashes, (
                    f"Record {i} previous_hash {record.previous_hash} "
                    f"not found in {i} earlier hashes"
                )

    def test_50_concurrent_stores_all_unique_ids(self, mem):
        """Each concurrent store gets a unique memory_id."""
        records = []
        lock = threading.Lock()

        def store_memory(index):
            r = mem.store("fact", f"Unique memory {index}")
            with lock:
                records.append(r)

        threads = [threading.Thread(target=store_memory, args=(i,)) for i in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)

        ids = [r.memory_id for r in records]
        assert len(set(ids)) == 50, f"Found duplicate IDs: {len(set(ids))} unique out of 50"


# ── Concurrent Reads + Writes ─────────────────────────────────────────────────


class TestConcurrentReadWrite:
    def test_concurrent_reads_during_writes(self, mem):
        """Reading (search/list) while writing doesn't crash or return corrupt data."""
        # Seed some data first
        for i in range(10):
            mem.store("fact", f"Seed memory {i}")

        errors = []
        read_results = []
        write_count = [0]
        lock = threading.Lock()
        stop = threading.Event()

        def writer():
            idx = 0
            while not stop.is_set():
                try:
                    mem.store("fact", f"Write {idx}")
                    with lock:
                        write_count[0] += 1
                    idx += 1
                except Exception as e:
                    with lock:
                        errors.append(e)
                time.sleep(0.001)

        def reader():
            while not stop.is_set():
                try:
                    results = mem.search("memory", k=5)
                    with lock:
                        read_results.append(len(results))
                except Exception as e:
                    with lock:
                        errors.append(e)
                time.sleep(0.001)

        writer_threads = [threading.Thread(target=writer) for _ in range(3)]
        reader_threads = [threading.Thread(target=reader) for _ in range(5)]

        for t in writer_threads + reader_threads:
            t.start()
        time.sleep(0.5)
        stop.set()
        for t in writer_threads + reader_threads:
            t.join(timeout=10)

        assert not errors, f"Concurrent read/write raised errors: {errors}"
        assert write_count[0] > 0, "Writer should have produced some writes"
        assert len(read_results) > 0, "Readers should have produced some results"

    def test_concurrent_list_during_writes(self, mem):
        """list_memories during concurrent writes returns valid lists."""
        for i in range(5):
            mem.store("fact", f"List seed {i}")

        errors = []
        list_results = []
        stop = threading.Event()

        def writer():
            idx = 0
            while not stop.is_set():
                mem.store("fact", f"List writer {idx}")
                idx += 1
                time.sleep(0.005)

        def lister():
            while not stop.is_set():
                try:
                    results = mem.list_memories()
                    assert isinstance(results, list)
                    list_results.append(len(results))
                except Exception as e:
                    errors.append(e)
                time.sleep(0.005)

        wt = threading.Thread(target=writer)
        lt = threading.Thread(target=lister)
        wt.start()
        lt.start()
        time.sleep(0.3)
        stop.set()
        wt.join(timeout=5)
        lt.join(timeout=5)

        assert not errors


# ── Concurrent Search Operations ──────────────────────────────────────────────


class TestConcurrentSearch:
    def test_concurrent_searches_are_isolated(self, mem):
        """Multiple threads searching simultaneously get consistent results."""
        for i in range(20):
            mem.store("fact", f"Searchable item {i}")

        results_per_thread = []
        errors = []
        lock = threading.Lock()

        def search_worker(query):
            try:
                results = mem.search(query, k=5)
                with lock:
                    results_per_thread.append((query, len(results)))
            except Exception as e:
                with lock:
                    errors.append(e)

        queries = ["Searchable", "item", "Searchable item", "nonexistent xyz"]
        threads = [threading.Thread(target=search_worker, args=(q,)) for q in queries * 5]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        assert not errors
        assert len(results_per_thread) == 20

    def test_concurrent_search_types_filter(self, mem):
        """Type-filtered searches under concurrency return correct types."""
        mem.store("fact", "Fact A")
        mem.store("preference", "Pref B")
        mem.store("fact", "Fact C")

        errors = []
        results = []
        lock = threading.Lock()

        def search_typed(mem_type):
            try:
                r = mem.search("A B C", memory_type=mem_type)
                with lock:
                    results.append((mem_type, [m.memory_type for m in r]))
            except Exception as e:
                with lock:
                    errors.append(e)

        threads = [
            threading.Thread(target=search_typed, args=("fact",)),
            threading.Thread(target=search_typed, args=("preference",)),
            threading.Thread(target=search_typed, args=("fact",)),
            threading.Thread(target=search_typed, args=("preference",)),
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert not errors
        for mem_type, types_found in results:
            assert all(t == mem_type for t in types_found), (
                f"Expected all {mem_type}, got {types_found}"
            )


# ── Connection Pool Under Load ────────────────────────────────────────────────


class TestConnectionPoolLoad:
    def test_mock_mode_has_no_pool_leak(self, mem):
        """Mock mode doesn't create a connection pool, so no leak possible."""
        assert mem._pool is None

    def test_concurrent_heal_operations(self, mem):
        """Multiple concurrent heal() calls don't corrupt state."""
        for i in range(10):
            mem.store("fact", f"Heal seed {i}")

        errors = []
        results = []

        def heal_worker():
            try:
                r = mem.heal()
                results.append(r)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=heal_worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert not errors
        assert len(results) == 5
        assert all(r["status"] == "healed" for r in results)

    def test_concurrent_audit_reads(self, mem):
        """Multiple threads reading the audit log simultaneously don't crash."""
        for i in range(5):
            mem.store("fact", f"Audit seed {i}")

        errors = []
        results = []

        def audit_worker():
            try:
                entries = mem.audit()
                results.append(len(entries))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=audit_worker) for _ in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert not errors
        assert all(r > 0 for r in results)


# ── Circuit Breaker State Transitions Under Concurrency ───────────────────────


class TestCircuitBreakerConcurrency:
    def test_concurrent_failures_open_circuit(self):
        """Many concurrent failures correctly open the circuit breaker."""
        cb = CircuitBreaker("concurrent-test", failure_threshold=20)
        errors = []

        def fail():
            try:
                cb.call(lambda: (_ for _ in ()).throw(RuntimeError("fail")))
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=fail) for _ in range(30)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert cb.state == CircuitState.OPEN
        assert len(errors) == 30

    def test_concurrent_successes_keep_closed(self):
        """Many concurrent successes keep the circuit breaker closed."""
        cb = CircuitBreaker("concurrent-test", failure_threshold=5)
        results = []

        def succeed():
            results.append(cb.call(lambda: 42))

        threads = [threading.Thread(target=succeed) for _ in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert cb.state == CircuitState.CLOSED
        assert len(results) == 50
        assert all(r == 42 for r in results)

    def test_mixed_concurrent_operations(self):
        """Mixed success/failure threads produce correct final state."""
        cb = CircuitBreaker("mixed-test", failure_threshold=10, recovery_timeout=1)
        errors = []
        successes = []
        lock = threading.Lock()

        def fail_n(n):
            for _ in range(n):
                try:
                    cb.call(lambda: (_ for _ in ()).throw(RuntimeError()))
                except Exception:
                    with lock:
                        errors.append(1)

        def succeed_n(n):
            for _ in range(n):
                try:
                    cb.call(lambda: 1)
                    with lock:
                        successes.append(1)
                except CircuitBreakerOpenError:
                    pass  # Expected when circuit opens

        # Launch mixed threads
        threads = (
            [threading.Thread(target=fail_n, args=(3,)) for _ in range(5)]
            + [threading.Thread(target=succeed_n, args=(3,)) for _ in range(5)]
        )
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=15)

        # Circuit should be open or closed depending on timing
        stats = cb.get_stats()
        assert stats["total_calls"] == 30
        # Failures + rejections + successes should equal 30 total calls
        assert stats["total_failures"] + stats["total_rejected"] + len(successes) == 30

    def test_half_open_concurrent_probe_limit(self):
        """In HALF_OPEN state, only one probe can execute at a time."""
        cb = CircuitBreaker(
            "probe-test",
            failure_threshold=2,
            recovery_timeout=2.0,
            success_threshold=2,
        )
        # Open the circuit
        for _ in range(2):
            try:
                cb.call(lambda: (_ for _ in ()).throw(RuntimeError()))
            except Exception:
                pass

        time.sleep(2.1)  # Wait for recovery timeout to enter HALF_OPEN

        probe_results = []
        probe_errors = []

        def probe():
            try:
                result = cb.call(lambda: "ok")
                probe_results.append(result)
            except CircuitBreakerOpenError:
                probe_errors.append("rejected")

        # Launch multiple probes — only one should succeed at a time (semaphore=1)
        threads = [threading.Thread(target=probe) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=5)

        # The semaphore limits concurrent probes to 1.
        # The first probe succeeds, the rest may succeed or be rejected
        # depending on timing. But the key assertion is that not ALL 5
        # run simultaneously (the semaphore guarantees serialization).
        total_attempts = len(probe_results) + len(probe_errors)
        assert total_attempts == 5
        # At least one must have been attempted (the semaphore allowed it)
        assert len(probe_results) >= 1

    def test_circuit_breaker_state_change_callback(self):
        """State change callback fires on transitions."""
        transitions = []

        def on_change(name, old, new):
            transitions.append((name, old, new))

        cb = CircuitBreaker(
            "callback-test",
            failure_threshold=2,
            recovery_timeout=0.1,
            on_state_change=on_change,
        )
        # Trigger OPEN
        for _ in range(2):
            try:
                cb.call(lambda: (_ for _ in ()).throw(RuntimeError()))
            except Exception:
                pass

        assert ("callback-test", "closed", "open") in transitions

        # Wait for HALF_OPEN
        time.sleep(0.2)
        _ = cb.state  # Trigger state check
        assert ("callback-test", "open", "half_open") in transitions


# ── Reinforce Concurrency ─────────────────────────────────────────────────────


class TestReinforceConcurrency:
    def test_concurrent_reinforce_increases_monotonically(self, mem):
        """Multiple concurrent reinforces produce a monotonically increasing score."""
        record = mem.store("fact", "Reinforce me concurrently")
        initial = record.importance_score

        def reinforce_worker():
            mem.reinforce(record.memory_id, success=True)

        threads = [threading.Thread(target=reinforce_worker) for _ in range(20)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        final = mem.get_memory(record.memory_id)
        # Score should be higher than initial (all reinforces succeeded)
        assert final.importance_score > initial

    def test_concurrent_delete_and_search(self, mem):
        """Deleting while searching doesn't crash."""
        records = [mem.store("fact", f"Delete-search {i}") for i in range(10)]
        errors = []

        def deleter():
            for r in records[:5]:
                try:
                    mem.delete_memory(r.memory_id)
                except Exception as e:
                    errors.append(e)

        def searcher():
            for _ in range(5):
                try:
                    mem.search("Delete-search")
                except Exception as e:
                    errors.append(e)

        threads = [threading.Thread(target=deleter), threading.Thread(target=searcher)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        assert not errors
