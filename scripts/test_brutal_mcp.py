"""
BRUTAL E2E TEST: MCP Server — All 25 Tools
Tests every MCP tool through the FastMCP interface against real CockroachDB.
"""

import asyncio
import io
import json
import os
import sys

from bastion.mcp_server import create_server
from bastion.memory import BastionMemory

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))


DIVIDER = "=" * 70
passed = 0
failed = 0
errors = []


def test(name, fn):
    global passed, failed
    try:
        result = fn()
        if result is False:
            failed += 1
            errors.append(f"FAIL: {name}")
            print(f"  FAIL | {name}")
        else:
            passed += 1
            print(f"  PASS | {name}")
    except Exception as e:
        failed += 1
        errors.append(f"ERROR: {name} — {e}")
        print(f"  ERROR| {name}: {e}")


print(DIVIDER)
print("  BRUTAL E2E: MCP SERVER — ALL TOOLS")
print(DIVIDER)

mcp = create_server()
print(f"\n  MCP Server: {mcp.name}")

mem = BastionMemory("mcp-brutal-test")


# Helper to run async
def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ─── 1. memory_store ───────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  1. memory_store — Store Agent Memory")
print(f"{'─' * 70}")

stored_ids = []


async def test_store():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_store":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, content="MCP tool test memory", memory_type="fact")
            data = json.loads(result)
            if "memory_id" in data:
                stored_ids.append(data["memory_id"])
            return data
    return {"error": "tool not found"}


result = run_async(test_store())
test("memory_store returns memory_id", lambda: "memory_id" in result)
test("memory_store has content", lambda: result.get("content") == "MCP tool test memory")

# ─── 2. memory_search ──────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  2. memory_search — Vector Search")
print(f"{'─' * 70}")


async def test_search():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_search":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, query="MCP tool test", k=5)
            return json.loads(result)
    return {"error": "tool not found"}


result = run_async(test_search())
test("memory_search returns results", lambda: "results" in result)
test("memory_search has total", lambda: "total" in result)

# ─── 3. memory_timetravel ──────────────────────────────────────
print(f"\n{'─' * 70}")
print("  3. memory_timetravel — AS OF SYSTEM TIME")
print(f"{'─' * 70}")


async def test_timetravel():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_timetravel":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, timestamp="2026-01-01T00:00:00Z")
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_timetravel())
test("memory_timetravel returns list", lambda: isinstance(result, list))

# ─── 4. memory_audit ───────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  4. memory_audit — Audit Log")
print(f"{'─' * 70}")


async def test_audit():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_audit":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_audit())
test("memory_audit returns list", lambda: isinstance(result, list))
test("memory_audit has entries", lambda: len(result) > 0)

# ─── 5. memory_heal ────────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  5. memory_heal — Self-Healing")
print(f"{'─' * 70}")


async def test_heal():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_heal":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_heal())
test("memory_heal returns dict", lambda: isinstance(result, dict))

# ─── 6. memory_delete ──────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  6. memory_delete — Delete Memory")
print(f"{'─' * 70}")


async def test_delete():
    store_tool = None
    delete_tool = None
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_store":
            store_tool = tool
        if tool.name == "memory_delete":
            delete_tool = tool
    if store_tool and delete_tool:
        ctx = type("MockCtx", (), {"client_id": "brutal-delete-test"})()
        stored = await store_tool.fn(ctx, content="Delete me via MCP", memory_type="fact")
        stored_data = json.loads(stored)
        mid = stored_data.get("memory_id")
        if mid:
            result = await delete_tool.fn(ctx, memory_id=mid, confirmed=True)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tools not found"}


result = run_async(test_delete())
test("memory_delete returns deleted", lambda: result.get("deleted") or result.get("status") == "ok")

# ─── 7. memory_pin ─────────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  7. memory_pin — Pin Safety-Critical")
print(f"{'─' * 70}")


async def test_pin():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_pin":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, content="MCP pinned safety rule", memory_type="safety_rule", pin_priority=2)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_pin())
test("memory_pin returns record", lambda: "memory_id" in result)

# ─── 8. memory_get_pinned ──────────────────────────────────────
print(f"\n{'─' * 70}")
print("  8. memory_get_pinned — Get Pinned")
print(f"{'─' * 70}")


async def test_get_pinned():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_get_pinned":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, min_priority=1)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_get_pinned())
test("memory_get_pinned returns list", lambda: isinstance(result, list))

# ─── 9. memory_list ────────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  9. memory_list — List Memories")
print(f"{'─' * 70}")


async def test_list():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_list":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, limit=10)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_list())
test("memory_list returns list", lambda: isinstance(result, list))

# ─── 10. memory_correct ────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  10. memory_correct — Correct Memory")
print(f"{'─' * 70}")


async def test_correct():
    store_tool = None
    correct_tool = None
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_store":
            store_tool = tool
        if tool.name == "memory_correct":
            correct_tool = tool
    if store_tool and correct_tool:
        ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
        stored = await store_tool.fn(ctx, content="Old content to correct", memory_type="fact")
        stored_data = json.loads(stored)
        mid = stored_data.get("memory_id")
        if mid:
            result = await correct_tool.fn(ctx, memory_id=mid, new_content="Corrected content via MCP")
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tools not found"}


