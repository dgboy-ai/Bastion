CREATE TABLE agent_relations (
    relation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          STRING NOT NULL,
    source_entity_id  UUID NOT NULL REFERENCES agent_entities(entity_id),
    target_entity_id  UUID NOT NULL REFERENCES agent_entities(entity_id),
    relation_type     STRING NOT NULL,
    confidence        FLOAT DEFAULT 1.0,
    valid_from        TIMESTAMPTZ DEFAULT now(),
    valid_until       TIMESTAMPTZ,
    source_memory_id  UUID REFERENCES agent_memory(memory_id),
    created_at        TIMESTAMPTZ DEFAULT now(),
    INDEX idx_rel_source (source_entity_id, relation_type),
    INDEX idx_rel_target (target_entity_id, relation_type)
);
