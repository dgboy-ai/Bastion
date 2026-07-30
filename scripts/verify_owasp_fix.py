"""Verify OWASP count fix."""

import os
import psycopg

CONN = os.environ.get("BASTION_CONN", "")


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
