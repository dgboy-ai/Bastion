"""Tests for trust scoring module."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from bastion.trust import compute_trust_score


class TestTrustScore:
    def test_healthy_memory_high_score(self):
        report = compute_trust_score(
            memory_id="m1",
            content="test content",
            metadata={"source": "verified"},
            previous_hash=None,
            cryptographic_hash=None,
            source_provenance="system",
            trust_level=4,
            overwrite_count=0,
            created_at=datetime.now(UTC),
            last_accessed_at=datetime.now(UTC),
        )
        assert report.trust_score > 0.5
        assert report.poisoning_risk in ("NONE", "LOW")

    def test_hash_chain_break_returns_zero(self):
        report = compute_trust_score(
            memory_id="m1",
            content="test",
            metadata=None,
            previous_hash="abc",
            cryptographic_hash="bad_hash",
            source_provenance="agent_direct",
            trust_level=2,
            overwrite_count=0,
            created_at=datetime.now(UTC),
            last_accessed_at=datetime.now(UTC),
        )
        assert report.trust_score == 0.0
        assert report.poisoning_risk == "CRITICAL"
        assert report.hash_chain_intact is False

    def test_old_memory_penalty(self):
        report = compute_trust_score(
            memory_id="m1",
            content="test",
            metadata=None,
            previous_hash=None,
            cryptographic_hash=None,
            source_provenance="agent_direct",
            trust_level=2,
            overwrite_count=0,
            created_at=datetime.now(UTC) - timedelta(days=100),
            last_accessed_at=datetime.now(UTC),
        )
        assert report.age_penalty > 0

    def test_rapid_overwrite_flag(self):
        report = compute_trust_score(
            memory_id="m1",
            content="test",
            metadata=None,
            previous_hash=None,
            cryptographic_hash=None,
            source_provenance="agent_direct",
            trust_level=2,
            overwrite_count=15,
            created_at=datetime.now(UTC),
            last_accessed_at=datetime.now(UTC),
        )
        assert "RAPID_OVERWRITE" in report.flags

    def test_unknown_provenance_penalizes(self):
        report = compute_trust_score(
            memory_id="m1",
            content="test",
            metadata=None,
            previous_hash=None,
            cryptographic_hash=None,
            source_provenance="unknown",
            trust_level=0,
            overwrite_count=0,
            created_at=datetime.now(UTC),
            last_accessed_at=datetime.now(UTC),
        )
        assert report.trust_score < 0.5
