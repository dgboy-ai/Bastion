-- Add role column to OAuth access tokens and refresh tokens for RBAC.
-- Roles: 'admin' (full access), 'writer' (memory:read + memory:write), 'reader' (memory:read only).
--
-- The oauth token tables are created lazily by auth_provider.py at runtime (not
-- in schema migrations), so on a fresh cluster they do not exist yet when this
-- migration runs. Guard each ALTER so it only applies when the table exists;
-- auth_provider.py also runs "ADD COLUMN IF NOT EXISTS role" at startup, so the
-- column is guaranteed to be added once the tables are created.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'oauth_access_tokens' AND table_schema = current_schema()
    ) THEN
        EXECUTE 'ALTER TABLE oauth_access_tokens ADD COLUMN IF NOT EXISTS role STRING NOT NULL DEFAULT ''writer''';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'oauth_refresh_tokens' AND table_schema = current_schema()
    ) THEN
        EXECUTE 'ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS role STRING NOT NULL DEFAULT ''writer''';
    END IF;
END
$$;
