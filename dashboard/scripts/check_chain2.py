import os, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
conn_str = os.environ['BASTION_CONN']
import psycopg2
conn = psycopg2.connect(conn_str)
cur = conn.cursor()

# Check the 3 specific mismatch IDs
mismatch_ids = [
    "9f6f89bf-d346-496c-9959-90e2f6851006",
    "219c1820-26c1-45a7-9a99-4d2f8b470524",
    "26f5dfae-6351-4964-9cb0-a161cedf7340",
]

from bastion.crypto import compute_hash

for mid in mismatch_ids:
    cur.execute("""
        SELECT memory_id, content, metadata, previous_hash, cryptographic_hash, needs_verification, created_at
        FROM agent_memory WHERE memory_id = %s
    """, (mid,))
    row = cur.fetchone()
    if row:
        mem_id, content, metadata, prev_hash, stored_hash, needs_verif, created_at = row
        meta_dict = dict(metadata) if metadata else {}
        meta_dict.pop('_precomputed_embedding', None)
        meta_dict.pop('_trust_level', None)
        meta_dict.pop('_source_provenance', None)
        recomputed = compute_hash(content or "", meta_dict, prev_hash)
        print(f'ID: {mem_id}')
        print(f'Created: {created_at}')
        print(f'Content: {(content or "")[:100]}...')
        print(f'Metadata keys: {sorted(meta_dict.keys())}')
        print(f'Prev hash: {prev_hash}')
        print(f'Stored hash: {stored_hash}')
        print(f'Recomputed:  {recomputed}')
        print(f'Match: {stored_hash == recomputed}')
        print(f'Needs verif: {needs_verif}')
        print()
    else:
        print(f'ID {mid} NOT FOUND (deleted?)')
        print()

# Check how many memories still have needs_verification = true
cur.execute("SELECT COUNT(*) FROM agent_memory WHERE needs_verification = true")
count = cur.fetchone()[0]
print(f'Memories with needs_verification=true: {count}')

# Check total memories
cur.execute("SELECT COUNT(*) FROM agent_memory")
total = cur.fetchone()[0]
print(f'Total memories: {total}')

# Check if chain_verify is being called repeatedly by looking at recent audit entries
cur.execute("""
    SELECT action, COUNT(*), MAX(recorded_at) 
    FROM agent_audit 
    WHERE action LIKE 'chain_%'
    GROUP BY action
""")
print('\n=== Chain-related audit actions ===')
for row in cur.fetchall():
    print(f'{row[0]}: {row[1]} times (last: {row[2]})')

conn.close()
