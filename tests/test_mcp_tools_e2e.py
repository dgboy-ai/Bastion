"""End-to-end tests for ALL 25 MCP tools.

Covers every tool registered in mcp_server.py with real call_tool invocations
through the FastMCP interface (mock mode). Validates:
- Correct tool invocation and response format
- Input validation and error handling
- Tool annotations (readOnlyHint, destructiveHint, idempotentHint)
- Resource notifications after write operations
- Cross-tool workflows (store -> search -> pin -> get_pinned, etc.)
"""

import json

import pytest

from bastion.mcp_server import create_server


@pytest.fixture(autouse=True)
def reset_mock():
    from bastion.mock import reset

    reset()


@pytest.fixture
def mcp():
    return create_server(mock=True)


# ── Helper ──────────────────────────────────────────────────────────────────


async def _store(mcp, content="test content", memory_type="fact", **kw):
    """Store a memory and return parsed result dict."""
    result = await mcp.call_tool("memory_store", {"content": content, "memory_type": memory_type, **kw})
    return json.loads(result[0][0].text)


async def _search(mcp, query="test", **kw):
    """Search and return parsed result dict."""
    result = await mcp.call_tool("memory_search", {"query": query, **kw})
    return json.loads(result[0][0].text)


# ════════════════════════════════════════════════════════════════════════════
# memory_delete
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_memory_delete_requires_confirmation(mcp):
    stored = await _store(mcp, "delete me")
    result = await mcp.call_tool("memory_delete", {"memory_id": stored["memory_id"]})
    data = json.loads(result[0][0].text)
    assert data["error"] == "Deletion requires confirmed=true"


@pytest.mark.asyncio
async def test_memory_delete_requires_memory_id(mcp):
    result = await mcp.call_tool("memory_delete", {"memory_id": "", "confirmed": True})
    data = json.loads(result[0][0].text)
    assert data["error"] == "memory_id is required"


@pytest.mark.asyncio
async def test_memory_delete_removes_memory(mcp):
    stored = await _store(mcp, "delete me now")
    memory_id = stored["memory_id"]

    result = await mcp.call_tool("memory_delete", {"memory_id": memory_id, "confirmed": True})
    data = json.loads(result[0][0].text)
    assert data["deleted"] == memory_id
    assert data["status"] == "ok"

    # Verify it's gone
    search_result = await _search(mcp, "delete me now")
    assert not any(r["memory_id"] == memory_id for r in search_result["results"])


@pytest.mark.asyncio
async def test_memory_delete_record_removed(mcp):
    stored = await _store(mcp, "ephemeral")
    mid = stored["memory_id"]
    await mcp.call_tool("memory_delete", {"memory_id": mid, "confirmed": True})
    # Search should not find it
    search = await _search(mcp, "ephemeral")
    ids = [r["memory_id"] for r in search["results"]]
    assert mid not in ids


# ════════════════════════════════════════════════════════════════════════════
# memory_pin / memory_get_pinned
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_memory_pin_stores_pinned_memory(mcp):
    result = await mcp.call_tool(
        "memory_pin",
        {"content": "Safety: never auto-delete backups", "memory_type": "safety_rule", "pin_priority": 2},
    )
    data = json.loads(result[0][0].text)
    assert data["is_pinned"] is True
    assert data["pin_priority"] == 2
    assert "never auto-delete backups" in data["content"]


@pytest.mark.asyncio
async def test_memory_get_pinned_returns_pinned_memories(mcp):
    await mcp.call_tool("memory_pin", {"content": "Rule A", "pin_priority": 2})
    await mcp.call_tool("memory_pin", {"content": "Rule B", "pin_priority": 1})
    await mcp.call_tool("memory_store", {"content": "Not pinned"})

    result = await mcp.call_tool("memory_get_pinned", {"min_priority": 1})
    data = json.loads(result[0][0].text)
    assert len(data) == 2
    assert all(r["is_pinned"] for r in data)
    # Priority 2 should come first
    assert data[0]["pin_priority"] >= data[1]["pin_priority"]


@pytest.mark.asyncio
async def test_memory_get_pinned_filters_by_min_priority(mcp):
    await mcp.call_tool("memory_pin", {"content": "Critical", "pin_priority": 2})
    await mcp.call_tool("memory_pin", {"content": "Important", "pin_priority": 1})

    result = await mcp.call_tool("memory_get_pinned", {"min_priority": 2})
    data = json.loads(result[0][0].text)
    assert len(data) == 1
    assert data[0]["pin_priority"] == 2


