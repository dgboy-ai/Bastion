"""Apply all Bastion schema migrations to a CockroachDB cluster.

Thin wrapper over the real migration runner (``python -m bastion.migrate``).
The old behavior only applied migrations 001-004; this delegates to the full,
idempotent runner that discovers all ``schema/*.sql`` files and tracks applied
versions in ``_schema_migrations``.

Usage:
    python scripts/apply_schema.py "postgresql://user:pass@host:26257/defaultdb"
    BASTION_CONN="..." python scripts/apply_schema.py
"""

import os
import sys

from bastion.migrate import run_migrations


def main() -> int:
    conn_str = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("BASTION_CONN")
    if not conn_str:
        print("Error: pass a connection string or set BASTION_CONN", file=sys.stderr)
        return 1

    result = run_migrations(conn_str=conn_str)
    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        return 1

    print(
        "Discovered: {} | Applied: {} | Pending: {}".format(
            result["total_discovered"], result["already_applied"], result["pending"]
        )
    )
    for m in result.get("applied", []):
        print(f"  ✓ {m['version']} {m['filename']} ({m['execution_ms']}ms)")
    if not result.get("applied"):
        print("No pending migrations — schema is up to date.")

    # Reminder for the C-SPANN vector index on already-populated clusters.
    print(
        "\nIf the C-SPANN vector index (idx_memory_embedding) backfill is slow on a "
        "populated table, apply it separately:\n"
        "  BASTION_CONN=\"...\" python scripts/create_vector_index.py"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
