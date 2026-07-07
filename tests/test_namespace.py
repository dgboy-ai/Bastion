from __future__ import annotations

from bastion import BastionMemory
from bastion.models import MessageRecord


def test_broadcast_creates_message():
    mem = BastionMemory("test-agent", mock=True)
    msg = mem.broadcast("task_complete", {"task": "research"}, namespace="project-x")
    assert msg.namespace == "project-x"
    assert msg.event_type == "task_complete"
    assert msg.payload == {"task": "research"}
    assert msg.sender_agent_id == "test-agent"


def test_poll_messages_returns_unread():
    mem1 = BastionMemory("agent-1", mock=True, namespace="team-alpha")
    mem2 = BastionMemory("agent-2", mock=True, namespace="team-alpha")
    mem1.broadcast("update", {"msg": "hello"})
    msgs = mem2.poll_messages()
    assert len(msgs) == 1
    assert msgs[0].event_type == "update"
    assert msgs[0].payload == {"msg": "hello"}


def test_poll_is_idempotent():
    mem = BastionMemory("agent-1", mock=True, namespace="team-alpha")
    mem.broadcast("test", {"n": 1})
    first = mem.poll_messages()
    second = mem.poll_messages()
    assert len(first) == 1
    assert len(second) == 0


def test_broadcast_default_namespace():
    mem = BastionMemory("test-agent", mock=True, namespace="my-ns")
    msg = mem.broadcast("ping", {"ok": True})
    assert msg.namespace == "my-ns"


def test_poll_default_namespace():
    mem = BastionMemory("test-agent", mock=True, namespace="ns1")
    mem.broadcast("e1", {"a": 1})
    mem.broadcast("e2", {"b": 2})
    msgs = mem.poll_messages()
    assert len(msgs) == 2


def test_poll_respects_namespace_isolation():
    mem_a = BastionMemory("a", mock=True, namespace="ns-a")
    mem_b = BastionMemory("b", mock=True, namespace="ns-b")
    mem_a.broadcast("secret", {"for": "a"})
    msgs_b = mem_b.poll_messages()
    assert len(msgs_b) == 0


def test_search_shared_scope_finds_all_in_namespace():
    mem_a = BastionMemory("agent-a", mock=True, namespace="shared-ns")
    mem_b = BastionMemory("agent-b", mock=True, namespace="shared-ns")
    mem_a.store("fact", "Alpha knows Python")
    mem_b.store("fact", "Beta knows Go")
    results = mem_a.search("Python", k=10, threshold=0.0, namespace_scope="shared")
    assert any("Alpha" in r.content for r in results)


def test_search_own_scope_excludes_other_agents():
    mem_a = BastionMemory("agent-a", mock=True, namespace="team")
    mem_b = BastionMemory("agent-b", mock=True, namespace="team")
    mem_a.store("fact", "Secret A")
    mem_b.store("fact", "Secret B")
    results = mem_a.search("Secret", k=10, threshold=0.0, namespace_scope="own")
    secrets = [r.content for r in results]
    assert "Secret A" in secrets
    assert "Secret B" not in secrets


def test_search_shared_scoped_by_namespace_prefix():
    mem_a = BastionMemory("agent-a", mock=True, namespace="team-x")
    mem_b = BastionMemory("agent-b", mock=True, namespace="team-y")
    mem_a.store("fact", "Team X data")
    mem_b.store("fact", "Team Y data")
    results = mem_a.search("data", k=10, threshold=0.0, namespace_scope="shared")
    assert len(results) == 1
    assert "Team X" in results[0].content


def test_broadcast_event_type_filter():
    mem = BastionMemory("agent", mock=True, namespace="ns")
    mem.broadcast("task_done", {"id": 1})
    mem.broadcast("alert", {"level": "warn"})
    msgs = mem.poll_messages()
    types = [m.event_type for m in msgs]
    assert "task_done" in types
    assert "alert" in types


def test_message_record_defaults():
    msg = MessageRecord(namespace="ns", sender_agent_id="a", event_type="evt")
    assert msg.message_id is not None
    assert msg.read is False
    assert msg.payload == {}
    d = msg.to_dict()
    assert d["namespace"] == "ns"
    assert d["event_type"] == "evt"
    assert d["read"] is False
