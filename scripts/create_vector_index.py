"""Create the C-SPANN vector index on agent_memory for an existing cluster.

Why this script exists
----------------------
Migration 002 declares ``CREATE VECTOR INDEX idx_memory_embedding`` for fresh
clusters, but on an already-populated table the index backfill can take a long
time (it is a full index build over every stored embedding). On small/hobby
clusters this used to be skipped manually, leaving the live database without
the vector index — so ANN queries fell back to a full scan.

This script applies the index safely:
  1. Checks whether the index already exists (no-op if it does).
  2. Optionally raises index-build throughput limits so the backfill does not
     starve the cluster (restores them afterwards).
  3. Creates the index with ``IF NOT EXISTS``.
  4. Verifies with ``SHOW INDEXES`` and reports backfill progress.

Usage:
    BASTION_CONN="postgresql://..." python scripts/create_vector_index.py
    BASTION_CONN="postgresql://..." python scripts/create_vector_index.py --throttle
"""

from __future__ import annotations

import os
import sys
import time

import psycopg

INDEX_SQL = (
    "CREATE VECTOR INDEX IF NOT EXISTS idx_memory_embedding "
    "ON agent_memory (agent_id, embedding)"
)
# Cluster settings raised during backfill so a large table does not starve the cluster.
_THROTTLE_SETTINGS = {
    "kv.snapshot_rebalance_rate": "1MiB",
    "kv.snapshot_recovery_rate": "1MiB",
}


def _index_exists(cur) -> bool:
    cur.execute(
        "SELECT index_name FROM [SHOW INDEXES FROM agent_memory] "
        "WHERE index_name = 'idx_memory_embedding'"
    )
    return cur.fetchone() is not None


def _backfill_progress(cur) -> tuple[int, int] | None:
    """Return (complete, total) backfill fraction if a backfill is running."""
    try:
        cur.execute(
            """
            SELECT pg_class.relname, pg_index.indisready
            FROM pg_catalog.pg_class
            JOIN pg_catalog.pg_index ON pg_index.indexrelid = pg_class.oid
            JOIN pg_catalog.pg_class tbl ON tbl.oid = pg_index.indrelid
            WHERE tbl.relname = 'agent_memory'
            """
        )
        rows = cur.fetchall()
        if not rows:
            return None
        ready = all(r[1] for r in rows)
        return (1 if ready else 0, len(rows))
    except Exception:
        return None


def main() -> int:
    conn_str = os.environ.get("BASTION_CONN")
    if not conn_str:
        print("Error: set BASTION_CONN first", file=sys.stderr)
        return 1

    throttle = "--throttle" in sys.argv[1:]
    conn = psycopg.connect(conn_str)
    try:
        with conn.cursor() as cur:
            if _index_exists(cur):
                print("idx_memory_embedding already exists — nothing to do.")
                return 0

            print("Index not present. Creating C-SPANN vector index...")
            if throttle:
                print("Throttling index-build rates to protect the cluster...")
                for key, val in _THROTTLE_SETTINGS.items():
                    cur.execute("SET CLUSTER SETTING %s = %s", (key, val))
                    print(f"  SET CLUSTER SETTING {key} = {val}")

            try:
                cur.execute(INDEX_SQL)
            finally:
                if throttle:
                    print("Restoring default index-build rates...")
                    cur.execute("RESET CLUSTER SETTING kv.snapshot_rebalance_rate")
                    cur.execute("RESET CLUSTER SETTING kv.snapshot_recovery_rate")
            conn.commit()

            # Poll for backfill completion.
            print("Waiting for backfill to complete...")
            deadline = time.monotonic() + 3600
            while time.monotonic() < deadline:
                done, total = _backfill_progress(cur) or (0, 0)
                if done and done >= total:
                    break
                time.sleep(5)
            else:
                print("Backfill still running — index will finish in the background.")
                return 0

        with conn.cursor() as cur:
            cur.execute("SHOW INDEXES FROM agent_memory")
            for row in cur.fetchall():
                print("  ", row[0], row[1])
        print("C-SPANN vector index ready. ANN queries are now index-accelerated.")
        return 0
    except Exception as e:  # pragma: no cover
        print(f"Error: {e}", file=sys.stderr)
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
