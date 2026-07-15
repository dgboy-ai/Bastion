"""Run schema migrations against the CRDB cluster in order."""
import glob
import os

import psycopg

conn_str = os.environ.get("BASTION_CONN")
if not conn_str:
    raise SystemExit("BASTION_CONN not set")

schema_dir = os.path.join(os.path.dirname(__file__), "schema")
sql_files = sorted(glob.glob(os.path.join(schema_dir, "*.sql")))

print("Connecting to CRDB cluster...")
conn = psycopg.connect(conn_str)
conn.autocommit = True

for i, path in enumerate(sql_files, 1):
    name = os.path.basename(path)
    print(f"[{i}/{len(sql_files)}] Running {name}...")
    with open(path) as f:
        sql = f.read()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        print("  OK")
    except Exception as e:
        err = str(e)
        if "already exists" in err or "duplicate column" in err:
            print(f"  SKIP (already applied): {err[:80]}")
        else:
            print(f"  ERROR: {err[:200]}")

conn.close()
print("\nMigrations complete.")
