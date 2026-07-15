"""Verify all tables and columns exist."""
import os

import psycopg

conn = psycopg.connect(os.environ["BASTION_CONN"])
conn.autocommit = True
cur = conn.cursor()

expected = {
    "agent_checkpoints": ["workflow_id", "agent_id", "step_number", "step_type", "input_data", "output_data", "idempotency_key", "token_cost", "status", "health_score", "created_at", "completed_at", "region"],
    "agent_memory": ["memory_id", "agent_id", "memory_type", "content", "embedding", "metadata", "previous_hash", "cryptographic_hash", "created_at", "expires_at", "access_count", "importance_score", "trust_level", "source_provenance", "overwrite_count"],
    "agent_audit": ["audit_id", "agent_id", "workflow_id", "action", "details", "recorded_at"],
    "agent_coordination": ["lock_id", "agent_id", "resource", "lock_type", "acquired_at", "expires_at", "payload"],
    "agent_entities": ["entity_id", "agent_id", "entity_type", "name", "attributes", "valid_from", "valid_until", "created_at"],
    "agent_relations": ["relation_id", "agent_id", "source_entity_id", "target_entity_id", "relation_type", "confidence", "valid_from", "valid_until", "source_memory_id", "created_at"],
    "agent_messages": ["message_id", "namespace", "sender_agent_id", "event_type", "payload", "created_at", "expires_at", "read"],
    "agent_drift_baselines": ["agent_id", "dimension", "mean", "stddev", "sample_count", "baseline_window", "established_at"],
    "agent_drift_scores": ["score_id", "agent_id", "overall_drift_score", "dimensions", "baseline_sessions", "alert_threshold", "status", "top_drift_signals", "recommendation", "scorable_at"],
}

all_ok = True
for table, cols in expected.items():
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position", (table,))
    actual = [r[0] for r in cur.fetchall()]
    missing = [c for c in cols if c not in actual]
    if missing:
        print(f"FAIL {table}: missing columns: {missing}")
        all_ok = False
    else:
        print(f"OK {table}: {len(actual)} columns (expected {len(cols)})")

conn.close()
if all_ok:
    print("\n✓ All 9 tables verified!")
else:
    print("\n✗ Some tables have missing columns")
