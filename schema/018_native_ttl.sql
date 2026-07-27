-- Migration 018: Native CockroachDB TTL for agentic memory lifecycle
-- Enables automatic row expiration without application-level cleanup workers
--
-- Short-term memories (conversations) expire after 24 hours
-- Long-term memories (facts, knowledge) expire based on expires_at column
-- Forensic records (audit, hash chains) NEVER expire (no TTL)

-- Enable native TTL on agent_memory for long-term memories
-- Rows with expires_at set will be auto-deleted by CockroachDB
ALTER TABLE agent_memory
  SET (ttl_expiration_expression = 'expires_at');

-- Enable native TTL on agent_messages for short-term conversational memory
-- Messages auto-expire after their expires_at timestamp (default: 1 hour)
ALTER TABLE agent_messages
  SET (ttl_expiration_expression = 'expires_at');

-- Note: agent_audit, agent_checkpoints, and thought_graph do NOT have TTL
-- These are forensic records that must persist indefinitely for compliance
-- and hash chain integrity verification
