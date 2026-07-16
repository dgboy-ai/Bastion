CREATE TABLE IF NOT EXISTS agent_checkpoints (
    workflow_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id         STRING NOT NULL,
    step_number      INT NOT NULL,
    step_type        STRING NOT NULL,
    input_data       JSONB,
    output_data      JSONB,
    idempotency_key  STRING,
    token_cost       DECIMAL,
    status           STRING NOT NULL DEFAULT 'pending',
    health_score     DECIMAL,
    created_at       TIMESTAMPTZ DEFAULT now(),
    completed_at     TIMESTAMPTZ,
    region           STRING,
    INDEX idx_agent_workflow (agent_id, workflow_id),
    INDEX idx_idempotency (idempotency_key) WHERE idempotency_key IS NOT NULL
);

-- CDC Changefeed: Streams every checkpoint write to downstream processors (Lambda, anomaly detection)
-- Used for real-time memory health monitoring, self-healing triggers, and audit trail
CREATE CHANGEFEED FOR TABLE agent_checkpoints
  INTO 'function://cdc_handler'
  WITH updated, resolved, on_error=resume, initial_scan='no';
