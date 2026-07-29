"""Verify dashboard data matches CockroachDB."""

import psycopg

CONN = "postgresql://among:yIxLBZOZKwEw6-WwPq_54w@bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require"


def main():
    conn = psycopg.connect(CONN)
    cur = conn.cursor()

    print("=" * 60)
    print("  COCKROACHDB vs DASHBOARD DATA VERIFICATION")
    print("=" * 60)
    print()

    # 1. Total Memories
    cur.execute("SELECT COUNT(*) FROM agent_memory")
    total = cur.fetchone()[0]
    match = "MATCH" if total == 863 else "MISMATCH"
    print(f"  Total Memories:     DB={total}  Dashboard=863  [{match}]")

    # 2. Entities
    cur.execute("SELECT COUNT(*) FROM agent_entities")
    entities = cur.fetchone()[0]
    match = "MATCH" if entities == 34 else "MISMATCH"
    print(f"  Extracted Entities: DB={entities}  Dashboard=34  [{match}]")

    # 3. Relations
    cur.execute("SELECT COUNT(*) FROM agent_relations")
    relations = cur.fetchone()[0]
    match = "MATCH" if relations == 17 else "MISMATCH"
    print(f"  Identified Relations: DB={relations}  Dashboard=17  [{match}]")

    # 4. OWASP Attacks (metadata containing guard/scan keywords)
    cur.execute(
        "SELECT COUNT(*) FROM agent_memory "
        "WHERE metadata::text ILIKE %s OR metadata::text ILIKE %s OR metadata::text ILIKE %s",
        ("%injection%", "%attack%", "%blocked%"),
    )
    attacks = cur.fetchone()[0]
    print(f"  OWASP Defended:     DB=~{attacks}  Dashboard=12")
    print()

    # 5. Memories by agent
    cur.execute("SELECT agent_id, COUNT(*) FROM agent_memory GROUP BY agent_id ORDER BY COUNT(*) DESC LIMIT 10")
    print("  MEMORIES BY AGENT:")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")
    print()

    # 6. Memories by type
    cur.execute("SELECT memory_type, COUNT(*) FROM agent_memory GROUP BY memory_type ORDER BY COUNT(*) DESC")
    print("  MEMORIES BY TYPE:")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")
    print()

    # 7. Pinned
    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE is_pinned = true")
    pinned = cur.fetchone()[0]
    print(f"  Pinned Memories: {pinned}")

    # 8. Importance scores
    cur.execute("SELECT AVG(importance_score), MIN(importance_score), MAX(importance_score) FROM agent_memory")
    avg, mn, mx = cur.fetchone()
    print(f"  Importance Score: avg={avg:.1f} min={mn:.1f} max={mx:.1f}")

    # 9. Trust levels
    cur.execute("SELECT trust_level, COUNT(*) FROM agent_memory GROUP BY trust_level ORDER BY trust_level")
    print()
    print("  TRUST LEVELS:")
    for row in cur.fetchall():
        print(f"    Level {row[0]}: {row[1]} memories")

    # 10. Recent 5
    cur.execute(
        "SELECT LEFT(memory_id::text, 16), agent_id, memory_type, "
        "LEFT(content, 50), created_at::text "
        "FROM agent_memory ORDER BY created_at DESC LIMIT 5"
    )
    print()
    print("  RECENT 5 MEMORIES:")
    for row in cur.fetchall():
        ts = row[4][:19] if row[4] else "N/A"
        print(f"    {row[0]}... | {row[1]} | {row[2]} | {row[3]}... | {ts}")

    # 11. A2A Tasks
    cur.execute("SELECT COUNT(*) FROM a2a_tasks")
    tasks = cur.fetchone()[0]
    print(f"\n  A2A Tasks: {tasks}")

    cur.execute("SELECT status, COUNT(*) FROM a2a_tasks GROUP BY status ORDER BY COUNT(*) DESC")
    print("  Tasks by Status:")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")

    # 12. Graph stats
    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_entities' ORDER BY ordinal_position"
    )
    entity_cols = [r[0] for r in cur.fetchall()]
    name_col = next((c for c in entity_cols if "name" in c.lower()), entity_cols[0] if entity_cols else None)
    if name_col:
        cur.execute(f"SELECT COUNT(DISTINCT {name_col}) FROM agent_entities")
        entity_names = cur.fetchone()[0]
        print(f"\n  Unique Entity Names: {entity_names}")
    else:
        print(f"\n  Entity columns: {entity_cols}")

    cur.execute(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_relations' ORDER BY ordinal_position"
    )
    rel_cols = [r[0] for r in cur.fetchall()]
    print(f"  Relation columns: {rel_cols}")

    cur.execute("SELECT COUNT(*) FROM agent_relations")
    rel_count = cur.fetchone()[0]
    print(f"  Total Relations: {rel_count}")

    conn.close()
    print()
    print("=" * 60)
    print("  VERIFICATION COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()
