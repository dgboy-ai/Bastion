import os
import sys

import psycopg

# Retrieve database connection URI from environment configuration to prevent leaks
CONN = os.environ.get("BASTION_CONN") or os.environ.get("DATABASE_URL")

if not CONN:
    print("ERROR: Environment variable BASTION_CONN or DATABASE_URL is not set.")
    print("Please set BASTION_CONN before executing this migration script.")
    sys.exit(1)

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
