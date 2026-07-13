from __future__ import annotations

import os
import secrets
import time

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken

_PRE_REGISTERED_CLIENT_ID: str | None = None
_PRE_REGISTERED_CLIENT_SECRET: str | None = None
_PRE_REGISTERED_REDIRECT_URI: str | None = None


def _load_pre_registered_client() -> tuple[str | None, str | None, str | None]:
    global _PRE_REGISTERED_CLIENT_ID, _PRE_REGISTERED_CLIENT_SECRET, _PRE_REGISTERED_REDIRECT_URI
    if _PRE_REGISTERED_CLIENT_ID is None:
        _PRE_REGISTERED_CLIENT_ID = os.environ.get("BASTION_MCP_OAUTH_CLIENT_ID")
        _PRE_REGISTERED_CLIENT_SECRET = os.environ.get("BASTION_MCP_OAUTH_CLIENT_SECRET")
        _PRE_REGISTERED_REDIRECT_URI = os.environ.get("BASTION_MCP_OAUTH_REDIRECT_URI")
    return _PRE_REGISTERED_CLIENT_ID, _PRE_REGISTERED_CLIENT_SECRET, _PRE_REGISTERED_REDIRECT_URI


def is_oauth_enabled() -> bool:
    return bool(os.environ.get("BASTION_MCP_OAUTH_CLIENT_ID")) or bool(os.environ.get("BASTION_MCP_OAUTH_ENABLED"))


class BastionOAuthProvider(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]):
    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uri: str | None = None,
    ) -> None:
        self._clients: dict[str, OAuthClientInformationFull] = {}
        self._auth_codes: dict[str, AuthorizationCode] = {}
        self._access_tokens: dict[str, AccessToken] = {}
        self._refresh_tokens: dict[str, RefreshToken] = {}

        if client_id is None:
            client_id, client_secret, redirect_uri = _load_pre_registered_client()
        if client_id:
            redirect_uris = [redirect_uri] if redirect_uri else [os.environ.get("BASTION_OAUTH_REDIRECT_URI", "http://localhost:3000/callback")]
            self._clients[client_id] = OAuthClientInformationFull(
                client_id=client_id,
                client_secret=client_secret,
                redirect_uris=redirect_uris,
                token_endpoint_auth_method="client_secret_post" if client_secret else "none",
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                scope="memory:read memory:write",
            )

    # ── Client Management ─────────────────────────────────────────────

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return self._clients.get(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        if client_info.client_id:
            self._clients[client_info.client_id] = client_info

    # ── Authorization ─────────────────────────────────────────────────

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        code = secrets.token_urlsafe(32)
        now = time.time()
        auth_code = AuthorizationCode(
            code=code,
            scopes=params.scopes or [],
            expires_at=now + 600,
            client_id=client.client_id or "",
            code_challenge=params.code_challenge,
            redirect_uri=params.redirect_uri,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            resource=params.resource,
        )
        self._auth_codes[code] = auth_code
        return construct_redirect_uri(
            str(params.redirect_uri),
            code=code,
            state=params.state,
        )

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        code = self._auth_codes.get(authorization_code)
        if code and code.expires_at > time.time():
            return code
        return None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        access_token_str = secrets.token_urlsafe(48)
        refresh_token_str = secrets.token_urlsafe(48)
        now = time.time()

        self._access_tokens[access_token_str] = AccessToken(
            token=access_token_str,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=int(now) + 3600,
            resource=authorization_code.resource,
        )
        self._refresh_tokens[refresh_token_str] = RefreshToken(
            token=refresh_token_str,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=int(now) + 86400 * 7,
        )

        self._auth_codes.pop(authorization_code.code, None)

        return OAuthToken(
            access_token=access_token_str,
            token_type="Bearer",
            expires_in=3600,
            scope=" ".join(authorization_code.scopes),
            refresh_token=refresh_token_str,
        )

    # ── Token Refresh ─────────────────────────────────────────────────

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        token = self._refresh_tokens.get(refresh_token)
        if token and (token.expires_at is None or token.expires_at > time.time()):
            return token
        return None

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        access_token_str = secrets.token_urlsafe(48)
        refresh_token_str = secrets.token_urlsafe(48)
        now = time.time()

        self._access_tokens[access_token_str] = AccessToken(
            token=access_token_str,
            client_id=client.client_id or "",
            scopes=scopes or refresh_token.scopes,
            expires_at=int(now) + 3600,
        )

        new_refresh = RefreshToken(
            token=refresh_token_str,
            client_id=client.client_id or "",
            scopes=scopes or refresh_token.scopes,
            expires_at=int(now) + 86400 * 7,
        )
        self._refresh_tokens[refresh_token_str] = new_refresh

        self._refresh_tokens.pop(refresh_token.token, None)

        return OAuthToken(
            access_token=access_token_str,
            token_type="Bearer",
            expires_in=3600,
            scope=" ".join(scopes or refresh_token.scopes),
            refresh_token=refresh_token_str,
        )

    # ── Token Verification ────────────────────────────────────────────

    async def load_access_token(self, token: str) -> AccessToken | None:
        t = self._access_tokens.get(token)
        if t and (t.expires_at is None or t.expires_at > time.time()):
            return t
        return None

    # ── Token Revocation ──────────────────────────────────────────────

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        self._access_tokens.pop(token.token, None)
        self._refresh_tokens.pop(token.token, None)
