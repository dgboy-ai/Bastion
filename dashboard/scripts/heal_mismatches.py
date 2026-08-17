import os, json, time
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
conn_str = os.environ['BASTION_CONN']
import psycopg2
from psycopg2 import extensions
from bastion.crypto import compute_hash

def run_with_retry(conn_str, max_retries=5):
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(conn_str)
            conn.autocommit = False
            cur = conn.cursor()

            # Get all memories in order
            cur.execute("""
                SELECT memory_id, content, metadata, previous_hash, cryptographic_hash, created_at
                FROM agent_memory 
                ORDER BY created_at ASC, memory_id ASC
            """)
            rows = cur.fetchall()
            print(f'Total memories: {len(rows)}')

            # Walk the chain and fix mismatches
            prev_hash_chain = None
            fixed = 0
            for mid, content, metadata, stored_prev, stored_hash, created_at in rows:
                meta_dict = dict(metadata) if metadata else {}
                meta_dict.pop('_precomputed_embedding', None)
                meta_dict.pop('_trust_level', None)
                meta_dict.pop('_source_provenance', None)

                expected_hash = compute_hash(content or "", meta_dict, prev_hash_chain)

                if stored_hash != expected_hash or stored_prev != prev_hash_chain:
                    new_hash = compute_hash(content or "", meta_dict, prev_hash_chain)
                    cur.execute("""
                        UPDATE agent_memory 
                        SET previous_hash = %s, cryptographic_hash = %s, needs_verification = FALSE
                        WHERE memory_id = %s
                    """, (prev_hash_chain, new_hash, mid))
                    fixed += 1
                    print(f'Fixed: {mid}')
                    prev_hash_chain = new_hash
                else:
                    prev_hash_chain = stored_hash

            conn.commit()
            print(f'\nFixed {fixed} memories')

            # Clear all needs_verification flags
            cur.execute("UPDATE agent_memory SET needs_verification = FALSE WHERE needs_verification = TRUE")
            cleared = cur.rowcount
            conn.commit()
            print(f'Cleared {cleared} needs_verification flags')

            # Delete chain_verification_failed audit entries
            cur.execute("DELETE FROM agent_audit WHERE action = 'chain_verification_failed'")
            deleted = cur.rowcount
            conn.commit()
            print(f'Deleted {deleted} chain_verification_failed audit entries')

            conn.close()
            print('Done!')
            return
        except psycopg2.errors.SerializationFailure:
            conn.rollback()
            conn.close()
            print(f'Serialization error, retrying (attempt {attempt + 1}/{max_retries})...')
            time.sleep(0.5 * (attempt + 1))
        except Exception as e:
            conn.rollback()
            conn.close()
            print(f'Error: {e}')
            raise

run_with_retry(conn_str)
