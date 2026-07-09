-- 016_memory_pinning.sql
-- Adds memory pinning support for safety-critical instructions.
-- Pinned memories survive context compaction and are re-injected before every query.

ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS pin_priority INT DEFAULT 0;
-- 0 = normal, 1 = important, 2 = CRITICAL (re-injected before every query)

CREATE INDEX IF NOT EXISTS idx_pinned ON agent_memory (agent_id, is_pinned, pin_priority DESC)
    WHERE is_pinned = true;
