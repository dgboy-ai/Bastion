import os
import psycopg2
from dotenv import load_dotenv

def main():
    load_dotenv(dotenv_path=".env.local", override=True)
    conn_str = os.environ.get("BASTION_CONN", "")
    if not conn_str:
        print("BASTION_CONN not found")
        return
        
    print(f"Connecting to live database...")
    try:
        conn = psycopg2.connect(conn_str)
    except Exception as e:
        print(f"Connection failed: {e}")
        return
        
    # Get a sample entity ID
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT entity_id, name FROM agent_entities LIMIT 1")
            row = cur.fetchone()
            if not row:
                print("No entities found in agent_entities. Make sure agent has run.")
                return
            entity_id = row[0]
            entity_name = row[1]
            print(f"Testing query with entity_id: {entity_id} ({entity_name})")
            
            # Execute the exact Next.js query
            query = """
            SELECT DISTINCT m.memory_id, m.content, m.cryptographic_hash, m.previous_hash, m.created_at, m.importance_score
            FROM agent_memory m
            JOIN agent_relations r ON r.source_memory_id = m.memory_id
            WHERE r.source_entity_id = %s OR r.target_entity_id = %s
            ORDER BY m.created_at DESC
            LIMIT 20 OFFSET 0
            """
            
            cur.execute(query, (entity_id, entity_id))
            rows = cur.fetchall()
            print(f"Query succeeded! Returned {len(rows)} rows.")
    except Exception as e:
        print("Query failed!")
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
