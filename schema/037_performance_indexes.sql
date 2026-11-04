-- Performance indexes for the dashboard's hot read paths.
-- These back the common `WHERE agent_id = ... ORDER BY created_at DESC`
-- and type-breakdown queries used by /api/stats, /api/memories and the
-- knowledge-graph views.

CREATE INDEX IF NOT EXISTS idx_memory_agent_created
    ON agent_memory (agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_created
    ON agent_memory (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_type
    ON agent_memory (memory_type);
