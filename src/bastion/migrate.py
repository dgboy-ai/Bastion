"""Simple schema migration framework for CockroachDB.

Tracks applied migrations in a `_schema_migrations` table.
Reads numbered .sql files from the schema/ directory and applies
them in order, recording which ones have been applied.

Supports rollback via companion `down_*.sql` files.

Usage:
    python -m bastion.migrate                    # apply all pending
    python -m bastion.migrate --status           # show migration status
    python -m bastion.migrate --dry-run          # show what would be applied
    python -m bastion.migrate --rollback 003     # rollback migration 003
    python -m bastion.migrate --rollback-all     # rollback all applied migrations
"""

from __future__ import annotations

import glob
import os
import re
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
        cur.execute(f"SELECT version, filename, applied_at, checksum FROM {MIGRATIONS_TABLE} ORDER BY version")
        return {row[0]: {"filename": row[1], "applied_at": row[2], "checksum": row[3]} for row in cur.fetchall()}


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


def _split_statements(sql: str) -> list[str]:
    """Split a SQL script into individual statements.

    Unlike a naive ``split(";")`` this is aware of:
    - single-quoted strings ('' escapes),
    - double-quoted identifiers,
    - dollar-quoted blocks (``$$ ... $$`` / ``$tag$ ... $tag$``),
    - ``--`` line comments and ``/* */`` block comments.

    Returns a list of stripped statements (comments-only chunks removed).
    """

    statements: list[str] = []
    buf: list[str] = []
    i = 0
    n = len(sql)
    state = "code"  # code | sq | dq | dollar | line_comment | block_comment
    dollar_tag: str | None = None

    def flush() -> None:
        nonlocal buf
        stmt = "".join(buf).strip()
        buf = []
        if stmt:
            statements.append(stmt)

    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""

        if state == "line_comment":
            if ch == "\n":
                state = "code"
            buf.append(ch)
            i += 1
            continue

        if state == "block_comment":
            if ch == "*" and nxt == "/":
                buf.append("*/")
                i += 2
                state = "code"
                continue
            buf.append(ch)
            i += 1
            continue

        if state == "sq":
            buf.append(ch)
            if ch == "'" and nxt == "'":
                buf.append(nxt)
                i += 2
                continue
            if ch == "'":
                state = "code"
            i += 1
            continue

        if state == "dq":
            buf.append(ch)
            if ch == '"' and nxt == '"':
                buf.append(nxt)
                i += 2
                continue
            if ch == '"':
                state = "code"
            i += 1
            continue

        if state == "dollar":
            # Inside a dollar-quoted block: look for the closing tag.
            if sql.startswith(dollar_tag or "$$", i):
                buf.append(dollar_tag or "$$")
                i += len(dollar_tag or "$$")
                dollar_tag = None
                state = "code"
                continue
            buf.append(ch)
            i += 1
            continue

        # state == "code"
        if ch == "-" and nxt == "-":
            state = "line_comment"
            buf.append("--")
            i += 2
            continue
        if ch == "/" and nxt == "*":
            state = "block_comment"
            buf.append("/*")
            i += 2
            continue
        if ch == "'":
            state = "sq"
            buf.append(ch)
            i += 1
            continue
        if ch == '"':
            state = "dq"
            buf.append(ch)
            i += 1
            continue
        if ch == "$":
            # Detect $$ or $tag$ opener.
            m = re.match(r"\$[A-Za-z_0-9]*\$", sql[i:])
            if m:
                dollar_tag = m.group(0)
                state = "dollar"
                buf.append(dollar_tag)
                i += len(dollar_tag)
                continue
        if ch == ";":
            flush()
            i += 1
            continue
        buf.append(ch)
        i += 1

    flush()
    return statements


def _apply_migration(conn, version: str, filepath: str, checksum: str) -> int:
    """Apply a single migration file. Returns execution time in ms."""

    with open(filepath, encoding="utf-8") as f:
        sql = f.read()

    start = time.monotonic()
    with conn.cursor() as cur:
        # Split by semicolons (statement-aware) and execute each statement
        statements = _split_statements(sql)
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
            f"INSERT INTO {MIGRATIONS_TABLE} (version, filename, checksum, execution_ms) VALUES (%s, %s, %s, %s)",
            (version, os.path.basename(filepath), checksum, elapsed_ms),
        )
    conn.commit()
    return elapsed_ms


def _rollback_migration(conn, version: str, schema_dir: str) -> bool:
    """Rollback a single migration using its companion down_*.sql file.

    Looks for ``down_{version}_*.sql`` in the schema directory.
    Returns True if rollback succeeded, False if no down file found or error.
    """

    # Find the down migration file
    down_pattern = os.path.join(schema_dir, f"down_{version}_*.sql")
    down_files = glob.glob(down_pattern)

    # Also check for a single down file named down_{version}.sql
    if not down_files:
        down_file = os.path.join(schema_dir, f"down_{version}.sql")
        if os.path.isfile(down_file):
            down_files = [down_file]

    if not down_files:
        logger.warning("No rollback file found for migration %s (looked for down_%s_*.sql)", version, version)
        return False

    down_file = down_files[0]
    logger.info("Rolling back migration %s using %s", version, os.path.basename(down_file))

    with open(down_file, encoding="utf-8") as f:
        sql = f.read()

    start = time.monotonic()
    with conn.cursor() as cur:
        statements = _split_statements(sql)
        for stmt in statements:
            lines = [line for line in stmt.split("\n") if line.strip() and not line.strip().startswith("--")]
            if not lines:
                continue
            cur.execute(stmt)

    elapsed_ms = int((time.monotonic() - start) * 1000)

    # Remove from migrations table
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {MIGRATIONS_TABLE} WHERE version = %s", (version,))
    conn.commit()

    logger.info("Rolled back migration %s in %dms", version, elapsed_ms)
    return True


