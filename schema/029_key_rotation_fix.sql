-- Fix: Add previous_encrypted_dek column for key rotation without data loss
-- Without this, rotate_key() overwrites the DEK, making old ciphertexts unrecoverable

ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS previous_encrypted_dek BYTES;
