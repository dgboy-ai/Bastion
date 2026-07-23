"""Tests for Row-Level Security and connection bleed protection."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from bastion.errors import BastionPoolExhaustedError
from bastion.pool import ConnectionPool
from bastion.rls import RowLevelSecurity

# ---------------------------------------------------------------------------
# RLS context guard tests
# ---------------------------------------------------------------------------


class TestRowLevelSecurity:
    def test_set_agent_context_requires_non_autocommit(self):
        conn = MagicMock()
        conn.autocommit = True
        rls = RowLevelSecurity(conn)
        with pytest.raises(RuntimeError, match="autocommit is True"):
            rls.set_agent_context("agent-1")

    def test_set_agent_context_executes_set_local(self):
        conn = MagicMock()
        conn.autocommit = False
        cur = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        rls = RowLevelSecurity(conn)
        rls.set_agent_context("agent-1")
        cur.execute.assert_called_once_with(
            "SET LOCAL app.current_agent_id = %s",
            ("agent-1",),
        )

    def test_set_agent_context_commits(self):
        conn = MagicMock()
        conn.autocommit = False
        rls = RowLevelSecurity(conn)
        rls.set_agent_context("agent-1")
        conn.commit.assert_not_called()

    def test_verify_isolation(self):
        conn = MagicMock()
        conn.autocommit = False
        cur = MagicMock()
        cur.fetchone.return_value = (5,)
        conn.cursor.return_value.__enter__.return_value = cur
        rls = RowLevelSecurity(conn)
        result = rls.verify_isolation("agent-2")
        assert result["agent_id"] == "agent-2"
        assert result["visible_memories"] == 5
        assert result["rls_active"] is True

    def test_enable_rls_creates_policies(self):
        conn = MagicMock()
        rls = RowLevelSecurity(conn)
        result = rls.enable_rls()
        assert result["status"] == "enabled"
        assert "agent_memory" in result["tables"]


# ---------------------------------------------------------------------------
# Pool RESET ALL tests
# ---------------------------------------------------------------------------


class TestPoolResetAll:
    def test_release_executes_reset_all(self):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        pool = ConnectionPool("mock://", min_size=1, max_size=2)
        pool._total_created = 1
        pool.release(conn)
        cur.execute.assert_called_once_with("RESET ALL")

    def test_release_adds_conn_back_to_pool(self):
        conn = MagicMock()
        cur = MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        conn.closed = False
        conn.is_closed.return_value = False  # Healthy connection
        pool = ConnectionPool("mock://", min_size=1, max_size=2)
        pool._total_created = 1
        pool.release(conn)
        assert len(pool._pool) == 1
        assert pool._pool[0][0] == conn

    def test_release_reset_all_failure_logged(self):
        conn = MagicMock()
        cur = MagicMock()
        cur.execute.side_effect = Exception("reset failed")
        conn.cursor.return_value.__enter__.return_value = cur
        pool = ConnectionPool("mock://", min_size=1, max_size=2)
        with patch("bastion.pool.logger") as mock_logger:
            pool.release(conn)
            mock_logger.debug.assert_called_once_with(
                "RESET ALL failed during release — discarding connection"
            )

    def test_release_does_not_exceed_max_size(self):
        pool = ConnectionPool("mock://", min_size=1, max_size=2)
        pool._total_created = 1
        pool._pool.append((MagicMock(), 0))
        pool._pool.append((MagicMock(), 0))
        extra = MagicMock()
        pool.release(extra)
        assert len(pool._pool) == 2

    def test_acquire_respects_max_size(self):
        pool = ConnectionPool("mock://", min_size=1, max_size=1)
        pool._total_created = 1
        pool._pool.clear()
        with pytest.raises(BastionPoolExhaustedError):
            pool.acquire(timeout=0.01)

    def test_acquire_skips_unhealthy_connections(self):
        bad_conn = MagicMock()
        bad_conn.cursor.side_effect = Exception("connection lost")
        pool = ConnectionPool("mock://", min_size=1, max_size=2)
        pool._total_created = 1
        pool._pool.append((bad_conn, 0))
        good_conn = MagicMock()
        with patch.object(pool, "_create_connection", return_value=good_conn):
            result = pool.acquire(timeout=5.0)
            assert result == good_conn


# ---------------------------------------------------------------------------
# Async pool RESET ALL tests (set _pool directly, no asyncpg import needed)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_async_release_executes_reset_all():
    from bastion.pool import AsyncConnectionPool

    pool = AsyncConnectionPool("mock://")
    pool._pool = AsyncMock()
    pool._pool.release = AsyncMock()
    conn = AsyncMock()
    await pool.release(conn)
    conn.execute.assert_called_once_with("RESET ALL")


@pytest.mark.asyncio
async def test_async_release_reset_failure_logged():
    from bastion.pool import AsyncConnectionPool

    pool = AsyncConnectionPool("mock://")
    pool._pool = AsyncMock()
    pool._pool.release = AsyncMock()
    conn = AsyncMock()
    conn.execute.side_effect = Exception("async reset failed")
    with patch("bastion.pool.logger") as mock_logger:
        await pool.release(conn)
        mock_logger.debug.assert_called_once_with(
            "RESET ALL failed during async release — discarding connection"
        )


@pytest.mark.asyncio
async def test_async_release_releases_conn_to_pool():
    from bastion.pool import AsyncConnectionPool

    pool = AsyncConnectionPool("mock://")
    pool._pool = AsyncMock()
    pool._pool.release = AsyncMock()
    conn = AsyncMock()
    await pool.release(conn)
    pool._pool.release.assert_awaited_once_with(conn)

