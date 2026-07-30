import os
import psycopg
from dotenv import load_dotenv

load_dotenv(".env.local")
conn_str = os.environ.get("BASTION_CONN", "")
if not conn_str:
    print("Error: BASTION_CONN environment variable not set")
    import sys
    sys.exit(1)
print(f"Connecting to: {conn_str[:50]}...")

try:
    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM agent_entities")
            row_entities = cur.fetchone()
            entities = row_entities[0] if row_entities else 0
            cur.execute("SELECT COUNT(*) FROM agent_relations")
            row_relations = cur.fetchone()
            relations = row_relations[0] if row_relations else 0
            print(f"Entities: {entities}, Relations: {relations}")
            
            if entities > 0:
                cur.execute("SELECT entity_id, name, entity_type FROM agent_entities LIMIT 5")
                print("Entities Sample:")
                for r in cur.fetchall():
                    print(r)
            if relations > 0:
                cur.execute("SELECT relation_id, source_entity_id, target_entity_id, relation_type FROM agent_relations LIMIT 5")
                print("Relations Sample:")
                for r in cur.fetchall():
                    print(r)
except Exception as e:
    print(f"Error: {e}")
