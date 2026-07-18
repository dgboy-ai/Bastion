"""Timing breakdown for store operation."""
import sys, os, time, json
sys.path.insert(0, os.path.join('.', 'src'))
from bastion import BastionMemory
from bastion.crypto import compute_hash

conn = os.environ['BASTION_CONN']
mem = BastionMemory('timing-test', connection_string=conn)

# Step 1: Get pool
start = time.time()
pool = mem.get_pool()
conn2 = pool.acquire(timeout=30.0)
print(f'1. Get pool + acquire: {time.time()-start:.2f}s')

# Step 2: RLS
start = time.time()
mem._set_rls_context(conn2)
print(f'2. Set RLS context: {time.time()-start:.2f}s')

# Step 3: Previous hash
start = time.time()
with conn2.cursor() as cur:
    cur.execute('SELECT cryptographic_hash FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT 1', ('timing-test',))
    prev = cur.fetchone()
    prev_hash = prev[0] if prev else None
print(f'3. Get prev hash: {time.time()-start:.2f}s')

# Step 4: Compute hash
start = time.time()
crypto_hash = compute_hash('test content', {}, prev_hash)
print(f'4. Compute hash: {time.time()-start:.2f}s')

# Step 5: Insert
start = time.time()
with conn2.cursor() as cur:
    cur.execute(
        "INSERT INTO agent_memory (agent_id, memory_type, content, embedding, metadata, previous_hash, cryptographic_hash) VALUES (%s, %s, %s, %s::vector, %s, %s, %s) RETURNING memory_id, created_at",
        ('timing-test', 'fact', 'manual test', json.dumps([0.001]*1024), '{}', prev_hash, crypto_hash)
    )
    row = cur.fetchone()
conn2.commit()
print(f'5. Insert + commit: {time.time()-start:.2f}s')

pool.release(conn2)
mem.close()
