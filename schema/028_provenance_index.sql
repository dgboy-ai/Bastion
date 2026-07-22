CREATE INDEX IF NOT EXISTS idx_memory_provenance ON agent_memory (source_provenance, trust_level);
CREATE INDEX IF NOT EXISTS idx_memory_indirect ON agent_memory ((metadata->>'indirect_score')) WHERE metadata->>'indirect_score' IS NOT NULL;
