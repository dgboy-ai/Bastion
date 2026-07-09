-- Distributed rate limiter slot table for multi-instance concurrency control
-- Each row is one "slot"—a global concurrency token acquired via row-level lock.
-- Pre-populated with max_concurrent rows (1..N) at application startup.
CREATE TABLE IF NOT EXISTS agent_limiter (
    slot_id      INT PRIMARY KEY,
    instance_id  VARCHAR(128),           -- UUID of the holding Vercel instance
    acquired_at  TIMESTAMPTZ             -- set on acquire, cleared on release
);
