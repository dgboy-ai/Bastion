CREATE TABLE IF NOT EXISTS agent_coordination (
    lock_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     STRING NOT NULL,
    resource     STRING NOT NULL,
    lock_type    STRING NOT NULL DEFAULT 'shared',
    acquired_at  TIMESTAMPTZ DEFAULT now(),
    expires_at   TIMESTAMPTZ,
    payload      JSONB,
    INDEX idx_coordination_resource (resource)
);
