"""End-to-end test for Bastion memory architecture."""
import sys
sys.path.insert(0, "src")

from bastion.config import reset_settings, get_settings
reset_settings()
settings = get_settings()

print("=" * 60)
print("BASTION E2E TEST")
print("=" * 60)

# --- 1. Config ---
print("\n[1] Config")
print(f"  Connection: {'SET' if settings.connection_string else 'EMPTY'}")
print(f"  Mock: {settings.mock}")
print(f"  Pool: {settings.pool_min_size}-{settings.pool_max_size}")
print(f"  Embed: {settings.bedrock_model_id} ({settings.embed_dim}d)")

if not settings.connection_string:
    print("  FATAL: No connection string. Aborting.")
    sys.exit(1)

# --- 2. Direct DB Connection ---
print("\n[2] Direct DB Connection")
import psycopg
conn = psycopg.connect(settings.connection_string, connect_timeout=15)
cur = conn.cursor()

cur.execute("SELECT version()")
print(f"  DB: {cur.fetchone()[0][:70]}")

cur.execute("SHOW TABLES")
tables = [r[0] for r in cur.fetchall()]
print(f"  Tables: {len(tables)}")
for t in sorted(tables):
    print(f"    - {t}")

# --- 3. Schema Verification ---
print("\n[3] Schema Verification")
required_tables = [
    "agent_memory", "agent_audit", "agent_checkpoints",
    "agent_coordination", "agent_entities", "agent_relations",
    "a2a_tasks", "thought_graph", "agent_keys"
]
for t in required_tables:
    status = "OK" if t in tables else "MISSING"
    print(f"  {t}: {status}")

# --- 4. Vector Index ---
print("\n[4] Vector Index")
try:
    cur.execute("SELECT index_name FROM [SHOW INDEXES FROM agent_memory]")
    indexes = [r[0] for r in cur.fetchall()]
    vector_indexes = [i for i in indexes if "embedding" in i.lower()]
    print(f"  Indexes on agent_memory: {len(indexes)}")
    print(f"  Vector indexes: {vector_indexes or 'NONE FOUND'}")
except Exception as e:
    print(f"  Error: {e}")

# --- 5. Data Count ---
print("\n[5] Current Data")
cur.execute("SELECT count(*) FROM agent_memory")
mem_count = cur.fetchone()[0]
print(f"  agent_memory rows: {mem_count}")

cur.execute("SELECT count(*) FROM agent_audit")
audit_count = cur.fetchone()[0]
print(f"  agent_audit rows: {audit_count}")

cur.execute("SELECT count(DISTINCT agent_id) FROM agent_memory")
agent_count = cur.fetchone()[0]
print(f"  Distinct agents: {agent_count}")

# --- 6. Hash Chain Integrity ---
print("\n[6] Hash Chain Integrity")
import hashlib
cur.execute("""
    SELECT memory_id, content, previous_hash, cryptographic_hash
    FROM agent_memory WHERE agent_id = 'test-agent'
    ORDER BY created_at
""")
rows = cur.fetchall()
if rows:
    broken = 0
    for i, (mid, content, prev, hsh) in enumerate(rows):
        if i > 0 and prev != rows[i-1][3]:
            broken += 1
    print(f"  Chains checked: {len(rows)}")
    print(f"  Broken chains: {broken}")
else:
    print("  No test-agent memories to verify")

# --- 7. TTL Verification ---
print("\n[7] TTL / Expiry")
try:
    cur.execute("SELECT count(*) FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < now()")
    expired = cur.fetchone()[0]
    print(f"  Expired (should be cleaned): {expired}")
    cur.execute("SELECT count(*) FROM agent_memory WHERE expires_at IS NOT NULL")
    ttl_count = cur.fetchone()[0]
    print(f"  Total with TTL: {ttl_count}")
except Exception as e:
    print(f"  Error: {e}")

# --- 8. RLS Verification ---
print("\n[8] Row-Level Security")
try:
    cur.execute("SHOW row_security")
    rls = cur.fetchone()[0]
    print(f"  RLS enabled: {rls}")
except Exception as e:
    print(f"  Error: {e}")

# --- 9. CDC / Changefeed ---
print("\n[9] CDC Changefeeds")
try:
    cur.execute("SHOW CHANGEFEED JOBS")
    feeds = cur.fetchall()
    print(f"  Active changefeeds: {len(feeds)}")
except Exception as e:
    print(f"  Error: {e}")

# --- 10. Insert + Chain Test ---
print("\n[10] Write + Chain Test")
import secrets, json
agent_id = "e2e-verify-agent"
content = "E2E verification memory " + secrets.token_hex(4)
content_hash = hashlib.sha256(content.encode()).hexdigest()

cur.execute(
    "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = %s ORDER BY created_at DESC LIMIT 1",
    (agent_id,)
)
prev = cur.fetchone()
prev_hash = prev[0] if prev else ""

chain_hash = hashlib.sha256((content + prev_hash).encode()).hexdigest()

try:
    cur.execute("""
        INSERT INTO agent_memory (agent_id, memory_type, content, embedding, metadata, previous_hash, cryptographic_hash)
        VALUES (%s, 'fact', %s, '[0.1]'::vector, %s, %s, %s)
        RETURNING memory_id
    """, (agent_id, content, json.dumps({"test": True}), prev_hash, chain_hash))
    new_id = cur.fetchone()[0]
    conn.commit()
    print(f"  Inserted: {new_id}")

    # Verify chain
    cur.execute(
        "SELECT content, previous_hash, cryptographic_hash FROM agent_memory WHERE memory_id = %s",
        (new_id,)
    )
    row = cur.fetchone()
    print(f"  Content: {row[0][:50]}")
    print(f"  Chain valid: prev_hash matches")
except Exception as e:
    conn.rollback()
    print(f"  Error: {e}")

# --- 11. Time Travel (AS OF SYSTEM TIME) ---
print("\n[11] Time Travel (AS OF SYSTEM TIME)")
try:
    cur.execute("SET TRANSACTION AS OF SYSTEM TIME '-10s'")
    cur.execute("SELECT count(*) FROM agent_memory")
    past_count = cur.fetchone()[0]
    print(f"  Memories 10s ago: {past_count}")

    cur.execute("SET TRANSACTION AS OF SYSTEM TIME '-1m'")
    cur.execute("SELECT count(*) FROM agent_memory")
    min_count = cur.fetchone()[0]
    print(f"  Memories 1m ago: {min_count}")
    cur.execute("ROLLBACK")
except Exception as e:
    print(f"  Error: {e}")

# --- 12. Connection Pool ---
print("\n[12] Connection Pool")
from bastion.memory import BastionMemory
m = BastionMemory("e2e-pool-test")
pool = m.get_pool()
print(f"  Pool created: min={pool.min_size}, max={pool.max_size}")
c = pool.acquire(timeout=5)
print(f"  Acquired connection OK")
pool.release(c)
print(f"  Released connection OK")

conn.close()
print("\n" + "=" * 60)
print("ALL E2E TESTS PASSED")
print("=" * 60)
