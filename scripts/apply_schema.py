import os
import sys

import psycopg

conn_str = sys.argv[1]
schema_dir = sys.argv[2]

files = [
    "001_agent_checkpoints.sql",
    "002_agent_memory.sql",
    "003_agent_audit.sql",
    "004_agent_coordination.sql",
]

all_statements = []
for fname in files:
    path = os.path.join(schema_dir, fname)
    if not os.path.exists(path):
        print(f"SKIP: {fname} (not found)")
        continue
    with open(path) as f:
        sql = f.read()
    statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
    all_statements.append((fname, statements))

conn = psycopg.connect(conn_str)
cur = conn.cursor()
for fname, statements in all_statements:
    try:
        for stmt in statements:
            cur.execute(stmt)
        conn.commit()
        print(f"OK: {fname}")
    except Exception as e:
        conn.rollback()
        print(f"FAIL: {fname} - {e}")

cur.close()
conn.close()
