-- Add role column to OAuth access tokens and refresh tokens for RBAC.
-- Roles: 'admin' (full access), 'writer' (memory:read + memory:write), 'reader' (memory:read only).
ALTER TABLE oauth_access_tokens ADD COLUMN IF NOT EXISTS role STRING NOT NULL DEFAULT 'writer';
ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS role STRING NOT NULL DEFAULT 'writer';
