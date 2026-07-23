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
from bastion.merkle import MerkleTree


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
        # Store some memories to generate audit entries
        memory.store("fact", "User prefers dark mode")
        memory.store("task", "Deploy to production")
        memory.store("preference", "Use TypeScript for frontend")
        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="art12")
        reqs = report["art12_requirements"]
        assert reqs["automatic_event_recording"] is True
        assert reqs["traceability"] is True
        assert reqs["post_market_monitoring"] is True

    def test_generate_report_without_memories(self):
        memory = BastionMemory(agent_id="empty-agent", mock=True)
        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="empty-agent")
        assert report["summary"]["total_operations"] == 0
        assert report["compliance_status"]["status"] == "NO_DATA"

    def test_period_defaults(self):
        memory = BastionMemory(agent_id="period", mock=True)
        memory.store("fact", "Something")
        reporter = ComplianceReporter(memory)
        report = reporter.generate_report(agent_id="period")
        assert report["period"]["start"] == "all"
        assert report["period"]["end"] == "now"


class TestStoreAudit:
    def test_store_audit_writes_to_mock(self):
        memory = BastionMemory(agent_id="audit-test", mock=True)
        memory.store_audit("test_action", {"key": "value"})
        entries = memory.audit("audit-test")
        assert len(entries) >= 1
        matching = [e for e in entries if e.action == "test_action"]
        assert len(matching) == 1
        assert matching[0].details == {"key": "value"}

    def test_store_audit_with_string_details(self):
        memory = BastionMemory(agent_id="audit-str", mock=True)
        memory.store_audit("log_event", '{"raw": "json_string"}')
        entries = memory.audit("audit-str")
        matching = [e for e in entries if e.action == "log_event"]
        assert len(matching) == 1