def rollback_migration(
    version: str,
    conn_str: str | None = None,
    schema_dir: str | None = None,
) -> dict:
    """Rollback a specific migration by version number.

    Args:
        version: Migration version to rollback (e.g., "003").
        conn_str: CockroachDB connection string. Falls back to BASTION_CONN env var.
        schema_dir: Directory containing .sql migration files.

    Returns:
        Dict with rollback results.
    """
    from bastion.config import get_settings

    settings = get_settings()
    conn_str = conn_str or settings.connection_string
    if not conn_str:
        return {"error": "No connection string. Set BASTION_CONN or pass conn_str."}

    if schema_dir is None:
        project_root = Path(__file__).parent.parent.parent
        schema_dir = str(project_root / "schema")
    if not os.path.isdir(schema_dir):
        return {"error": f"Schema directory not found: {schema_dir}"}

    import psycopg

    conn = psycopg.connect(conn_str)
    try:
        _ensure_migrations_table(conn)
        applied = _get_applied(conn)

        if version not in applied:
            return {"error": f"Migration {version} is not applied (cannot rollback)"}

        # Check that there are no later applied migrations that might depend on this one
        later_versions = [v for v in applied if v > version]
        if later_versions:
            logger.warning(
                "Rolling back %s but later migrations are applied: %s — this may cause errors",
                version,
                later_versions,
            )

        success = _rollback_migration(conn, version, schema_dir)
        if success:
            return {"status": "rolled_back", "version": version}
        return {"error": f"Rollback file not found for migration {version}"}
    finally:
        conn.close()


def rollback_all(
    conn_str: str | None = None,
    schema_dir: str | None = None,
    dry_run: bool = False,
) -> dict:
    """Rollback all applied migrations in reverse order.

    Args:
        conn_str: CockroachDB connection string.
        schema_dir: Directory containing .sql migration files.
        dry_run: If True, show what would be rolled back without applying.

    Returns:
        Dict with rollback results.
    """
    from bastion.config import get_settings

    settings = get_settings()
    conn_str = conn_str or settings.connection_string
    if not conn_str:
        return {"error": "No connection string. Set BASTION_CONN or pass conn_str."}

    if schema_dir is None:
        project_root = Path(__file__).parent.parent.parent
        schema_dir = str(project_root / "schema")
    if not os.path.isdir(schema_dir):
        return {"error": f"Schema directory not found: {schema_dir}"}

    import psycopg

    conn = psycopg.connect(conn_str)
    try:
        _ensure_migrations_table(conn)
        applied = _get_applied(conn)

        # Rollback in reverse order (newest first)
        versions = sorted(applied.keys(), reverse=True)
        rollback_list: list[dict[str, str | int]] = []
        result: dict[str, Any] = {
            "total_applied": len(applied),
            "dry_run": dry_run,
            "rolled_back": rollback_list,
        }

        if dry_run:
            result["would_rollback"] = [{"version": v, "filename": applied[v]["filename"]} for v in versions]
            return result

        for version in versions:
            success = _rollback_migration(conn, version, schema_dir)
            rollback_list.append(
                {
                    "version": version,
                    "filename": applied[version]["filename"],
                    "status": "rolled_back" if success else "no_down_file",
                }
            )

        return result
    finally:
        conn.close()


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
            result["applied"].append(
                {
                    "version": version,
                    "filename": os.path.basename(filepath),
                    "execution_ms": elapsed_ms,
                }
            )
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
    parser.add_argument("--rollback", metavar="VERSION", help="Rollback a specific migration (e.g., 003)")
    parser.add_argument("--rollback-all", action="store_true", help="Rollback all applied migrations in reverse order")
    args = parser.parse_args()

    if args.rollback:
        result = rollback_migration(
            version=args.rollback,
            conn_str=args.conn,
            schema_dir=args.schema_dir,
        )
        if "error" in result:
            print(f"Error: {result['error']}", file=sys.stderr)
            sys.exit(1)
        print(f"Rolled back migration {result['version']}")
        return

    if args.rollback_all:
        result = rollback_all(
            conn_str=args.conn,
            schema_dir=args.schema_dir,
            dry_run=args.dry_run,
        )
        if "error" in result:
            print(f"Error: {result['error']}", file=sys.stderr)
            sys.exit(1)
        if args.dry_run:
            print(f"Would rollback {len(result.get('would_rollback', []))} migration(s):")
            for m in result.get("would_rollback", []):
                print(f"  ○ {m['version']} {m['filename']}")
        else:
            print(f"Rolled back {len(result['rolled_back'])} migration(s):")
            for m in result["rolled_back"]:
                status = "✓" if m["status"] == "rolled_back" else "○"
                print(f"  {status} {m['version']} {m['filename']} ({m['status']})")
        return

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
