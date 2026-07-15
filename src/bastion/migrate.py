"""Simple schema migration framework for CockroachDB.

Tracks applied migrations in a `_schema_migrations` table.
Reads numbered .sql files from the schema/ directory and applies
them in order, recording which ones have been applied.

Usage:
    python -m bastion.migrate                    # apply all pending
    python -m bastion.migrate --status           # show migration status
    python -m bastion.migrate --dry-run          # show what would be applied
"""

from __future__ import annotations

import glob
import os
import sys
import time
from pathlib import Path
from typing import Any

from bastion.log_setup import get_logger

logger = get_logger(__name__)

MIGRATIONS_TABLE = "_schema_migrations"


def _ensure_migrations_table(conn) -> None:
    """Create the migrations tracking table if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS {MIGRATIONS_TABLE} (
                id INT PRIMARY KEY DEFAULT unique_rowid(),
                version VARCHAR(255) NOT NULL UNIQUE,
                filename VARCHAR(500) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                checksum VARCHAR(64) NOT NULL,
                execution_ms INT NOT NULL DEFAULT 0
            )
        """)
    conn.commit()


def _get_applied(conn) -> dict[str, dict]:
    """Return a dict of version -> {filename, applied_at, checksum} for applied migrations."""
    with conn.cursor() as cur:
        cur.execute(
            f"SELECT version, filename, applied_at, checksum FROM {MIGRATIONS_TABLE} ORDER BY version"
        )
        return {
            row[0]: {"filename": row[1], "applied_at": row[2], "checksum": row[3]}
            for row in cur.fetchall()
        }


def _discover_migrations(schema_dir: str) -> list[tuple[str, str, str]]:
    """Discover migration files from schema/ directory.

    Returns list of (version, filepath, checksum) sorted by version.
    Expects files like: 001_agent_checkpoints.sql, 002_agent_memory.sql, etc.
    """
    import hashlib

    pattern = os.path.join(schema_dir, "*.sql")
    files = sorted(glob.glob(pattern))
    migrations = []
    for filepath in files:
        filename = os.path.basename(filepath)
        # Extract version from filename: 001_xxx.sql -> "001"
        parts = filename.split("_", 1)
        if len(parts) < 2 or not parts[0].isdigit():
            continue
        version = parts[0]
        with open(filepath, encoding="utf-8") as f:
            content = f.read()
        checksum = hashlib.sha256(content.encode()).hexdigest()[:16]
        migrations.append((version, filepath, checksum))
    return migrations


def _apply_migration(conn, version: str, filepath: str, checksum: str) -> int:
    """Apply a single migration file. Returns execution time in ms."""

    with open(filepath, encoding="utf-8") as f:
        sql = f.read()

    start = time.monotonic()
    with conn.cursor() as cur:
        # Split by semicolons and execute each statement
        statements = [s.strip() for s in sql.split(";") if s.strip()]
        for stmt in statements:
            # Skip empty statements and comments-only
            lines = [line for line in stmt.split("\n") if line.strip() and not line.strip().startswith("--")]
            if not lines:
                continue
            try:
                cur.execute(stmt)
            except Exception as e:
                # "already exists" errors are expected for idempotent migrations
                if "already exists" in str(e).lower():
                    logger.debug("Statement already exists (idempotent): %s", str(e)[:80])
                else:
                    logger.warning("Migration statement failed: %s", str(e)[:200])
                    raise

    elapsed_ms = int((time.monotonic() - start) * 1000)

    # Record the migration
    with conn.cursor() as cur:
        cur.execute(
            f"INSERT INTO {MIGRATIONS_TABLE} (version, filename, checksum, execution_ms) "
            "VALUES (%s, %s, %s, %s)",
            (version, os.path.basename(filepath), checksum, elapsed_ms),
        )
    conn.commit()
    return elapsed_ms


def run_migrations(
    conn_str: str | None = None,
    schema_dir: str | None = None,
    dry_run: bool = False,
    status_only: bool = False,
) -> dict:
    """Run pending migrations.

    Args:
        conn_str: CockroachDB connection string. Falls back to BASTION_CONN env var.
        schema_dir: Directory containing .sql migration files. Defaults to repo schema/.
        dry_run: If True, show what would be applied without applying.
        status_only: If True, only show migration status.

    Returns:
        Dict with migration results.
    """
    from bastion.config import get_settings

    settings = get_settings()
    conn_str = conn_str or settings.connection_string
    if not conn_str:
        return {"error": "No connection string. Set BASTION_CONN or pass conn_str."}

    # Find schema directory
    if schema_dir is None:
        # Look for schema/ relative to the project root
        project_root = Path(__file__).parent.parent.parent
        schema_dir = str(project_root / "schema")
    if not os.path.isdir(schema_dir):
        return {"error": f"Schema directory not found: {schema_dir}"}

    import psycopg

    conn = psycopg.connect(conn_str)
    try:
        _ensure_migrations_table(conn)
        applied = _get_applied(conn)
        discovered = _discover_migrations(schema_dir)

        pending = [(v, fp, cs) for v, fp, cs in discovered if v not in applied]

        applied_list: list[dict[str, str | int]] = []
        result: dict[str, Any] = {
            "total_discovered": len(discovered),
            "already_applied": len(applied),
            "pending": len(pending),
            "dry_run": dry_run,
            "applied": applied_list,
        }

        if status_only or dry_run:
            result["discovered"] = [
                {"version": v, "filename": os.path.basename(fp), "status": "applied" if v in applied else "pending"}
                for v, fp, cs in discovered
            ]
            return result

        for version, filepath, checksum in pending:
            logger.info("Applying migration %s: %s", version, os.path.basename(filepath))
            elapsed_ms = _apply_migration(conn, version, filepath, checksum)
            result["applied"].append({
                "version": version,
                "filename": os.path.basename(filepath),
                "execution_ms": elapsed_ms,
            })
            logger.info("Applied migration %s in %dms", version, elapsed_ms)

        return result
    finally:
        conn.close()


def main():
    """CLI entry point for migrations."""
    import argparse

    parser = argparse.ArgumentParser(description="Bastion schema migration runner")
    parser.add_argument("--status", action="store_true", help="Show migration status")
    parser.add_argument("--dry-run", action="store_true", help="Show pending migrations without applying")
    parser.add_argument("--conn", help="CockroachDB connection string (overrides BASTION_CONN)")
    parser.add_argument("--schema-dir", help="Directory containing .sql migration files")
    args = parser.parse_args()

    result = run_migrations(
        conn_str=args.conn,
        schema_dir=args.schema_dir,
        dry_run=args.dry_run,
        status_only=args.status,
    )

    if "error" in result:
        print(f"Error: {result['error']}", file=sys.stderr)
        sys.exit(1)

    if args.status or args.dry_run:
        print(f"Discovered: {result['total_discovered']} migrations")
        print(f"Applied:    {result['already_applied']}")
        print(f"Pending:    {result['pending']}")
        if "discovered" in result:
            for m in result["discovered"]:
                status = "✓" if m["status"] == "applied" else "○"
                print(f"  {status} {m['version']} {m['filename']}")
    else:
        if result["applied"]:
            print(f"Applied {len(result['applied'])} migration(s):")
            for m in result["applied"]:
                print(f"  ✓ {m['version']} {m['filename']} ({m['execution_ms']}ms)")
        else:
            print("No pending migrations.")


if __name__ == "__main__":
    main()
