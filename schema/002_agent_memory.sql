CREATE TABLE agent_memory (
    memory_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id           STRING NOT NULL,
    memory_type        STRING NOT NULL,
    content            TEXT NOT NULL,
    embedding          VECTOR(1536) NOT NULL,
    metadata           JSONB,
    previous_hash      STRING,
    cryptographic_hash STRING NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now(),
    expires_at         TIMESTAMPTZ,
    access_count       INT DEFAULT 0,
    INDEX idx_memory_agent (agent_id)
);
-- CREATE INDEX idx_memory_embedding ON agent_memory USING C_SPANN (embedding) WITH (dim=1536)
-- C-SPANN requires Enterprise license (exact vec search via <=> works without index)
