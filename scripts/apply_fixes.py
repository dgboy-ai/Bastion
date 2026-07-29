"""Apply RLS fixes and create CDC changefeeds on live CockroachDB."""

import sys

import psycopg

sys.path.insert(0, "src")
from bastion.config import get_settings, reset_settings

reset_settings()
settings = get_settings()

conn = psycopg.connect(settings.connection_string, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor()

print("=" * 60)
print("APPLYING RLS & CDC FIXES")
print("=" * 60)

errors = []


def run_sql(label, sql):
    try:
        cur.execute(sql)
        print(f"  OK: {label}")
        return True
    except Exception as e:
        msg = str(e).split("\n")[0]
        print(f"  WARN: {label} — {msg}")
        errors.append((label, msg))
        return False


# ============================================================
# PART 1: Missing Tables
# ============================================================
print("\n[1] Creating missing tables")

run_sql(
    "agent_keys table",
    """
CREATE TABLE IF NOT EXISTS agent_keys (
    agent_id STRING PRIMARY KEY,
    encrypted_dek BYTES NOT NULL,
    kms_key_id STRING NOT NULL,
    key_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    rotated_at TIMESTAMPTZ,
    previous_key_version INT
)
""",
)

run_sql("agent_keys index", "CREATE INDEX IF NOT EXISTS idx_agent_keys_kms ON agent_keys (kms_key_id)")

run_sql(
    "agent_keys previous_encrypted_dek column",
    "ALTER TABLE agent_keys ADD COLUMN IF NOT EXISTS previous_encrypted_dek BYTES",
)

run_sql(
    "push_notification_log table",
    """
CREATE TABLE IF NOT EXISTS push_notification_log (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    callback_url STRING NOT NULL,
    status STRING NOT NULL,
    payload JSONB,
    delivery_attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    last_status_code INT,
    last_error STRING,
    next_retry_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
)
""",
)

run_sql(
    "push_notification_log pending index",
    "CREATE INDEX IF NOT EXISTS idx_push_notif_pending ON push_notification_log (next_retry_at) WHERE delivered_at IS NULL AND next_retry_at IS NOT NULL",
)

run_sql(
    "push_notification_log task index",
    "CREATE INDEX IF NOT EXISTS idx_push_notif_task ON push_notification_log (task_id)",
)

# ============================================================
# PART 2: RLS Policies
# ============================================================
print("\n[2] Applying RLS policies")

# agent_memory
run_sql("agent_memory ENABLE RLS", "ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY")
run_sql("agent_memory FORCE RLS", "ALTER TABLE agent_memory FORCE ROW LEVEL SECURITY")
run_sql("agent_memory drop old policy", "DROP POLICY IF EXISTS agent_memory_isolation ON agent_memory")
run_sql(
    "agent_memory isolation policy",
    """
CREATE POLICY agent_memory_isolation ON agent_memory
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true))
""",
)

# agent_keys
run_sql("agent_keys ENABLE RLS", "ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY")
run_sql("agent_keys FORCE RLS", "ALTER TABLE agent_keys FORCE ROW LEVEL SECURITY")
run_sql("agent_keys drop old policy", "DROP POLICY IF EXISTS agent_keys_isolation ON agent_keys")
run_sql(
    "agent_keys isolation policy",
    """
CREATE POLICY agent_keys_isolation ON agent_keys
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true))
""",
)

# agent_entities — recreate with WITH CHECK
run_sql("agent_entities ENABLE RLS", "ALTER TABLE agent_entities ENABLE ROW LEVEL SECURITY")
run_sql("agent_entities FORCE RLS", "ALTER TABLE agent_entities FORCE ROW LEVEL SECURITY")
run_sql("agent_entities drop old policy", "DROP POLICY IF EXISTS agent_entities_isolation ON agent_entities")
run_sql(
    "agent_entities isolation policy",
    """
CREATE POLICY agent_entities_isolation ON agent_entities
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true))
""",
)

# agent_relations — recreate with WITH CHECK
run_sql("agent_relations ENABLE RLS", "ALTER TABLE agent_relations ENABLE ROW LEVEL SECURITY")
run_sql("agent_relations FORCE RLS", "ALTER TABLE agent_relations FORCE ROW LEVEL SECURITY")
run_sql("agent_relations drop old policy", "DROP POLICY IF EXISTS agent_relations_isolation ON agent_relations")
run_sql(
    "agent_relations isolation policy",
    """
CREATE POLICY agent_relations_isolation ON agent_relations
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true))
""",
)

# a2a_tasks
run_sql("a2a_tasks ENABLE RLS", "ALTER TABLE a2a_tasks ENABLE ROW LEVEL SECURITY")
run_sql("a2a_tasks FORCE RLS", "ALTER TABLE a2a_tasks FORCE ROW LEVEL SECURITY")
run_sql("a2a_tasks drop old policy", "DROP POLICY IF EXISTS a2a_tasks_isolation ON a2a_tasks")
run_sql(
    "a2a_tasks isolation policy",
    """
CREATE POLICY a2a_tasks_isolation ON a2a_tasks
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true))
""",
)

# thought_graph
run_sql("thought_graph ENABLE RLS", "ALTER TABLE thought_graph ENABLE ROW LEVEL SECURITY")
run_sql("thought_graph FORCE RLS", "ALTER TABLE thought_graph FORCE ROW LEVEL SECURITY")
run_sql("thought_graph drop old policy", "DROP POLICY IF EXISTS thought_graph_isolation ON thought_graph")
run_sql(
    "thought_graph isolation policy",
    """
CREATE POLICY thought_graph_isolation ON thought_graph
    USING (agent_id = current_setting('app.current_agent_id', true))
    WITH CHECK (agent_id = current_setting('app.current_agent_id', true))
""",
)

# ============================================================
# PART 3: CDC Changefeeds
# ============================================================
print("\n[3] Creating CDC changefeeds")

# Use memory sink for demo (no Kafka dependency)
run_sql(
    "cdc_agent_memory changefeed",
    """
CREATE CHANGEFEED cdc_agent_memory
INTO 'memory://cdc_agent_memory'
WITH updated, resolved, on_error=resume, initial_scan='no'
FOR TABLE agent_memory
""",
)

run_sql(
    "cdc_agent_audit changefeed",
    """
CREATE CHANGEFEED cdc_agent_audit
INTO 'memory://cdc_agent_audit'
WITH updated, resolved, on_error=resume, initial_scan='no'
FOR TABLE agent_audit
""",
)

run_sql(
    "cdc_a2a_tasks changefeed",
    """
CREATE CHANGEFEED cdc_a2a_tasks
INTO 'memory://cdc_a2a_tasks'
WITH updated, resolved, on_error=resume, initial_scan='no'
FOR TABLE a2a_tasks
""",
)

# ============================================================
# VERIFICATION
# ============================================================
print("\n[4] Verification")

# Check RLS
cur.execute("""
    SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public' AND c.relrowsecurity = true
    ORDER BY c.relname
""")
rls_tables = cur.fetchall()
print(f"  Tables with RLS enabled: {len(rls_tables)}")
for name, _rls, force in rls_tables:
    print(f"    {name}: FORCE={'yes' if force else 'no'}")

# Check policies
cur.execute("SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename")
policies = cur.fetchall()
print(f"  Total RLS policies: {len(policies)}")
for table, policy in policies:
    print(f"    {table}.{policy}")

# Check changefeeds
try:
    cur.execute("SHOW CHANGEFEED JOBS")
    cols = [d[0] for d in cur.description]
    feeds = cur.fetchall()
    print(f"  Active changefeeds: {len(feeds)}")
    for row in feeds:
        info = dict(zip(cols, row, strict=False))
        print(f"    Job {info.get('job_id', '?')}: {info.get('description', '?')[:60]}")
except Exception as e:
    print(f"  Changefeed check error: {e}")

# Check new tables
for t in ["agent_keys", "push_notification_log"]:
    cur.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = %s AND table_schema = 'public'", (t,)
    )
    exists = cur.fetchone()[0] > 0
    print(f"  {t}: {'OK' if exists else 'MISSING'}")

print(f"\n  Errors: {len(errors)}")
for label, msg in errors:
    print(f"    {label}: {msg}")

conn.close()
print("\n" + "=" * 60)
print("DONE")
print("=" * 60)
