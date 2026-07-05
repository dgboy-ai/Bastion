from datetime import datetime, timezone

from bastion import AuditEntry, BastionMemory, ClusterInfo, MemoryRecord


def test_mock_mode_enabled_by_env(monkeypatch):
    monkeypatch.setenv("BASTION_MOCK", "true")
    memory = BastionMemory(agent_id="test-agent")
    assert memory._mock is True


def test_mock_mode_explicit():
    memory = BastionMemory(agent_id="test-agent", mock=True)
    assert memory._mock is True


def test_store_memory():
    memory = BastionMemory(agent_id="test-agent", mock=True)
    record = memory.store("fact", "User prefers Python", {"source": "chat"})
    assert isinstance(record, MemoryRecord)
    assert record.agent_id == "test-agent"
    assert record.memory_type == "fact"
    assert record.content == "User prefers Python"
    assert record.memory_id is not None
    assert record.cryptographic_hash is not None


def test_store_multiple_memories_form_hash_chain():
    memory = BastionMemory(agent_id="hash-test", mock=True)
    r1 = memory.store("fact", "First memory")
    r2 = memory.store("fact", "Second memory")
    r3 = memory.store("fact", "Third memory")
    assert r1.previous_hash is None
    assert r2.previous_hash == r1.cryptographic_hash
    assert r3.previous_hash == r2.cryptographic_hash


def test_search_memory():
    memory = BastionMemory(agent_id="search-test", mock=True)
    memory.store("fact", "User likes Python")
    memory.store("fact", "User likes Rust")
    memory.store("preference", "Dark mode preferred")
    results = memory.search("Python")
    assert len(results) > 0
    assert any("Python" in r.content for r in results)


def test_search_by_memory_type():
    memory = BastionMemory(agent_id="type-test", mock=True)
    memory.store("fact", "User is from New York")
    memory.store("preference", "User prefers dark mode")
    results = memory.search("dark", memory_type="preference")
    assert len(results) > 0
    assert all(r.memory_type == "preference" for r in results)


def test_get_at_time():
    memory = BastionMemory(agent_id="time-test", mock=True)
    now = datetime.now(timezone.utc).isoformat()
    memory.store("fact", "Memory after timestamp")
    results = memory.get_at_time(timestamp=now, agent_id="time-test")
    assert len(results) == 0


def test_audit_log():
    memory = BastionMemory(agent_id="audit-test", mock=True)
    memory.store("fact", "Auditable action")
    entries = memory.audit("audit-test")
    assert len(entries) > 0
    entry = entries[0]
    assert isinstance(entry, AuditEntry)
    assert entry.action == "memory_store"
    assert entry.agent_id == "audit-test"


def test_heal():
    memory = BastionMemory(agent_id="heal-test", mock=True)
    memory.store("fact", "Keep this")
    result = memory.heal("heal-test")
    assert "records_before" in result
    assert "records_after" in result
    assert result["agent_id"] == "heal-test"


def test_resolve_conflict():
    memory = BastionMemory(agent_id="conflict-test", mock=True)
    result = memory.resolve_conflict("User likes Python", "User likes Rust")
    assert "Python" in result
    assert "Rust" in result


def test_provision_cluster():
    memory = BastionMemory(agent_id="provision-test", mock=True)
    info = memory.provision_cluster("bastion-demo", region="us-east1", provider="aws")
    assert isinstance(info, ClusterInfo)
    assert info.status == "created"
    assert "cockroachlabs.cloud" in info.connection_string
    assert info.region == "us-east1"


def test_memory_record_to_dict():
    now = datetime.now(timezone.utc)
    record = MemoryRecord(
        memory_id="test-id",
        agent_id="test-agent",
        memory_type="fact",
        content="test content",
        created_at=now,
    )
    d = record.to_dict()
    assert d["memory_id"] == "test-id"
    assert d["agent_id"] == "test-agent"
    assert d["memory_type"] == "fact"
    assert d["content"] == "test content"
    assert d["embedding"] == []
    assert d["access_count"] == 0


def test_cluster_info_to_dict():
    info = ClusterInfo(cluster_id="c1", connection_string="postgres://...",
                        admin_url="https://...", region="eu-west1")
    d = info.to_dict()
    assert d["cluster_id"] == "c1"
    assert d["region"] == "eu-west1"
    assert d["status"] == "created"


def test_audit_entry_to_dict():
    entry = AuditEntry(audit_id="a1", agent_id="ag1", workflow_id="wf1", action="test")
    d = entry.to_dict()
    assert d["audit_id"] == "a1"
    assert d["agent_id"] == "ag1"
    assert d["action"] == "test"


def test_query_with_cache_miss_then_hit():
    memory = BastionMemory(agent_id="cache-test", mock=True)
    call_count = 0

    def llm(q: str) -> str:
        nonlocal call_count
        call_count += 1
        return f"LLM response for: {q}"

    # First call — cache miss
    result1, meta1 = memory.query_with_cache("What is Python?", llm)
    assert meta1["cache"] == "miss"
    assert result1 == "LLM response for: What is Python?"
    assert call_count == 1

    # Second call — cache hit (llm_callback required but won't be called)
    result2, meta2 = memory.query_with_cache("What is Python?", llm)
    assert meta2["cache"] == "hit"
    assert result2 == "LLM response for: What is Python?"
    assert call_count == 1, "LLM should not be called again on cache hit"