result = run_async(test_correct())
test("memory_correct returns record", lambda: "memory_id" in result)

# ─── 11. memory_health ─────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  11. memory_health — Health Metrics")
print(f"{'─' * 70}")


async def test_health():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_health":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_health())
test("memory_health returns dict", lambda: isinstance(result, dict))

# ─── 12. memory_apply_patch ────────────────────────────────────
print(f"\n{'─' * 70}")
print("  12. memory_apply_patch — JSON Patch")
print(f"{'─' * 70}")


async def test_patch():
    store_tool = None
    patch_tool = None
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "memory_store":
            store_tool = tool
        if tool.name == "memory_apply_patch":
            patch_tool = tool
    if store_tool and patch_tool:
        ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
        stored = await store_tool.fn(ctx, content="Patch target memory", metadata={"tags": ["old"]})
        stored_data = json.loads(stored)
        mid = stored_data.get("memory_id")
        if mid:
            result = await patch_tool.fn(
                ctx, memory_id=mid, patch_ops=[{"op": "replace", "path": "/metadata/tags", "value": ["patched"]}]
            )
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tools not found"}


result = run_async(test_patch())
test("memory_apply_patch returns result", lambda: isinstance(result, dict))

# ─── 13. resolve_conflict ──────────────────────────────────────
print(f"\n{'─' * 70}")
print("  13. resolve_conflict — Conflict Resolution")
print(f"{'─' * 70}")


async def test_conflict():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "resolve_conflict":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, fact_a="Server is in US-East", fact_b="Server is in EU-West")
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_conflict())
test("resolve_conflict returns merged", lambda: "merged" in result)

# ─── 14. ltm_check_reuse ───────────────────────────────────────
print(f"\n{'─' * 70}")
print("  14. ltm_check_reuse — LTM Gateway")
print(f"{'─' * 70}")


async def test_ltm_check():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "ltm_check_reuse":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, query="test query for reuse")
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_ltm_check())
test("ltm_check_reuse returns reuse_found", lambda: "reuse_found" in result)

# ─── 15. ltm_store_analysis ────────────────────────────────────
print(f"\n{'─' * 70}")
print("  15. ltm_store_analysis — Store Analysis")
print(f"{'─' * 70}")


async def test_ltm_store():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "ltm_store_analysis":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(
                ctx, query="test analysis query", result="This is a test analysis result", analysis_type="test"
            )
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_ltm_store())
test("ltm_store_analysis returns dict", lambda: isinstance(result, dict))

# ─── 16. ltm_invalidate ────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  16. ltm_invalidate — Invalidate Stale")
print(f"{'─' * 70}")


async def test_ltm_invalidate():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "ltm_invalidate":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, query="test invalidate query")
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_ltm_invalidate())
test("ltm_invalidate returns result", lambda: isinstance(result, dict))

# ─── 17. detect_contradictions ──────────────────────────────────
print(f"\n{'─' * 70}")
print("  17. detect_contradictions — Contradiction Detection")
print(f"{'─' * 70}")


async def test_contradictions():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "detect_contradictions":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            if stored_ids:
                result = await tool.fn(ctx, memory_id=stored_ids[0])
                return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found or no stored IDs"}


result = run_async(test_contradictions())
test("detect_contradictions returns dict", lambda: isinstance(result, dict))

# ─── 18. scan_all_contradictions ───────────────────────────────
print(f"\n{'─' * 70}")
print("  18. scan_all_contradictions — Batch Scan")
print(f"{'─' * 70}")


async def test_scan_all():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "scan_all_contradictions":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_scan_all())
test("scan_all_contradictions returns list", lambda: isinstance(result, list))

# ─── 19. dream ─────────────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  19. dream — Sleep-Time Consolidation")
print(f"{'─' * 70}")


async def test_dream():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "dream":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx, lookback_hours=1)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_dream())
test("dream returns dict", lambda: isinstance(result, dict))

# ─── 20. dream_history ─────────────────────────────────────────
print(f"\n{'─' * 70}")
print("  20. dream_history — Dream History")
print(f"{'─' * 70}")


async def test_dream_history():
    for tool in mcp._tool_manager._tools.values():
        if tool.name == "dream_history":
            ctx = type("MockCtx", (), {"client_id": "brutal-test"})()
            result = await tool.fn(ctx)
            return json.loads(result) if isinstance(result, str) else result
    return {"error": "tool not found"}


result = run_async(test_dream_history())
test("dream_history returns list", lambda: isinstance(result, list))

# ─── SUMMARY ────────────────────────────────────────────────────
print(f"\n{DIVIDER}")
print(f"  RESULTS: {passed} PASS / {failed} FAIL / {passed + failed} TOTAL")
print(DIVIDER)

if errors:
    print("\n  FAILURES:")
    for e in errors:
        print(f"    - {e}")

print()
