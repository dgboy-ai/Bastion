from __future__ import annotations

import os
from urllib.parse import parse_qs, urlparse

import pytest

from bastion.auth_provider import BastionOAuthProvider, is_oauth_enabled


def _clear_provider_cache():
    from bastion import auth_provider as ap

    ap._PRE_REGISTERED_CLIENT_ID = None
    ap._PRE_REGISTERED_CLIENT_SECRET = None
    ap._PRE_REGISTERED_REDIRECT_URI = None


@pytest.fixture(autouse=True)
def _manage_env():
    saved = {
        "BASTION_MCP_OAUTH_CLIENT_ID": os.environ.get("BASTION_MCP_OAUTH_CLIENT_ID"),
        "BASTION_MCP_OAUTH_ENABLED": os.environ.get("BASTION_MCP_OAUTH_ENABLED"),
    }
    os.environ["BASTION_MCP_OAUTH_CLIENT_ID"] = "bastion-client"
    os.environ["BASTION_MCP_OAUTH_ENABLED"] = "true"
    _clear_provider_cache()
    yield
    for k, v in saved.items():
        if v is not None:
            os.environ[k] = v
        else:
            os.environ.pop(k, None)
    _clear_provider_cache()


@pytest.fixture
def provider():
    return BastionOAuthProvider()


@pytest.mark.asyncio
async def test_get_pre_registered_client(provider):
    client = await provider.get_client("bastion-client")
    assert client is not None
    assert client.client_id == "bastion-client"
    assert client.redirect_uris is not None
    assert len(client.redirect_uris) == 1


@pytest.mark.asyncio
async def test_get_unknown_client_returns_none(provider):
    client = await provider.get_client("unknown-client")
    assert client is None


@pytest.mark.asyncio
async def test_register_client(provider):
    from mcp.shared.auth import OAuthClientInformationFull

    new_client = OAuthClientInformationFull(
        client_id="test-client-1",
        redirect_uris=["http://localhost:9999/callback"],
        token_endpoint_auth_method="none",
    )
    await provider.register_client(new_client)
    retrieved = await provider.get_client("test-client-1")
    assert retrieved is not None
    assert retrieved.client_id == "test-client-1"


@pytest.mark.asyncio
async def test_full_authorization_code_flow(provider):
    import base64
    import hashlib
    import secrets

    from mcp.server.auth.provider import AuthorizationParams

    client = await provider.get_client("bastion-client")
    assert client is not None

    code_verifier = secrets.token_urlsafe(32)
    code_challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest()).rstrip(b"=").decode()
    )

    redirect_uri = "http://localhost:3000/callback"
    params = AuthorizationParams(
        state="test-state-123",
        scopes=["memory:read", "memory:write"],
        code_challenge=code_challenge,
        redirect_uri=redirect_uri,
        redirect_uri_provided_explicitly=True,
    )
    redirect_url = await provider.authorize(client, params)
    assert redirect_url.startswith(redirect_uri)

    parsed = urlparse(redirect_url)
    qs = parse_qs(parsed.query)
    auth_code_str = qs["code"][0]
    assert qs["state"][0] == "test-state-123"

    auth_code = await provider.load_authorization_code(client, auth_code_str)
    assert auth_code is not None
    assert auth_code.code == auth_code_str
    assert "memory:read" in auth_code.scopes

    token = await provider.exchange_authorization_code(client, auth_code)
    assert token.access_token is not None
    assert token.refresh_token is not None
    assert token.token_type == "Bearer"
    assert token.expires_in == 3600

    access_info = await provider.load_access_token(token.access_token)
    assert access_info is not None
    assert access_info.client_id == "bastion-client"
    assert "memory:read" in access_info.scopes

    refresh = await provider.load_refresh_token(client, token.refresh_token)
    assert refresh is not None
    new_token = await provider.exchange_refresh_token(client, refresh, ["memory:read"])
    assert new_token.access_token is not None
    assert new_token.refresh_token is not None

    old_refresh = await provider.load_refresh_token(client, token.refresh_token)
    assert old_refresh is None

    new_access = await provider.load_access_token(new_token.access_token)
    assert new_access is not None
    await provider.revoke_token(new_access)
    revoked = await provider.load_access_token(new_token.access_token)
    assert revoked is None


@pytest.mark.asyncio
async def test_invalid_code_returns_none(provider):
    client = await provider.get_client("bastion-client")
    assert client is not None
    result = await provider.load_authorization_code(client, "invalid-code")
    assert result is None


@pytest.mark.asyncio
async def test_invalid_token_returns_none(provider):
    result = await provider.load_access_token("invalid-token")
    assert result is None


@pytest.mark.asyncio
async def test_oauth_enabled_with_env():
    assert is_oauth_enabled() is True
    os.environ.pop("BASTION_MCP_OAUTH_ENABLED", None)
    os.environ.pop("BASTION_MCP_OAUTH_CLIENT_ID", None)
    _clear_provider_cache()
    assert is_oauth_enabled() is False


@pytest.mark.asyncio
async def test_provider_works_without_env():
    os.environ.pop("BASTION_MCP_OAUTH_CLIENT_ID", None)
    os.environ.pop("BASTION_MCP_OAUTH_ENABLED", None)
    _clear_provider_cache()
    p = BastionOAuthProvider()
    client = await p.get_client("bastion-client")
    assert client is None


@pytest.mark.asyncio
async def test_provider_with_explicit_client():
    p = BastionOAuthProvider(
        client_id="explicit-client",
        client_secret="secret-123",
        redirect_uri="http://localhost:9999/cb",
    )
    client = await p.get_client("explicit-client")
    assert client is not None
    assert client.client_secret == "secret-123"
    assert str(client.redirect_uris[0]) == "http://localhost:9999/cb"
    assert client.token_endpoint_auth_method == "client_secret_post"
