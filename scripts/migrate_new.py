import os
import sys
import psycopg

CONN = "postgresql://divyansh:7_GfcNnRnL6UaflljIzOIw@bastion-memory-28736.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"

# Read and apply the new migrations
new_files = [
    "schema/005_agent_entities.sql",
    "schema/006_agent_relations.sql",
    "schema/007_memory_decay.sql",
]

conn = psycopg.connect(CONN)
cur = conn.cursor()

for fpath in new_files:
    fname = os.path.basename(fpath)
    if not os.path.exists(fpath):
        print(f"SKIP: {fname} (file not found)")
        continue
    with open(fpath) as f:
        sql = f.read()
    statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
    try:
        for stmt in statements:
            print(f"  Executing: {stmt[:80]}...")
            cur.execute(stmt)
        conn.commit()
        print(f"OK: {fname}")
    except Exception as e:
        conn.rollback()
        print(f"FAIL: {fname} - {e}")

cur.close()
conn.close()
print("\nDone.")
