import os, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
conn_str = os.environ['BASTION_CONN']
import psycopg2
conn = psycopg2.connect(conn_str)
cur = conn.cursor()

# Check recent chain_verification_failed audit entries
cur.execute("""
    SELECT details, recorded_at 
    FROM agent_audit 
    WHERE action = 'chain_verification_failed' 
    ORDER BY recorded_at DESC 
    LIMIT 5
""")
print('=== Recent chain_verification_failed ===')
for row in cur.fetchall():
    details = row[0]
    if isinstance(details, str):
        details = json.loads(details)
    print(f'Time: {row[1]}')
    print(f'Details: {json.dumps(details, indent=2)}')
    print()

# Check a few recent memories to see metadata state
cur.execute("""
    SELECT memory_id, content, metadata, previous_hash, cryptographic_hash, needs_verification
    FROM agent_memory 
    ORDER BY created_at DESC 
    LIMIT 5
""")
print('=== Recent memories ===')
for row in cur.fetchall():
    mid, content, metadata, prev_hash, crypt_hash, needs_verif = row
    meta = dict(metadata) if metadata else {}
    print(f'ID: {mid}')
    print(f'Content: {(content or "")[:80]}...')
    print(f'Metadata keys: {sorted(meta.keys())}')
    print(f'Prev hash: {prev_hash}')
    print(f'Crypt hash: {crypt_hash}')
    print(f'Needs verif: {needs_verif}')
    print()

# Recompute hash for the most recent memory to see if it matches
from bastion.crypto import compute_hash
cur.execute("""
    SELECT memory_id, content, metadata, previous_hash, cryptographic_hash
    FROM agent_memory 
    ORDER BY created_at DESC 
    LIMIT 1
""")
row = cur.fetchone()
if row:
    mid, content, metadata, prev_hash, stored_hash = row
    meta_dict = dict(metadata) if metadata else {}
    meta_dict.pop('_precomputed_embedding', None)
    meta_dict.pop('_trust_level', None)
    meta_dict.pop('_source_provenance', None)
    recomputed = compute_hash(content or "", meta_dict, prev_hash)
    print(f'=== Hash verification for {mid} ===')
    print(f'Stored:  {stored_hash}')
    print(f'Recomp:  {recomputed}')
    print(f'Match:   {stored_hash == recomputed}')
    if stored_hash != recomputed:
        print(f'Metadata after pops: {json.dumps(meta_dict, sort_keys=True, default=str)[:500]}')

conn.close()
