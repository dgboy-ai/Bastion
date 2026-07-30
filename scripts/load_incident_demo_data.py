#!/usr/bin/env python3
"""
Load real incident demo data into the CockroachDB cluster for the Incident Responder demo.
Run this ONCE before recording the demo video.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from bastion.memory import BastionMemory


INCIDENTS = [
    {
        "title": "P1: API Gateway 502 Errors - ap-south-1",
        "content": (
            "INCIDENT-2026-07-15-001: API Gateway returning 502 Bad Gateway for 12% of requests in ap-south-1. "
            "Root cause: CockroachDB range leaseholder loss on node n3 after AZ maintenance. "
            "Leaseholders for ranges [12345, 12456] moved to n7 in us-east-1, adding 180ms cross-region latency. "
            "Fix: Preemptively set lease preferences for critical tables to ap-south-1 nodes. "
            "Runbook: Check 'crdb_internal.node_liveness', verify leaseholder distribution with SHOW RANGES."
        ),
        "memory_type": "incident",
        "metadata": {
            "severity": "P1",
            "region": "ap-south-1",
            "cluster": "bastion-memory",
            "root_cause": "leaseholder_loss",
            "resolution_time_minutes": 23,
            "affected_services": ["api-gateway", "payments", "auth"],
            "runbook_ref": "RB-2026-07-15-001",
        },
    },
    {
        "title": "P2: Vector Search Latency Spike - High CPU",
        "content": (
            "INCIDENT-2026-07-18-003: C-SPANN vector index query latency spiked from 45ms p99 to 2.3s. "
            "Cause: New tenant onboarded with 500K vectors without partition-by-tenant. "
            "All vectors in single range caused hotspot on node n2 (95% CPU). "
            "Fix: ALTER TABLE memory_records SPLIT AT VALUES for tenant_id; added tenant-aware routing. "
            "Prevention: Auto-split threshold at 100K vectors per tenant."
        ),
        "memory_type": "incident",
        "metadata": {
            "severity": "P2",
            "region": "ap-south-1",
            "cluster": "bastion-memory",
            "root_cause": "vector_hotspot",
            "resolution_time_minutes": 45,
            "affected_services": ["memory-search", "recommendations"],
            "runbook_ref": "RB-2026-07-18-003",
        },
    },
    {
        "title": "P1: Backup Restore Failed - Encryption Key Mismatch",
        "content": (
            "INCIDENT-2026-07-20-002: Point-in-time restore to 2026-07-19 03:00 UTC failed with "
            "'encryption key not found' error. Backup taken with CMEK key 'prod-backup-key-v2' "
            "but key was rotated to v3 on 2026-07-19 04:00. Old key version destroyed by KMS policy. "
            "Fix: Re-enabled key version v2 in KMS, re-ran restore. "
            "Lesson: CMEK key rotation must retain versions used by active backups. "
            "Runbook: Check KMS key versions before restore; use 'ccloud backup list --cluster' to verify."
        ),
        "memory_type": "incident",
        "metadata": {
            "severity": "P1",
            "region": "ap-south-1",
            "cluster": "bastion-memory",
            "root_cause": "cmek_key_rotation",
            "resolution_time_minutes": 67,
            "affected_services": ["disaster-recovery"],
            "runbook_ref": "RB-2026-07-20-002",
        },
    },
    {
        "title": "P2: Schema Change Hung - Online Index Backfill",
        "content": (
            "INCIDENT-2026-07-22-001: CREATE INDEX CONCURRENTLY ON events(tenant_id, created_at) "
            "stuck in backfill for 4+ hours on 2.1TB table. Blocked by long-running transaction "
            "holding SERIALIZABLE snapshot. Backfill progress: 34% (714GB of 2.1TB). "
            "Fix: CANCEL QUERY on blocker (pg_backend_pid=14522), backfill completed in 18 min. "
            "Prevention: Set 'sql.defaults.statement_timeout' = '30m' for schema changes; "
            "monitor with 'SHOW JOBS' and 'crdb_internal.backfill_progress'. "
            "Agent Skill 'schema-risk-analysis' predicted 2.1TB backfill."
        ),
        "memory_type": "incident",
        "metadata": {
            "severity": "P2",
            "region": "ap-south-1",
            "cluster": "bastion-memory",
            "root_cause": "long_running_txn_blocking_backfill",
            "resolution_time_minutes": 18,
            "affected_services": ["analytics", "event-ingestion"],
            "runbook_ref": "RB-2026-07-22-001",
        },
    },
    {
        "title": "P3: Cross-Region Replication Lag - DR Drill",
        "content": (
            "INCIDENT-2026-07-25-001: Scheduled DR drill revealed 47-minute replication lag to us-east-1. "
            "Cause: Network throughput limit on VPC peering (1 Gbps) insufficient for 2.3TB database. "
            "RPO at risk: 47 min vs 5 min target. Fix: Requested AWS PrivateLink 10 Gbps upgrade; "
            "temporary workaround: pause non-critical writes during DR window. "
            "Monitoring: Added 'replication_lag_seconds' alert at 300s threshold. "
            "Skill: 'multi-region-design' REGIONAL BY ROW would avoid cross-region writes."
        ),
        "memory_type": "incident",
        "metadata": {
            "severity": "P3",
            "region": "ap-south-1",
            "cluster": "bastion-memory",
            "root_cause": "network_bandwidth_limit",
            "resolution_time_minutes": 0,
            "affected_services": ["disaster-recovery"],
            "runbook_ref": "RB-2026-07-25-001",
        },
    },
    {
        "title": "Runbook: Diagnose Hot Ranges (Skill: range-analysis)",
        "content": (
            "RUNBOOK RB-2026-07-15-001: When CPU > 80% on single node, check for hot ranges. "
            "1. SHOW RANGES FROM TABLE memory_records WHERE leaseholder = '<hot_node>'; "
            "2. crdb_internal.ranges_no_leases to find under-replicated; "
            "3. ALTER TABLE ... SPLIT AT VALUES to distribute; "
            "4. Set zone config: ALTER TABLE ... CONFIGURE ZONE USING lease_preferences='[[+region=ap-south-1]]'; "
            "5. Verify with DB Console > Metrics > Range Leaseholders."
        ),
"memory_type": "runbook",
        "metadata": {
            "skill": "schema-risk-analysis",
            "severity": "reference",
            "cluster": "bastion-memory",
        },
    },
    {
        "title": "Runbook: Vector Index Hotspot Mitigation",
        "content": (
            "RUNBOOK RB-2026-07-18-003: When vector search latency > 1s p99, check C-SPANN hotspots. "
            "1. SELECT * FROM crdb_internal.cluster_statements WHERE fingerprint = 'vector_search'; "
            "2. Check range distribution: SHOW RANGES FROM INDEX memory_records@cocktailr_embedding_idx; "
            "3. If single range > 50% CPU: ALTER TABLE memory_records SPLIT AT VALUES (tenant_id); "
            "4. Add tenant-aware routing in application layer; "
            "5. Consider REGIONAL BY ROW for multi-tenant vector workloads."
        ),
        "memory_type": "runbook",
        "metadata": {
            "skill": "analyzing-schema-change-storage-risk",
            "severity": "reference",
            "cluster": "bastion-memory",
        },
    },
    {
        "title": "Runbook: CMEK Backup Restore Procedure",
        "content": (
            "RUNBOOK RB-2026-07-20-002: Before any PITR restore, verify KMS key availability. "
            "1. ccloud backup list --cluster=bastion-memory --format=json | jq '.[] | .encryption_key_version'; "
            "2. In AWS KMS console, verify key version exists and is ENABLED; "
            "3. If key destroyed: contact AWS support for key recovery (7-30 days); "
            "4. Alternative: restore to new cluster with current key, then logical replicate."
        ),
        "memory_type": "runbook",
        "metadata": {
            "skill": "managing-certificates-and-encryption",
            "severity": "reference",
            "cluster": "bastion-memory",
        },
    },
    {
        "title": "Runbook: Schema Change Safety Checklist",
        "content": (
            "RUNBOOK RB-2026-07-22-001: Before any DDL on tables > 100GB: "
            "1. Run 'schema-risk-analysis' skill to estimate backfill size/time; "
            "2. Set session: SET sql.defaults.statement_timeout = '30m'; "
            "3. Run during low-traffic window; "
            "4. Monitor with: SHOW JOBS WHERE job_type = 'SCHEMA CHANGE'; "
            "5. Have CANCEL QUERY ready for blocker sessions; "
            "6. Post-DDL: ANALYZE TABLE to update statistics."
        ),
        "memory_type": "runbook",
        "metadata": {
            "skill": "analyzing-schema-change-storage-risk",
            "severity": "reference",
            "cluster": "bastion-memory",
        },
    },
    {
        "title": "Runbook: Multi-Region Replication Monitoring",
        "content": (
            "RUNBOOK RB-2026-07-25-001: Daily replication health check. "
            "1. ccloud cluster describe --cluster=bastion-memory --format=json | jq '.replication_lag_seconds'; "
            "2. Alert if lag > 300s (5 min); "
            "3. Check network: AWS VPC peering metrics > 80% utilization = upgrade; "
            "4. Consider REGIONAL BY ROW tables for low-latency reads in us-east-1; "
            "5. DR drill monthly: ccloud sql --cluster=dr-cluster 'SELECT now()' verify < 10s."
        ),
        "memory_type": "runbook",
        "metadata": {
            "skill": "designing-multi-region-applications",
            "severity": "reference",
            "cluster": "bastion-memory",
        },
    },
]


def main():
    print("=" * 60)
    print("Loading Incident Responder Demo Data")
    print("=" * 60)
    print(f"Cluster: bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud")
    print(f"Cluster ID: <your-cluster-id>")
    print()

    mem = BastionMemory("incident-responder-demo", connection_string=os.environ.get("BASTION_CONN"), mock=False)

    print(f"Connected to cluster. Storing {len(INCIDENTS)} memories...")
    print()

    stored = mem.store_batch(INCIDENTS)

    print(f"[OK] Successfully stored {len(stored)} memories")
    print()
    for r in stored:
        print(f"  - {r.memory_id}: {r.memory_type} - {r.metadata.get('severity', 'N/A')}")
    print()
    print("Demo data loaded. Ready for Incident Responder demo!")


if __name__ == "__main__":
    main()