"""Tests for bastion.messaging module."""
from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import MagicMock

import pytest


class FakeCursor:
    def __init__(self, return_row=None, return_rows=None):
        self._return_row = return_row
        self._return_rows = return_rows or []

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def execute(self, sql, params=None):
        pass

    def fetchone(self):
        return self._return_row

    def fetchall(self):
        return self._return_rows


class TestMessageBroker:
    def test_broadcast_mock(self):
        from bastion.messaging import MessageBroker

        MessageBroker._mock_messages.clear()
        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        record = broker.broadcast("test_event", {"key": "value"}, "default")

        assert record.event_type == "test_event"
        assert record.payload == {"key": "value"}
        assert record.namespace == "default"
        assert record.sender_agent_id == "agent-1"

    def test_broadcast_db_mode(self):
        from bastion.messaging import MessageBroker

        now = datetime.now(UTC)
        row = ("msg-1", "default", "agent-1", "test_event", '{"key": "value"}', now)

        cursor = FakeCursor(return_row=row)
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.autocommit = False

        pool = MagicMock()
        pool.acquire.return_value = conn
        pool.release.return_value = None

        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: pool,
            is_mock_fn=lambda: False,
        )

        record = broker.broadcast("test_event", {"key": "value"}, "default")

        assert record.message_id == "msg-1"
        assert record.event_type == "test_event"

    def test_consume_mock(self):
        from bastion.messaging import MessageBroker

        MessageBroker._mock_messages.clear()
        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        # Broadcast first
        broker.broadcast("event1", {"data": 1}, "agent-1")
        broker.broadcast("event2", {"data": 2}, "agent-1")

        # Consume
        messages = broker.consume(namespace="agent-1", limit=10)
        assert len(messages) == 2
        assert messages[0].event_type == "event1"

    def test_consume_marks_read(self):
        from bastion.messaging import MessageBroker

        MessageBroker._mock_messages.clear()
        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        broker.broadcast("event1", {}, "agent-1")

        # First consume
        messages1 = broker.consume(namespace="agent-1")
        assert len(messages1) == 1

        # Second consume — should be empty (already read)
        messages2 = broker.consume(namespace="agent-1")
        assert len(messages2) == 0

    def test_consume_limit(self):
        from bastion.messaging import MessageBroker

        MessageBroker._mock_messages.clear()
        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        for i in range(10):
            broker.broadcast(f"event{i}", {}, "agent-1")

        messages = broker.consume(namespace="agent-1", limit=3)
        assert len(messages) == 3

    def test_consume_db_mode(self):
        from bastion.messaging import MessageBroker

        now = datetime.now(UTC)
        rows = [
            ("msg-1", "default", "agent-1", "event1", '{"k": 1}', now),
            ("msg-2", "default", "agent-1", "event2", '{"k": 2}', now),
        ]

        cursor = FakeCursor(return_rows=rows)
        conn = MagicMock()
        conn.cursor.return_value = cursor
        conn.autocommit = False

        pool = MagicMock()
        pool.acquire.return_value = conn
        pool.release.return_value = None

        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: pool,
            is_mock_fn=lambda: False,
        )

        messages = broker.consume(namespace="default")
        assert len(messages) == 2
        assert messages[0].message_id == "msg-1"

    def test_broadcast_empty_payload(self):
        from bastion.messaging import MessageBroker

        MessageBroker._mock_messages.clear()
        broker = MessageBroker(
            agent_id="agent-1",
            get_pool_fn=lambda: None,
            is_mock_fn=lambda: True,
        )

        record = broker.broadcast("event", None, "default")
        assert record.payload == {}
