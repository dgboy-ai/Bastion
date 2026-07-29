"""Check OWASP data in database."""

import psycopg

CONN = "postgresql://among:CRDB_PASSWORD_REMOVED@bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require"


def main():
    conn = psycopg.connect(CONN)
    cur = conn.cursor()

    print("=== AGENT_AUDIT TABLE ===")
    cur.execute("SELECT COUNT(*) FROM agent_audit")
    print(f"Total audit entries: {cur.fetchone()[0]}")

    cur.execute("SELECT action, COUNT(*) FROM agent_audit GROUP BY action ORDER BY COUNT(*) DESC LIMIT 10")
    print("Actions:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")

    print()
    print("=== POISON ATTEMPT MEMORIES ===")
    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'poison_attempt'")
    print(f"Total poison_attempt memories: {cur.fetchone()[0]}")

    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'healed'")
    print(f"Total healed memories: {cur.fetchone()[0]}")

    print()
    print("=== AUDIT ENTRIES WITH BLOCK/SECURITY ===")
    cur.execute("SELECT COUNT(*) FROM agent_audit WHERE action LIKE '%block%' OR action LIKE '%security%'")
    print(f"Blocked/security audit entries: {cur.fetchone()[0]}")

    cur.execute(
        "SELECT action, COUNT(*) FROM agent_audit WHERE action LIKE '%guard%' OR action LIKE '%block%' OR action LIKE '%security%' OR action LIKE '%inject%' GROUP BY action"
    )
    print("Guard/block/security/inject actions:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")

    print()
    print("=== ALL AUDIT ACTIONS ===")
    cur.execute("SELECT DISTINCT action FROM agent_audit ORDER BY action")
    for row in cur.fetchall():
        print(f"  {row[0]}")

    conn.close()


if __name__ == "__main__":
    main()
