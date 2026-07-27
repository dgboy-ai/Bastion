-- Distributed rate limiter for A2A server: per-IP sliding window in CockroachDB.
-- Replaces in-memory defaultdict(list) so rate limits survive restarts and work across instances.
CREATE TABLE IF NOT EXISTS a2a_rate_limits (
    ip_address   STRING NOT NULL,
    request_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ip_address, request_time)
);

ALTER TABLE a2a_rate_limits SET (ttl_expiration_expression = 'request_time + INTERVAL ''120 seconds''');

CREATE INDEX IF NOT EXISTS idx_a2a_rate_limits_ip ON a2a_rate_limits (ip_address, request_time DESC);
