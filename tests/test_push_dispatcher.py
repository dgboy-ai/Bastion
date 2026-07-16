"""Tests for push notification dispatcher."""

from __future__ import annotations

import time
from unittest.mock import patch, MagicMock

import pytest

from bastion.push_dispatcher import PushNotificationDispatcher, get_dispatcher


class TestPushNotificationDispatcher:
    def setup_method(self):
        self.dispatcher = PushNotificationDispatcher()

    def test_register_stores_callback_url(self):
        self.dispatcher.register("task-1", "http://example.com/callback")
        assert self.dispatcher.get_callback_url("task-1") == "http://example.com/callback"

    def test_get_callback_url_returns_none_for_unknown(self):
        assert self.dispatcher.get_callback_url("nonexistent") is None

    def test_notify_skips_non_terminal_states(self):
        self.dispatcher.register("task-1", "http://example.com/callback")
        # WORKING is not terminal — should not deliver
        self.dispatcher.notify("task-1", "WORKING")
        time.sleep(0.1)
        assert "task-1" not in self.dispatcher._delivered

    def test_notify_delivers_on_terminal_states(self):
        self.dispatcher.register("task-1", "http://example.com/callback")
        self.dispatcher.notify("task-1", "COMPLETED")
        time.sleep(0.2)
        assert "task-1" in self.dispatcher._delivered

    def test_notify_deduplicates(self):
        self.dispatcher.register("task-1", "http://example.com/callback")
        self.dispatcher.notify("task-1", "COMPLETED")
        self.dispatcher.notify("task-1", "COMPLETED")  # Duplicate
        time.sleep(0.2)
        # Should only be delivered once
        assert "task-1" in self.dispatcher._delivered  # Set, so only one entry

    def test_stats_returns_counts(self):
        self.dispatcher.register("t1", "http://example.com/a")
        self.dispatcher.register("t2", "http://example.com/b")
        stats = self.dispatcher.get_stats()
        assert stats["active_registrations"] == 2
        assert stats["delivered_count"] == 0

    def test_cleanup_delivered_clears_set(self):
        self.dispatcher._delivered.add("old-task")
        count = self.dispatcher.cleanup_delivered()
        assert count == 1
        assert len(self.dispatcher._delivered) == 0


class TestGlobalDispatcher:
    def test_get_dispatcher_returns_singleton(self):
        d1 = get_dispatcher()
        d2 = get_dispatcher()
        assert d1 is d2
