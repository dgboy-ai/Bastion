CREATE TABLE agent_audit (
    audit_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     STRING NOT NULL,
    workflow_id  UUID NOT NULL,
    action       STRING NOT NULL,
    details      JSONB,
    recorded_at  TIMESTAMPTZ DEFAULT now()
);
