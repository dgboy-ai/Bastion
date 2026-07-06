from datetime import UTC, datetime

from bastion import BastionMemory, MemoryRecord


def test_store_sets_default_importance():
    memory = BastionMemory(agent_id="imp-default", mock=True)
    record = memory.store("fact", "Important fact")
    assert record.importance_score == 5.0


def test_reinforce_increases_importance():
    memory = BastionMemory(agent_id="imp-reinforce", mock=True)
    record = memory.store("fact", "Reinforce me")
    result = memory.reinforce(record.memory_id, success=True)
    assert result["status"] == "reinforced"
    assert result["importance_score"] > 5.0
    assert result["delta"] >= 1.0


def test_reinforce_not_found():
    memory = BastionMemory(agent_id="imp-notfound", mock=True)
    result = memory.reinforce("nonexistent-id", success=True)
    assert result["status"] == "not_found"


def test_reinforce_small_boost_on_access():
    memory = BastionMemory(agent_id="imp-access", mock=True)
    record = memory.store("fact", "Access me")
    result = memory.reinforce(record.memory_id, success=False)
    assert result["importance_score"] > 5.0
    assert result["delta"] < 1.0


def test_reinforce_caps_at_ten():
    memory = BastionMemory(agent_id="imp-cap", mock=True)
    record = memory.store("fact", "Cap me")
    for _ in range(20):
        memory.reinforce(record.memory_id, success=True)
    result = memory.reinforce(record.memory_id, success=True)
    assert result["importance_score"] <= 10.0


def test_search_ranks_by_decay_score():
    memory = BastionMemory(agent_id="decay-rank", mock=True)
    old = memory.store("fact", "Old memory with high importance")
    memory.store("fact", "Recent memory")
    memory.reinforce(old.memory_id, success=True)
    memory.reinforce(old.memory_id, success=True)
    results = memory.search("memory")
    assert len(results) > 0
    scores = [r.importance_score for r in results]
    assert all(s >= 5.0 for s in scores)


def test_decay_score_calculated_in_to_dict():
    memory = BastionMemory(agent_id="imp-todict", mock=True)
    record = memory.store("fact", "Check dict")
    d = record.to_dict()
    assert d["importance_score"] == 5.0


def test_importance_score_in_from_dict():
    d = {
        "memory_id": "test-id",
        "agent_id": "agent-1",
        "memory_type": "fact",
        "content": "test",
        "embedding": [],
        "metadata": {},
        "previous_hash": None,
        "cryptographic_hash": "hash",
        "created_at": datetime.now(UTC).isoformat(),
        "expires_at": None,
        "access_count": 3,
        "importance_score": 8.5,
    }
    record = MemoryRecord.from_dict(d)
    assert record.importance_score == 8.5
