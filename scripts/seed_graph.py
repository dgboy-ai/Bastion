import psycopg
import uuid
from datetime import datetime, timezone

CONN = "postgresql://divyansh:7_GfcNnRnL6UaflljIzOIw@bastion-memory-28736.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"

conn = psycopg.connect(CONN)
cur = conn.cursor()

# Clear existing entries
cur.execute("DELETE FROM agent_relations")
cur.execute("DELETE FROM agent_entities")
conn.commit()

# Generate UUIDs
alice_id = str(uuid.uuid4())
bob_id = str(uuid.uuid4())
rust_id = str(uuid.uuid4())
nextjs_id = str(uuid.uuid4())
agent_id = "demo-agent"

# Insert Entities
entities = [
    (alice_id, agent_id, "person", "Alice", '{"role": "Lead Systems Architect"}'),
    (bob_id, agent_id, "person", "Bob", '{"role": "Senior Frontend Developer"}'),
    (rust_id, agent_id, "technology", "Rust", '{"paradigm": "Systems Programming"}'),
    (nextjs_id, agent_id, "technology", "Next.js", '{"category": "Frontend Framework"}'),
]

for eid, aid, etype, name, attrs in entities:
    cur.execute(
        "INSERT INTO agent_entities (entity_id, agent_id, entity_type, name, attributes) VALUES (%s, %s, %s, %s, %s)",
        (eid, aid, etype, name, attrs)
    )

# Insert Relations
relations = [
    (str(uuid.uuid4()), agent_id, alice_id, rust_id, "works_on", 0.95),
    (str(uuid.uuid4()), agent_id, bob_id, nextjs_id, "works_on", 0.88),
    (str(uuid.uuid4()), agent_id, alice_id, bob_id, "collaborates", 0.90),
    (str(uuid.uuid4()), agent_id, bob_id, rust_id, "learning", 0.70),
]

for rid, aid, src, tgt, rtype, conf in relations:
    cur.execute(
        "INSERT INTO agent_relations (relation_id, agent_id, source_entity_id, target_entity_id, relation_type, confidence) VALUES (%s, %s, %s, %s, %s, %s)",
        (rid, aid, src, tgt, rtype, conf)
    )

conn.commit()
cur.close()
conn.close()

print("Graph seeded successfully with 4 nodes and 4 edges!")
