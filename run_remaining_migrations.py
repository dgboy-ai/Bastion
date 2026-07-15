"""Run missing schema migrations (no vector index to avoid hang)."""
import os

import psycopg

conn = psycopg.connect(os.environ["BASTION_CONN"])
conn.autocommit = True
cur = conn.cursor()

print("[7/10] 007_memory_decay.sql...")
cur.execute("ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS importance_score FLOAT DEFAULT 5.0")
print("  OK")

print("[9/10] 009_trust_scoring.sql...")
cur.execute("ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS trust_level INT DEFAULT 2")
cur.execute("ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS source_provenance STRING DEFAULT 'agent_direct'")
cur.execute("ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS overwrite_count INT DEFAULT 0")
print("  OK")

print("[10/10] 010_drift_detection.sql...")
cur.execute("""
    CREATE TABLE IF NOT EXISTS agent_drift_baselines (
        agent_id STRING NOT NULL, dimension STRING NOT NULL,
        mean FLOAT NOT NULL, stddev FLOAT NOT NULL,
        sample_count INT NOT NULL, baseline_window STRING NOT NULL DEFAULT '7d',
        established_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (agent_id, dimension)
    )
""")
cur.execute("""
    CREATE TABLE IF NOT EXISTS agent_drift_scores (
        score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id STRING NOT NULL, overall_drift_score FLOAT NOT NULL,
        dimensions JSONB NOT NULL, baseline_sessions INT NOT NULL,
        alert_threshold FLOAT NOT NULL DEFAULT 0.3,
        status STRING NOT NULL DEFAULT 'HEALTHY',
        top_drift_signals JSONB, recommendation STRING,
        scorable_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
""")
cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_drift_scores_agent_time
    ON agent_drift_scores (agent_id, scorable_at DESC)
""")
print("  OK")

conn.close()
print("All remaining migrations complete.")
