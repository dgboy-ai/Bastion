CREATE TABLE agent_memory (
    memory_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id           STRING NOT NULL,
    memory_type        STRING NOT NULL,
    content            TEXT NOT NULL,
    embedding          VECTOR(1024) NOT NULL,
    metadata           JSONB,
    previous_hash      STRING,
    cryptographic_hash STRING NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now(),
    expires_at         TIMESTAMPTZ,
    access_count       INT DEFAULT 0,
    INDEX idx_memory_agent (agent_id)
);
-- C-SPANN distributed vector index for semantic memory search
-- Enables sub-linear vector similarity search at scale with 94% compression vs pgvector
-- Requires CockroachDB v23.2+ with vector search enabled
CREATE INVERTED INDEX idx_memory_embedding ON agent_memory USING INVERTED (embedding) WITH (dim=1024);

-- CDC Changefeed: Streams every memory write for real-time anomaly detection and self-healing
-- Lambda handler receives events, checks hash chain integrity, detects poisoning attacks
CREATE CHANGEFEED FOR TABLE agent_memory
  INTO 'function://cdc_memory_handler'
  WITH updated, resolved, on_error=resume, initial_scan='no';