def test_query_with_cache_different_queries():
    memory = BastionMemory(agent_id="cache-test-2", mock=True)
    call_count = 0

    def llm(q: str) -> str:
        nonlocal call_count
        call_count += 1
        return f"Answer: {q}"

    r1, _ = memory.query_with_cache("Question A", llm)
    assert r1 == "Answer: Question A"
    r2, _ = memory.query_with_cache("Question B", llm)
    assert r2 == "Answer: Question B"
    assert call_count == 2


def test_detect_anomalies_no_issues():
    memory = BastionMemory(agent_id="anomaly-clean", mock=True)
    alerts = memory.detect_anomalies()
    assert alerts == []


def test_detect_anomalies_fact_turnover():
    memory = BastionMemory(agent_id="anomaly-dup", mock=True)
    memory.store("fact", "Duplicate content")
    memory.store("fact", "Unique content")
    memory.store("fact", "Duplicate content")
    alerts = memory.detect_anomalies()
    types = [a["type"] for a in alerts]
    assert "fact_turnover" in types


def test_diff_empty():
    memory = BastionMemory(agent_id="diff-empty", mock=True)
    now = datetime.now(timezone.utc).isoformat()
    result = memory.diff(now, now)
    assert result["count_a"] == 0
    assert result["count_b"] == 0


def test_diff_records_added():
    memory = BastionMemory(agent_id="diff-add", mock=True)
    before = datetime.now(timezone.utc).isoformat()
    memory.store("fact", "Added after")
    after = datetime.now(timezone.utc).isoformat()
    result = memory.diff(before, after)
    assert result["count_a"] == 0
    assert result["count_b"] == 1
    assert len(result["added"]) == 1
    assert result["added"][0]["content"] == "Added after"


def test_store_with_expires_in_seconds_sets_expires_at():
    memory = BastionMemory(agent_id="ttl-set", mock=True)
    record = memory.store("fact", "Expiring memory", expires_in_seconds=3600)
    assert record.expires_at is not None
    delta = record.expires_at - record.created_at
    assert abs(delta.total_seconds() - 3600) < 1


def test_search_excludes_expired_records():
    memory = BastionMemory(agent_id="ttl-expiry", mock=True)
    memory.store("fact", "Permanent record")
    memory.store("fact", "Expired record", expires_in_seconds=0)
    results = memory.search("record")
    assert all("Permanent" in r.content for r in results)
    assert not any("Expired" in r.content for r in results)


def test_heal_prunes_expired_records():
    memory = BastionMemory(agent_id="heal-prune", mock=True)
    memory.store("fact", "Keep this")
    memory.store("fact", "Expiring soon", expires_in_seconds=0)
    result = memory.heal()
    assert result["pruned"] == 1
    assert result["records_after"] == 1


def test_search_returns_empty_when_no_records():
    memory = BastionMemory(agent_id="no-records", mock=True)
    results = memory.search("anything")
    assert results == []


def test_get_at_time_before_all_records():
    memory = BastionMemory(agent_id="before-all", mock=True)
    memory.store("fact", "Future memory")
    early = datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat()
    results = memory.get_at_time(timestamp=early)
    assert len(results) == 0


def test_resolve_conflict_with_context():
    memory = BastionMemory(agent_id="conflict-ctx", mock=True)
    result = memory.resolve_conflict("Fact A", "Fact B", context="User prefers A")
    assert "Fact" in result
    assert "A" in result or "B" in result


def test_detect_anomalies_size_spike():
    memory = BastionMemory(agent_id="spike", mock=True)
    for i in range(12):
        memory.store("fact", f"Record {i}")
    alerts = memory.detect_anomalies()
    types = [a["type"] for a in alerts]
    assert "size_spike" in types


def test_from_row_parses_embedding_string():
    from datetime import datetime, timezone
    record = MemoryRecord.from_row((
        "test-id", "agent-1", "fact", "content",
        "[0.1, 0.2, 0.3]",  # VECTOR returned as JSON string
        {"source": "test"}, "prev-hash", "crypto-hash",
        datetime.now(timezone.utc), None, 5, 5.0,
    ))
    assert record.memory_id == "test-id"
    assert record.embedding == [0.1, 0.2, 0.3]
    assert record.metadata == {"source": "test"}
    assert record.access_count == 5


def test_from_row_parses_embedding_list():
    from datetime import datetime, timezone
    record = MemoryRecord.from_row((
        "test-id", "agent-1", "fact", "content",
        [0.1, 0.2, 0.3],
        {"source": "test"}, "prev-hash", "crypto-hash",
        datetime.now(timezone.utc), None, 0, 5.0,
    ))
    assert record.embedding == [0.1, 0.2, 0.3]
    assert record.access_count == 0


def test_from_row_null_values():
    record = MemoryRecord.from_row((
        "test-id", "agent-1", "fact", "content",
        None, None, None, "crypto-hash",
        None, None, None, None,
    ))
    assert record.embedding == []
    assert record.metadata == {}
    assert record.previous_hash is None
    assert record.access_count == 0
