import pytest

from bastion.mcp_server import create_server


@pytest.fixture(autouse=True)
def reset_mock():
    from bastion.mock import reset
    reset()


def test_handle_tool_memory_store():
    _, handler = create_server(mock=True)
    result = handler("memory_store", {"memory_type": "fact", "content": "Hello"})
    assert len(result) == 1
    assert result[0]["memory_type"] == "fact"
    assert result[0]["content"] == "Hello"


def test_handle_tool_memory_search():
    _, handler = create_server(mock=True)
    handler("memory_store", {"content": "Python is great"})
    results = handler("memory_search", {"query": "Python"})
    assert len(results) > 0


def test_handle_tool_memory_timetravel():
    _, handler = create_server(mock=True)
    handler("memory_store", {"content": "Future memory"})
    from datetime import datetime, timezone
    future = datetime.now(timezone.utc).isoformat()
    results = handler("memory_timetravel", {"timestamp": future})
    assert len(results) > 0


def test_handle_tool_memory_audit():
    _, handler = create_server(mock=True)
    handler("memory_store", {"content": "Audit me"})
    entries = handler("memory_audit", {})
    assert len(entries) > 0
    assert entries[0]["action"] == "memory_store"


def test_handle_tool_memory_heal():
    _, handler = create_server(mock=True)
    handler("memory_store", {"content": "Keep"})
    result = handler("memory_heal", {})
    assert len(result) == 1
    assert "records_before" in result[0]


def test_handle_tool_resolve_conflict():
    _, handler = create_server(mock=True)
    result = handler("resolve_conflict", {"fact_a": "A", "fact_b": "B"})
    assert len(result) == 1
    assert "merged" in result[0]


def test_handle_tool_unknown():
    _, handler = create_server(mock=True)
    with pytest.raises(ValueError, match="Unknown tool"):
        handler("nonexistent", {})
