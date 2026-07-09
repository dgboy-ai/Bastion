-- Structured thought-graph logging for reasoning trace analysis
-- Each row is a single node in the agent's decision tree
CREATE TABLE IF NOT EXISTS thought_graph (
    thought_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    STRING NOT NULL,
    agent_id      STRING NOT NULL,
    thought_type  STRING NOT NULL,
    content       TEXT NOT NULL,
    parent_id     UUID,
    status        STRING NOT NULL DEFAULT 'active',
    confidence    FLOAT DEFAULT 1.0,
    metadata      JSONB,
    created_at    TIMESTAMPTZ DEFAULT now(),
    INDEX idx_thought_session (session_id),
    INDEX idx_thought_agent (agent_id),
    INDEX idx_thought_parent (parent_id)
);

-- Changefeed for real-time reasoning monitoring
CREATE CHANGEFEED FOR TABLE thought_graph
  INTO 'function://cdc_thought_handler'
  WITH updated, resolved, on_error=resume, initial_scan='no';
