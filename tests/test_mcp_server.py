
import pytest

from bastion.mcp_server import _get_tools, _handle_tool_call, create_server


@pytest.fixture(autouse=True)
def reset_mock():
    from bastion.mock import reset
    reset()


@pytest.fixture
def memory():
    _server, mem = create_server(mock=True)
    return mem


def test_create_server_returns_server_and_memory():
    server, memory = create_server(mock=True)
    assert server is not None
    assert memory is not None


def test_tools_list_has_six_tools():
    tools = _get_tools()
    assert len(tools) == 6
    tool_names = [t.name for t in tools]
    assert "memory_search" in tool_names
    assert "memory_store" in tool_names
    assert "memory_timetravel" in tool_names
    assert "memory_audit" in tool_names
    assert "memory_heal" in tool_names
    assert "resolve_conflict" in tool_names


def test_tool_schemas_are_valid():
    tools = _get_tools()
    for tool in tools:
        assert "type" in tool.inputSchema
        assert tool.inputSchema["type"] == "object"
        assert "properties" in tool.inputSchema


def test_handle_tool_memory_store(memory):
    result = _handle_tool_call(memory, "memory_store", {"memory_type": "fact", "content": "Hello"})
    assert len(result) == 1
    assert result[0]["memory_type"] == "fact"
    assert result[0]["content"] == "Hello"
    assert "cryptographic_hash" in result[0]
    assert "memory_id" in result[0]


def test_handle_tool_memory_store_with_metadata(memory):
    result = _handle_tool_call(memory, "memory_store", {
        "content": "Test",
        "metadata": {"source": "test", "importance": "high"},
    })
    assert len(result) == 1
    assert result[0]["metadata"]["source"] == "test"


def test_handle_tool_memory_store_with_expiry(memory):
    result = _handle_tool_call(memory, "memory_store", {
        "content": "Expiring",
        "expires_in_seconds": 3600,
    })
    assert len(result) == 1
    assert result[0]["expires_at"] is not None


def test_handle_tool_memory_search(memory):
    _handle_tool_call(memory, "memory_store", {"content": "Python is great"})
    results = _handle_tool_call(memory, "memory_search", {"query": "Python"})
    assert len(results) > 0
    assert any("Python" in r["content"] for r in results)


def test_handle_tool_memory_search_with_type_filter(memory):
    _handle_tool_call(memory, "memory_store", {"content": "Python fact", "memory_type": "fact"})
    _handle_tool_call(memory, "memory_store", {"content": "Python pref", "memory_type": "preference"})
    results = _handle_tool_call(memory, "memory_search", {"query": "Python", "memory_type": "preference"})
    assert len(results) > 0
    assert all(r["memory_type"] == "preference" for r in results)


def test_handle_tool_memory_timetravel(memory):
    _handle_tool_call(memory, "memory_store", {"content": "Future memory"})
    from datetime import datetime, timezone
    future = datetime.now(timezone.utc).isoformat()
    results = _handle_tool_call(memory, "memory_timetravel", {"timestamp": future})
    assert len(results) > 0


def test_handle_tool_memory_audit(memory):
    _handle_tool_call(memory, "memory_store", {"content": "Audit me"})
    entries = _handle_tool_call(memory, "memory_audit", {})
    assert len(entries) > 0
    assert entries[0]["action"] == "memory_store"


def test_handle_tool_memory_heal(memory):
    _handle_tool_call(memory, "memory_store", {"content": "Keep"})
    result = _handle_tool_call(memory, "memory_heal", {})
    assert len(result) == 1
    assert "records_before" in result[0]


def test_handle_tool_resolve_conflict(memory):
    result = _handle_tool_call(memory, "resolve_conflict", {"fact_a": "A", "fact_b": "B"})
    assert len(result) == 1
    assert "merged" in result[0]


def test_handle_tool_resolve_conflict_with_context(memory):
    result = _handle_tool_call(memory, "resolve_conflict", {
        "fact_a": "User likes Python",
        "fact_b": "User likes Rust",
        "context": "User prefers Python for backend, Rust for systems",
    })
    assert len(result) == 1
    assert "merged" in result[0]


def test_handle_tool_unknown(memory):
    with pytest.raises(ValueError, match="Unknown tool"):
        _handle_tool_call(memory, "nonexistent", {})


def test_tool_descriptions_are_meaningful():
    tools = _get_tools()
    for tool in tools:
        assert len(tool.description) > 50, f"{tool.name} description too short"
        desc_lower = tool.description.lower()
        # Must mention CockroachDB, memory, or agent
        assert any(kw in desc_lower for kw in ("cockroachdb", "memory", "memories", "agent"))


def test_memory_search_returns_empty_for_no_match(memory):
    results = _handle_tool_call(memory, "memory_search", {"query": "nonexistent"})
    assert results == []


def test_memory_store_creates_hash_chain(memory):
    r1 = _handle_tool_call(memory, "memory_store", {"content": "First"})[0]
    r2 = _handle_tool_call(memory, "memory_store", {"content": "Second"})[0]
    assert r1["previous_hash"] is None
    assert r2["previous_hash"] == r1["cryptographic_hash"]
