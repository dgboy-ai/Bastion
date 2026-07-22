CREATE TABLE IF NOT EXISTS memory_compaction_log (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    memories_before INT NOT NULL DEFAULT 0,
    memories_compacted INT NOT NULL DEFAULT 0,
    memories_deleted INT NOT NULL DEFAULT 0,
    tokens_reclaimed INT NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status STRING NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    error_message STRING
);

CREATE INDEX IF NOT EXISTS idx_compaction_log_agent ON memory_compaction_log (agent_id, started_at DESC);
