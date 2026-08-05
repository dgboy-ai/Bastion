import os, sys
sys.path.insert(0, "src")
import psycopg2

conn = os.environ.get("BASTION_CONN") or os.environ.get("BASTION_DB_URL")
if not conn:
    print("No BASTION_CONN set")
    sys.exit(1)

db = psycopg2.connect(conn)
cur = db.cursor()
cur.execute("SELECT DISTINCT tool_name FROM tool_usage_log ORDER BY tool_name")
used = set(r[0] for r in cur.fetchall())

all_tools = {
    "a2a_bridge", "agent_schema", "ccloud_exec", "compliance_report",
    "context_pack", "detect_contradictions", "detect_observations",
    "dream", "dream_history", "forensic_report", "invoke_agent_skill",
    "list_agent_skills", "ltm_check_reuse", "ltm_invalidate",
    "ltm_store_analysis", "managed_mcp_call", "managed_mcp_list_tools",
    "memory_apply_patch", "memory_audit", "memory_correct", "memory_delete",
    "memory_get_pinned", "memory_heal", "memory_health", "memory_list",
    "memory_pin", "memory_search", "memory_search_encrypted", "memory_store",
    "memory_store_batch", "memory_store_encrypted", "memory_timetravel",
    "multi_signal_search", "resolve_conflict", "scan_all_contradictions",
}

missing = sorted(all_tools - used)
print(f"Used: {len(used)}/35")
print(f"Unused ({len(missing)}):")
for m in missing:
    print(f"  {m}")
db.close()
