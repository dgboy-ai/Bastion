from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import threading
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

from bastion.log_setup import get_logger

logger = get_logger(__name__)

_PRE_REGISTERED_CLIENT_ID: str | None = None
_PRE_REGISTERED_CLIENT_SECRET: str | None = None
_PRE_REGISTERED_REDIRECT_URI: str | None = None

# PKCE code_verifier storage: maps authorization_code -> code_verifier
_pkce_verifiers: dict[str, str] = {}
_pkce_lock = threading.Lock()

# TTL for cleanup of stale PKCE entries (10 minutes)
_PKCE_TTL = 600


def store_pkce_verifier(authorization_code: str, code_verifier: str) -> None:
    """Store a code_verifier for later verification during token exchange."""
    with _pkce_lock:
        _pkce_verifiers[authorization_code] = (code_verifier, time.time())


def _cleanup_pkce_verifiers() -> None:
    """Remove expired PKCE verifiers."""
    now = time.time()
    with _pkce_lock:
        expired = [k for k, (_, ts) in _pkce_verifiers.items() if now - ts > _PKCE_TTL]
        for k in expired:
            _pkce_verifiers.pop(k, None)


def _verify_pkce_s256(code_verifier: str, code_challenge: str) -> bool:
    """Verify code_verifier against code_challenge using S256 method."""
    computed = (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest())
        .rstrip(b"=")
        .decode("ascii")
    )
    return secrets.compare_digest(computed, code_challenge)


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
    """Persistent OAuth 2.0 provider backed by CockroachDB.

    Falls back to in-memory storage when no database connection is available.
    Tokens survive server restarts when using CockroachDB persistence.
    """

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uri: str | None = None,
        connection_string: str | None = None,
    ) -> None:
        self._conn_str = connection_string or os.environ.get("BASTION_CONN", "")
        self._use_db = bool(self._conn_str)

        # In-memory fallback (used when DB unavailable or in mock mode)
        self._clients: dict[str, OAuthClientInformationFull] = {}
        self._auth_codes: dict[str, AuthorizationCode] = {}
        self._access_tokens: dict[str, AccessToken] = {}
        self._refresh_tokens: dict[str, RefreshToken] = {}

        # Initialize DB tables if using persistent storage
        if self._use_db:
            try:
                self._init_db()
            except Exception as exc:
                logger.warning("Failed to initialize OAuth DB tables, falling back to in-memory: %s", exc)
                self._use_db = False

        if client_id is None:
            client_id, client_secret, redirect_uri = _load_pre_registered_client()
        if client_id:
            raw_uri = redirect_uri or os.environ.get("BASTION_OAUTH_REDIRECT_URI", "http://localhost:3000/callback")
            from pydantic import AnyUrl
            redirect_uris = [AnyUrl(raw_uri)]
            self._clients[client_id] = OAuthClientInformationFull(
                client_id=client_id,
                client_secret=client_secret,
                redirect_uris=redirect_uris,
                token_endpoint_auth_method="client_secret_post" if client_secret else "none",
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                scope="memory:read memory:write",
            )

    def _get_conn(self):
        """Get a raw psycopg connection."""
        import psycopg
        return psycopg.connect(self._conn_str)

    def _init_db(self) -> None:
        """Create OAuth tables if they don't exist."""
        conn = self._get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS oauth_clients (
                        client_id STRING PRIMARY KEY,
                        client_secret STRING,
                        redirect_uris JSONB,
                        token_endpoint_auth_method STRING,
                        grant_types JSONB,
                        response_types JSONB,
                        scope STRING,
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS oauth_auth_codes (
                        code STRING PRIMARY KEY,
                        client_id STRING,
                        scopes JSONB,
                        expires_at FLOAT8,
                        code_challenge STRING,
                        redirect_uri STRING,
                        redirect_uri_provided_explicitly BOOL,
                        resource JSONB,
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS oauth_access_tokens (
                        token STRING PRIMARY KEY,
                        client_id STRING,
                        scopes JSONB,
                        expires_at INT8,
                        resource JSONB,
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
                        token STRING PRIMARY KEY,
                        client_id STRING,
                        scopes JSONB,
                        expires_at INT8,
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                """)
            conn.commit()
            logger.info("OAuth DB tables initialized")
        finally:
            conn.close()

    # ── Client Management ─────────────────────────────────────────────

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT * FROM oauth_clients WHERE client_id = %s", (client_id,))
                        row = cur.fetchone()
                        if row:
                            from pydantic import AnyUrl
                            return OAuthClientInformationFull(
                                client_id=row[0],
                                client_secret=row[1],
                                redirect_uris=[AnyUrl(u) for u in (row[2] or [])],
                                token_endpoint_auth_method=row[3],
                                grant_types=row[4] or [],
                                response_types=row[5] or [],
                                scope=row[6] or "",
                            )
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB get_client failed, falling back to memory: %s", exc)
        return self._clients.get(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        if client_info.client_id:
            self._clients[client_info.client_id] = client_info
            if self._use_db:
                try:
                    conn = self._get_conn()
                    try:
                        with conn.cursor() as cur:
                            cur.execute(
                                """INSERT INTO oauth_clients (client_id, client_secret, redirect_uris,
                                   token_endpoint_auth_method, grant_types, response_types, scope)
                                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                                   ON CONFLICT (client_id) DO UPDATE SET
                                   client_secret = EXCLUDED.client_secret,
                                   redirect_uris = EXCLUDED.redirect_uris""",
                                (
                                    client_info.client_id,
                                    client_info.client_secret,
                                    json.dumps([str(u) for u in (client_info.redirect_uris or [])]),
                                    client_info.token_endpoint_auth_method,
                                    json.dumps(client_info.grant_types or []),
                                    json.dumps(client_info.response_types or []),
                                    client_info.scope,
                                ),
                            )
                        conn.commit()
                    finally:
                        conn.close()
                except Exception as exc:
                    logger.warning("DB register_client failed: %s", exc)

    # ── Authorization ─────────────────────────────────────────────────

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        _cleanup_pkce_verifiers()
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

        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO oauth_auth_codes (code, client_id, scopes, expires_at,
                               code_challenge, redirect_uri, redirect_uri_provided_explicitly, resource)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                            (
                                code,
                                client.client_id,
                                json.dumps(params.scopes or []),
                                now + 600,
                                params.code_challenge,
                                str(params.redirect_uri),
                                params.redirect_uri_provided_explicitly,
                                json.dumps(params.resource) if params.resource else None,
                            ),
                        )
                    conn.commit()
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB authorize failed: %s", exc)

        return construct_redirect_uri(
            str(params.redirect_uri),
            code=code,
            state=params.state,
        )

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT * FROM oauth_auth_codes WHERE code = %s", (authorization_code,)
                        )
                        row = cur.fetchone()
                        if row and row[3] > time.time():
                            return AuthorizationCode(
                                code=row[0],
                                client_id=row[1],
                                scopes=row[2] or [],
                                expires_at=row[3],
                                code_challenge=row[4],
                                redirect_uri=row[5],
                                redirect_uri_provided_explicitly=row[6],
                                resource=json.loads(row[7]) if row[7] else None,
                            )
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB load_authorization_code failed: %s", exc)

        code = self._auth_codes.get(authorization_code)
        if code and code.expires_at > time.time():
            return code
        return None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        # PKCE verification
        with _pkce_lock:
            pv_entry = _pkce_verifiers.pop(authorization_code.code, None)
        code_verifier = pv_entry[0] if pv_entry else None

        if authorization_code.code_challenge:
            if not code_verifier:
                raise ValueError(
                    "PKCE code_verifier missing from token request — "
                    "middleware may have failed to capture it"
                )
            if not _verify_pkce_s256(code_verifier, authorization_code.code_challenge):
                raise ValueError(
                    "PKCE verification failed: code_verifier does not match code_challenge"
                )

        access_token_str = secrets.token_urlsafe(48)
        refresh_token_str = secrets.token_urlsafe(48)
        now = time.time()

        access_token = AccessToken(
            token=access_token_str,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=int(now) + 3600,
            resource=authorization_code.resource,
        )
        refresh_token = RefreshToken(
            token=refresh_token_str,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=int(now) + 86400 * 7,
        )

        self._access_tokens[access_token_str] = access_token
        self._refresh_tokens[refresh_token_str] = refresh_token
        self._auth_codes.pop(authorization_code.code, None)

        # Persist to DB
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO oauth_access_tokens (token, client_id, scopes, expires_at, resource)
                               VALUES (%s, %s, %s, %s, %s)""",
                            (access_token_str, client.client_id, json.dumps(authorization_code.scopes),
                             int(now) + 3600, json.dumps(authorization_code.resource) if authorization_code.resource else None),
                        )
                        cur.execute(
                            """INSERT INTO oauth_refresh_tokens (token, client_id, scopes, expires_at)
                               VALUES (%s, %s, %s, %s)""",
                            (refresh_token_str, client.client_id, json.dumps(authorization_code.scopes),
                             int(now) + 86400 * 7),
                        )
                        cur.execute("DELETE FROM oauth_auth_codes WHERE code = %s", (authorization_code.code,))
                    conn.commit()
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB exchange_authorization_code failed: %s", exc)

        return OAuthToken(
            access_token=access_token_str,
            token_type="Bearer",
            expires_in=3600,
            scope=" ".join(authorization_code.scopes),
            refresh_token=refresh_token_str,
        )

    # ── Token Refresh ─────────────────────────────────────────────────

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT * FROM oauth_refresh_tokens WHERE token = %s", (refresh_token,)
                        )
                        row = cur.fetchone()
                        if row and (row[3] is None or row[3] > time.time()):
                            return RefreshToken(
                                token=row[0],
                                client_id=row[1],
                                scopes=row[2] or [],
                                expires_at=row[3],
                            )
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB load_refresh_token failed: %s", exc)

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
        # Scope escalation prevention: requested scopes must be subset of original
        granted_scopes = set(refresh_token.scopes or [])
        requested_scopes = set(scopes or refresh_token.scopes)
        if not requested_scopes.issubset(granted_scopes):
            # Only grant the intersection (original scopes)
            requested_scopes = granted_scopes
        final_scopes = list(requested_scopes)

        access_token_str = secrets.token_urlsafe(48)
        refresh_token_str = secrets.token_urlsafe(48)
        now = time.time()

        new_access = AccessToken(
            token=access_token_str,
            client_id=client.client_id or "",
            scopes=final_scopes,
            expires_at=int(now) + 3600,
        )
        new_refresh = RefreshToken(
            token=refresh_token_str,
            client_id=client.client_id or "",
            scopes=final_scopes,
            expires_at=int(now) + 86400 * 7,
        )

        self._access_tokens[access_token_str] = new_access
        self._refresh_tokens[refresh_token_str] = new_refresh
        self._refresh_tokens.pop(refresh_token.token, None)

        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO oauth_access_tokens (token, client_id, scopes, expires_at)
                               VALUES (%s, %s, %s, %s)""",
                            (access_token_str, client.client_id, json.dumps(scopes or refresh_token.scopes),
                             int(now) + 3600),
                        )
                        cur.execute(
                            """INSERT INTO oauth_refresh_tokens (token, client_id, scopes, expires_at)
                               VALUES (%s, %s, %s, %s)""",
                            (refresh_token_str, client.client_id, json.dumps(scopes or refresh_token.scopes),
                             int(now) + 86400 * 7),
                        )
                        cur.execute("DELETE FROM oauth_refresh_tokens WHERE token = %s", (refresh_token.token,))
                        cur.execute("DELETE FROM oauth_access_tokens WHERE token = %s", (refresh_token.token,))
                    conn.commit()
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB exchange_refresh_token failed: %s", exc)

        return OAuthToken(
            access_token=access_token_str,
            token_type="Bearer",
            expires_in=3600,
            scope=" ".join(final_scopes),
            refresh_token=refresh_token_str,
        )

    # ── Token Verification ────────────────────────────────────────────

    async def load_access_token(self, token: str) -> AccessToken | None:
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT * FROM oauth_access_tokens WHERE token = %s", (token,)
                        )
                        row = cur.fetchone()
                        if row and (row[3] is None or row[3] > time.time()):
                            return AccessToken(
                                token=row[0],
                                client_id=row[1],
                                scopes=row[2] or [],
                                expires_at=row[3],
                                resource=json.loads(row[4]) if row[4] else None,
                            )
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB load_access_token failed: %s", exc)

        t = self._access_tokens.get(token)
        if t and (t.expires_at is None or t.expires_at > time.time()):
            return t
        return None

    # ── Token Revocation ──────────────────────────────────────────────

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        self._access_tokens.pop(token.token, None)
        self._refresh_tokens.pop(token.token, None)
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("DELETE FROM oauth_access_tokens WHERE token = %s", (token.token,))
                        cur.execute("DELETE FROM oauth_refresh_tokens WHERE token = %s", (token.token,))
                    conn.commit()
                finally:
                    conn.close()
            except Exception as exc:
                logger.warning("DB revoke_token failed: %s", exc)
