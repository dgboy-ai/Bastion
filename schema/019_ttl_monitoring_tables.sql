-- Migration 019: TTL on monitoring tables that grow unbounded
-- cache_stats: query-level stats, useful for 7 days then stale
-- agent_drift_scores: drift scores, useful for 30 days then stale

ALTER TABLE cache_stats
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days');

ALTER TABLE cache_stats
  SET (ttl_expiration_expression = 'expires_at', ttl_delete_rate = 100);

ALTER TABLE agent_drift_scores
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days');

ALTER TABLE agent_drift_scores
  SET (ttl_expiration_expression = 'expires_at', ttl_delete_rate = 50);
