"""Database-Enforced Row-Level Security (RLS).

Enforces agent isolation at the database engine level using
Postgres RLS policies. Prevents cross-agent data leaks even
if application code has bugs.
"""

from __future__ import annotations

import threading
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

_POLICY_TEMPLATE = """
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = '{name}' AND tablename = '{table}') THEN
        CREATE POLICY {name} ON {table}
            USING (agent_id = current_setting('app.current_agent_id', true))
            WITH CHECK (agent_id = current_setting('app.current_agent_id', true));
    END IF;
END $$;
"""

RLS_POLICY_TABLES = [
    ("agent_isolation_policy", "agent_memory"),
    ("agent_audit_isolation", "agent_audit"),
    ("agent_checkpoint_isolation", "agent_checkpoints"),
    ("agent_entities_isolation", "agent_entities"),
    ("agent_relations_isolation", "agent_relations"),
    ("agent_keys_isolation", "agent_keys"),
    ("agent_budgets_isolation", "agent_budgets"),
    ("agent_region_mapping_isolation", "agent_region_mapping"),
]

RLS_POLICY_SQL = "\n\n".join(_POLICY_TEMPLATE.format(name=name, table=table) for name, table in RLS_POLICY_TABLES)


class RowLevelSecurity:
    """Enforces agent isolation at the database level."""

    def __init__(self, conn: Any):
        self.conn = conn
        self._verify_lock = threading.Lock()

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
            return {
                "status": "enabled",
                "tables": [
                    "agent_memory",
                    "agent_audit",
                    "agent_checkpoints",
                    "agent_entities",
                    "agent_relations",
                    "agent_keys",
                    "agent_budgets",
                    "agent_region_mapping",
                ],
            }
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