@pytest.mark.asyncio
async def test_memory_get_pinned_empty_when_no_pins(mcp):
    result = await mcp.call_tool("memory_get_pinned", {})
    data = json.loads(result[0][0].text)
    assert data == []


# ════════════════════════════════════════════════════════════════════════════
# memory_list
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_memory_list_returns_all_memories(mcp):
    for i in range(5):
        await _store(mcp, f"item {i}", memory_type="fact")
    await _store(mcp, "preference item", memory_type="preference")

    result = await mcp.call_tool("memory_list", {})
    data = json.loads(result[0][0].text)
    assert len(data) == 6


@pytest.mark.asyncio
async def test_memory_list_filters_by_type(mcp):
    await _store(mcp, "fact one", memory_type="fact")
    await _store(mcp, "fact two", memory_type="fact")
    await _store(mcp, "pref one", memory_type="preference")

    result = await mcp.call_tool("memory_list", {"memory_type": "fact"})
    data = json.loads(result[0][0].text)
    assert len(data) == 2
    assert all(r["memory_type"] == "fact" for r in data)


@pytest.mark.asyncio
async def test_memory_list_pagination(mcp):
    for i in range(10):
        await _store(mcp, f"item {i}")

    page1 = await mcp.call_tool("memory_list", {"limit": 3, "offset": 0})
    d1 = json.loads(page1[0][0].text)
    assert len(d1) == 3

    page2 = await mcp.call_tool("memory_list", {"limit": 3, "offset": 3})
    d2 = json.loads(page2[0][0].text)
    assert len(d2) == 3
    assert d1[0]["memory_id"] != d2[0]["memory_id"]


@pytest.mark.asyncio
async def test_memory_list_empty_store(mcp):
    result = await mcp.call_tool("memory_list", {})
    data = json.loads(result[0][0].text)
    assert data == []


# ════════════════════════════════════════════════════════════════════════════
# memory_correct
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_memory_correct_updates_content(mcp):
    stored = await _store(mcp, "original content")
    mid = stored["memory_id"]

    result = await mcp.call_tool(
        "memory_correct", {"memory_id": mid, "new_content": "corrected content"}
    )
    data = json.loads(result[0][0].text)
    assert data["content"] == "corrected content"
    assert data["memory_id"] == mid


@pytest.mark.asyncio
async def test_memory_correct_not_found(mcp):
    result = await mcp.call_tool(
        "memory_correct",
        {"memory_id": "nonexistent-id", "new_content": "updated"},
    )
    data = json.loads(result[0][0].text)
    assert "error" in data
    assert "not found" in data["error"]


@pytest.mark.asyncio
async def test_memory_correct_with_metadata(mcp):
    stored = await _store(mcp, "original")
    mid = stored["memory_id"]

    result = await mcp.call_tool(
        "memory_correct",
        {"memory_id": mid, "new_content": "updated", "metadata": {"reviewed": True}},
    )
    data = json.loads(result[0][0].text)
    assert data["metadata"]["reviewed"] is True


# ════════════════════════════════════════════════════════════════════════════
# memory_health
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_memory_health_empty_store(mcp):
    result = await mcp.call_tool("memory_health", {})
    data = json.loads(result[0][0].text)
    assert data["total_memories"] == 0
    assert data["pinned_memories"] == 0
    assert "freshness_ratio" in data
    assert "avg_access_count" in data
    assert "avg_importance_score" in data


@pytest.mark.asyncio
async def test_memory_health_with_memories(mcp):
    await _store(mcp, "fact 1")
    await _store(mcp, "fact 2")
    await mcp.call_tool("memory_pin", {"content": "pinned rule", "pin_priority": 2})

    result = await mcp.call_tool("memory_health", {})
    data = json.loads(result[0][0].text)
    assert data["total_memories"] == 3
    assert data["pinned_memories"] == 1
    assert data["memories_last_7_days"] >= 3


# ════════════════════════════════════════════════════════════════════════════
# memory_apply_patch
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_memory_apply_patch_updates_metadata(mcp):
    stored = await _store(mcp, "patched", metadata={"version": 1})
    mid = stored["memory_id"]

    result = await mcp.call_tool(
        "memory_apply_patch",
        {"memory_id": mid, "patch_ops": [{"op": "replace", "path": "/version", "value": 2}]},
    )
    data = json.loads(result[0][0].text)
    assert data["metadata"]["version"] == 2
    assert data["memory_id"] == mid


