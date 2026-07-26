-- 031: RLS hardening — add missing policies to schema migrations
-- Ensures RLS is applied even when migrations run directly via SQL
-- (not through Python enable_rls())

-- 1. agent_memory — most sensitive table (content + embeddings + crypto hashes)
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_memory_isolation' AND tablename = 'agent_memory') THEN
        CREATE POLICY agent_memory_isolation ON agent_memory
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

-- 2. agent_keys — encryption key material (encrypted DEKs, KMS key IDs)
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_keys FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_keys_isolation' AND tablename = 'agent_keys') THEN
        CREATE POLICY agent_keys_isolation ON agent_keys
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

-- 3. Fix existing policies in 017 that lack WITH CHECK clause
-- Drop and recreate with both USING + WITH CHECK

-- agent_entities
DROP POLICY IF EXISTS agent_entities_isolation ON agent_entities;
CREATE POLICY agent_entities_isolation ON agent_entities
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- agent_relations
DROP POLICY IF EXISTS agent_relations_isolation ON agent_relations;
CREATE POLICY agent_relations_isolation ON agent_relations
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- a2a_tasks
DROP POLICY IF EXISTS a2a_tasks_isolation ON a2a_tasks;
CREATE POLICY a2a_tasks_isolation ON a2a_tasks
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- thought_graph
DROP POLICY IF EXISTS thought_graph_isolation ON thought_graph;
CREATE POLICY thought_graph_isolation ON thought_graph
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
