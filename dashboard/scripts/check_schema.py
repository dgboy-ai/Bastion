import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env.local'))
conn_str = os.environ['BASTION_CONN']
import psycopg2
conn = psycopg2.connect(conn_str)
cur = conn.cursor()

# Check the schema for needs_verification column
cur.execute("""
    SELECT column_name, column_default, is_nullable 
    FROM information_schema.columns 
    WHERE table_name = 'agent_memory' AND column_name = 'needs_verification'
""")
row = cur.fetchone()
if row:
    print(f'Column: {row[0]}')
    print(f'Default: {row[1]}')
    print(f'Nullable: {row[2]}')
else:
    print('Column needs_verification not found')

# Check how many memories have needs_verification = true
cur.execute("SELECT COUNT(*) FROM agent_memory WHERE needs_verification = true")
count = cur.fetchone()[0]
print(f'\nMemories with needs_verification=true: {count}')

# Check the 3 specific IDs - are they still in the DB?
cur.execute("""
    SELECT memory_id, needs_verification 
    FROM agent_memory 
    WHERE memory_id IN ('9f6f89bf-d346-496c-9959-90e2f6851006', '219c1820-26c1-45a7-9a99-4d2f8b470524', '26f5dfae-6351-4964-9cb0-a161cedf7340')
""")
print('\n=== 3 mismatch IDs status ===')
for row in cur.fetchall():
    print(f'ID: {row[0]}, needs_verification: {row[1]}')

conn.close()
