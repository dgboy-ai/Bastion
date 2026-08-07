-- 032: Fix incomplete RLS policies and create CDC changefeeds
-- Applied: 2026-07-26
-- This migration补s gaps left by schema migrations 026, 027, 029, 031

-- ============================================================
-- PART 1: Missing Tables
-- ============================================================

-- 1a. agent_keys (from schema 026, never applied)
CREATE TABLE IF NOT EXISTS agent_keys (
    agent_id STRING PRIMARY KEY,
    encrypted_dek BYTES NOT NULL,
    kms_key_id STRING NOT NULL,
    key_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    previous_key_version INT
);

CREATE INDEX IF NOT EXISTS idx_agent_keys_kms ON agent_keys (kms_key_id);

-- 1b. Add previous_encrypted_dek column (from schema 029, never applied)
ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS previous_encrypted_dek BYTES;

-- 1c. push_notification_log (from schema 027, never applied)
CREATE TABLE IF NOT EXISTS push_notification_log (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    callback_url STRING NOT NULL,
    status STRING NOT NULL,
    payload JSONB,
    delivery_attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    last_status_code INT,
    last_error STRING,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_notif_pending ON push_notification_log (next_retry_at) WHERE delivered_at IS NULL AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_notif_task ON push_notification_log (task_id);

-- ============================================================
-- PART 2: RLS Policies (from schema 031, partially applied)
-- ============================================================

-- 2a. agent_memory — most sensitive table
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_memory_isolation ON agent_memory;
CREATE POLICY agent_memory_isolation ON agent_memory
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- 2b. agent_keys — encryption key material
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_keys_isolation ON agent_keys;
CREATE POLICY agent_keys_isolation ON agent_keys
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- 2c. agent_entities — recreate with proper WITH CHECK
ALTER TABLE agent_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_entities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_entities_isolation ON agent_entities;
CREATE POLICY agent_entities_isolation ON agent_entities
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- 2d. agent_relations — recreate with proper WITH CHECK
ALTER TABLE agent_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_relations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_relations_isolation ON agent_relations;
CREATE POLICY agent_relations_isolation ON agent_relations
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- 2e. a2a_tasks
ALTER TABLE a2a_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE a2a_tasks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS a2a_tasks_isolation ON a2a_tasks;
CREATE POLICY a2a_tasks_isolation ON a2a_tasks
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- 2f. thought_graph
ALTER TABLE thought_graph ENABLE ROW LEVEL SECURITY;
ALTER TABLE thought_graph FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS thought_graph_isolation ON thought_graph;
CREATE POLICY thought_graph_isolation ON thought_graph
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true));

-- ============================================================
-- PART 3: CDC Changefeeds (runtime — requires deployed sink)
-- ============================================================
-- CDC changefeeds are created at runtime, not in schema migrations.
-- They require a running sink (Kafka, webhook, etc.).
--
-- After deploying a changefeed sink, create changefeeds:
--
--   -- agent_memory: hash chain verification + anomaly detection
--   CREATE CHANGEFEED cdc_agent_memory
--   INTO 'webhook-https://<WEBHOOK_URL>'
--   WITH updated, resolved, on_error=resume, initial_scan='no';
--
--   -- agent_audit: compliance monitoring
--   CREATE CHANGEFEED cdc_agent_audit
--   INTO 'webhook-https://<WEBHOOK_URL>'
--   WITH updated, resolved, on_error=resume, initial_scan='no';
--
--   -- a2a_tasks: push notifications on task completion
--   CREATE CHANGEFEED cdc_a2a_tasks
--   INTO 'webhook-https://<WEBHOOK_URL>'
--   WITH updated, resolved, on_error=resume, initial_scan='no';
--
-- For local development with Kafka:
--   CREATE CHANGEFEED cdc_agent_memory
--   INTO 'kafka://localhost:9092?topic_prefix=cdc_'
--   WITH updated, resolved, on_error=resume, initial_scan='no';
--
-- To drop a changefeed:
--   PAUSE JOB <job_id>;
--   CANCEL JOB <job_id>;

-- ============================================================
-- PART 4: Verification Queries (run after migration)
-- ============================================================

-- Verify RLS:
-- SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
-- FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
-- WHERE n.nspname = 'public' AND c.relrowsecurity = true
-- ORDER BY c.relname;

-- Verify policies:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename;

-- Verify changefeeds:
-- SHOW CHANGEFEED JOBS;
