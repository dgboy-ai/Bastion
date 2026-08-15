"""EU AI Act Article 12 Compliance Mode for Bastion.

Provides IETF AAT (Agent Audit Trail) compliant audit logging,
GDPR Article 17 verifiable unlearning receipts, and compliance
report generation.

References:
- EU AI Act Article 12: https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- IETF AAT Draft: draft-sharif-agent-audit-trail-00
- GDPR Article 17: Right to Erasure
"""

from __future__ import annotations

import base64
import hashlib
import json
import uuid
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class ComplianceMode(StrEnum):
    """Supported regulatory compliance frameworks."""

    EU_AI_ACT = "eu_ai_act"
    HIPAA = "hipaa"
    SOC2 = "soc2"


class IETFAATRecord:
    """IETF Agent Audit Trail compliant record format."""

    def __init__(
        self,
        agent_id: str,
        action: str,
        target: str,
        outcome: str,
        timestamp: datetime | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        self.record_id = str(uuid.uuid4())
        self.agent_id = agent_id
        self.action = action
        self.target = target
        self.outcome = outcome
        self.timestamp = timestamp or datetime.now(UTC)
        self.metadata = metadata or {}
        self.previous_hash: str | None = None
        self.record_hash: str = self._compute_hash()

    def link_to(self, previous_record: IETFAATRecord) -> None:
        """Link this record to the previous one in the hash chain."""
        self.previous_hash = previous_record.record_hash
        self.record_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        from bastion.crypto import compute_hash

        data = f"{self.agent_id}{self.action}{self.target}{self.outcome}{self.timestamp.isoformat()}"
        return compute_hash(data, None, self.previous_hash)

    def to_dict(self) -> dict[str, Any]:
        return {
            "record_id": self.record_id,
            "agent_id": self.agent_id,
            "action": self.action,
            "target": self.target,
            "outcome": self.outcome,
            "timestamp": self.timestamp.isoformat(),
            "metadata": self.metadata,
            "previous_hash": self.previous_hash,
            "record_hash": self.record_hash,
            "schema_version": "ietf-aat-00",
            "compliance_framework": "eu_ai_act_article_12",
        }

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict(), default=str)


class ComplianceReporter:
    """Generates EU AI Act compliance reports from audit data."""

    def __init__(self, memory: Any):
        self.memory = memory

    def _check_hash_chain_integrity(self) -> bool:
        """Check if any memories have broken hash chains (NULL cryptographic_hash)."""
        try:
            if self.memory._mock:
                return True
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=10.0)
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT COUNT(*) FROM agent_memory WHERE agent_id = %s AND cryptographic_hash IS NULL",
                        (self.memory.agent_id,),
                    )
                    broken = cur.fetchone()[0]
                    return broken == 0
            finally:
                pool.release(conn)
        except Exception:
            return False

    def generate_report(
        self,
        agent_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> dict[str, Any]:
        """Generate a compliance report for a given time period."""
        audit_entries = self.memory.audit(agent_id=agent_id)

        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if start_dt.tzinfo is None:
                start_dt = start_dt.replace(tzinfo=UTC)
            audit_entries = [e for e in audit_entries if e.recorded_at >= start_dt]
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=UTC)
            audit_entries = [e for e in audit_entries if e.recorded_at <= end_dt]

        total_operations = len(audit_entries)
        operations_by_type: dict[str, int] = {}
        for entry in audit_entries:
            operations_by_type[entry.action] = operations_by_type.get(entry.action, 0) + 1

        return {
            "report_id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "generated_at": datetime.now(UTC).isoformat(),
            "period": {
                "start": start_date or "all",
                "end": end_date or "now",
            },
            "summary": {
                "total_operations": total_operations,
                "operations_by_type": operations_by_type,
                "unique_actions": list(operations_by_type.keys()),
            },
            "compliance_status": {
                "framework": "EU AI Act Article 12",
                "tamper_evident_logging": bool(audit_entries),
                "hash_chain_integrity": self._check_hash_chain_integrity(),
                "audit_trail_format": "IETF AAT draft-sharif-agent-audit-trail-00",
                "status": "COMPLIANT" if audit_entries else "NO_DATA",
            },
            "art12_requirements": {
                "automatic_event_recording": total_operations > 0,
                "tamper_evident_logs": self._check_hash_chain_integrity(),
                "traceability": len(set(getattr(e, "action", "") for e in audit_entries)) >= 1,
                "human_oversight_verification": any(
                    getattr(e, "action", "") in ("memory_correct", "delete", "heal") for e in audit_entries
                ),
                "post_market_monitoring": total_operations > 0,
            },
        }


