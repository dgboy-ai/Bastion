import psycopg2, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
conn = psycopg2.connect(os.environ['BASTION_CONN'])
cur = conn.cursor()
cur.execute("SELECT tool_name, sub_tool, COUNT(*) as calls FROM tool_usage_log GROUP BY tool_name, sub_tool ORDER BY calls DESC")
rows = cur.fetchall()
print(f"{'TOOL':35s} {'SUB_TOOL':25s} {'CALLS':>6s}")
print("-" * 70)
for row in rows:
    print(f"{str(row[0] or ''):35s} {str(row[1] or ''):25s} {row[2]:>6d}")
cur.execute("SELECT COUNT(*) FROM tool_usage_log WHERE tool_name = 'managed_mcp_call'")
mcp_count = cur.fetchone()[0]
print(f"\nmanaged_mcp_call total: {mcp_count}")
cur.execute("SELECT COUNT(*) FROM tool_usage_log")
total = cur.fetchone()[0]
print(f"Total tool calls: {total}")
cur.close()
conn.close()
