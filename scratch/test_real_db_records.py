import os
import psycopg2
from dotenv import load_dotenv

# Load env variables
load_dotenv()
env_local = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local")
if os.path.exists(env_local):
    load_dotenv(env_local, override=True)

conn_str = os.environ.get("BASTION_CONN", "")
if not conn_str:
    print("[ERROR] BASTION_CONN environment variable is empty!")
    exit(1)

print("Connecting to CockroachDB cluster...")
try:
    conn = psycopg2.connect(conn_str)
    conn.autocommit = True
    with conn.cursor() as cur:
        # 1. Fetch latest agent memories
        print("\n=== LATEST AGENT MEMORIES (agent_memory table) ===")
        cur.execute(
            "SELECT created_at, memory_type, content, cryptographic_hash "
            "FROM agent_memory "
            "ORDER BY created_at DESC "
            "LIMIT 5"
        )
        rows = cur.fetchall()
        if not rows:
            print("No memory rows found.")
        for r in rows:
            print(f"[{r[0]}] Type: {r[1]} | Hash: {r[3][:16]}...")
            print(f"Content: {r[2][:120]}...\n")

        # 2. Fetch latest tool usages
        print("\n=== LATEST TOOL USAGES (tool_usage_log table) ===")
        cur.execute(
            "SELECT created_at, tool_name, sub_tool, duration_ms, client_name "
            "FROM tool_usage_log "
            "ORDER BY created_at DESC "
            "LIMIT 5"
        )
        rows = cur.fetchall()
        if not rows:
            print("No tool usage logs found.")
        for r in rows:
            print(f"[{r[0]}] Tool: {r[1]} | Sub-tool: {r[2]} | Duration: {r[3]}ms | Client: {r[4]}")
            
    conn.close()
except Exception as e:
    print(f"[ERROR] Connection/Query failed: {e}")
