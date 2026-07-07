"""Tests for EU AI Act Article 12 compliance and GDPR unlearning."""

from __future__ import annotations

from datetime import UTC, datetime

from bastion.compliance import (
    ComplianceMode,
    ComplianceReporter,
    IETFAATRecord,
    VerifiableUnlearning,
)
from bastion.memory import BastionMemory


class TestIETFAATRecord:
    def test_create_record(self):
        record = IETFAATRecord(
            agent_id="agent-1",
            action="memory_store",
            target="memory-123",
            outcome="success",
        )
        assert record.agent_id == "agent-1"
        assert record.action == "memory_store"
        assert record.target == "memory-123"
        assert record.outcome == "success"
        assert record.record_id is not None
        assert record.record_hash is not None
        assert record.previous_hash is None

    def test_to_dict_includes_all_fields(self):
        record = IETFAATRecord(
            agent_id="agent-1",
            action="memory_read",
            target="memory-456",
            outcome="success",
            metadata={"scope": "test"},
        )
        d = record.to_dict()
        assert d["record_id"] == record.record_id
        assert d["agent_id"] == "agent-1"
        assert d["action"] == "memory_read"
        assert d["target"] == "memory-456"
        assert d["outcome"] == "success"
        assert d["metadata"] == {"scope": "test"}
        assert d["previous_hash"] is None
        assert d["record_hash"] == record.record_hash
        assert d["schema_version"] == "ietf-aat-00"
        assert d["compliance_framework"] == "eu_ai_act_article_12"

    def test_to_dict_includes_timestamp(self):
        record = IETFAATRecord(
            agent_id="a1", action="store", target="t1", outcome="ok",
        )
        d = record.to_dict()
        assert "timestamp" in d
        assert d["timestamp"] == record.timestamp.isoformat()

    def test_hash_changes_with_content(self):
        r1 = IETFAATRecord("a1", "store", "t1", "ok")
        r2 = IETFAATRecord("a1", "store", "t2", "ok")
        assert r1.record_hash != r2.record_hash

    def test_hash_chains_when_previous_set(self):
        r1 = IETFAATRecord("a1", "store", "t1", "ok")
        r2 = IETFAATRecord("a1", "store", "t2", "ok")
        hash_without_prev = r2.record_hash
        r2.previous_hash = r1.record_hash
        hash_with_prev = r2._compute_hash()
        assert hash_with_prev != hash_without_prev

    def test_to_jsonl(self):
        record = IETFAATRecord("a1", "store", "t1", "ok")
        line = record.to_jsonl()
        import json
        parsed = json.loads(line)
        assert parsed["agent_id"] == "a1"
        assert parsed["action"] == "store"

    def test_custom_timestamp(self):
        ts = datetime(2025, 1, 1, tzinfo=UTC)
        record = IETFAATRecord("a1", "store", "t1", "ok", timestamp=ts)
        assert record.timestamp == ts


