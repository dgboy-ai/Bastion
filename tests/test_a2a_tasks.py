"""Tests for bastion.a2a_tasks module."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock


class FakeCursor:
    def __init__(self, return_row=None):
        self._return_row = return_row

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, sql, params=None):
        pass

    def fetchone(self):
        return self._return_row


class TestA2ATaskStore:
    def test_store_task_mock_mode(self):
        from bastion.a2a_tasks import A2ATaskStore

        store = A2ATaskStore(
            agent_id="test-agent",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        result = store.store_task(
            task_id="task-1",
            agent_id="test-agent",
            skill_id="memory_store",
            status="WORKING",
        )

        assert result["task_id"] == "task-1"
        assert result["agent_id"] == "test-agent"
        assert result["skill_id"] == "memory_store"
        assert result["status"] == "WORKING"
        assert result["created_at"] is not None

    def test_store_task_db_mode(self):
        from bastion.a2a_tasks import A2ATaskStore

        now = datetime.now(UTC)
        row = ("task-1", "test-agent", "memory_store", "WORKING", None, None, now, None)

        cursor = FakeCursor(return_row=row)
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.autocommit = False

        pool = MagicMock()
        pool.acquire.return_value = conn
        pool.release.return_value = None

        store = A2ATaskStore(
            agent_id="test-agent",
            get_pool_fn=lambda: pool,
            is_mock_fn=lambda: False,
        )

        result = store.store_task(
            task_id="task-1",
            agent_id="test-agent",
            skill_id="memory_store",
        )

        assert result["task_id"] == "task-1"
        assert result["status"] == "WORKING"

    def test_get_task_mock_mode(self):
        from bastion.a2a_tasks import A2ATaskStore

        store = A2ATaskStore(
            agent_id="test-agent",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        result = store.get_task("task-1")
        assert result is None

    def test_get_task_db_mode(self):
        from bastion.a2a_tasks import A2ATaskStore

        now = datetime.now(UTC)
        row = ("task-1", "test-agent", "memory_store", "COMPLETED", None, None, now, now)

        cursor = FakeCursor(return_row=row)
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.autocommit = False

        pool = MagicMock()
        pool.acquire.return_value = conn
        pool.release.return_value = None

        store = A2ATaskStore(
            agent_id="test-agent",
            get_pool_fn=lambda: pool,
            is_mock_fn=lambda: False,
        )

        result = store.get_task("task-1")
        assert result is not None
        assert result["task_id"] == "task-1"
        assert result["status"] == "COMPLETED"

    def test_update_task_mock_mode(self):
        from bastion.a2a_tasks import A2ATaskStore

        store = A2ATaskStore(
            agent_id="test-agent",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        result = store.update_task("task-1", "COMPLETED")
        assert result is not None
        assert result["status"] == "COMPLETED"

    def test_update_task_db_mode(self):
        from bastion.a2a_tasks import A2ATaskStore

        now = datetime.now(UTC)
        row = ("task-1", "test-agent", "memory_store", "COMPLETED", None, None, now, now)

        cursor = FakeCursor(return_row=row)
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.autocommit = False

        pool = MagicMock()
        pool.acquire.return_value = conn
        pool.release.return_value = None

        store = A2ATaskStore(
            agent_id="test-agent",
            get_pool_fn=lambda: pool,
            is_mock_fn=lambda: False,
        )

        result = store.update_task("task-1", "COMPLETED")
        assert result is not None
        assert result["status"] == "COMPLETED"
