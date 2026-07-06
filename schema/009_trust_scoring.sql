ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS trust_level INT DEFAULT 2;
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS source_provenance STRING DEFAULT 'agent_direct';
ALTER TABLE agent_memory ADD COLUMN IF NOT EXISTS overwrite_count INT DEFAULT 0;