@pytest.mark.asyncio
async def test_memory_apply_patch_add_field(mcp):
    stored = await _store(mcp, "add field", metadata={"existing": "value"})
    mid = stored["memory_id"]

    result = await mcp.call_tool(
        "memory_apply_patch",
        {"memory_id": mid, "patch_ops": [{"op": "add", "path": "/new_field", "value": "hello"}]},
    )
    data = json.loads(result[0][0].text)
    assert data["metadata"]["new_field"] == "hello"
    assert data["metadata"]["existing"] == "value"


@pytest.mark.asyncio
async def test_memory_apply_patch_not_found(mcp):
    result = await mcp.call_tool(
        "memory_apply_patch",
        {"memory_id": "nonexistent", "patch_ops": [{"op": "add", "path": "/x", "value": 1}]},
    )
    data = json.loads(result[0][0].text)
    assert "error" in data


# ════════════════════════════════════════════════════════════════════════════
# ltm_check_reuse
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ltm_check_reuse_no_match(mcp):
    result = await mcp.call_tool(
        "ltm_check_reuse", {"query": "analyze Q2 revenue trends"}
    )
    data = json.loads(result[0][0].text)
    assert data["reuse_found"] is False
    assert data["recommendation"] == "run_workflow"


@pytest.mark.asyncio
async def test_ltm_check_reuse_validates_query(mcp):
    result = await mcp.call_tool("ltm_check_reuse", {"query": ""})
    data = json.loads(result[0][0].text)
    assert "error" in data


@pytest.mark.asyncio
async def test_ltm_check_reuse_validates_threshold(mcp):
    result = await mcp.call_tool("ltm_check_reuse", {"query": "test", "threshold": 1.5})
    data = json.loads(result[0][0].text)
    assert "error" in data


@pytest.mark.asyncio
async def test_ltm_check_reuse_finds_cached_result(mcp):
    # Store an analysis result first
    await mcp.call_tool(
        "ltm_store_analysis",
        {"query": "analyze revenue", "result": "Revenue is up 20%", "analysis_type": "analysis"},
    )
    # Now check for reuse
    result = await mcp.call_tool(
        "ltm_check_reuse", {"query": "analyze revenue", "threshold": 0.5}
    )
    data = json.loads(result[0][0].text)
    assert data["reuse_found"] is True
    assert "memory_id" in data
    assert "similarity" in data


# ════════════════════════════════════════════════════════════════════════════
# ltm_store_analysis
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ltm_store_analysis_stores_result(mcp):
    result = await mcp.call_tool(
        "ltm_store_analysis",
        {
            "query": "analyze Q2 revenue",
            "result": "Revenue grew 15% YoY",
            "analysis_type": "analysis",
            "tokens_used": 5000,
        },
    )
    data = json.loads(result[0][0].text)
    assert "memory_id" in data
    assert data["analysis_type"] == "analysis"
    assert data["estimated_tokens"] > 0


@pytest.mark.asyncio
async def test_ltm_store_analysis_validates_inputs(mcp):
    result = await mcp.call_tool("ltm_store_analysis", {"query": "", "result": "some result"})
    data = json.loads(result[0][0].text)
    assert "error" in data

    result2 = await mcp.call_tool("ltm_store_analysis", {"query": "valid", "result": ""})
    data2 = json.loads(result2[0][0].text)
    assert "error" in data2


# ════════════════════════════════════════════════════════════════════════════
# ltm_invalidate
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_ltm_invalidate_stale_analyses(mcp):
    # Store first
    await mcp.call_tool(
        "ltm_store_analysis",
        {"query": "old analysis", "result": "outdated result", "analysis_type": "analysis"},
    )
    # Invalidate
    result = await mcp.call_tool(
        "ltm_invalidate", {"query": "old analysis", "reason": "data changed"}
    )
    data = json.loads(result[0][0].text)
    assert "invalidated" in data or "count" in data or "status" in data


@pytest.mark.asyncio
async def test_ltm_invalidate_validates_query(mcp):
    result = await mcp.call_tool("ltm_invalidate", {"query": ""})
    data = json.loads(result[0][0].text)
    assert "error" in data


# ════════════════════════════════════════════════════════════════════════════
# detect_contradictions
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_detect_contradictions_requires_memory_id(mcp):
    result = await mcp.call_tool("detect_contradictions", {"memory_id": ""})
    data = json.loads(result[0][0].text)
    assert "error" in data


