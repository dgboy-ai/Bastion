"""A2A Task Store — CockroachDB-backed task persistence for A2A protocol."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)


class A2ATaskStore:
    """Manages A2A task lifecycle in CockroachDB."""

    def __init__(self, agent_id: str, get_pool_fn: Any, is_mock_fn: Any, set_rls_context_fn: Any = None):
        self.agent_id = agent_id
        self._get_pool = get_pool_fn
        self._is_mock = is_mock_fn
        self._set_rls_context = set_rls_context_fn

    def _make_record(self, row: tuple) -> dict[str, Any]:
        return {
            "task_id": str(row[0]),
            "agent_id": row[1],
            "skill_id": row[2],
            "status": row[3],
            "callback_url": row[4],
            "artifacts": row[5],
            "created_at": row[6].isoformat() if row[6] else None,
            "completed_at": row[7].isoformat() if row[7] else None,
        }

    def store_task(
        self,
        task_id: str,
        agent_id: str,
        skill_id: str,
        status: str = "WORKING",
        callback_url: str | None = None,
    ) -> dict[str, Any]:
        """Insert a new A2A task into CockroachDB. Returns the task record."""
        if self._is_mock():
            return {
                "task_id": task_id,
                "agent_id": agent_id,
                "skill_id": skill_id,
                "status": status,
                "callback_url": callback_url,
                "artifacts": None,
                "created_at": datetime.now(UTC).isoformat(),
                "completed_at": None,
            }
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls_context:
            self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO a2a_tasks (task_id, agent_id, skill_id, status, callback_url) "
                    "VALUES (%s, %s, %s, %s, %s) "
                    "RETURNING task_id, agent_id, skill_id, status, callback_url, "
                    "artifacts, created_at, completed_at",
                    (task_id, agent_id, skill_id, status, callback_url),
                )
                row = cur.fetchone()
                conn.commit()
                if row:
                    return self._make_record(row)
                return {"task_id": task_id, "status": status}
        finally:
            pool.release(conn)

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        """Retrieve an A2A task by ID from CockroachDB."""
        if self._is_mock():
            return None
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls_context:
            self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT task_id, agent_id, skill_id, status, callback_url, "
                    "artifacts, created_at, completed_at "
                    "FROM a2a_tasks WHERE task_id = %s",
                    (task_id,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return self._make_record(row)
        finally:
            pool.release(conn)

    def update_task(
        self,
        task_id: str,
        status: str,
        artifacts: list[dict[str, Any]] | None = None,
        callback_url: str | None = None,
    ) -> dict[str, Any] | None:
        """Update task status, artifacts, and/or callback URL."""
        if self._is_mock():
            return {"task_id": task_id, "status": status}
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls_context:
            self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                completed_at = datetime.now(UTC).isoformat() if status in ("COMPLETED", "FAILED", "CANCELED") else None
                cur.execute(
                    "UPDATE a2a_tasks SET status = %s, "
                    "artifacts = COALESCE(%s, artifacts), "
                    "callback_url = COALESCE(%s, callback_url), "
                    "completed_at = COALESCE(%s, completed_at) "
                    "WHERE task_id = %s "
                    "RETURNING task_id, agent_id, skill_id, status, callback_url, artifacts, created_at, completed_at",
                    (status, json.dumps(artifacts) if artifacts else None, callback_url, completed_at, task_id),
                )
                row = cur.fetchone()
                conn.commit()
                if row:
                    return self._make_record(row)
                return {"task_id": task_id, "status": status}
        finally:
            pool.release(conn)

    def delete_task(self, task_id: str) -> bool:
        """Delete an A2A task by ID. Returns True if a row was deleted."""
        if self._is_mock():
            return False
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls_context:
            self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM a2a_tasks WHERE task_id = %s", (task_id,))
                deleted = cur.rowcount > 0
                conn.commit()
                return deleted
        finally:
            pool.release(conn)

    def list_tasks(
        self,
        agent_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        """List tasks with optional filters. Returns most recent first."""
        if self._is_mock():
            return []
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls_context:
            self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                conditions: list[str] = []
                params: list[Any] = []
                if agent_id is not None:
                    conditions.append("agent_id = %s")
                    params.append(agent_id)
                if status is not None:
                    conditions.append("status = %s")
                    params.append(status)
                where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
                sql = (
                    "SELECT task_id, agent_id, skill_id, status, callback_url, "
                    "artifacts, created_at, completed_at "
                    "FROM a2a_tasks" + where_clause + " ORDER BY created_at DESC LIMIT %s OFFSET %s"
                )
                params.extend([limit, offset])
                cur.execute(sql, params)
                return [self._make_record(row) for row in cur.fetchall()]
        finally:
            pool.release(conn)

    def cleanup_expired(self, max_age_seconds: int = 3600) -> int:
        """Delete tasks older than max_age_seconds. Returns count deleted."""
        if self._is_mock():
            return 0
        pool = self._get_pool()
        conn = pool.acquire(timeout=30.0)
        if self._set_rls_context:
            self._set_rls_context(conn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM a2a_tasks "
                    "WHERE completed_at IS NOT NULL "
                    "AND completed_at < now() - make_interval(secs => %s)",
                    (max_age_seconds,),
                )
                deleted = cur.rowcount
                conn.commit()
                return deleted
        finally:
            pool.release(conn)
