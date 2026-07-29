"""Check which columns exist on agent_memory."""

import os

import psycopg

conn = psycopg.connect(os.environ["BASTION_CONN"])
conn.autocommit = True
cur = conn.cursor()
cur.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_memory' ORDER BY ordinal_position"
)
cols = [r[0] for r in cur.fetchall()]
print("agent_memory columns:", cols)
conn.close()
