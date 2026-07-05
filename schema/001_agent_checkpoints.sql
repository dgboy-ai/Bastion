CREATE TABLE agent_checkpoints (
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

-- CREATE CHANGEFEED FOR TABLE agent_checkpoints INTO 'kafka://...' WITH updated, resolved, on_error=pause;
-- Changefeed will be configured when CDC sink is provisioned (Week 2)
