"""Full dashboard vs database verification."""
import psycopg

CONN = "postgresql://among:CRDB_PASSWORD_REMOVED@bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb?sslmode=require"

def main():
    conn = psycopg.connect(CONN)
    cur = conn.cursor()

    print("=" * 70)
    print("  FULL DASHBOARD vs COCKROACHDB VERIFICATION")
    print("=" * 70)
    print()

    # ── 1. TOP KPI CARDS ──
    print("  TOP KPI CARDS:")
    print("  " + "-" * 50)

    cur.execute("SELECT COUNT(*) FROM agent_memory")
    total_memories = cur.fetchone()[0]
    print(f"  Total Memories:        DB={total_memories}  Dashboard=863  [{'MATCH' if total_memories == 863 else 'MISMATCH'}]")

    cur.execute("SELECT COUNT(*) FROM agent_entities")
    entities = cur.fetchone()[0]
    print(f"  Extracted Entities:    DB={entities}  Dashboard=34   [{'MATCH' if entities == 34 else 'MISMATCH'}]")

    cur.execute("SELECT COUNT(*) FROM agent_relations")
    relations = cur.fetchone()[0]
    print(f"  Identified Relations:  DB={relations}  Dashboard=17   [{'MATCH' if relations == 17 else 'MISMATCH'}]")

    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'poison_attempt'")
    owasp = cur.fetchone()[0]
    print(f"  OWASP Defended:        DB={owasp}  Dashboard=12   [{'MATCH (FIXED)' if owasp == 12 else 'DB=' + str(owasp)}]")
    print()

    # ── 2. TRUST INDEX ──
    print("  TRUST INDEX:")
    print("  " + "-" * 50)

    cur.execute("SELECT AVG(importance_score) FROM agent_memory")
    avg_importance = float(cur.fetchone()[0] or 0)
    print(f"  Avg Importance Score:  DB={avg_importance:.2f}")

    cur.execute("SELECT trust_level, COUNT(*) FROM agent_memory GROUP BY trust_level ORDER BY trust_level")
    trust_dist = cur.fetchall()
    print("  Trust Level Distribution:")
    total_trust = sum(cnt for _, cnt in trust_dist)
    danger_count = 0
    for level, cnt in trust_dist:
        pct = (cnt / total_trust * 100) if total_trust > 0 else 0
        danger_label = " (DANGER)" if level == 0 else ""
        print(f"    Level {level}: {cnt} ({pct:.1f}%){danger_label}")
        if level == 0:
            danger_count = cnt
    print(f"  Danger Count (Level 0): {danger_count}")
    print()

    # ── 3. HEALTH METRICS ──
    print("  HEALTH METRICS:")
    print("  " + "-" * 50)

    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE is_pinned = true")
    pinned = cur.fetchone()[0]
    print(f"  Pinned Memories:       {pinned}")

    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE created_at > NOW() - INTERVAL '7 days'")
    recent_7d = cur.fetchone()[0]
    print(f"  Memories (last 7 days): {recent_7d}")

    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE created_at > NOW() - INTERVAL '30 days'")
    recent_30d = cur.fetchone()[0]
    print(f"  Memories (last 30 days): {recent_30d}")

    cur.execute("SELECT AVG(access_count) FROM agent_memory")
    avg_access = float(cur.fetchone()[0] or 0)
    print(f"  Avg Access Count:      {avg_access:.2f}")
    print()

    # ── 4. MEMORY TYPES ──
    print("  MEMORY TYPES:")
    print("  " + "-" * 50)

    cur.execute("SELECT memory_type, COUNT(*) FROM agent_memory GROUP BY memory_type ORDER BY COUNT(*) DESC")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")
    print()

    # ── 5. AGENTS ──
    print("  TOP AGENTS:")
    print("  " + "-" * 50)

    cur.execute("SELECT agent_id, COUNT(*) FROM agent_memory GROUP BY agent_id ORDER BY COUNT(*) DESC LIMIT 10")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")
    print()

    # ── 6. AUDIT LOGS ──
    print("  AUDIT LOGS:")
    print("  " + "-" * 50)

    cur.execute("SELECT COUNT(*) FROM agent_audit")
    audit_count = cur.fetchone()[0]
    print(f"  Total Audit Entries:   {audit_count}")

    cur.execute("SELECT action, COUNT(*) FROM agent_audit GROUP BY action ORDER BY COUNT(*) DESC")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")
    print()

    # ── 7. A2A TASKS ──
    print("  A2A TASKS:")
    print("  " + "-" * 50)

    cur.execute("SELECT COUNT(*) FROM a2a_tasks")
    tasks = cur.fetchone()[0]
    print(f"  Total Tasks:           {tasks}")

    if tasks > 0:
        cur.execute("SELECT status, COUNT(*) FROM a2a_tasks GROUP BY status ORDER BY COUNT(*) DESC")
        for row in cur.fetchall():
            print(f"    {row[0]}: {row[1]}")
    print()

    # ── 8. KNOWLEDGE GRAPH ──
    print("  KNOWLEDGE GRAPH:")
    print("  " + "-" * 50)

    cur.execute("SELECT COUNT(*) FROM agent_entities")
    ent_count = cur.fetchone()[0]
    print(f"  Total Entities:        {ent_count}")

    cur.execute("SELECT COUNT(*) FROM agent_relations")
    rel_count = cur.fetchone()[0]
    print(f"  Total Relations:       {rel_count}")

    # Entity types
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_entities' ORDER BY ordinal_position")
    ent_cols = [r[0] for r in cur.fetchall()]
    print(f"  Entity columns:        {ent_cols}")

    # Relation types
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_relations' ORDER BY ordinal_position")
    rel_cols = [r[0] for r in cur.fetchall()]
    print(f"  Relation columns:      {rel_cols}")
    print()

    # ── 9. CIRCUIT BREAKER / HEALTH ──
    print("  SYSTEM HEALTH:")
    print("  " + "-" * 50)

    # Check for any error logs
    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'error_log'")
    errors = cur.fetchone()[0]
    print(f"  Error Logs:            {errors}")

    # Check for healed memories
    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'healed'")
    healed = cur.fetchone()[0]
    print(f"  Healed Memories:       {healed}")

    # Check for contradictions
    cur.execute("SELECT COUNT(*) FROM agent_memory WHERE memory_type = 'contradiction'")
    contradictions = cur.fetchone()[0]
    print(f"  Contradictions:        {contradictions}")
    print()

    # ── 10. RECENT ACTIVITY ──
    print("  RECENT 5 MEMORIES:")
    print("  " + "-" * 50)

    cur.execute(
        "SELECT LEFT(memory_id::text, 16), agent_id, memory_type, "
        "LEFT(content, 50), created_at::text "
        "FROM agent_memory ORDER BY created_at DESC LIMIT 5"
    )
    for row in cur.fetchall():
        ts = row[4][:19] if row[4] else "N/A"
        print(f"    {row[0]}... | {row[1]} | {row[2]} | {row[3]}... | {ts}")

    conn.close()
    print()
    print("=" * 70)
    print("  VERIFICATION COMPLETE")
    print("=" * 70)

if __name__ == "__main__":
    main()
