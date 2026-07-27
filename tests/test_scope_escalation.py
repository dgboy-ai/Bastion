"""Tests for OAuth scope escalation prevention."""

from __future__ import annotations

import base64
import hashlib
import secrets

import pytest
from mcp.shared.auth import OAuthClientInformationFull

from bastion.auth_provider import BastionOAuthProvider


@pytest.fixture
def provider():
    return BastionOAuthProvider(
        client_id="test-client",
        client_secret="test-secret",
        redirect_uri="http://localhost:3000/callback",
    )


@pytest.fixture
def client_info():
    from pydantic import AnyUrl

    return OAuthClientInformationFull(
        client_id="test-client",
        client_secret="test-secret",
        redirect_uris=[AnyUrl("http://localhost:3000/callback")],
        token_endpoint_auth_method="client_secret_post",
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
        scope="memory:read",
    )


class TestScopeEscalation:
    @pytest.mark.asyncio
    async def test_refresh_token_cannot_escalate_scopes(self, provider, client_info):
        """Requested scopes must be subset of original scopes."""
        from mcp.server.auth.provider import AuthorizationParams
        from pydantic import AnyUrl

        from bastion.auth_provider import store_pkce_verifier

        # Generate PKCE challenge
        code_verifier = secrets.token_urlsafe(32)
        code_challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest()).rstrip(b"=").decode()
        )

        params = AuthorizationParams(
            redirect_uri=AnyUrl("http://localhost:3000/callback"),
            redirect_uri_provided_explicitly=True,
            state="test",
            code_challenge=code_challenge,
            scopes=["memory:read"],
        )
        redirect = await provider.authorize(client_info, params)

        code = redirect.split("code=")[1].split("&")[0]
        # Store the PKCE verifier for this code
        store_pkce_verifier(code, code_verifier)

        auth_code = await provider.load_authorization_code(client_info, code)
        assert auth_code is not None
        token = await provider.exchange_authorization_code(client_info, auth_code)

        refresh_token = await provider.load_refresh_token(client_info, token.refresh_token)
        assert refresh_token is not None

        # Request broader scopes than originally granted
        new_token = await provider.exchange_refresh_token(
            client_info, refresh_token, ["memory:read", "memory:write", "admin"]
        )
        # Should only have the original scopes (memory:read), not the escalated ones
        assert set(new_token.scope.split()) <= {"memory:read"}

    @pytest.mark.asyncio
    async def test_refresh_token_subset_scopes_allowed(self, provider, client_info):
        """Requested scopes that are a subset of original should be allowed."""
        from mcp.server.auth.provider import AuthorizationParams
        from pydantic import AnyUrl

        from bastion.auth_provider import store_pkce_verifier

        code_verifier = secrets.token_urlsafe(32)
        code_challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest()).rstrip(b"=").decode()
        )

        params = AuthorizationParams(
            redirect_uri=AnyUrl("http://localhost:3000/callback"),
            redirect_uri_provided_explicitly=True,
            state="test",
            code_challenge=code_challenge,
            scopes=["memory:read", "memory:write"],
        )
        redirect = await provider.authorize(client_info, params)
        code = redirect.split("code=")[1].split("&")[0]
        store_pkce_verifier(code, code_verifier)

        auth_code = await provider.load_authorization_code(client_info, code)
        token = await provider.exchange_authorization_code(client_info, auth_code)

        refresh_token = await provider.load_refresh_token(client_info, token.refresh_token)
        # Request only memory:read (subset of original)
        new_token = await provider.exchange_refresh_token(client_info, refresh_token, ["memory:read"])
        assert "memory:read" in new_token.scope.split()