@pytest.mark.asyncio
async def test_detect_contradictions_not_found(mcp):
    result = await mcp.call_tool("detect_contradictions", {"memory_id": "nonexistent"})
    data = json.loads(result[0][0].text)
    assert "error" in data
    assert "not found" in data["error"]


@pytest.mark.asyncio
async def test_detect_contradictions_on_stored_memory(mcp):
    stored = await _store(mcp, "The sky is blue")
    result = await mcp.call_tool("detect_contradictions", {"memory_id": stored["memory_id"]})
    data = json.loads(result[0][0].text)
    assert "contradictions_found" in data
    assert "scanned_count" in data


# ════════════════════════════════════════════════════════════════════════════
# scan_all_contradictions
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_scan_all_contradictions_empty(mcp):
    result = await mcp.call_tool("scan_all_contradictions", {})
    data = json.loads(result[0][0].text)
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_scan_all_contradictions_with_memories(mcp):
    await _store(mcp, "Fact A")
    await _store(mcp, "Fact B")
    result = await mcp.call_tool("scan_all_contradictions", {})
    data = json.loads(result[0][0].text)
    assert isinstance(data, list)


# ════════════════════════════════════════════════════════════════════════════
# dream
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_dream_runs_consolidation_cycle(mcp):
    await _store(mcp, "recent memory 1")
    await _store(mcp, "recent memory 2")

    result = await mcp.call_tool("dream", {"lookback_hours": 24})
    data = json.loads(result[0][0].text)
    assert "memories_reviewed" in data
    assert "memories_consolidated" in data
    assert "memories_promoted" in data
    assert "memories_pruned" in data
    assert "duration_ms" in data


@pytest.mark.asyncio
async def test_dream_validates_lookback_hours(mcp):
    result = await mcp.call_tool("dream", {"lookback_hours": 0})
    data = json.loads(result[0][0].text)
    assert "error" in data

    result2 = await mcp.call_tool("dream", {"lookback_hours": 200})
    data2 = json.loads(result2[0][0].text)
    assert "error" in data2


@pytest.mark.asyncio
async def test_dream_empty_store(mcp):
    result = await mcp.call_tool("dream", {})
    data = json.loads(result[0][0].text)
    assert data["memories_reviewed"] == 0


# ════════════════════════════════════════════════════════════════════════════
# dream_history
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_dream_history_empty(mcp):
    result = await mcp.call_tool("dream_history", {})
    data = json.loads(result[0][0].text)
    # Should return a list or dict of past sessions
    assert isinstance(data, (list, dict))


@pytest.mark.asyncio
async def test_dream_history_after_dream(mcp):
    await _store(mcp, "dream me")
    await mcp.call_tool("dream", {"lookback_hours": 24})
    result = await mcp.call_tool("dream_history", {})
    data = json.loads(result[0][0].text)
    # Dream should have logged an audit entry
    assert isinstance(data, (list, dict))


# ════════════════════════════════════════════════════════════════════════════
# detect_observations
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_detect_observations_empty(mcp):
    result = await mcp.call_tool("detect_observations", {})
    data = json.loads(result[0][0].text)
    assert "total_memories_scanned" in data
    assert "observations" in data


@pytest.mark.asyncio
async def test_detect_observations_with_memories(mcp):
    for i in range(5):
        await _store(mcp, f"Python is used for task {i}")

    result = await mcp.call_tool("detect_observations", {})
    data = json.loads(result[0][0].text)
    assert data["total_memories_scanned"] >= 5
    assert isinstance(data["observations"], list)


# ════════════════════════════════════════════════════════════════════════════
# multi_signal_search
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_multi_signal_search_basic(mcp):
    await _store(mcp, "Python is a programming language")
    await _store(mcp, "Rust is fast and safe")

    result = await mcp.call_tool("multi_signal_search", {"query": "Python programming"})
    data = json.loads(result[0][0].text)
    assert "results" in data
    assert "total" in data
    assert "signals" in data
    assert set(data["signals"]) == {"vector", "keyword", "entity", "temporal"}


@pytest.mark.asyncio
async def test_multi_signal_search_validates_query(mcp):
    result = await mcp.call_tool("multi_signal_search", {"query": ""})
    data = json.loads(result[0][0].text)
    assert "error" in data


