-- 033_production_gaps_fix.sql
-- Fixes 8 production gaps identified in audit:
--   #3  Agent auth table for dynamic key management
--   #5  A2A task runtime metadata persistence
--   #8  Vector health tracking
--   #10 Background hash chain verification flag

BEGIN;

-- ==================================================================
-- #3: Agent Auth Table — Dynamic API Key Management
-- ==================================================================
-- Replaces purely env-var-based auth with DB-backed key management.
-- Supports key rotation, revocation, role assignment, and expiry.
-- ==================================================================
CREATE TABLE IF NOT EXISTS agent_auth (
    key_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      STRING NOT NULL,
    key_hash      STRING NOT NULL,           -- bcrypt/argon2 hash of the API key
    key_prefix    STRING(8) NOT NULL,         -- first 8 chars for identification (not secret)
    role          STRING NOT NULL DEFAULT 'writer' CHECK (role IN ('reader', 'writer', 'admin')),
    description   STRING,                    -- human-readable label
    created_at    TIMESTAMPTZ DEFAULT now(),
    expires_at    TIMESTAMPTZ,                -- NULL = never expires
    revoked_at    TIMESTAMPTZ,                -- NULL = active
    rotated_from  UUID REFERENCES agent_auth(key_id),
    INDEX idx_auth_agent (agent_id),
    INDEX idx_auth_active (revoked_at) WHERE revoked_at IS NULL
);

-- ==================================================================
-- #5: Extend A2A Tasks with Runtime Metadata
-- ==================================================================
-- Persists in-flight operational state so tasks survive restarts.
-- ==================================================================
ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS runtime_metadata JSONB;
ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;
ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS error_message STRING;
ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES a2a_tasks(task_id);
ALTER TABLE a2a_tasks ADD COLUMN IF NOT EXISTS priority INT DEFAULT 0;

-- ==================================================================
-- #8: Vector Health Tracking
-- ==================================================================
-- Records vector index status so health checks can verify C-SPANN is operational.
-- ==================================================================
CREATE TABLE IF NOT EXISTS vector_health (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id         STRING NOT NULL,
    index_name       STRING NOT NULL DEFAULT 'idx_memory_embedding',
    index_type       STRING NOT NULL DEFAULT 'C-SPANN',
    is_operational   BOOL NOT NULL DEFAULT false,
    dimension        INT,
    total_vectors    INT DEFAULT 0,
    last_check_at    TIMESTAMPTZ DEFAULT now(),
    error_message    STRING,
    INDEX idx_vec_health_agent (agent_id)
);

-- ==================================================================
-- #10: Memory Heal — Async Verification Flag
-- ==================================================================
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS needs_verification BOOL DEFAULT false;

COMMIT;
