from datetime import UTC, datetime, timedelta

from bastion import BastionMemory, EntityRecord, RelationRecord


def test_store_with_graph_creates_entities_and_relations():
    memory = BastionMemory(agent_id="graph-test", mock=True)
    record, entities, relations = memory.store_with_graph(
        "Divyansh builds Bastion and loves CockroachDB"
    )
    assert isinstance(record.content, str)
    assert len(entities) > 0
    assert len(relations) > 0


def test_store_with_graph_returns_entity_records():
    memory = BastionMemory(agent_id="graph-entity-types", mock=True)
    _, entities, _ = memory.store_with_graph("Alice loves Bob")
    for e in entities:
        assert isinstance(e, EntityRecord)
        assert e.agent_id == "graph-entity-types"
        assert e.name in ("alice", "bob")


def test_store_with_graph_returns_relation_records():
    memory = BastionMemory(agent_id="graph-rel-types", mock=True)
    _, _, relations = memory.store_with_graph("Charlie builds project-x")
    for r in relations:
        assert isinstance(r, RelationRecord)
        assert r.relation_type == "builds"
        assert r.confidence == 1.0


def test_graph_query_finds_relations():
    memory = BastionMemory(agent_id="graph-query-test", mock=True)
    memory.store_with_graph("Alice uses Postgres and loves Python")
    results = memory.graph_query(start_entity="alice", hops=2)
    assert len(results) > 0
    found = any(r["relation"] == "uses" or r["relation"] == "loves" for r in results)
    assert found


def test_graph_query_with_relation_path_filter():
    memory = BastionMemory(agent_id="graph-path-test", mock=True)
    memory.store_with_graph("Dave builds Bastion and Dave loves Go")
    results = memory.graph_query("dave", relation_path=["loves"])
    assert len(results) > 0
    assert all(r["relation"] == "loves" for r in results)


def test_graph_query_unknown_entity_returns_empty():
    memory = BastionMemory(agent_id="graph-unknown", mock=True)
    results = memory.graph_query("nonexistent", hops=3)
    assert results == []


def test_graph_at_time_returns_snapshot():
    memory = BastionMemory(agent_id="graph-time", mock=True)
    memory.store_with_graph("Eve works on Bastion")
    future = (datetime.now(UTC) + timedelta(hours=1)).isoformat()
    snapshot = memory.graph_at_time(timestamp=future)
    assert "entities" in snapshot
    assert "relations" in snapshot
    assert snapshot["agent_id"] == "graph-time"


def test_graph_at_time_with_entity_filter():
    memory = BastionMemory(agent_id="graph-time-entity", mock=True)
    memory.store_with_graph("Frank manages infrastructure")
    now = datetime.now(UTC).isoformat()
    snapshot = memory.graph_at_time(timestamp=now, entity="frank")
    assert len(snapshot["entities"]) > 0
    assert any(e["name"] == "frank" for e in snapshot["entities"])


def test_graph_stats_counts():
    memory = BastionMemory(agent_id="graph-stats", mock=True)
    memory.store_with_graph("Grace builds project and loves testing")
    stats = memory.graph_stats()
    assert stats["entities"] > 0
    assert stats["relations"] > 0
    assert isinstance(stats["entity_types"], list)


def test_graph_stats_orphans():
    memory = BastionMemory(agent_id="graph-orphans", mock=True)
    memory.store_with_graph("Bastion is a platform")
    stats = memory.graph_stats()
    assert stats["entities"] > 0


def test_graph_respects_agent_isolation():
    mem_a = BastionMemory(agent_id="graph-iso-a", mock=True)
    mem_b = BastionMemory(agent_id="graph-iso-b", mock=True)
    mem_a.store_with_graph("Hank builds Q")
    mem_b.store_with_graph("Ivy builds R")
    stats_a = mem_a.graph_stats()
    stats_b = mem_b.graph_stats()
    assert stats_a["entities"] > 0
    assert stats_b["entities"] > 0


def test_multiple_store_with_graph_accumulates():
    memory = BastionMemory(agent_id="graph-accum", mock=True)
    memory.store_with_graph("Jack uses Postgres")
    memory.store_with_graph("Jack uses Redis")
    stats = memory.graph_stats()
    assert stats["entities"] >= 2
    assert stats["relations"] >= 2
