-- Agent region mapping for REGIONAL BY ROW locality
-- Enables row-level geo-partitioning for GDPR/HIPAA data residency
CREATE TABLE IF NOT EXISTS agent_region_mapping (
    agent_id   STRING PRIMARY KEY,
    region     STRING NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add region column to agent_memory if not present
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS crdb_region STRING NOT NULL DEFAULT 'us-east-1';

-- Enable REGIONAL BY ROW so CRDB auto-routes rows to correct serverless zone
ALTER TABLE agent_memory SET LOCALITY REGIONAL BY ROW AS crdb_region;

-- Index for fast region-scoped queries
CREATE INDEX IF NOT EXISTS idx_memory_region ON agent_memory (crdb_region);
