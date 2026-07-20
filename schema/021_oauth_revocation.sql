-- Revoked token table: active revocation for OAuth tokens (RFC 7009).
-- Tokens are checked against this table during validation.
CREATE TABLE IF NOT EXISTS oauth_revoked_tokens (
    token_hash  STRING PRIMARY KEY,
    token_type  STRING NOT NULL DEFAULT 'access',
    revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ  -- TTL on the revocation record itself
);

-- Auto-expire revocation records after 8 days (max token lifetime + 1 day buffer)
ALTER TABLE oauth_revoked_tokens SET (ttl_expiration_expression = 'INTERVAL ''8 days''');
