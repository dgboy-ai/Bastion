CREATE TABLE IF NOT EXISTS agent_memory (
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

-- C-SPANN distributed vector index for multi-tenant semantic memory search
-- Requires CockroachDB v25.2+ with vector indexing (Preview)
-- On older versions, this will fail gracefully — vector search falls back to keyword search
-- Reference: https://www.cockroachlabs.com/docs/stable/vector-indexes
-- NOTE: On an already-populated table the backfill can take a long time. If the
-- index build hangs on an existing cluster, apply it separately with:
--   BASTION_CONN="..." python scripts/create_vector_index.py
CREATE VECTOR INDEX IF NOT EXISTS idx_memory_embedding ON agent_memory (agent_id, embedding);

-- CDC Changefeed: Streams every memory write for real-time anomaly detection and self-healing
-- Downstream processors verify hash chain integrity and detect poisoning attacks
-- NOTE: CDC changefeeds require a running sink (Kafka, webhook, etc.)
-- Create after deploying a changefeed sink:
--   CREATE CHANGEFEED FOR TABLE agent_memory
--   INTO 'webhook-https://<WEBHOOK_URL>'
--   WITH updated, resolved, on_error=resume, initial_scan='no';
-- For local development with Kafka:
--   CREATE CHANGEFEED FOR TABLE agent_memory
--   INTO 'kafka://localhost:9092?topic_prefix=cdc_'
--   WITH updated, resolved, on_error=resume, initial_scan='no';
