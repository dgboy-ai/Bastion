"""Simple migration runner - runs the SQL from a file."""

import os
import sys

import psycopg

sql_file = sys.argv[1]
with open(sql_file) as f:
    sql = f.read()

conn = psycopg.connect(os.environ["BASTION_CONN"])
conn.autocommit = True

# Split by semicolons and run each statement
statements = [s.strip() for s in sql.split(";") if s.strip()]
for stmt in statements:
    try:
        conn.cursor().execute(stmt)
        print(f"  OK: {stmt[:60]}...")
    except Exception as e:
        if "already exists" in str(e) or "duplicate column" in str(e):
            print(f"  SKIP: {stmt[:60]}...")
        else:
            print(f"  ERROR: {e}")

conn.close()
print(f"Done: {sql_file}")
