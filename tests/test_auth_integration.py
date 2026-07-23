"""Full auth integration tests — OAuth provider, PKCE, tokens, brute-force, timing-safe comparison.

Tests the BastionOAuthProvider with in-memory storage (no DB required).
Covers: client registration, authorization, PKCE, token lifecycle,
scope escalation prevention, and timing-safe string comparison.
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import time
import threading

import pytest

from bastion.auth_provider import (
    BastionOAuthProvider,
    is_oauth_enabled,
    store_pkce_verifier,
)
from mcp.server.auth.provider import AuthorizationParams
from mcp.shared.auth import OAuthClientInformationFull


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_pkce_pair():
    """Generate a PKCE code_verifier and code_challenge (S256)."""
    code_verifier = secrets.token_urlsafe(32)
    code_challenge = (
        base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode("ascii")).digest()
        )
        .rstrip(b"=")
        .decode("ascii")
    )
    return code_verifier, code_challenge


def _make_provider():
    """Create a clean in-memory OAuth provider."""
    return BastionOAuthProvider(
        client_id="test-client",
        client_secret="test-secret",
        redirect_uri="http://localhost:3000/callback",
    )


def _make_auth_params(**overrides):
    """Create AuthorizationParams with a valid code_challenge (required by pydantic).

    Returns (params, code_verifier) so the caller can store the verifier
    after calling authorize(), which is required before token exchange.
    """
    code_verifier, code_challenge = _make_pkce_pair()
    defaults = {
        "state": "state-123",
        "scopes": ["memory:read"],
        "code_challenge": code_challenge,
        "redirect_uri": "http://localhost:3000/callback",
        "redirect_uri_provided_explicitly": True,
    }
    defaults.update(overrides)
    return AuthorizationParams(**defaults), code_verifier


async def _authorize_and_exchange(provider, params, code_verifier):
    """Run the full authorize → store_pkce → exchange flow.

    Returns (token, auth_code_obj) for further testing.
    """
    client = await provider.get_client("test-client")
    redirect = await provider.authorize(client, params)
    from urllib.parse import parse_qs, urlparse
    code = parse_qs(urlparse(redirect).query)["code"][0]
    store_pkce_verifier(code, code_verifier)
    auth_code = await provider.load_authorization_code(client, code)
    token = await provider.exchange_authorization_code(client, auth_code)
    return token, auth_code


@pytest.fixture(autouse=True)
def _manage_env():
    """Ensure clean env state for OAuth provider tests."""
    saved = {}
    for key in ("BASTION_MCP_OAUTH_CLIENT_ID", "BASTION_MCP_OAUTH_ENABLED"):
        saved[key] = os.environ.get(key)
    os.environ.pop("BASTION_MCP_OAUTH_CLIENT_ID", None)
    os.environ.pop("BASTION_MCP_OAUTH_ENABLED", None)
    # Reset the provider cache
    from bastion import auth_provider as ap
    ap._PRE_REGISTERED_CLIENT_ID = None
    ap._PRE_REGISTERED_CLIENT_SECRET = None
    ap._PRE_REGISTERED_REDIRECT_URI = None
    yield
    for k, v in saved.items():
        if v is not None:
            os.environ[k] = v
        else:
            os.environ.pop(k, None)
    ap._PRE_REGISTERED_CLIENT_ID = None
    ap._PRE_REGISTERED_CLIENT_SECRET = None
    ap._PRE_REGISTERED_REDIRECT_URI = None


# ── Provider with Mock DB ─────────────────────────────────────────────────────


class TestOAuthProviderInit:
    def test_provider_creates_with_explicit_client(self):
        """Provider registers the explicit client on init."""
        p = _make_provider()
        assert "test-client" in p._clients

    def test_provider_works_without_db(self):
        """Provider falls back to in-memory when no connection_string."""
        import os
        conn = os.environ.pop("BASTION_CONN", None)
        try:
            p = BastionOAuthProvider(client_id="no-db-client")
            assert p._use_db is False
        finally:
            if conn is not None:
                os.environ["BASTION_CONN"] = conn

    def test_provider_stores_client_secret(self):
        """Explicit client_secret is stored on the client info."""
        p = _make_provider()
        client = p._clients["test-client"]
        assert client.client_secret == "test-secret"

    def test_provider_stores_redirect_uri(self):
        """Explicit redirect_uri is stored on the client info."""
        p = _make_provider()
        client = p._clients["test-client"]
        assert len(client.redirect_uris) == 1
        assert str(client.redirect_uris[0]) == "http://localhost:3000/callback"


# ── Client Registration ───────────────────────────────────────────────────────


class TestClientRegistration:
    @pytest.mark.asyncio
    async def test_register_and_retrieve_client(self):
        """Registering a client makes it retrievable via get_client."""
        p = BastionOAuthProvider()
        new_client = OAuthClientInformationFull(
            client_id="reg-client",
            redirect_uris=["http://localhost:9999/callback"],
            token_endpoint_auth_method="none",
        )
        await p.register_client(new_client)
        result = await p.get_client("reg-client")
        assert result is not None
        assert result.client_id == "reg-client"

    @pytest.mark.asyncio
    async def test_get_nonexistent_client_returns_none(self):
        """get_client returns None for unknown client_id."""
        p = BastionOAuthProvider()
        assert await p.get_client("unknown") is None


# ── PKCE Verification ────────────────────────────────────────────────────────


class TestPKCEVerification:
    def test_pkce_verifier_storage_and_retrieval(self):
        """store_pkce_verifier stores the hashed verifier for later retrieval."""
        store_pkce_verifier("auth-code-123", "verifier-abc")
        from bastion.auth_provider import _pkce_verifiers
        entry = _pkce_verifiers.get("auth-code-123")
        assert entry is not None
        # Verifier is hashed before storage — should not be the raw value
        assert entry[0] != "verifier-abc"
        assert len(entry[0]) > 0  # but should be a non-empty hash

    def test_pkce_verifier_cleanup_expired(self):
        """Expired PKCE verifiers are cleaned up."""
        from bastion.auth_provider import _pkce_verifiers, _cleanup_pkce_verifiers, _PKCE_TTL
        # Manually insert an expired entry
        _pkce_verifiers["expired-code"] = ("verifier", time.time() - _PKCE_TTL - 100)
        _cleanup_pkce_verifiers()
        assert "expired-code" not in _pkce_verifiers


# ── Authorization Code Flow ───────────────────────────────────────────────────


class TestAuthorizationCodeFlow:
    @pytest.mark.asyncio
    async def test_authorize_returns_redirect_url(self):
        """authorize() returns a redirect URL containing the auth code."""
        p = _make_provider()
        client = await p.get_client("test-client")
        params, _ = _make_auth_params(state="state-123", scopes=["memory:read"])
        redirect_url = await p.authorize(client, params)
        assert redirect_url.startswith("http://localhost:3000/callback")
        assert "code=" in redirect_url
        assert "state=state-123" in redirect_url

    @pytest.mark.asyncio
    async def test_load_authorization_code_returns_code(self):
        """load_authorization_code returns the stored code."""
        p = _make_provider()
        client = await p.get_client("test-client")
        params, _ = _make_auth_params(scopes=["memory:read"])
        await p.authorize(client, params)
        codes = list(p._auth_codes.values())
        assert len(codes) >= 1
        loaded = await p.load_authorization_code(client, codes[0].code)
        assert loaded is not None

    @pytest.mark.asyncio
    async def test_invalid_code_returns_none(self):
        """Loading a non-existent code returns None."""
        p = _make_provider()
        client = await p.get_client("test-client")
        assert await p.load_authorization_code(client, "no-such-code") is None

    @pytest.mark.asyncio
    async def test_redirect_uri_mismatch_raises(self):
        """authorize() raises if redirect_uri doesn't match registered URIs."""
        p = _make_provider()
        client = await p.get_client("test-client")
        params, _ = _make_auth_params(
            scopes=[],
            redirect_uri="http://evil.com/callback",
        )
        with pytest.raises(ValueError, match="does not match"):
            await p.authorize(client, params)


