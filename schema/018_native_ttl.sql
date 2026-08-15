-- Migration 018: Native CockroachDB TTL for agentic memory lifecycle
-- Enables automatic row expiration without application-level cleanup workers
--
-- Short-term memories (conversations) expire after 24 hours
-- Long-term memories (facts, knowledge) expire based on expires_at column
-- Forensic records (audit, hash chains) NEVER expire (no TTL)
--
-- NOTE: agent_memory uses per-row expiry (its `expires_at` column is set by the
-- application and enforced at query time with `expires_at IS NULL OR expires_at
-- > now()` filters, plus physical cleanup in `memory_heal`). A blanket fixed
-- TTL would wrongly expire long-term memories, so no native TTL is set there.

-- Enable native TTL on agent_messages for short-term conversational memory.
-- The table's expires_at default (now() + 1 hour) matches this fixed interval.
ALTER TABLE agent_messages
  SET (ttl_expire_after = INTERVAL '1 hour');

-- Note: agent_audit, agent_checkpoints, and thought_graph do NOT have TTL
-- These are forensic records that must persist indefinitely for compliance
-- and hash chain integrity verification
