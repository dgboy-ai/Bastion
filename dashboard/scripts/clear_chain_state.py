import os, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
conn_str = os.environ['BASTION_CONN']
import psycopg2

conn = psycopg2.connect(conn_str)
conn.autocommit = True
cur = conn.cursor()

# Just clear all needs_verification flags
cur.execute("UPDATE agent_memory SET needs_verification = FALSE WHERE needs_verification = TRUE")
print(f'Cleared {cur.rowcount} needs_verification flags')

# Delete chain_verification_failed audit entries
cur.execute("DELETE FROM agent_audit WHERE action = 'chain_verification_failed'")
print(f'Deleted {cur.rowcount} chain_verification_failed audit entries')

# Check current state
cur.execute("SELECT COUNT(*) FROM agent_memory WHERE needs_verification = TRUE")
print(f'Remaining needs_verification=true: {cur.fetchone()[0]}')

cur.execute("SELECT COUNT(*) FROM agent_audit WHERE action = 'chain_verification_failed'")
print(f'Remaining chain_verification_failed: {cur.fetchone()[0]}')

conn.close()
