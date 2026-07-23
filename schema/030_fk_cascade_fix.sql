-- Fix: Add ON DELETE handling to FK references to prevent orphaned rows
-- When memories are deleted (GDPR physical delete or TTL), orphaned FK
-- references in agent_relations would cause query failures.

-- agent_relations.source_memory_id: use SET NULL (relation survives, memory ref cleared)
ALTER TABLE agent_relations DROP CONSTRAINT IF EXISTS fk_source_memory;
ALTER TABLE agent_relations ADD CONSTRAINT fk_source_memory
    FOREIGN KEY (source_memory_id) REFERENCES agent_memory(memory_id)
    ON DELETE SET NULL;

-- agent_relations.source_entity_id: use CASCADE (delete relations when entity deleted)
ALTER TABLE agent_relations DROP CONSTRAINT IF EXISTS fk_source_entity;
ALTER TABLE agent_relations ADD CONSTRAINT fk_source_entity
    FOREIGN KEY (source_entity_id) REFERENCES agent_entities(entity_id)
    ON DELETE CASCADE;

-- agent_relations.target_entity_id: use CASCADE (delete relations when entity deleted)
ALTER TABLE agent_relations DROP CONSTRAINT IF EXISTS fk_target_entity;
ALTER TABLE agent_relations ADD CONSTRAINT fk_target_entity
    FOREIGN KEY (target_entity_id) REFERENCES agent_entities(entity_id)
    ON DELETE CASCADE;

-- Add CHECK constraints for bounded numeric columns
ALTER TABLE agent_memory ADD CONSTRAINT IF NOT EXISTS chk_importance_score
    CHECK (importance_score >= 0 AND importance_score <= 10);
ALTER TABLE agent_memory ADD CONSTRAINT IF NOT EXISTS chk_trust_level
    CHECK (trust_level >= 0 AND trust_level <= 4);
ALTER TABLE agent_memory ADD CONSTRAINT IF NOT EXISTS chk_overwrite_count
    CHECK (overwrite_count >= 0);
ALTER TABLE agent_relations ADD CONSTRAINT IF NOT EXISTS chk_relation_confidence
    CHECK (confidence >= 0 AND confidence <= 1);
ALTER TABLE agent_budgets ADD CONSTRAINT IF NOT EXISTS chk_daily_searches
    CHECK (daily_searches >= 0);
ALTER TABLE agent_budgets ADD CONSTRAINT IF NOT EXISTS chk_daily_stores
    CHECK (daily_stores >= 0);
ALTER TABLE agent_budgets ADD CONSTRAINT IF NOT EXISTS chk_daily_embeds
    CHECK (daily_embeds >= 0);
ALTER TABLE agent_budgets ADD CONSTRAINT IF NOT EXISTS chk_daily_heals
    CHECK (daily_heals >= 0);
