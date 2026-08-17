#!/usr/bin/env python3
"""Import memories from a JSONL file into Bastion.

Each line should be a JSON object with at minimum:
  {"content": "...", "memory_type": "fact"}

Optional fields:
  "metadata": {...}       — merged into the stored metadata
  "agent_id": "..."       — override target agent (default: from --agent)
  "expires_in_seconds": 3600

Usage:
    python scripts/import_jsonl.py data/memories.jsonl --agent customer-support
    python scripts/import_jsonl.py data/memories.jsonl --agent devops --skip-guard
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from bastion.errors import SecurityBlockError  # noqa: E402

from bastion.memory import BastionMemory  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Import memories from JSONL into Bastion")
    parser.add_argument("file", type=Path, help="Path to JSONL file")
    parser.add_argument("--agent", default="customer-support", help="Target agent_id (default: customer-support)")
    parser.add_argument("--skip-guard", action="store_true", help="Skip ASI06 guard checks")
    parser.add_argument("--dry-run", action="store_true", help="Validate without storing")
    parser.add_argument("--verbose", action="store_true", help="Print each imported record")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"Error: file not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    BastionMemory(args.agent, mock=False)

    stats = {"total": 0, "imported": 0, "skipped": 0, "errors": 0}
    start = time.time()

    with open(args.file, encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            stats["total"] += 1

            try:
                record = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"  [line {line_no}] JSON parse error: {e}", file=sys.stderr)
                stats["errors"] += 1
                continue

            content = record.get("content", "")
            memory_type = record.get("memory_type", "fact")
            metadata = record.get("metadata", {})
            expires = record.get("expires_in_seconds")
            agent = record.get("agent_id", args.agent)

            if not content:
                print(f"  [line {line_no}] empty content, skipping", file=sys.stderr)
                stats["skipped"] += 1
                continue

            if args.dry_run:
                stats["imported"] += 1
                if args.verbose:
                    print(f"  [line {line_no}] DRY RUN: {memory_type} ({len(content)} chars)")
                continue

            try:
                mem = BastionMemory(agent, mock=False)
                mem.store(
                    memory_type=memory_type,
                    content=content,
                    metadata=metadata,
                    expires_in_seconds=expires,
                    _skip_guard=args.skip_guard,
                )
                stats["imported"] += 1
                if args.verbose:
                    print(f"  [line {line_no}] OK: {memory_type} ({len(content)} chars)")
            except SecurityBlockError as e:
                print(f"  [line {line_no}] BLOCKED: {e}", file=sys.stderr)
                stats["skipped"] += 1
            except Exception as e:
                print(f"  [line {line_no}] ERROR: {e}", file=sys.stderr)
                stats["errors"] += 1

    elapsed = time.time() - start
    print(f"\nImport complete in {elapsed:.1f}s")
    print(
        f"  Total: {stats['total']}  Imported: {stats['imported']}  Skipped: {stats['skipped']}  Errors: {stats['errors']}"
    )


if __name__ == "__main__":
    main()
