"""Tests for push notification dispatcher."""

from __future__ import annotations

import time

from bastion.push_dispatcher import PushNotificationDispatcher, get_dispatcher

_VALID_URL = "https://hooks.example.com/push"


class TestPushNotificationDispatcher:
    def setup_method(self):
        self.dispatcher = PushNotificationDispatcher()

    def test_register_stores_callback_url(self):
        ok = self.dispatcher.register("task-1", _VALID_URL)
        assert ok
        assert self.dispatcher.get_callback_url("task-1") == _VALID_URL

    def test_register_rejects_http_url(self):
        ok = self.dispatcher.register("task-http", "http://example.com/callback")
        assert not ok
        assert self.dispatcher.get_callback_url("task-http") is None

    def test_register_rejects_private_ip(self):
        ok = self.dispatcher.register("task-local", "https://127.0.0.1/callback")
        assert not ok

    def test_get_callback_url_returns_none_for_unknown(self):
        assert self.dispatcher.get_callback_url("nonexistent") is None

    def test_notify_skips_non_terminal_states(self):
        self.dispatcher.register("task-1", _VALID_URL)
        self.dispatcher.notify("task-1", "WORKING")
        time.sleep(0.1)
        assert "task-1" not in self.dispatcher._delivered

    def test_notify_delivers_on_terminal_states(self):
        self.dispatcher.register("task-1", _VALID_URL)
        self.dispatcher.notify("task-1", "COMPLETED", artifacts=[{"parts": [{"text": "done"}]}])
        time.sleep(0.2)
        assert "task-1" in self.dispatcher._delivered

    def test_notify_deduplicates(self):
        self.dispatcher.register("task-1", _VALID_URL)
        self.dispatcher.notify("task-1", "COMPLETED")
        self.dispatcher.notify("task-1", "COMPLETED")
        time.sleep(0.2)
        assert "task-1" in self.dispatcher._delivered

    def test_stats_returns_counts(self):
        self.dispatcher.register("t1", _VALID_URL)
        self.dispatcher.register("t2", _VALID_URL)
        stats = self.dispatcher.get_stats()
        assert stats["active_registrations"] == 2
        assert stats["delivered_count"] == 0

    def test_cleanup_delivered_clears_set(self):
        self.dispatcher._delivered.add("old-task")
        count = self.dispatcher.cleanup_delivered()
        assert count == 1
        assert len(self.dispatcher._delivered) == 0

    def test_wait_pending_completes(self):
        self.dispatcher.register("task-1", _VALID_URL)
        self.dispatcher.notify("task-1", "COMPLETED")
        self.dispatcher.wait_pending(timeout=3.0)

    def test_close_prevents_new_notifications(self):
        self.dispatcher.close()
        self.dispatcher.register("task-1", _VALID_URL)
        self.dispatcher.notify("task-1", "COMPLETED")
        assert "task-1" not in self.dispatcher._delivered


class TestGlobalDispatcher:
    def test_get_dispatcher_returns_singleton(self):
        d1 = get_dispatcher()
        d2 = get_dispatcher()
        assert d1 is d2
