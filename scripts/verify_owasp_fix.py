"""Verify OWASP count fix."""

import psycopg

CONN = "postgresql://among:yIxLBZOZKwEw6-WwPq_54w@bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require"


def main():
    conn = psycopg.connect(CONN)
    cur = conn.cursor()

    # This is what the fixed API now queries
    cur.execute("SELECT COUNT(*) as count FROM agent_memory WHERE memory_type = 'poison_attempt'")
    blocked = cur.fetchone()[0]
    print(f"OWASP Defended (poison_attempt): {blocked}")

    cur.execute("SELECT COUNT(*) as count FROM agent_memory WHERE memory_type = 'healed'")
    healed = cur.fetchone()[0]
    print(f"Healed memories: {healed}")

    cur.execute("SELECT COUNT(*) as count FROM agent_audit")
    total = cur.fetchone()[0]
    print(f"Total audit entries: {total}")

    print()
    print(f"Dashboard will now show: {blocked} OWASP Defended Attacks")
    print("(Previously showed hardcoded 12)")

    conn.close()


if __name__ == "__main__":
    main()
