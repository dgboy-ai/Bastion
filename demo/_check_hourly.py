import os, psycopg
conn = psycopg.connect(os.environ.get("BASTION_CONN"))
conn.autocommit = True
cur = conn.cursor()
cur.execute("""
SELECT EXTRACT(HOUR FROM created_at)::int as hr, COUNT(*)
FROM agent_memory
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY hr ORDER BY hr ASC
""")
rows = cur.fetchall()
print("hourly rows (hr, count):", rows)
cur.execute("SELECT COUNT(*) FROM agent_memory WHERE created_at >= NOW() - INTERVAL '24 hours'")
print("memories in last 24h:", cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM agent_memory")
print("total memories:", cur.fetchone()[0])
conn.close()
