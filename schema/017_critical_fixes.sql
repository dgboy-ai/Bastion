-- 017: Critical data integrity fixes
-- Adds missing UNIQUE constraints, indexes, and RLS policies

-- 1. UNIQUE constraint on agent_entities (ON CONFLICT never fires without this)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_unique_name
    ON agent_entities (agent_id, name);

-- 2. Indexes for agent_audit (currently ZERO indexes - full table scans)
CREATE INDEX IF NOT EXISTS idx_audit_agent_time
    ON agent_audit (agent_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
    ON agent_audit (action);

-- 3. Index for agent_messages consume query
CREATE INDEX IF NOT EXISTS idx_messages_consume
    ON agent_messages (namespace, read, created_at DESC)
    WHERE read = FALSE;

-- 4. Index for a2a_tasks time-range queries
CREATE INDEX IF NOT EXISTS idx_a2a_time
    ON a2a_tasks (created_at DESC);

-- 5. Index for agent_coordination agent lookup
CREATE INDEX IF NOT EXISTS idx_coord_agent
    ON agent_coordination (agent_id);

-- 6. Index for thought_graph parent traversal
CREATE INDEX IF NOT EXISTS idx_thought_parent
    ON thought_graph (parent_id) WHERE parent_id IS NOT NULL;

-- 7. Add TTL cleanup indexes
CREATE INDEX IF NOT EXISTS idx_memory_expires
    ON agent_memory (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_expires
    ON agent_messages (expires_at) WHERE expires_at IS NOT NULL;

-- 8. RLS policies for missing tables
ALTER TABLE agent_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_entities FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_entities_isolation ON agent_entities
    USING (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE agent_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_relations FORCE ROW LEVEL SECURITY;
CREATE POLICY agent_relations_isolation ON agent_relations
    USING (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE a2a_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE a2a_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY a2a_tasks_isolation ON a2a_tasks
    USING (agent_id = current_setting('app.current_agent_id', true));

ALTER TABLE thought_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE thought_graph FORCE ROW LEVEL SECURITY;
CREATE POLICY thought_graph_isolation ON thought_graph
    USING (agent_id = current_setting('app.current_agent_id', true));

-- 9. Fix messaging consume to filter expired messages
-- (Applied via code change, not schema)