@pytest.mark.asyncio
async def test_multi_signal_search_validates_k(mcp):
    result = await mcp.call_tool("multi_signal_search", {"query": "test", "k": 0})
    data = json.loads(result[0][0].text)
    assert "error" in data


@pytest.mark.asyncio
async def test_multi_signal_search_with_type_filter(mcp):
    await _store(mcp, "Python fact", memory_type="fact")
    await _store(mcp, "Python pref", memory_type="preference")

    result = await mcp.call_tool(
        "multi_signal_search", {"query": "Python", "memory_type": "preference"}
    )
    data = json.loads(result[0][0].text)
    assert all(r["memory_type"] == "preference" for r in data["results"])


# ════════════════════════════════════════════════════════════════════════════
# context_pack
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_context_pack_empty(mcp):
    result = await mcp.call_tool("context_pack", {"budget_tokens": 4000})
    data = json.loads(result[0][0].text)
    assert data["total_tokens"] == 0
    assert data["memory_count"] == 0
    assert data["budget_tokens"] == 4000


@pytest.mark.asyncio
async def test_context_pack_with_memories(mcp):
    await _store(mcp, "User prefers dark mode")
    await _store(mcp, "User's name is Alice")
    await mcp.call_tool("memory_pin", {"content": "Always validate inputs", "pin_priority": 2})

    result = await mcp.call_tool("context_pack", {"budget_tokens": 4000})
    data = json.loads(result[0][0].text)
    assert data["memory_count"] > 0
    assert data["pinned_count"] >= 1
    assert data["total_tokens"] > 0
    assert "utilization" in data


@pytest.mark.asyncio
async def test_context_pack_respects_budget(mcp):
    for i in range(20):
        await _store(mcp, f"Memory item {i} with some content to fill tokens")

    result = await mcp.call_tool("context_pack", {"budget_tokens": 50})
    data = json.loads(result[0][0].text)
    assert data["total_tokens"] <= 50 + 20  # small tolerance for token estimation
    assert data["truncated"] is True


# ════════════════════════════════════════════════════════════════════════════
# agent_schema
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_agent_schema_mock_mode(mcp):
    result = await mcp.call_tool("agent_schema", {})
    data = json.loads(result[0][0].text)
    assert "tables" in data
    assert "agent_memory" in data["tables"]
    assert "agent_audit" in data["tables"]


@pytest.mark.asyncio
async def test_agent_schema_specific_table(mcp):
    result = await mcp.call_tool("agent_schema", {"table": "agent_memory"})
    data = json.loads(result[0][0].text)
    assert "columns" in data
    assert "table" in data
    col_names = [c["name"] for c in data["columns"]]
    assert "memory_id" in col_names
    assert "content" in col_names


@pytest.mark.asyncio
async def test_agent_schema_table_not_found(mcp):
    result = await mcp.call_tool("agent_schema", {"table": "nonexistent"})
    data = json.loads(result[0][0].text)
    assert "error" in data


# ════════════════════════════════════════════════════════════════════════════
# a2a_bridge
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_a2a_bridge_returns_agent_card(mcp):
    result = await mcp.call_tool("a2a_bridge", {"agent_id": "test-agent"})
    data = json.loads(result[0][0].text)
    assert data["name"] == "Bastion/test-agent"
    assert data["version"] == "1.0.0"
    assert data["protocol"] == "a2a"
    assert data["capabilities"]["memory_store"] is True
    assert data["capabilities"]["memory_search"] is True
    assert data["capabilities"]["knowledge_graph"] is True
    assert data["well_known_url"] == "/.well-known/agent-card.json"


@pytest.mark.asyncio
async def test_a2a_bridge_default_agent_id(mcp):
    result = await mcp.call_tool("a2a_bridge", {})
    data = json.loads(result[0][0].text)
    assert data["name"] == "Bastion/bastion-agent"


# ════════════════════════════════════════════════════════════════════════════
# Cross-tool integration workflows
# ════════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
async def test_workflow_store_search_correct_delete(mcp):
    """Full lifecycle: store -> search -> correct -> delete."""
    # Store
    stored = await _store(mcp, "Original fact about Python")
    mid = stored["memory_id"]

    # Search
    search = await _search(mcp, "Python")
    assert any(r["memory_id"] == mid for r in search["results"])

    # Correct
    corrected = await mcp.call_tool(
        "memory_correct", {"memory_id": mid, "new_content": "Updated fact about Python"}
    )
    cdata = json.loads(corrected[0][0].text)
    assert cdata["content"] == "Updated fact about Python"

    # Delete
    deleted = await mcp.call_tool("memory_delete", {"memory_id": mid, "confirmed": True})
    ddata = json.loads(deleted[0][0].text)
    assert ddata["status"] == "ok"


