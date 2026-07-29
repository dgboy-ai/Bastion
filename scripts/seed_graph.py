import os
import sys
import uuid

import psycopg

# Retrieve database connection URI from environment configuration to prevent leaks
CONN = os.environ.get("BASTION_CONN") or os.environ.get("DATABASE_URL")

if not CONN:
    print("ERROR: Environment variable BASTION_CONN or DATABASE_URL is not set.")
    print("Please set BASTION_CONN before executing this script.")
    sys.exit(1)

conn = psycopg.connect(CONN)
cur = conn.cursor()

# Clear existing entries to prevent overlaps
print("Clearing existing tables...")
cur.execute("DELETE FROM agent_relations")
cur.execute("DELETE FROM agent_entities")
cur.execute("DELETE FROM agent_memory WHERE agent_id = 'demo-agent'")
conn.commit()

# Generate UUIDs
alice_id = str(uuid.uuid4())
bob_id = str(uuid.uuid4())
rust_id = str(uuid.uuid4())
nextjs_id = str(uuid.uuid4())
agent_id = "demo-agent"

# Source Memory UUIDs for Cryptographic Timeline Links
mem1_id = str(uuid.uuid4())
mem2_id = str(uuid.uuid4())
mem3_id = str(uuid.uuid4())
mem4_id = str(uuid.uuid4())

# Create a mock 1024-dimension vector embedding string representation
mock_emb = "[" + ",".join(["0.0"] * 1024) + "]"

# 1. Seed Source Agent Memories with SHA256 chain signatures
memories = [
    (
        mem1_id,
        agent_id,
        "fact",
        ("Alice is the Lead Systems Architect who works on systems programming using Rust and coordinates core logic."),
        8.5,
        "a1b2c3d4e5f60101010101010101010101010101010101010101010101010101",
        None,
    ),
    (
        mem2_id,
        agent_id,
        "fact",
        ("Bob is a Senior Frontend Developer building the main operational cockpit using Next.js."),
        7.8,
        "b2c3d4e5f6a10202020202020202020202020202020202020202020202020202",
        "a1b2c3d4e5f60101010101010101010101010101010101010101010101010101",
    ),
    (
        mem3_id,
        agent_id,
        "fact",
        (
            "Alice collaborates directly with Bob to integrate backend "
            "telemetry endpoints with the cockpit dashboard UI."
        ),
        9.0,
        "c3d4e5f6a1b20303030303030303030303030303030303030303030303030303",
        "b2c3d4e5f6a10202020202020202020202020202020202020202020202020202",
    ),
    (
        mem4_id,
        agent_id,
        "fact",
        ("Bob is learning systems programming in Rust to help write efficient SDK bindings for the database layer."),
        6.5,
        "d4e5f6a1b2c30404040404040404040404040404040404040404040404040404",
        "c3d4e5f6a1b20303030303030303030303030303030303030303030303030303",
    ),
]

print("Seeding agent memories...")
for mid, aid, mtype, content, score, mhash, prev in memories:
    cur.execute(
        """INSERT INTO agent_memory (
            memory_id, agent_id, memory_type, content, importance_score,
            cryptographic_hash, previous_hash, embedding
           ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (mid, aid, mtype, content, score, mhash, prev, mock_emb),
    )

# 2. Insert Entities
entities = [
    (alice_id, agent_id, "person", "Alice", '{"role": "Lead Systems Architect"}'),
    (bob_id, agent_id, "person", "Bob", '{"role": "Senior Frontend Developer"}'),
    (rust_id, agent_id, "technology", "Rust", '{"paradigm": "Systems Programming"}'),
    (nextjs_id, agent_id, "technology", "Next.js", '{"category": "Frontend Framework"}'),
]

print("Seeding graph entities...")
for eid, aid, etype, name, attrs in entities:
    cur.execute(
        "INSERT INTO agent_entities (entity_id, agent_id, entity_type, name, attributes) VALUES (%s, %s, %s, %s, %s)",
        (eid, aid, etype, name, attrs),
    )

# 3. Insert Relations Linked to their source memories
relations = [
    (str(uuid.uuid4()), agent_id, alice_id, rust_id, "works_on", 0.95, mem1_id),
    (str(uuid.uuid4()), agent_id, bob_id, nextjs_id, "works_on", 0.88, mem2_id),
    (str(uuid.uuid4()), agent_id, alice_id, bob_id, "collaborates", 0.90, mem3_id),
    (str(uuid.uuid4()), agent_id, bob_id, rust_id, "learning", 0.70, mem4_id),
]

print("Seeding graph relations...")
for rid, aid, src, tgt, rtype, conf, mid in relations:
    cur.execute(
        """INSERT INTO agent_relations (
            relation_id, agent_id, source_entity_id, target_entity_id,
            relation_type, confidence, source_memory_id
           ) VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (rid, aid, src, tgt, rtype, conf, mid),
    )

conn.commit()
cur.close()
conn.close()

print("Database graph and source memories seeded successfully!")
