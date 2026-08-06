from __future__ import annotations

import base64
import contextlib
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

# RBAC roles and their allowed scopes
RBAC_ROLES: dict[str, set[str]] = {
    "admin": {"memory:read", "memory:write", "memory:delete", "admin"},
    "writer": {"memory:read", "memory:write"},
    "reader": {"memory:read"},
}
DEFAULT_ROLE = "writer"


def resolve_role_from_scopes(scopes: list[str]) -> str:
    """Determine the most privileged role from a set of scopes."""
    scope_set = set(scopes or [])
    if "admin" in scope_set:
        return "admin"
    if "memory:write" in scope_set:
        return "writer"
    return "reader"


def role_has_scope(role: str, required_scope: str) -> bool:
    """Check if a role grants the required scope."""
    allowed = RBAC_ROLES.get(role, set())
    return required_scope in allowed


def _hash_token(token: str) -> str:
    """SHA-256 hash of a token for the revocation table lookup."""
    return hashlib.sha256(token.encode()).hexdigest()


_PRE_REGISTERED_CLIENT_ID: str | None = None
_PRE_REGISTERED_CLIENT_SECRET: str | None = None
_PRE_REGISTERED_REDIRECT_URI: str | None = None
_PRE_REGISTERED_LOCK = threading.Lock()

# Token rotation locks: per-client to prevent global serialization
_token_rotation_locks: dict[str, threading.Lock] = {}
_token_rotation_locks_lock = threading.Lock()

# PKCE code_verifier storage: maps authorization_code -> code_verifier
# In-memory cache is ONLY used when DB is unavailable (single-instance dev mode).
# In production, DB is the primary store — this dict is a fast-path cache.
_pkce_verifiers: dict[str, tuple[str, float]] = {}
_pkce_lock = threading.Lock()

# TTL for cleanup of stale PKCE entries (10 minutes)
_PKCE_TTL = 600
_PKCE_MAX_SIZE = 1_000  # Prevent memory exhaustion (entries expire after 10 min)