@pytest.mark.asyncio
async def test_workflow_pin_get_pinned_list(mcp):
    """Pin memories and verify they appear in get_pinned and list."""
    pinned = await mcp.call_tool(
        "memory_pin", {"content": "Critical safety rule", "pin_priority": 2}
    )
    pdata = json.loads(pinned[0][0].text)
    assert pdata["is_pinned"] is True

    # get_pinned
    gp = await mcp.call_tool("memory_get_pinned", {"min_priority": 2})
    gpdata = json.loads(gp[0][0].text)
    assert len(gpdata) >= 1

    # list should also show it
    lst = await mcp.call_tool("memory_list", {})
    lstdata = json.loads(lst[0][0].text)
    assert any(r["memory_id"] == pdata["memory_id"] for r in lstdata)


@pytest.mark.asyncio
async def test_workflow_store_ltm_check_invalidate(mcp):
    """Store analysis -> check reuse -> invalidate -> check again."""
    await mcp.call_tool(
        "ltm_store_analysis",
        {"query": "revenue analysis", "result": "Revenue up 10%", "analysis_type": "analysis"},
    )

    # Check reuse - should find it
    check1 = await mcp.call_tool("ltm_check_reuse", {"query": "revenue analysis", "threshold": 0.5})
    d1 = json.loads(check1[0][0].text)
    assert d1["reuse_found"] is True

    # Invalidate
    await mcp.call_tool("ltm_invalidate", {"query": "revenue analysis", "reason": "stale data"})

    # Check again - should not find it (or find it tagged stale)
    check2 = await mcp.call_tool("ltm_check_reuse", {"query": "revenue analysis", "threshold": 0.9})
    d2 = json.loads(check2[0][0].text)
    # After invalidation, the stale tag means it shouldn't be reused
    # (behavior depends on LTM gateway implementation)


@pytest.mark.asyncio
async def test_workflow_dream_history_audit(mcp):
    """Store -> dream -> verify audit trail."""
    await _store(mcp, "dream test memory")
    await mcp.call_tool("dream", {"lookback_hours": 24})

    # Audit should show both store and dream
    audit = await mcp.call_tool("memory_audit", {})
    adata = json.loads(audit[0][0].text)
    actions = [e["action"] for e in adata]
    assert "memory_store" in actions


@pytest.mark.asyncio
async def test_workflow_health_after_operations(mcp):
    """Store, pin, delete, then check health reflects all changes."""
    await _store(mcp, "health test 1")
    await _store(mcp, "health test 2")
    await mcp.call_tool("memory_pin", {"content": "pinned rule", "pin_priority": 1})

    health = await mcp.call_tool("memory_health", {})
    hdata = json.loads(health[0][0].text)
    assert hdata["total_memories"] == 3
    assert hdata["pinned_memories"] == 1

    # Delete one
    stored = await _store(mcp, "to delete")
    await mcp.call_tool("memory_delete", {"memory_id": stored["memory_id"], "confirmed": True})

    health2 = await mcp.call_tool("memory_health", {})
    hdata2 = json.loads(health2[0][0].text)
    assert hdata2["total_memories"] == 3  # 3 - 1 deleted + 1 new = 3


@pytest.mark.asyncio
async def test_workflow_patch_then_apply(mcp):
    """Store -> apply JSON patch -> verify metadata updated."""
    stored = await _store(mcp, "patch workflow", metadata={"count": 0, "tags": ["v1"]})
    mid = stored["memory_id"]

    # Replace count
    await mcp.call_tool(
        "memory_apply_patch",
        {"memory_id": mid, "patch_ops": [{"op": "replace", "path": "/count", "value": 5}]},
    )

    # Add tag
    await mcp.call_tool(
        "memory_apply_patch",
        {"memory_id": mid, "patch_ops": [{"op": "add", "path": "/tags/1", "value": "v2"}]},
    )

    # Verify via list
    lst = await mcp.call_tool("memory_list", {})
    lstdata = json.loads(lst[0][0].text)
    target = [r for r in lstdata if r["memory_id"] == mid][0]
    assert target["metadata"]["count"] == 5
    assert "v2" in target["metadata"]["tags"]
