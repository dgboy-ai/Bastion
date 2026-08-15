-- Brute-force lockout table: tracks failed auth attempts per IP across restarts.
-- Survives server restarts so attackers can't brute-force across process restarts.
CREATE TABLE IF NOT EXISTS auth_brute_force (
    ip_address   STRING PRIMARY KEY,
    failure_count INT NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    locked_until TIMESTAMPTZ,
    last_failure TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TTL: auto-expire rows after 1 hour (lockout + window)
ALTER TABLE auth_brute_force SET (ttl_expire_after = INTERVAL '1 hour');
