"""Tests for inter-agent messaging system."""

from __future__ import annotations

import pytest

from bastion.mock import reset


class TestMessaging:
    def setup_method(self):
        reset()

    def test_broadcast_returns_message_record(self):
        from bastion.memory import BastionMemory
        mem = BastionMemory("agent-1", mock=True)
        msg = mem.broadcast("task_complete", {"task_id": "t1"})
        assert msg.event_type == "task_complete"
        assert msg.sender_agent_id == "agent-1"
        assert msg.payload == {"task_id": "t1"}

    def test_poll_messages_returns_unread(self):
        from bastion.memory import BastionMemory
        mem = BastionMemory("agent-1", mock=True)
        mem.broadcast("alert", {"level": "warning"})
        messages = mem.poll_messages()
        assert len(messages) == 1
        assert messages[0].event_type == "alert"

    def test_poll_messages_marks_as_read(self):
        from bastion.memory import BastionMemory
        mem = BastionMemory("agent-1", mock=True)
        mem.broadcast("event1", {})
        mem.broadcast("event2", {})
        first_poll = mem.poll_messages()
        assert len(first_poll) == 2
        second_poll = mem.poll_messages()
        assert len(second_poll) == 0

    def test_namespace_isolation(self):
        from bastion.memory import BastionMemory
        mem1 = BastionMemory("agent-1", mock=True)
        mem2 = BastionMemory("agent-2", mock=True)
        mem1.broadcast("event1", {}, namespace="ns-a")
        mem2.broadcast("event2", {}, namespace="ns-b")
        ns_a = mem1.poll_messages(namespace="ns-a")
        ns_b = mem2.poll_messages(namespace="ns-b")
        assert len(ns_a) == 1
        assert len(ns_b) == 1
        assert ns_a[0].event_type == "event1"
        assert ns_b[0].event_type == "event2"

    def test_broadcast_empty_payload(self):
        from bastion.memory import BastionMemory
        mem = BastionMemory("agent-1", mock=True)
        msg = mem.broadcast("ping", {})
        assert msg.payload == {}
