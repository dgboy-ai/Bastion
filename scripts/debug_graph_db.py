import os
import psycopg
from dotenv import load_dotenv

load_dotenv(".env.local")
conn_str = os.environ.get("BASTION_CONN")
print(f"Connecting to: {conn_str[:50]}...")

try:
    with psycopg.connect(conn_str) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM agent_entities")
            entities = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM agent_relations")
            relations = cur.fetchone()[0]
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
