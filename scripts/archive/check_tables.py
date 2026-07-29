"""Check existing tables and rows in the CRDB cluster."""

import os

import psycopg

conn_str = os.environ.get("BASTION_CONN")
conn = psycopg.connect(conn_str)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
tables = cur.fetchall()
print(f"Found {len(tables)} existing tables:")
for (t,) in tables:
    cur2 = conn.cursor()
    cur2.execute(f"SELECT count(*) FROM {t}")
    cnt = cur2.fetchone()[0]
    print(f"  {t}: {cnt} rows")
conn.close()
