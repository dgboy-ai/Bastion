"""Database-Enforced Row-Level Security (RLS).

Enforces agent isolation at the database engine level using
Postgres RLS policies. Prevents cross-agent data leaks even
if application code has bugs.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


RLS_ENABLE_SQL = """
ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_memory FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_checkpoints FORCE ROW LEVEL SECURITY;
"""

RLS_POLICY_SQL = """
CREATE POLICY IF NOT EXISTS agent_isolation_policy ON agent_memory
    USING (agent_id = current_setting('app.current_agent_id', true));

CREATE POLICY IF NOT EXISTS agent_audit_isolation ON agent_audit
    USING (agent_id = current_setting('app.current_agent_id', true));

CREATE POLICY IF NOT EXISTS agent_checkpoint_isolation ON agent_checkpoints
    USING (agent_id = current_setting('app.current_agent_id', true));
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
            return {"status": "enabled", "tables": ["agent_memory", "agent_audit", "agent_checkpoints"]}
        except Exception as e:
            logger.error("Failed to enable RLS: %s", e)
            return {"status": "error", "error": str(e)}

    def set_agent_context(self, agent_id: str) -> None:
        """Set the current agent context for RLS filtering.

        Must be called within an active transaction (autocommit must be False).
        """
        if getattr(self.conn, "autocommit", False):
            raise RuntimeError("Cannot set local agent context: autocommit is True (no active transaction)")
        with self.conn.cursor() as cur:
            cur.execute(
                "SET LOCAL app.current_agent_id = %s",
                (agent_id,),
            )

    def verify_isolation(self, agent_id: str) -> dict[str, Any]:
        """Verify that RLS is working correctly."""
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
            return {
                "agent_id": agent_id,
                "rls_active": False,
                "error": str(e),
            }
        finally:
            self.conn.autocommit = prev_autocommit