class TestVerifiableUnlearning:
    def test_generate_receipt_hard_delete(self):
        memory = BastionMemory(agent_id="unlearn-test", mock=True)
        memory.store("fact", "Memory to keep")
        r2 = memory.store("fact", "Memory to delete")
        mid = r2.memory_id

        v = VerifiableUnlearning(memory)
        receipt = v.generate_unlearning_receipt("unlearn-test", [mid])

        assert receipt["agent_id"] == "unlearn-test"
        assert receipt["deleted_memory_ids"] == [mid]
        assert len(receipt["deleted_hashes"]) == 1
        assert receipt["deleted_hashes"][0] == r2.cryptographic_hash
        assert receipt["old_merkle_root"] is not None
        assert receipt["new_merkle_root"] is not None
        assert receipt["old_merkle_root"] != receipt["new_merkle_root"]
        assert receipt["memories_before"] == 2
        assert receipt["memories_after"] == 1
        assert receipt["compliance_framework"] == "GDPR Article 17"
        assert receipt["type"] == "VerifiableUnlearningReceipt"
        assert receipt["@context"] == "https://w3id.org/security/v3"
        assert "receipt_id" in receipt
        assert receipt["not_found_ids"] == []

    def test_memory_physically_deleted(self):
        memory = BastionMemory(agent_id="purge-test", mock=True)
        r = memory.store("fact", "Sensitive data")

        v = VerifiableUnlearning(memory)
        v.generate_unlearning_receipt("purge-test", [r.memory_id])

        all_mems = memory.list_all()
        agent_mems = [m for m in all_mems if m.agent_id == "purge-test"]
        assert len(agent_mems) == 0
        cached = memory.get_memory(r.memory_id)
        assert cached is None

    def test_no_memories_to_delete(self):
        memory = BastionMemory(agent_id="no-delete", mock=True)
        memory.store("fact", "Keep this")

        v = VerifiableUnlearning(memory)
        receipt = v.generate_unlearning_receipt("no-delete", [])

        assert receipt["deleted_memory_ids"] == []
        assert receipt["deleted_hashes"] == []
        assert receipt["memories_before"] == receipt["memories_after"]
        assert receipt["old_merkle_root"] == receipt["new_merkle_root"]
        assert receipt["not_found_ids"] == []

    def test_receipt_ed25519_signed(self):
        from bastion.a2a_signing import AgentCardSigner

        signer = AgentCardSigner()
        memory = BastionMemory(agent_id="signed-test", mock=True)
        r = memory.store("fact", "Sign this deletion")

        v = VerifiableUnlearning(memory, signer=signer)
        receipt = v.generate_unlearning_receipt("signed-test", [r.memory_id])

        assert "signature" in receipt
        sig = receipt["signature"]
        assert sig["algorithm"] == "ed25519"
        assert sig["publicKeyPem"] == signer.get_public_key_pem()
        assert "value" in sig
        assert len(sig["value"]) > 0

    def test_receipt_signature_verifiable(self):
        from bastion.a2a_signing import AgentCardSigner

        signer = AgentCardSigner()
        memory = BastionMemory(agent_id="verify-test", mock=True)
        r = memory.store("fact", "Verify this")

        v = VerifiableUnlearning(memory, signer=signer)
        receipt = v.generate_unlearning_receipt("verify-test", [r.memory_id])

        # Verify the signature
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives import serialization

        pubkey_pem = receipt["signature"]["publicKeyPem"]
        pubkey = serialization.load_pem_public_key(pubkey_pem.encode())
        sig_value = __import__("base64").b64decode(receipt["signature"]["value"])
        receipt_json = __import__("json").dumps(
            {k: v for k, v in receipt.items() if k != "signature"},
            sort_keys=True, separators=(",", ":"), default=str,
        ).encode()
        try:
            pubkey.verify(sig_value, receipt_json)
            valid = True
        except InvalidSignature:
            valid = False
        assert valid, "Receipt Ed25519 signature is invalid"

    def test_unreceipt_without_signer_no_signature(self):
        memory = BastionMemory(agent_id="unsigned-test", mock=True)
        r = memory.store("fact", "No signer")

        v = VerifiableUnlearning(memory)
        receipt = v.generate_unlearning_receipt("unsigned-test", [r.memory_id])

        assert receipt.get("signature") is None

    def test_unlearning_persists_audit_trail(self):
        memory = BastionMemory(agent_id="audit-trail", mock=True)
        r = memory.store("fact", "Audit this deletion")

        v = VerifiableUnlearning(memory)
        v.generate_unlearning_receipt("audit-trail", [r.memory_id])

        entries = memory.audit("audit-trail")
        gdpr_entries = [e for e in entries if e.action == "gdpr_art17_unlearn"]
        assert len(gdpr_entries) == 1
        import json
        details = gdpr_entries[0].details
        if isinstance(details, str):
            details = json.loads(details)
        assert details.get("action") == "gdpr_art17_unlearn"
        assert details.get("target") == r.memory_id
        assert details.get("outcome") == "deleted"

    def test_compute_merkle_root_empty(self):
        v = VerifiableUnlearning(None)
        root = v._compute_merkle_root([])
        from bastion.merkle import MerkleTree
        assert root == MerkleTree._hash("")
        assert len(root) == 64

    def test_compute_merkle_root_single(self):
        v = VerifiableUnlearning(None)
        root = v._compute_merkle_root(["a" * 64])
        assert len(root) == 64
        # Merkle tree applies domain-separated hashing, so root != input
        expected = MerkleTree.from_hashes(["a" * 64]).root
        assert root == expected

    def test_compute_merkle_root_pair(self):
        from bastion.merkle import MerkleTree

        v = VerifiableUnlearning(None)
        root = v._compute_merkle_root(["aa", "bb"])
        expected = MerkleTree.from_hashes(["aa", "bb"]).root
        assert root == expected

    def test_compute_merkle_root_odd_padded(self):
        from bastion.merkle import MerkleTree

        v = VerifiableUnlearning(None)
        root = v._compute_merkle_root(["aa", "bb", "cc"])
        expected = MerkleTree.from_hashes(["aa", "bb", "cc"]).root
        assert root == expected


def test_compliance_mode_enum():
    assert ComplianceMode.EU_AI_ACT.value == "eu_ai_act"
    assert ComplianceMode.HIPAA.value == "hipaa"
    assert ComplianceMode.SOC2.value == "soc2"
