import psycopg2, os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))
conn = psycopg2.connect(os.environ['BASTION_CONN'])
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM agent_memory")
print("MEMORIES SECURED (agent_memory count):", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'poison_attempt'")
print("THREATS BLOCKED (poison_attempt count):", cur.fetchone()[0])

cur.execute("SELECT AVG(importance_score) FROM agent_memory")
avg = cur.fetchone()[0]
print(f"AVG importance_score raw: {avg}  ->  displayed trustScore (avg/10*100): {round((avg/10)*100)}")

cur.execute("SELECT memory_type, COUNT(*) FROM agent_memory GROUP BY memory_type ORDER BY COUNT(*) DESC")
print("\nmemory_type distribution:")
for r in cur.fetchall():
    print(f"  {r[0]}: {r[1]}")

cur.close()
conn.close()
