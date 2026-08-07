-- Security hardening: OAuth expires_at TIMESTAMPTZ + sender key cache table

-- GAP-38: Migrate expires_at from INT8 to TIMESTAMPTZ for idiomatic CockroachDB
-- Add new columns, backfill, then drop old ones (safe online schema change)

-- Access tokens: add TIMESTAMPTZ column
ALTER TABLE oauth_access_tokens ADD COLUMN IF NOT EXISTS expires_at_ts TIMESTAMPTZ;
UPDATE oauth_access_tokens SET expires_at_ts = timestamp 'epoch' + expires_at * interval '1 second' WHERE expires_at_ts IS NULL;

-- Refresh tokens: add TIMESTAMPTZ column
ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS expires_at_ts TIMESTAMPTZ;
UPDATE oauth_refresh_tokens SET expires_at_ts = timestamp 'epoch' + expires_at * interval '1 second' WHERE expires_at_ts IS NULL;

-- Auth codes: add TIMESTAMPTZ column
ALTER TABLE oauth_auth_codes ADD COLUMN IF NOT EXISTS expires_at_ts TIMESTAMPTZ;
UPDATE oauth_auth_codes SET expires_at_ts = timestamp 'epoch' + expires_at * interval '1 second' WHERE expires_at_ts IS NULL;

-- PKCE verifiers: add TIMESTAMPTZ column
ALTER TABLE oauth_pkce_verifiers ADD COLUMN IF NOT EXISTS expires_at_ts TIMESTAMPTZ;
UPDATE oauth_pkce_verifiers SET expires_at_ts = timestamp 'epoch' + expires_at * interval '1 second' WHERE expires_at_ts IS NULL;

-- GAP-40: Sender key cache table for multi-instance TOFU trust sharing
CREATE TABLE IF NOT EXISTS sender_key_cache (
    url             STRING PRIMARY KEY,
    public_key_pem  STRING NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    first_seen_at   TIMESTAMPTZ DEFAULT now(),
    last_verified   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sender_key_cache_expires ON sender_key_cache (expires_at);