def store_pkce_verifier(authorization_code: str, code_verifier: str) -> None:
    """Store a hashed code_verifier for later verification during token exchange.

    In production (DB available): DB is primary, in-memory is cache.
    In dev (no DB): in-memory only.
    """
    # Hash verifier before storage — never persist plaintext verifiers
    verifier_hash = (
        base64.urlsafe_b64encode(hashlib.sha256(code_verifier.encode("ascii")).digest()).rstrip(b"=").decode("ascii")
    )

    conn_str = os.environ.get("BASTION_CONN")
    if conn_str:
        # DB is primary — always write through
        try:
            import psycopg

            with psycopg.connect(conn_str) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO oauth_pkce_verifiers (code, code_verifier, expires_at)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (code) DO UPDATE SET
                        code_verifier = EXCLUDED.code_verifier,
                        expires_at = EXCLUDED.expires_at
                    """,
                        (authorization_code, verifier_hash, time.time() + _PKCE_TTL),
                    )
                conn.commit()
            # Also cache in memory for fast single-instance lookup
            with _pkce_lock:
                _pkce_verifiers[authorization_code] = (verifier_hash, time.time())
            return
        except Exception as exc:
            logger.warning("Failed to store PKCE verifier in DB, falling back to memory: %s", exc)

    # Dev mode: in-memory only
    with _pkce_lock:
        _pkce_verifiers[authorization_code] = (verifier_hash, time.time())
        # Periodic cleanup: evict expired entries on every store
        now = time.time()
        expired = [k for k, (_, ts) in _pkce_verifiers.items() if now - ts > _PKCE_TTL]
        for k in expired:
            _pkce_verifiers.pop(k, None)
        # Hard cap: evict oldest entries if still over limit
        if len(_pkce_verifiers) > _PKCE_MAX_SIZE:
            sorted_keys = sorted(_pkce_verifiers, key=lambda k: _pkce_verifiers[k][1])
            for k in sorted_keys[: len(sorted_keys) - _PKCE_MAX_SIZE + 100]:
                _pkce_verifiers.pop(k, None)


def _cleanup_pkce_verifiers() -> None:
    """Remove expired PKCE verifiers."""
    now = time.time()
    with _pkce_lock:
        expired = [k for k, (_, ts) in _pkce_verifiers.items() if now - ts > _PKCE_TTL]
        for k in expired:
            _pkce_verifiers.pop(k, None)

    conn_str = os.environ.get("BASTION_CONN")
    if conn_str:
        try:
            import psycopg

            with psycopg.connect(conn_str) as conn:
                with conn.cursor() as cur:
                    cur.execute("DELETE FROM oauth_pkce_verifiers WHERE expires_at <= %s", (now,))
                conn.commit()
        except Exception as exc:
            logger.warning("Failed to clean up expired PKCE verifiers in DB: %s", exc)


def _load_pkce_verifier_from_db(authorization_code: str) -> str | None:
    """Load a PKCE verifier from the database for the given authorization code."""
    conn_str = os.environ.get("BASTION_CONN")
    if not conn_str:
        return None
    try:
        import psycopg

        with psycopg.connect(conn_str) as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT code_verifier FROM oauth_pkce_verifiers WHERE code = %s AND expires_at > %s",
                (authorization_code, time.time()),
            )
            row = cur.fetchone()
            if row:
                # Delete after retrieval (one-time use)
                cur.execute("DELETE FROM oauth_pkce_verifiers WHERE code = %s", (authorization_code,))
                conn.commit()
                return row[0]
    except Exception as exc:
        logger.warning("Failed to load PKCE verifier from DB: %s", exc)
    return None


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
        self._pool = None  # Lazy-initialized connection pool
        self._use_db = bool(self._conn_str)

        # In-memory fallback (used when DB unavailable or in mock mode)
        self._clients: dict[str, OAuthClientInformationFull] = {}
        self._auth_codes: dict[str, AuthorizationCode] = {}
        self._access_tokens: dict[str, AccessToken] = {}
        self._refresh_tokens: dict[str, RefreshToken] = {}
        self._last_cleanup: float = time.time()
        self._cleanup_interval: float = 300  # Clean up every 5 minutes

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
            # Hash client secret before storing in memory (prevent plaintext exposure)
            hashed_secret = None
            if client_secret:
                import hashlib

                hashed_secret = hashlib.sha256(client_secret.encode()).hexdigest()
            self._clients[client_id] = OAuthClientInformationFull(
                client_id=client_id,
                client_secret=hashed_secret,
                redirect_uris=redirect_uris,
                token_endpoint_auth_method="client_secret_post" if client_secret else "none",
                grant_types=["authorization_code", "refresh_token"],
                response_types=["code"],
                scope="memory:read memory:write",
            )

    def _get_conn(self):
        """Get a connection from the pool (or create a new one if pool unavailable)."""
        if self._pool is not None:
            try:
                return self._pool.acquire(timeout=5.0)
            except Exception:
                pass  # Fall through to raw connection
        import psycopg

        return psycopg.connect(self._conn_str)

    def _release_conn(self, conn):
        """Release a connection back to the pool."""
        if self._pool is not None:
            try:
                self._pool.release(conn)
                return
            except Exception as exc:
                logger.warning("Failed to release connection to pool: %s", exc)
        # If not using pool, just close
        with contextlib.suppress(Exception):
            conn.close()

    def _init_pool(self):
        """Initialize connection pool for OAuth operations."""
        if self._pool is not None or not self._conn_str:
            return
        try:
            from bastion.pool import ConnectionPool

            self._pool = ConnectionPool(
                connection_string=self._conn_str,
                min_size=2,
                max_size=5,
                max_idle_seconds=300,
            )
        except Exception as exc:
            logger.warning("Failed to create OAuth connection pool: %s", exc)
            self._pool = None

    def _init_db(self) -> None:
        """Create OAuth tables if they don't exist."""
        self._init_pool()
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
                        expires_at_ts TIMESTAMPTZ,
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
                        expires_at_ts TIMESTAMPTZ,
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
                        expires_at_ts TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS oauth_pkce_verifiers (
                        code STRING PRIMARY KEY,
                        code_verifier STRING,
                        expires_at FLOAT8,
                        expires_at_ts TIMESTAMPTZ,
                        created_at TIMESTAMPTZ DEFAULT now()
                    )
                """)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS oauth_revoked_tokens (
                        token_hash  STRING PRIMARY KEY,
                        token_type  STRING NOT NULL DEFAULT 'access',
                        revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                        expires_at  TIMESTAMPTZ
                    )
                """)
                # RBAC: add role column if missing
                cur.execute(
                    "ALTER TABLE oauth_access_tokens ADD COLUMN IF NOT EXISTS role STRING NOT NULL DEFAULT 'writer'"
                )
                cur.execute(
                    "ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS role STRING NOT NULL DEFAULT 'writer'"
                )
            conn.commit()
            logger.info("OAuth DB tables initialized")
        finally:
            self._release_conn(conn)

    # ── Token Cleanup ─────────────────────────────────────────────────

    def _cleanup_expired_tokens(self) -> None:
        """Remove expired tokens from in-memory stores to prevent unbounded growth."""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return
        self._last_cleanup = now

        # Use asyncio-safe snapshot-then-delete to avoid RuntimeError during iteration
        # asyncio is single-threaded so no lock needed, but snapshot prevents
        # "dictionary changed size during iteration" if a concurrent coroutine mutates
        try:
            import asyncio
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        def _safe_cleanup(store: dict, predicate) -> int:
            keys_to_remove = [k for k, v in list(store.items()) if predicate(v)]
            for k in keys_to_remove:
                store.pop(k, None)
            return len(keys_to_remove)

        # Clean expired auth codes
        cleaned_codes = _safe_cleanup(self._auth_codes, lambda v: v.expires_at < now)
        # Clean expired access tokens
        cleaned_tokens = _safe_cleanup(self._access_tokens, lambda v: v.expires_at and v.expires_at < now)
        # Clean expired refresh tokens
        cleaned_refresh = _safe_cleanup(self._refresh_tokens, lambda v: v.expires_at and v.expires_at < now)

        total_cleaned = cleaned_codes + cleaned_tokens + cleaned_refresh
        if total_cleaned > 0:
            logger.info("OAuth token cleanup: removed %d expired entries", total_cleaned)

    # ── Client Management ─────────────────────────────────────────────

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        cached = self._clients.get(client_id)
        if cached:
            return cached
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
                    self._release_conn(conn)
            except Exception as exc:
                logger.warning("DB get_client failed: %s", exc)
        return None

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        if client_info.client_id:
            self._clients[client_info.client_id] = client_info
            if self._use_db:
                try:
                    conn = self._get_conn()
                    try:
                        with conn.cursor() as cur:
                            hashed_secret = _hash_token(client_info.client_secret or "")
                            cur.execute(
                                """INSERT INTO oauth_clients (client_id, client_secret, redirect_uris,
                                   token_endpoint_auth_method, grant_types, response_types, scope)
                                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                                   ON CONFLICT (client_id) DO UPDATE SET
                                   client_secret = EXCLUDED.client_secret,
                                   redirect_uris = EXCLUDED.redirect_uris""",
                                (
                                    client_info.client_id,
                                    hashed_secret,
                                    json.dumps([str(u) for u in (client_info.redirect_uris or [])]),
                                    client_info.token_endpoint_auth_method,
                                    json.dumps(client_info.grant_types or []),
                                    json.dumps(client_info.response_types or []),
                                    client_info.scope,
                                ),
                            )
                        conn.commit()
                    finally:
                        self._release_conn(conn)
                except Exception as exc:
                    logger.warning("DB register_client failed: %s", exc)

    # ── Authorization ─────────────────────────────────────────────────

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        _cleanup_pkce_verifiers()

        # Validate redirect_uri against client's registered URIs
        if params.redirect_uri and client.redirect_uris:
            redirect_str = str(params.redirect_uri)
            if redirect_str not in [str(uri) for uri in client.redirect_uris]:
                raise ValueError(
                    f"redirect_uri {redirect_str} does not match any registered URI for client {client.client_id}"
                )

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
                    self._release_conn(conn)
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
                        cur.execute("SELECT * FROM oauth_auth_codes WHERE code = %s", (authorization_code,))
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
                    self._release_conn(conn)
            except Exception as exc:
                logger.warning("DB load_authorization_code failed: %s", exc)

        code = self._auth_codes.get(authorization_code)
        if code and code.expires_at > time.time():
            return code
        return None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        # Periodic cleanup of expired in-memory tokens
        self._cleanup_expired_tokens()

        # PKCE verification — retrieve code_verifier from in-memory store or DB
        code_verifier = None
        with _pkce_lock:
            pv_entry = _pkce_verifiers.pop(authorization_code.code, None)
            if pv_entry:
                code_verifier = pv_entry[0]

        # Fallback: load from DB if not in memory (e.g., server restarted or multi-instance)
        if not code_verifier and self._use_db:
            code_verifier = _load_pkce_verifier_from_db(authorization_code.code)

        if authorization_code.code_challenge:
            # PKCE challenge was provided during authorization — verifier MUST be present
            if not code_verifier:
                raise ValueError(
                    "PKCE code_verifier missing from token request — "
                    "middleware may have failed to capture it, or the verifier expired"
                )
            # Verify stored hash matches code_challenge (verifier was hashed before storage)
            if not secrets.compare_digest(code_verifier, authorization_code.code_challenge):
                logger.warning(
                    "PKCE verification FAILED for client %s — code_verifier does not match code_challenge",
                    client.client_id,
                )
                raise ValueError("PKCE verification failed: code_verifier does not match code_challenge")
            logger.info("PKCE S256 verification passed for client %s", client.client_id)
        else:
            # PKCE is mandatory in this server — reject requests without a code_challenge
            logger.warning(
                "PKCE code_challenge missing from token request — rejecting for client %s",
                client.client_id,
            )
            raise ValueError("PKCE code_challenge is required — token requests without PKCE are not allowed")

        access_token_str = secrets.token_urlsafe(48)
        refresh_token_str = secrets.token_urlsafe(48)
        now = time.time()
        token_role = resolve_role_from_scopes(authorization_code.scopes)

        access_token = AccessToken(
            token=access_token_str,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=now + 3600,
            resource=authorization_code.resource,
        )
        refresh_token = RefreshToken(
            token=refresh_token_str,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=now + 86400 * 7,
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
                        from datetime import datetime as _dt, timezone as _tz
                        _expires_ts = _dt.fromtimestamp(now + 3600, tz=_tz.utc)
                        cur.execute(
                            """INSERT INTO oauth_access_tokens (token, client_id, scopes, expires_at, expires_at_ts, resource, role)
                               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                            (
                                _hash_token(access_token_str),
                                client.client_id,
                                json.dumps(authorization_code.scopes),
                                now + 3600,
                                _expires_ts,
                                json.dumps(authorization_code.resource) if authorization_code.resource else None,
                                token_role,
                            ),
                        )
                        _refresh_expires_ts = _dt.fromtimestamp(now + 86400 * 7, tz=_tz.utc)
                        cur.execute(
                            """INSERT INTO oauth_refresh_tokens (token, client_id, scopes, expires_at, expires_at_ts, role)
                               VALUES (%s, %s, %s, %s, %s, %s)""",
                            (
                                _hash_token(refresh_token_str),
                                client.client_id,
                                json.dumps(authorization_code.scopes),
                                now + 86400 * 7,
                                _refresh_expires_ts,
                                token_role,
                            ),
                        )
                        cur.execute("DELETE FROM oauth_auth_codes WHERE code = %s", (authorization_code.code,))
                    conn.commit()
                finally:
                    self._release_conn(conn)
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
                        cur.execute("SELECT * FROM oauth_refresh_tokens WHERE token = %s", (_hash_token(refresh_token),))
                        row = cur.fetchone()
                        if row and (row[3] is None or row[3] > time.time()):
                            return RefreshToken(
                                token=row[0],
                                client_id=row[1],
                                scopes=row[2] or [],
                                expires_at=row[3],
                            )
                finally:
                    self._release_conn(conn)
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
        token_role = resolve_role_from_scopes(final_scopes)

        new_access = AccessToken(
            token=access_token_str,
            client_id=client.client_id or "",
            scopes=final_scopes,
            expires_at=now + 3600,
        )
        new_refresh = RefreshToken(
            token=refresh_token_str,
            client_id=client.client_id or "",
            scopes=final_scopes,
            expires_at=now + 86400 * 7,
        )

        # Delete old refresh token FIRST to prevent race condition
        # (two concurrent requests using the same token)
        # Use per-client lock to make pop + insert atomic (both in-memory AND DB)
        with _token_rotation_locks_lock:
            client_id = client.client_id or ""
            client_lock = _token_rotation_locks.get(client_id)
            if client_lock is None:
                client_lock = threading.Lock()
                _token_rotation_locks[client_id] = client_lock
        with client_lock:
            self._refresh_tokens.pop(refresh_token.token, None)
            self._access_tokens[access_token_str] = new_access
            self._refresh_tokens[refresh_token_str] = new_refresh

            if self._use_db:
                try:
                    conn = self._get_conn()
                    try:
                        with conn.cursor() as cur:
                            # Delete old tokens first (atomic with inserts)
                            cur.execute("DELETE FROM oauth_refresh_tokens WHERE token = %s", (_hash_token(refresh_token.token),))
                            # Delete old access tokens for this client
                            # (the old access token value is not available here)
                            cur.execute(
                                "DELETE FROM oauth_access_tokens WHERE client_id = %s AND expires_at < %s",
                                (client.client_id, now),
                            )
                            # Then insert new tokens
                            cur.execute(
                                """INSERT INTO oauth_access_tokens (token, client_id, scopes, expires_at, role)
                                   VALUES (%s, %s, %s, %s, %s)""",
                                (
                                    access_token_str,
                                    client.client_id,
                                    json.dumps(list(final_scopes)),
                                    now + 3600,
                                    token_role,
                                ),
                            )
                            cur.execute(
                                """INSERT INTO oauth_refresh_tokens (token, client_id, scopes, expires_at, role)
                                   VALUES (%s, %s, %s, %s, %s)""",
                                (
                                    refresh_token_str,
                                    client.client_id,
                                    json.dumps(list(final_scopes)),
                                    now + 86400 * 7,
                                    token_role,
                                ),
                            )
                        conn.commit()
                    finally:
                        self._release_conn(conn)
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
        # Check revocation table first (fast fail for revoked tokens)
        if self._use_db:
            degraded = time.time() - getattr(self, "_last_revocation_failure", 0) < 60
            try:
                if not degraded:
                    conn = self._get_conn()
                    try:
                        with conn.cursor() as cur:
                            cur.execute(
                                "SELECT 1 FROM oauth_revoked_tokens WHERE token_hash = %s AND token_type = 'access'",
                                (_hash_token(token),),
                            )
                            if cur.fetchone():
                                return None
                    finally:
                        self._release_conn(conn)
                else:
                    logger.warning("Revocation check degraded — skipping check for 60s after failure")
            except Exception:
                self._last_revocation_failure = time.time()
                logger.warning("Revocation check failed — entering 60s degraded mode")

        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute("SELECT * FROM oauth_access_tokens WHERE token = %s", (_hash_token(token),))
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
                    self._release_conn(conn)
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
                        # Record in revocation table for distributed revocation checks
                        token_hash = _hash_token(token.token)
                        token_type = "access" if isinstance(token, AccessToken) else "refresh"
                        cur.execute(
                            "INSERT INTO oauth_revoked_tokens (token_hash, token_type, expires_at) "
                            "VALUES (%s, %s, %s) "
                            "ON CONFLICT (token_hash) DO NOTHING",
                            (token_hash, token_type, token.expires_at if token.expires_at else None),
                        )
                        # Also delete the token row (tokens stored as hashes)
                        cur.execute("DELETE FROM oauth_access_tokens WHERE token = %s", (_hash_token(token.token),))
                        cur.execute("DELETE FROM oauth_refresh_tokens WHERE token = %s", (_hash_token(token.token),))
                    conn.commit()
                finally:
                    self._release_conn(conn)
            except Exception as exc:
                logger.warning("DB revoke_token failed: %s", exc)

    async def revoke_token_by_value(self, token_value: str, token_type_hint: str = "access") -> bool:
        """Revoke a token by its raw value (RFC 7009). Returns True if revoked."""
        token_hash = _hash_token(token_value)
        revoked = False

        # Remove from in-memory stores
        self._access_tokens.pop(token_value, None)
        self._refresh_tokens.pop(token_value, None)

        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "INSERT INTO oauth_revoked_tokens (token_hash, token_type) "
                            "VALUES (%s, %s) ON CONFLICT (token_hash) DO NOTHING",
                            (token_hash, token_type_hint),
                        )
                        cur.execute("DELETE FROM oauth_access_tokens WHERE token = %s", (_hash_token(token_value),))
                        cur.execute("DELETE FROM oauth_refresh_tokens WHERE token = %s", (_hash_token(token_value),))
                        revoked = cur.rowcount > 0
                    conn.commit()
                finally:
                    self._release_conn(conn)
            except Exception as exc:
                logger.warning("DB revoke_token_by_value failed: %s", exc)

        return revoked

    async def is_token_revoked(self, token_value: str) -> bool:
        """Check if a token has been revoked."""
        if self._use_db:
            try:
                conn = self._get_conn()
                try:
                    with conn.cursor() as cur:
                        cur.execute(
                            "SELECT 1 FROM oauth_revoked_tokens WHERE token_hash = %s",
                            (_hash_token(token_value),),
                        )
                        return cur.fetchone() is not None
                finally:
                    self._release_conn(conn)
            except Exception:
                return True  # Fail closed on DB error — never allow revoked tokens through
        return False
