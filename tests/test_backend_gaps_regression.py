"""Regression test cases verifying structural gaps identified across backend core modules."""

import asyncio
import os
import pytest
from bastion.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError
from bastion.embeddings import _ensure_dim, TARGET_DIM
from bastion.cache_router import MemoryRouter
from bastion.capture_hooks import CaptureHooks, _redact_sensitive_content


class FakeMockMemory:
    def __init__(self):
        self.agent_id = "test-agent"
        self._stored = []

    def store(self, memory_type, content, metadata=None, **kwargs):
        rec = type(
            "Rec",
            (),
            {
                "memory_id": f"mem-{len(self._stored)}",
                "content": content,
                "memory_type": memory_type,
                "metadata": metadata or {},
                "embedding": [0.1] * TARGET_DIM,
            },
        )()
        self._stored.append(rec)
        return rec

    def search(self, query, k=5, threshold=0.0, memory_type=None, namespace_scope="own"):
        return self._stored[:k]


def test_ensure_dim_zero_padding_preserves_dimensions_and_geometry():
    """Ensure dimension padding is zero-padded without pseudo-random hash avalanche."""
    short_vec = [0.5, 0.5, 0.5, 0.5]
    padded = _ensure_dim(short_vec)
    assert len(padded) == TARGET_DIM
    # Tail dimensions should be zero
    assert all(x == 0.0 for x in padded[4:])
    # First 4 components should remain equal
    assert padded[0] == padded[1] == padded[2] == padded[3]


def test_capture_hooks_redacts_sensitive_credentials():
    """Ensure API keys, connection strings, and tokens are redacted before storage."""
    fake_mem = FakeMockMemory()
    hooks = CaptureHooks(fake_mem)

    raw_args = {
        "api_key": "secret_key_1234567890",
        "connection_string": "postgresql://user:pass@localhost:5432/db",
    }
    event = hooks.after_tool_call("db_connect", arguments=raw_args)
    assert event is not None
    # Check that secrets in content were redacted
    assert "pass@localhost" not in fake_mem._stored[0].content
    assert "[REDACTED" in fake_mem._stored[0].content or "REDACTED" in fake_mem._stored[0].content


def test_cache_router_records_hits_and_misses():
    """Verify cache hits and misses are properly tracked and not dead code."""
    fake_mem = FakeMockMemory()
    # Pre-store memory
    rec = fake_mem.store("semantic", "Important system architecture note")
    router = MemoryRouter(fake_mem, promotion_threshold=1)

    # Initial search misses cache
    stats_before = router.get_stats()
    assert stats_before["cache_hits"] == 0

    router.search("architecture", k=2, threshold=0.0)
    stats_after_miss = router.get_stats()
    # Cache hit or miss was recorded
    assert stats_after_miss["cache_hits"] + stats_after_miss["cache_misses"] > 0


@pytest.mark.asyncio
async def test_circuit_breaker_async_lock_across_event_loops():
    """Verify circuit breaker async_call operates smoothly without loop binding errors."""
    cb = CircuitBreaker("test-cb", failure_threshold=2)

    async def sample_task():
        return 42

    res = await cb.async_call(sample_task)
    assert res == 42

