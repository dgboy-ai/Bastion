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
