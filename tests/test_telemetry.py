from bastion import BastionMemory
from bastion.telemetry import TracedBastionMemory


def test_traced_store():
    inner = BastionMemory("otel-test", mock=True)
    traced = TracedBastionMemory(inner)
    record = traced.store("fact", "Traced memory")
    assert record.content == "Traced memory"
    assert record.memory_type == "fact"


def test_traced_search():
    inner = BastionMemory("otel-search", mock=True)
    traced = TracedBastionMemory(inner)
    traced.store("fact", "Searchable")
    results = traced.search("Searchable")
    assert len(results) > 0


def test_traced_agent_id():
    inner = BastionMemory("otel-agent", mock=True)
    traced = TracedBastionMemory(inner)
    assert traced.agent_id == "otel-agent"


def test_traced_heal():
    inner = BastionMemory("otel-heal", mock=True)
    traced = TracedBastionMemory(inner)
    traced.store("fact", "Something")
    result = traced.heal()
    assert "records_before" in result


def test_traced_resolve_conflict():
    inner = BastionMemory("otel-conflict", mock=True)
    traced = TracedBastionMemory(inner)
    result = traced.resolve_conflict("A", "B")
    assert "A" in result


def test_traced_close():
    inner = BastionMemory("otel-close", mock=True)
    traced = TracedBastionMemory(inner)
    traced.close()
