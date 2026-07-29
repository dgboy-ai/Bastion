"""Background TTL cleanup worker for expired memories and messages.

Runs as a Docker service or cron job. Periodically deletes:
- Expired memories (expires_at < now())
- Expired messages (expires_at < now())
- Old audit entries (configurable retention)
"""

from __future__ import annotations

import os
import time

import psycopg


def cleanup_expired_memories(conn: psycopg.Connection) -> int:
    """Delete memories past their TTL. Returns count deleted."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM agent_memory WHERE expires_at IS NOT NULL AND expires_at < now()")
        return cur.rowcount


def cleanup_expired_messages(conn: psycopg.Connection) -> int:
    """Delete messages past their TTL. Returns count deleted."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM agent_messages WHERE expires_at IS NOT NULL AND expires_at < now()")
        return cur.rowcount


def cleanup_old_audit(conn: psycopg.Connection, retention_days: int = 90) -> int:
    """Delete audit entries older than retention_days. Returns count deleted."""
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM agent_audit WHERE recorded_at < now() - INTERVAL '{retention_days} days'")
        return cur.rowcount


def run_cleanup_cycle(conn_str: str, retention_days: int = 90) -> dict:
    """Run one cleanup cycle. Returns summary."""
    conn = psycopg.connect(conn_str, connect_timeout=10)
    try:
        t0 = time.time()
        mem_deleted = cleanup_expired_memories(conn)
        msg_deleted = cleanup_expired_messages(conn)
        audit_deleted = cleanup_old_audit(conn, retention_days)
        conn.commit()
        elapsed_ms = int((time.time() - t0) * 1000)
        return {
            "memories_deleted": mem_deleted,
            "messages_deleted": msg_deleted,
            "audit_deleted": audit_deleted,
            "elapsed_ms": elapsed_ms,
        }
    finally:
        conn.close()


def main():
    conn_str = os.environ.get("BASTION_CONN", "postgresql://root@localhost:26257/defaultdb?sslmode=disable")
    interval = int(os.environ.get("BASTION_TTL_INTERVAL", "300"))
    retention_days = int(os.environ.get("BASTION_AUDIT_RETENTION_DAYS", "90"))

    print(f"TTL cleanup worker starting (interval={interval}s, retention={retention_days}d)")
    while True:
        try:
            result = run_cleanup_cycle(conn_str, retention_days)
            print(
                f"Cleanup: {result['memories_deleted']} memories, "
                f"{result['messages_deleted']} messages, "
                f"{result['audit_deleted']} audit entries "
                f"({result['elapsed_ms']}ms)"
            )
        except Exception as exc:
            print(f"Cleanup error: {exc}")
        time.sleep(interval)


if __name__ == "__main__":
    main()