class TestComplianceReporter:
    def test_generate_report_basic(self):
        memory = BastionMemory(agent_id="compliance-test", mock=True)
        memory.store("fact", "User prefers Python")
        memory.store("preference", "Dark mode")

        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="compliance-test")

        assert report["agent_id"] == "compliance-test"
        assert report["summary"]["total_operations"] >= 2
        assert "report_id" in report
        assert report["compliance_status"]["framework"] == "EU AI Act Article 12"
        assert report["compliance_status"]["status"] == "COMPLIANT"

    def test_generate_report_filters_by_date(self):
        memory = BastionMemory(agent_id="date-filter", mock=True)
        memory.store("fact", "Old memory")

        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(
            agent_id="date-filter",
            start_date="2099-01-01T00:00:00+00:00",
        )
        assert report["summary"]["total_operations"] == 0

    def test_generate_report_date_range(self):
        memory = BastionMemory(agent_id="date-range", mock=True)
        memory.store("fact", "A memory")

        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(
            agent_id="date-range",
            start_date="2020-01-01T00:00:00+00:00",
            end_date="2099-12-31T23:59:59+00:00",
        )
        assert report["summary"]["total_operations"] >= 1

    def test_operations_by_type(self):
        memory = BastionMemory(agent_id="op-type", mock=True)
        memory.store("fact", "Fact one")
        memory.store("fact", "Fact two")
        memory.store("preference", "Pref one")

        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="op-type")
        by_type = report["summary"]["operations_by_type"]
        assert by_type.get("memory_store", 0) >= 3
        assert "memory_store" in report["summary"]["unique_actions"]

    def test_article12_requirements_present(self):
        memory = BastionMemory(agent_id="art12", mock=True)
        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="art12")
        reqs = report["art12_requirements"]
        assert reqs["automatic_event_recording"] is True
        assert reqs["tamper_evident_logs"] is True
        assert reqs["traceability"] is True
        assert reqs["human_oversight_verification"] is True
        assert reqs["post_market_monitoring"] is True

    def test_generate_report_without_memories(self):
        memory = BastionMemory(agent_id="empty-agent", mock=True)
        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="empty-agent")
        assert report["summary"]["total_operations"] == 0
        assert report["compliance_status"]["status"] == "COMPLIANT"

    def test_period_defaults(self):
        memory = BastionMemory(agent_id="period", mock=True)
        memory.store("fact", "Something")
        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="period")
        assert report["period"]["start"] == "all"
        assert report["period"]["end"] == "now"


class TestVerifiableUnlearning:
    def test_generate_receipt(self):
        memory = BastionMemory(agent_id="unlearn-test", mock=True)
        memory.store("fact", "Memory to keep")
        r2 = memory.store("fact", "Memory to delete")

        v = VerifiableUnlearning(memory)
        receipt = v.generate_unlearning_receipt("unlearn-test", [r2.memory_id])

        assert receipt["agent_id"] == "unlearn-test"
        assert receipt["deleted_memory_ids"] == [r2.memory_id]
        assert len(receipt["deleted_hashes"]) == 1
        assert receipt["deleted_hashes"][0] == r2.cryptographic_hash
        assert receipt["old_merkle_root"] is not None
        assert receipt["new_merkle_root"] is not None
        assert receipt["memories_after"] > receipt["memories_before"]
        assert receipt["compliance_framework"] == "GDPR Article 17"
        assert "receipt_id" in receipt

    def test_tombstone_added_after_unlearning(self):
        memory = BastionMemory(agent_id="tombstone-test", mock=True)
        r = memory.store("fact", "Sensitive data")

        v = VerifiableUnlearning(memory)
        v.generate_unlearning_receipt("tombstone-test", [r.memory_id])

        all_mems = memory.list_all()
        tombstones = [m for m in all_mems if m.metadata.get("tombstone") is True]
        assert len(tombstones) >= 1
        assert tombstones[0].metadata.get("original_memory_id") == r.memory_id

    def test_no_memories_to_delete(self):
        memory = BastionMemory(agent_id="no-delete", mock=True)
        memory.store("fact", "Keep this")

        v = VerifiableUnlearning(memory)
        receipt = v.generate_unlearning_receipt("no-delete", [])

        assert receipt["deleted_memory_ids"] == []
        assert receipt["deleted_hashes"] == []
        assert receipt["memories_before"] == receipt["memories_after"]

    def test_compute_merkle_root_empty(self):
        v = VerifiableUnlearning(None)
        root = v._compute_merkle_root([])
        import hashlib
        assert root == hashlib.sha256(b"empty").hexdigest()

    def test_compute_merkle_root_single(self):
        v = VerifiableUnlearning(None)
        root = v._compute_merkle_root(["a" * 64])
        assert len(root) == 64


def test_compliance_mode_enum():
    assert ComplianceMode.EU_AI_ACT.value == "eu_ai_act"
    assert ComplianceMode.HIPAA.value == "hipaa"
    assert ComplianceMode.SOC2.value == "soc2"