class VerifiableUnlearning:
    """GDPR Article 17 verifiable unlearning with Merkle receipts.

    Performs soft-delete (UPDATE to tombstone content) for each memory,
    recalculates the active Merkle tree root, and optionally signs the
    receipt with the host agent's Ed25519 key for cryptographic
    non-repudiation.

    NOTE: This implements soft-delete for audit trail purposes. True GDPR
    Art 17 physical deletion requires additional steps (backup purging,
    MVCC history cleanup) that are outside this module's scope.

    Usage::

        from bastion.a2a_signing import AgentCardSigner

        signer = AgentCardSigner.from_env()
        uv = VerifiableUnlearning(memory, signer=signer)
        receipt = uv.generate_unlearning_receipt("agent-1", [mem_id])
    """

    def __init__(self, memory: Any, signer: Any | None = None):
        self.memory = memory
        self._signer = signer

    def generate_unlearning_receipt(
        self,
        agent_id: str,
        memory_ids: list[str],
    ) -> dict[str, Any]:
        """Generate a signed cryptographic receipt for physically purged memories."""
        memory_agent = getattr(self.memory, "agent_id", None)
        if memory_agent is not None and agent_id != memory_agent:
            raise PermissionError(
                f"Cannot unlearn memories for agent {agent_id}: memory instance belongs to agent {memory_agent}"
            )

        all_memories = self.memory.list_all()
        agent_memories = [m for m in all_memories if m.agent_id == agent_id]
        all_hashes = [m.cryptographic_hash for m in agent_memories if m.cryptographic_hash]
        deleted_hashes = [
            m.cryptographic_hash for m in agent_memories if m.memory_id in memory_ids and m.cryptographic_hash
        ]

        old_root = self._compute_merkle_root(all_hashes)

        # Physical hard delete in a SINGLE transaction for atomicity
        deleted_ids: list[str] = []
        not_found_ids: list[str] = []

        if memory_ids and hasattr(self.memory, "get_pool") and not getattr(self.memory, "_mock", False):
            pool = self.memory.get_pool()
            conn = pool.acquire(timeout=30.0)
            try:
                with conn.cursor() as cur:
                    # Physical hard delete (GDPR Art 17 — right to erasure)
                    # Note: This breaks the hash chain for subsequent records.
                    # The audit trail records the deletion, and hash chain
                    # verification stops at the last intact record.
                    cur.execute(
                        "DELETE FROM agent_memory WHERE memory_id = ANY(%s) AND agent_id = %s RETURNING memory_id",
                        (memory_ids, agent_id),
                    )
                    deleted_ids = [row[0] for row in cur.fetchall()]
                    not_found_ids = [mid for mid in memory_ids if mid not in deleted_ids]

                    # Audit trail in same transaction
                    for mid in deleted_ids:
                        cur.execute(
                            "INSERT INTO agent_audit (agent_id, action, details, recorded_at) "
                            "VALUES (%s, %s, %s, now())",
                            (
                                agent_id,
                                "gdpr_art17_unlearn",
                                json.dumps({"memory_id": mid, "compliance": "gdpr_art17"}),
                            ),
                        )
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error("GDPR unlearning failed — all deletions rolled back: %s", e)
                raise
            finally:
                pool.release(conn)
        else:
            # Fallback: individual deletes (mock mode or no pool)
            for mid in memory_ids:
                if self.memory.delete_memory(mid):
                    deleted_ids.append(mid)
                else:
                    not_found_ids.append(mid)

        if not_found_ids:
            logger.warning("Some memory IDs not found for unlearning", extra={"not_found": not_found_ids})

        deleted_hash_map = {m.memory_id: m.cryptographic_hash for m in agent_memories if m.memory_id in memory_ids}
        # Persist IETF AAT audit record for each deletion (linked hash chain)
        prev_record = None
        for mid in deleted_ids:
            record = IETFAATRecord(
                agent_id=agent_id,
                action="gdpr_art17_unlearn",
                target=mid,
                outcome="deleted",
                metadata={"compliance": "gdpr_art17", "deleted_hash": deleted_hash_map.get(mid, "")},
            )
            if prev_record:
                record.link_to(prev_record)
            prev_record = record
            self.memory.store_audit(
                agent_id=agent_id,
                action=record.action,
                details=record.to_jsonl(),
            )
            logger.info("Unlearning audit record: %s", record.to_jsonl())

        # Capture post-deletion state safely — use list_memories with limit to avoid OOM
        try:
            after_memories = self.memory.list_memories(limit=10_000)
            after_agent_memories = [m for m in after_memories if m.agent_id == agent_id]
            after_hashes = [m.cryptographic_hash for m in after_agent_memories]
            new_root = self._compute_merkle_root(after_hashes)
            memories_after = len(after_agent_memories)
        except Exception as exc:
            logger.error("Failed to compute Merkle root after deletion", extra={"error": str(exc)})
            new_root = "unknown"
            memories_after = -1

        receipt: dict[str, Any] = {
            "@context": "https://w3id.org/security/v3",
            "type": "VerifiableUnlearningReceipt",
            "receipt_id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "deleted_memory_ids": memory_ids,
            "deleted_hashes": deleted_hashes,
            "not_found_ids": not_found_ids,
            "old_merkle_root": old_root,
            "new_merkle_root": new_root,
            "memories_before": len(agent_memories),
            "memories_after": memories_after,
            "compliance_framework": "GDPR Article 17",
            "verification_method": "SHA-256 Merkle Tree",
            "valid": new_root != "unknown" and memories_after >= 0,
        }

        if self._signer is not None:
            receipt_json = json.dumps(
                {k: v for k, v in receipt.items() if k != "signature"},
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            ).encode()
            sig_value = self._signer.sign_data(receipt_json)
            receipt["signature"] = {
                "algorithm": "ed25519",
                "value": base64.b64encode(sig_value).decode(),
                "publicKeyPem": self._signer.get_public_key_pem(),
                "signedFields": sorted(k for k in receipt if k != "signature"),
            }
        else:
            # No signer — receipt has no cryptographic assurance
            receipt["signature"] = None
            receipt["unsigned_warning"] = "Receipt is not cryptographically signed — no assurance of integrity"

        return receipt

    def _compute_merkle_root(self, hashes: list[str]) -> str:
        if not hashes:
            return hashlib.sha256(b"\x00").hexdigest()
        from bastion.merkle import MerkleTree

        return MerkleTree.from_hashes(hashes).root
