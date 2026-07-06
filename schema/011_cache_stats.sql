-- Cache statistics table for semantic cache cost tracking
CREATE TABLE IF NOT EXISTS cache_stats (
    stat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now(),
    query TEXT NOT NULL,
    cache_hit BOOLEAN NOT NULL,
    similarity_score FLOAT,
    tokens_saved INT DEFAULT 0,
    cost_saved_usd FLOAT DEFAULT 0.0,
    response_latency_ms INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cache_stats_agent ON cache_stats (agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cache_stats_hit ON cache_stats (cache_hit, timestamp DESC);
