CREATE TABLE agent_entities (
    entity_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     STRING NOT NULL,
    entity_type  STRING NOT NULL,
    name         STRING NOT NULL,
    attributes   JSONB,
    valid_from   TIMESTAMPTZ DEFAULT now(),
    valid_until  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT now(),
    INDEX idx_entity_agent (agent_id),
    INDEX idx_entity_type (agent_id, entity_type)
);
