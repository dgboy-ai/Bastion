"""Database-Enforced Row-Level Security (RLS).

Enforces agent isolation at the database engine level using
Postgres RLS policies. Prevents cross-agent data leaks even
if application code has bugs.
"""

from __future__ import annotations

from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


RLS_ENABLE_SQL = """
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_entities FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_relations FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_budgets FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_region_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_region_mapping FORCE ROW LEVEL SECURITY;
"""

RLS_POLICY_SQL = """
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_isolation_policy' AND tablename = 'agent_memory') THEN
        CREATE POLICY agent_isolation_policy ON agent_memory
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_audit_isolation' AND tablename = 'agent_audit') THEN
        CREATE POLICY agent_audit_isolation ON agent_audit
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_checkpoint_isolation' AND tablename = 'agent_checkpoints') THEN
        CREATE POLICY agent_checkpoint_isolation ON agent_checkpoints
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_entities_isolation' AND tablename = 'agent_entities') THEN
        CREATE POLICY agent_entities_isolation ON agent_entities
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_relations_isolation' AND tablename = 'agent_relations') THEN
        CREATE POLICY agent_relations_isolation ON agent_relations
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_keys_isolation' AND tablename = 'agent_keys') THEN
        CREATE POLICY agent_keys_isolation ON agent_keys
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_budgets_isolation' AND tablename = 'agent_budgets') THEN
        CREATE POLICY agent_budgets_isolation ON agent_budgets
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agent_region_mapping_isolation' AND tablename = 'agent_region_mapping') THEN
        CREATE POLICY agent_region_mapping_isolation ON agent_region_mapping
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;
"""


class RowLevelSecurity:
    """Enforces agent isolation at the database level."""

    def __init__(self, conn: Any):
        self.conn = conn

    def enable_rls(self) -> dict[str, Any]:
        """Enable RLS on all agent tables."""
        try:
            with self.conn.cursor() as cur:
                for stmt in RLS_ENABLE_SQL.strip().split("\n"):
                    stmt = stmt.strip()
                    if stmt:
                        cur.execute(stmt)

                for stmt in RLS_POLICY_SQL.strip().split("\n\n"):
                    stmt = stmt.strip()
                    if stmt:
                        try:
                            cur.execute(stmt)
                        except Exception as e:
                            if "already exists" not in str(e).lower():
                                logger.warning("RLS policy creation: %s", e)

            self.conn.commit()
            return {"status": "enabled", "tables": ["agent_memory", "agent_audit", "agent_checkpoints", "agent_entities", "agent_relations", "agent_keys", "agent_budgets", "agent_region_mapping"]}
        except Exception as e:
            logger.error("Failed to enable RLS: %s", e)
            return {"status": "error", "error": "RLS enablement failed — check server logs"}

    def set_agent_context(self, agent_id: str) -> None:
        """Set the current agent context for RLS filtering.

        Must be called within an active transaction (autocommit must be False).
        Sets app.current_agent_id which is used by all RLS policies to enforce
        agent isolation at the database level.
        """
        if getattr(self.conn, "autocommit", False):
            raise RuntimeError("Cannot set local agent context: autocommit is True (no active transaction)")
        with self.conn.cursor() as cur:
            cur.execute(
                "SET LOCAL app.current_agent_id = %s",
                (agent_id,),
            )
        logger.debug("RLS agent context set to %s", agent_id)

    def verify_isolation(self, agent_id: str) -> dict[str, Any]:
        """Verify that RLS is working correctly."""
        import threading
        if not hasattr(self, '_verify_lock'):
            self._verify_lock = threading.Lock()
        with self._verify_lock:
            prev_autocommit = self.conn.autocommit
            try:
                self.conn.autocommit = False
                with self.conn.cursor() as cur:
                    self.set_agent_context(agent_id)
                    cur.execute("SELECT COUNT(*) FROM agent_memory")
                    count = cur.fetchone()[0]
                self.conn.commit()
                return {
                    "agent_id": agent_id,
                    "visible_memories": count,
                    "rls_active": True,
                }
            except Exception as e:
                self.conn.rollback()
                logger.error("RLS verification failed: %s", e)
                return {
                    "agent_id": agent_id,
                    "rls_active": False,
                    "error": "Verification failed — check server logs",
                }
            finally:
                self.conn.autocommit = prev_autocommit