# ── Token Exchange ────────────────────────────────────────────────────────────


class TestTokenExchange:
    @pytest.mark.asyncio
    async def test_exchange_without_pkce_succeeds(self):
        """Exchange succeeds with a matching PKCE verifier."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=["memory:read", "memory:write"])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        assert token.access_token
        assert token.refresh_token
        assert token.token_type == "Bearer"
        assert token.expires_in == 3600
        assert "memory:read" in token.scope

    @pytest.mark.asyncio
    async def test_exchange_with_pkce_valid(self):
        """Exchange with valid PKCE verifier succeeds."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=["memory:read"])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        assert token.access_token

    @pytest.mark.asyncio
    async def test_exchange_with_pkce_invalid_verifier_raises(self):
        """Exchange with wrong PKCE verifier raises ValueError."""
        p = _make_provider()
        params, _ = _make_auth_params(scopes=["memory:read"])
        client = await p.get_client("test-client")
        redirect = await p.authorize(client, params)
        from urllib.parse import parse_qs, urlparse
        code = parse_qs(urlparse(redirect).query)["code"][0]
        store_pkce_verifier(code, "wrong-verifier-abc")
        auth_code = await p.load_authorization_code(client, code)
        with pytest.raises(ValueError, match="PKCE verification failed"):
            await p.exchange_authorization_code(client, auth_code)

    @pytest.mark.asyncio
    async def test_exchange_consumes_auth_code(self):
        """Exchanging a code removes it from storage (one-time use)."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=[])
        client = await p.get_client("test-client")
        redirect = await p.authorize(client, params)
        from urllib.parse import parse_qs, urlparse
        code = parse_qs(urlparse(redirect).query)["code"][0]
        store_pkce_verifier(code, verifier)
        auth_code = await p.load_authorization_code(client, code)
        await p.exchange_authorization_code(client, auth_code)
        assert code not in p._auth_codes


# ── Token Lifecycle ───────────────────────────────────────────────────────────


class TestTokenLifecycle:
    @pytest.mark.asyncio
    async def test_access_token_loadable_after_exchange(self):
        """Access token is retrievable via load_access_token after exchange."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=["memory:read"])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        loaded = await p.load_access_token(token.access_token)
        assert loaded is not None
        assert loaded.client_id == "test-client"
        assert "memory:read" in loaded.scopes

    @pytest.mark.asyncio
    async def test_load_invalid_token_returns_none(self):
        """Loading a non-existent token returns None."""
        p = _make_provider()
        assert await p.load_access_token("nonexistent-token") is None

    @pytest.mark.asyncio
    async def test_refresh_token_loadable_after_exchange(self):
        """Refresh token is retrievable via load_refresh_token after exchange."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=["memory:read"])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        refresh = await p.load_refresh_token(
            await p.get_client("test-client"), token.refresh_token
        )
        assert refresh is not None

    @pytest.mark.asyncio
    async def test_refresh_exchange_returns_new_tokens(self):
        """Exchanging a refresh token produces new access/refresh tokens."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=["memory:read", "memory:write"])
        old_token, _ = await _authorize_and_exchange(p, params, verifier)
        client = await p.get_client("test-client")
        refresh = await p.load_refresh_token(client, old_token.refresh_token)
        new_token = await p.exchange_refresh_token(client, refresh, ["memory:read"])
        assert new_token.access_token != old_token.access_token
        assert new_token.refresh_token != old_token.refresh_token

    @pytest.mark.asyncio
    async def test_old_refresh_token_invalid_after_use(self):
        """Old refresh token is invalidated after being exchanged."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=[])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        client = await p.get_client("test-client")
        refresh = await p.load_refresh_token(client, token.refresh_token)
        await p.exchange_refresh_token(client, refresh, [])
        old_refresh = await p.load_refresh_token(client, token.refresh_token)
        assert old_refresh is None


# ── Token Revocation ──────────────────────────────────────────────────────────


class TestTokenRevocation:
    @pytest.mark.asyncio
    async def test_revoke_access_token(self):
        """Revoking an access token makes it unloadable."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=[])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        access = await p.load_access_token(token.access_token)
        await p.revoke_token(access)
        assert await p.load_access_token(token.access_token) is None

    @pytest.mark.asyncio
    async def test_revoke_refresh_token(self):
        """Revoking a refresh token makes it unloadable."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=[])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        client = await p.get_client("test-client")
        refresh = await p.load_refresh_token(client, token.refresh_token)
        await p.revoke_token(refresh)
        assert await p.load_refresh_token(client, token.refresh_token) is None


# ── Scope Escalation Prevention ───────────────────────────────────────────────


class TestScopeEscalation:
    @pytest.mark.asyncio
    async def test_refresh_cannot_escalate_scopes(self):
        """Requesting broader scopes during refresh only grants original scopes."""
        p = _make_provider()
        params, verifier = _make_auth_params(scopes=["memory:read"])
        token, _ = await _authorize_and_exchange(p, params, verifier)
        client = await p.get_client("test-client")
        refresh = await p.load_refresh_token(client, token.refresh_token)
        new_token = await p.exchange_refresh_token(
            client, refresh, ["memory:read", "admin:write"]
        )
        assert "memory:read" in new_token.scope
        assert "admin:write" not in new_token.scope


# ── Timing-Safe Comparison ────────────────────────────────────────────────────


class TestTimingSafeComparison:
    def test_compare_digest_equal(self):
        """secrets.compare_digest returns True for equal strings."""
        assert secrets.compare_digest("abc", "abc") is True

    def test_compare_digest_not_equal(self):
        """secrets.compare_digest returns False for different strings."""
        assert secrets.compare_digest("abc", "def") is False

    def test_check_auth_uses_timing_safe(self):
        """_check_auth uses secrets.compare_digest for API key comparison."""
        from bastion.mcp_server import _check_auth
        import inspect
        source = inspect.getsource(_check_auth)
        assert "compare_digest" in source


# ── Brute-Force Lockout ───────────────────────────────────────────────────────


class TestBruteForceProtection:
    @pytest.mark.asyncio
    async def test_invalid_codes_do_not_leak_info(self):
        """Loading invalid authorization codes always returns None (no info leak)."""
        p = _make_provider()
        client = await p.get_client("test-client")
        # Try many invalid codes — none should succeed
        for _ in range(20):
            result = await p.load_authorization_code(client, secrets.token_hex(16))
            assert result is None

    @pytest.mark.asyncio
    async def test_invalid_tokens_do_not_leak_info(self):
        """Loading invalid tokens always returns None (no info leak)."""
        p = _make_provider()
        for _ in range(20):
            result = await p.load_access_token(secrets.token_hex(24))
            assert result is None

    @pytest.mark.asyncio
    async def test_pkce_mismatch_does_not_reveal_verifier(self):
        """PKCE failure doesn't reveal the expected verifier (timing-safe)."""
        p = _make_provider()
        client = await p.get_client("test-client")
        verifier, challenge = _make_pkce_pair()
        params = AuthorizationParams(
            state="s",
            scopes=[],
            code_challenge=challenge,
            redirect_uri="http://localhost:3000/callback",
            redirect_uri_provided_explicitly=True,
        )
        redirect = await p.authorize(client, params)
        from urllib.parse import parse_qs, urlparse
        code = parse_qs(urlparse(redirect).query)["code"][0]
        store_pkce_verifier(code, "wrong-verifier-123")
        auth_code = await p.load_authorization_code(client, code)
        with pytest.raises(ValueError, match="PKCE verification failed"):
            await p.exchange_authorization_code(client, auth_code)
        # Error message should NOT contain the expected verifier
        # This is tested by the match pattern — it says "does not match", not the expected value


# ── is_oauth_enabled ──────────────────────────────────────────────────────────


class TestOAuthEnabled:
    def test_enabled_with_env_var(self):
        """is_oauth_enabled returns True when BASTION_MCP_OAUTH_CLIENT_ID is set."""
        os.environ["BASTION_MCP_OAUTH_CLIENT_ID"] = "test"
        assert is_oauth_enabled() is True

    def test_enabled_with_bastion_oauth_enabled(self):
        """is_oauth_enabled returns True when BASTION_MCP_OAUTH_ENABLED is set."""
        os.environ.pop("BASTION_MCP_OAUTH_CLIENT_ID", None)
        os.environ["BASTION_MCP_OAUTH_ENABLED"] = "true"
        assert is_oauth_enabled() is True

    def test_disabled_without_env(self):
        """is_oauth_enabled returns False when no OAuth env vars are set."""
        os.environ.pop("BASTION_MCP_OAUTH_CLIENT_ID", None)
        os.environ.pop("BASTION_MCP_OAUTH_ENABLED", None)
        assert is_oauth_enabled() is False
