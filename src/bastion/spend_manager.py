from __future__ import annotations

import datetime
import os
import threading
import time
from typing import Any

from bastion.log_setup import get_logger
from bastion.pool import ConnectionPool

logger = get_logger(__name__)

_SPEND_CATEGORIES = frozenset({"search", "store", "embed", "heal"})

_DEFAULT_LIMITS: dict[str, int] = {
    "search": 10000,
    "store": 5000,
    "embed": 2000,
    "heal": 100,
}


class SpendManager:
    """Per-agent daily spend tracking with hard and soft limits.

    Tracks usage per category per day per agent_id.
    Enforces hard limits (reject) and emits warnings at soft limits.
    Stored in CockroachDB ``agent_budgets`` table, with in-memory cache
    for hot-path performance.
    """

    def __init__(
        self,
        connection_string: str | None = None,
        pool: ConnectionPool | None = None,
        mock: bool = False,
    ):
        self._mock = mock
        self._pool = pool
        self._conn_str = connection_string
        self._cache: dict[str, dict[str, Any]] = {}
        self._cache_lock = threading.Lock()
        self._cache_ttl = 60.0  # seconds

    def _get_pool(self) -> ConnectionPool:
        if self._pool is not None:
            return self._pool
        conn = self._conn_str or os.environ.get("BASTION_CONN", "")
        self._pool = ConnectionPool(
            connection_string=conn,
            min_size=1,
            max_size=2,
            max_idle_seconds=60,
        )
        return self._pool

    def check_and_increment(
        self,
        agent_id: str,
        category: str,
        count: int = 1,
    ) -> dict[str, Any]:
        """Check if *agent_id* can spend *count* units in *category*.

        Returns a dict with keys:
          - ``allowed`` (bool)
          - ``remaining`` (int)
          - ``limit`` (int)
          - ``suspended`` (bool)
          - ``reason`` (str | None)

        Atomically increments the counter if allowed.
        """
        if category not in _SPEND_CATEGORIES:
            return {"allowed": True, "remaining": 0, "limit": 0, "suspended": False, "reason": None}

        if self._mock:
            return {"allowed": True, "remaining": 999999, "limit": 999999, "suspended": False, "reason": None}

        today = datetime.date.today()
        cache_key = f"{agent_id}:{today.isoformat()}"
        soft_limit_pct = 0.8

        with self._cache_lock:
            cached = self._cache.get(cache_key)
            if cached and time.time() - cached.get("_ts", 0) < self._cache_ttl:
                record = cached
            else:
                record = None

        if record is None:
            record = self._load_or_create_budget(agent_id)

        limit_key = f"hard_limit_{category}s"
        current_key = f"daily_{category}s"
        hard_limit = record.get(limit_key, _DEFAULT_LIMITS.get(category, 10000))
        current = record.get(current_key, 0)
        suspended = record.get("is_suspended", False)
        suspension_reason = record.get("suspension_reason")

        if suspended:
            return {
                "allowed": False,
                "remaining": 0,
                "limit": hard_limit,
                "suspended": True,
                "reason": suspension_reason or "Agent suspended due to budget overage",
            }

        if current + count > hard_limit:
            self._suspend_agent(agent_id, f"Hard limit exceeded for {category}s ({current + count}/{hard_limit})")
            return {
                "allowed": False,
                "remaining": 0,
                "limit": hard_limit,
                "suspended": True,
                "reason": f"Hard limit of {hard_limit} {category}s exceeded",
            }

        if current + count > hard_limit * soft_limit_pct:
            logger.warning(
                "Agent approaching spend limit",
                extra={"agent_id": agent_id, "category": category, "current": current, "limit": hard_limit},
            )

        self._increment_budget(agent_id, category, count)

        with self._cache_lock:
            record[current_key] = current + count
            record["_ts"] = time.time()
            self._cache[cache_key] = record

        return {
            "allowed": True,
            "remaining": hard_limit - (current + count),
            "limit": hard_limit,
            "suspended": False,
            "reason": None,
        }

    def get_usage(self, agent_id: str) -> dict[str, Any]:
        """Return current usage snapshot for *agent_id*."""
        if self._mock:
            return {cat: {"used": 0, "limit": lim, "remaining": lim} for cat, lim in _DEFAULT_LIMITS.items()}

        record = self._load_or_create_budget(agent_id)
        usage = {}
        for cat in _SPEND_CATEGORIES:
            current_key = f"daily_{cat}s"
            limit_key = f"hard_limit_{cat}s"
            limit = record.get(limit_key, _DEFAULT_LIMITS.get(cat, 10000))
            current = record.get(current_key, 0)
            usage[cat] = {"used": current, "limit": limit, "remaining": max(0, limit - current)}
        usage["is_suspended"] = record.get("is_suspended", False)
        usage["suspension_reason"] = record.get("suspension_reason")
        return usage

    def reset_budget(self, agent_id: str) -> bool:
        """Reset daily counters for *agent_id*."""
        if self._mock:
            return True
        pool = self._get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_budgets SET "
                    "daily_searches = 0, daily_stores = 0, daily_embeds = 0, daily_heals = 0, "
                    "is_suspended = false, suspension_reason = NULL, "
                    "updated_at = now() "
                    "WHERE agent_id = %s",
                    (agent_id,),
                )
                conn.commit()
            today = datetime.date.today()
            cache_key = f"{agent_id}:{today.isoformat()}"
            with self._cache_lock:
                self._cache.pop(cache_key, None)
            return True
        except Exception as exc:
            logger.error("Failed to reset budget", extra={"agent_id": agent_id, "error": str(exc)})
            return False
        finally:
            pool.release(conn)

    def set_limits(self, agent_id: str, limits: dict[str, int]) -> bool:
        """Override hard limits for *agent_id*.

        *limits* keys are like ``search``, ``store``, ``embed``, ``heal``.
        """
        if self._mock:
            return True
        pool = self._get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            set_clauses = []
            params: list[Any] = []
            for cat, limit in limits.items():
                col = f"hard_limit_{cat}s"
                set_clauses.append(f"{col} = %s")
                params.append(limit)
            if not set_clauses:
                return True
            params.append(agent_id)
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE agent_budgets SET {', '.join(set_clauses)}, updated_at = now() "
                    f"WHERE agent_id = %s",
                    params,
                )
                if cur.rowcount == 0:
                    cur.execute(
                        "INSERT INTO agent_budgets (agent_id, daily_searches, daily_stores, daily_embeds, daily_heals, "
                        + ", ".join(f"{cat.replace('_', '_')}" for cat in limits) + ") "
                        "VALUES (%s, 0, 0, 0, 0, "
                        + ", ".join("%s" for _ in limits) + ") "
                        "ON CONFLICT (agent_id) DO UPDATE SET "
                        + ", ".join(f"{col} = EXCLUDED.{col}" for col in set_clauses),
                        [agent_id] + list(limits.values()),
                    )
                conn.commit()
            today = datetime.date.today()
            cache_key = f"{agent_id}:{today}"
            with self._cache_lock:
                self._cache.pop(cache_key, None)
            return True
        except Exception as exc:
            logger.error("Failed to set limits", extra={"agent_id": agent_id, "error": str(exc)})
            return False
        finally:
            pool.release(conn)

    def _load_or_create_budget(self, agent_id: str) -> dict[str, Any]:
        pool = self._get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT daily_searches, daily_stores, daily_embeds, daily_heals, "
                    "budget_date, hard_limit_searches, hard_limit_stores, hard_limit_embeds, "
                    "hard_limit_heals, is_suspended, suspension_reason "
                    "FROM agent_budgets WHERE agent_id = %s",
                    (agent_id,),
                )
                row = cur.fetchone()
                if row:
                    record = {
                        "daily_searches": row[0],
                        "daily_stores": row[1],
                        "daily_embeds": row[2],
                        "daily_heals": row[3],
                        "budget_date": row[4],
                        "hard_limit_searches": row[5],
                        "hard_limit_stores": row[6],
                        "hard_limit_embeds": row[7],
                        "hard_limit_heals": row[8],
                        "is_suspended": row[9],
                        "suspension_reason": row[10],
                    }
                else:
                    record = self._create_budget(agent_id, conn)
                conn.commit()
                today = datetime.date.today()
                if isinstance(record.get("budget_date"), datetime.date) and record["budget_date"] < today:
                    record = self._reset_daily(agent_id, conn)
                return record
        except Exception as exc:
            logger.error("Failed to load budget", extra={"agent_id": agent_id, "error": str(exc)})
            result = {f"daily_{cat}s": 0 for cat in _SPEND_CATEGORIES}
            result.update({f"hard_limit_{cat}s": _DEFAULT_LIMITS[cat] for cat in _SPEND_CATEGORIES})
            result.update({"is_suspended": False, "suspension_reason": None})
            return result
        finally:
            pool.release(conn)

    def _create_budget(self, agent_id: str, conn: Any) -> dict[str, Any]:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO agent_budgets (agent_id, daily_searches, daily_stores, daily_embeds, daily_heals) "
                "VALUES (%s, 0, 0, 0, 0) "
                "ON CONFLICT (agent_id) DO NOTHING",
                (agent_id,),
            )
        return {
            "daily_searches": 0,
            "daily_stores": 0,
            "daily_embeds": 0,
            "daily_heals": 0,
            "budget_date": datetime.date.today(),
            "hard_limit_searches": _DEFAULT_LIMITS["search"],
            "hard_limit_stores": _DEFAULT_LIMITS["store"],
            "hard_limit_embeds": _DEFAULT_LIMITS["embed"],
            "hard_limit_heals": _DEFAULT_LIMITS["heal"],
            "is_suspended": False,
            "suspension_reason": None,
        }

    def _reset_daily(self, agent_id: str, conn: Any) -> dict[str, Any]:
        today = datetime.date.today()
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE agent_budgets SET "
                "daily_searches = 0, daily_stores = 0, daily_embeds = 0, daily_heals = 0, "
                "budget_date = %s, is_suspended = false, suspension_reason = NULL, "
                "updated_at = now() "
                "WHERE agent_id = %s",
                (today, agent_id),
            )
        return {
            "daily_searches": 0,
            "daily_stores": 0,
            "daily_embeds": 0,
            "daily_heals": 0,
            "budget_date": today,
            "hard_limit_searches": _DEFAULT_LIMITS["search"],
            "hard_limit_stores": _DEFAULT_LIMITS["store"],
            "hard_limit_embeds": _DEFAULT_LIMITS["embed"],
            "hard_limit_heals": _DEFAULT_LIMITS["heal"],
            "is_suspended": False,
            "suspension_reason": None,
        }

    def _increment_budget(self, agent_id: str, category: str, count: int) -> None:
        col = f"daily_{category}s"
        pool = self._get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE agent_budgets SET {col} = {col} + %s, updated_at = now() "
                    f"WHERE agent_id = %s",
                    (count, agent_id),
                )
                if cur.rowcount == 0:
                    cur.execute(
                        "INSERT INTO agent_budgets (agent_id, daily_searches, daily_stores, daily_embeds, daily_heals) "
                        "VALUES (%s, 0, 0, 0, 0) "
                        "ON CONFLICT (agent_id) DO UPDATE SET "
                        f"{col} = agent_budgets.{col} + %s",
                        (agent_id, count),
                    )
                conn.commit()
        except Exception as exc:
            logger.error("Failed to increment budget", extra={"agent": agent_id[:32], "cat": category, "err": str(exc)})
            conn.rollback()
        finally:
            pool.release(conn)

    def _suspend_agent(self, agent_id: str, reason: str) -> None:
        pool = self._get_pool()
        conn = pool.acquire(timeout=10.0)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE agent_budgets SET is_suspended = true, suspension_reason = %s, updated_at = now() "
                    "WHERE agent_id = %s",
                    (reason, agent_id),
                )
                conn.commit()
        except Exception as exc:
            logger.error("Failed to suspend agent", extra={"agent_id": agent_id, "error": str(exc)})
        finally:
            pool.release(conn)

    def close(self) -> None:
        if self._pool is not None:
            self._pool.close_all()
