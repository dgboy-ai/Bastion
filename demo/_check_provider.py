import psycopg2, os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
conn = psycopg2.connect(os.environ['BASTION_CONN'])
cur = conn.cursor()
cur.execute("""
    SELECT tool_name, sub_tool, result_summary, created_at
    FROM tool_usage_log
    WHERE tool_name = 'managed_mcp_call' AND sub_tool IN ('list_clusters','list_databases','select_query')
    ORDER BY created_at DESC LIMIT 3
""")
for row in cur.fetchall():
    print(f"--- {row[0]}:{row[1]} @ {row[3]} ---")
    res = row[2] or ""
    print(f"RESULT (first 200): {res[:200]}")
    print(f"  starts with '([TextContent': {res.startswith('([TextContent')}")
    print(f"  starts with '{{': {res.startswith('{')}")
    print(f"  contains 'provider': {'provider' in res}")
    print()
cur.close()
conn.close()
