-- A2A Task Store: Persists task state to CockroachDB so tasks survive server crashes.
-- This replaces the in-memory _tasks dict and enables webhook push notifications via CDC.

CREATE TABLE IF NOT EXISTS a2a_tasks (
    task_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      STRING NOT NULL,
    skill_id      STRING NOT NULL,
    status        STRING NOT NULL CHECK (status IN ('SUBMITTED', 'WORKING', 'COMPLETED', 'FAILED', 'CANCELED')),
    artifacts     JSONB,
    callback_url  STRING,
    created_at    TIMESTAMPTZ DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    INDEX idx_a2a_status (status),
    INDEX idx_a2a_agent (agent_id),
    INDEX idx_a2a_callback (callback_url) WHERE callback_url IS NOT NULL
);

-- CDC Changefeed: Streams task state changes to Lambda for webhook push notifications.
-- Enables real-time agent notification without polling.
-- NOTE: CDC changefeeds are configured at runtime, not in schema files
-- Example: CREATE CHANGEFEED FOR TABLE a2a_tasks INTO 'webhook-https://bastion-cdc-handler/cdc' WITH updated, resolved, on_error=resume, initial_scan='no';
