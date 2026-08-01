import psycopg2, os, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
conn = psycopg2.connect(os.environ['BASTION_CONN'])
cur = conn.cursor()
cur.execute("""
    SELECT result_summary FROM tool_usage_log
    WHERE tool_name = 'managed_mcp_call' AND sub_tool = 'select_query'
    ORDER BY created_at DESC LIMIT 1
""")
row = cur.fetchone()
res = row[0] if row else ""
print("stored result_summary:")
print(res)
try:
    parsed = json.loads(res)
    print("\ncontains full 'result' key:", "result" in parsed)
    print("'result' is '[REDACTED]':", parsed.get("result") == "[REDACTED]")
    print("'result' type:", type(parsed.get("result")).__name__)
except Exception as e:
    print("not valid JSON:", e)
cur.close()
conn.close()
