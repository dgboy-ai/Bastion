"""Bastion CLI — Import, Export, Search, Verify, and Status tools.

Usage:
    python -m bastion.cli import --file memories.jsonl --agent my-agent
    python -m bastion.cli export --agent my-agent --output memories.jsonl
    python -m bastion.cli search --agent my-agent --query "CockroachDB config"
    python -m bastion.cli verify --agent my-agent
    python -m bastion.cli status --agent my-agent
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bastion.log_setup import get_logger

logger = get_logger(__name__)


def _get_memory(agent_id: str, connection_string: str | None = None, mock: bool = False):
    from bastion.memory import BastionMemory

    return BastionMemory(agent_id, connection_string=connection_string, mock=mock)


# ── Import ───────────────────────────────────────────────────────────────────


def import_jsonl(
    file_path: str,
    agent_id: str,
    connection_string: str | None = None,
    batch_size: int = 50,
    mock: bool = False,
) -> dict:
    """Import memories from a JSONL file."""
    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}

    mem = _get_memory(agent_id, connection_string, mock)
    imported = skipped = errors = 0

    try:
        with open(path, encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON on line %d, skipping", line_num)
                    errors += 1
                    continue

                content = record.get("content", "")
                if not content:
                    skipped += 1
                    continue

                memory_type = record.get("memory_type", "imported")
                metadata = record.get("metadata", {})
                metadata["import_source"] = "jsonl"
                metadata["import_line"] = line_num
                metadata["import_file"] = str(path.name)

                try:
                    mem.store(
                        memory_type=memory_type,
                        content=content,
                        metadata=metadata,
                        _skip_guard=True,
                        _guard_bypass_token=True,
                    )
                    imported += 1
                except Exception as e:
                    logger.warning("Failed to import line %d: %s", line_num, e)
                    errors += 1

                if imported % batch_size == 0 and imported > 0:
                    logger.info("Imported %d memories so far...", imported)
    finally:
        mem.close()

    result = {
        "file": str(path.name),
        "agent_id": agent_id,
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "total_lines": imported + skipped + errors,
    }
    logger.info("Import complete: %s", result)
    return result


# ── Export ───────────────────────────────────────────────────────────────────


def export_jsonl(
    agent_id: str,
    output_path: str,
    connection_string: str | None = None,
    memory_type: str | None = None,
    mock: bool = False,
) -> dict:
    """Export memories to a JSONL file."""
    mem = _get_memory(agent_id, connection_string, mock)
    try:
        memories = mem.list_all(memory_type=memory_type)
        with open(output_path, "w", encoding="utf-8") as f:
            for m in memories:
                record = {
                    "content": m.content or "",
                    "memory_type": m.memory_type,
                    "metadata": m.metadata or {},
                    "created_at": str(m.created_at) if m.created_at else None,
                    "importance_score": m.importance_score,
                }
                f.write(json.dumps(record, default=str) + "\n")
        return {"agent_id": agent_id, "exported": len(memories), "output": output_path}
    finally:
        mem.close()


# ── Search ───────────────────────────────────────────────────────────────────


def search_memories(
    query: str,
    agent_id: str,
    k: int = 10,
    connection_string: str | None = None,
    mock: bool = False,
) -> dict:
    """Search memories by query."""
    mem = _get_memory(agent_id, connection_string, mock)
    try:
        results = mem.search(query, k=k)
        return {
            "agent_id": agent_id,
            "query": query,
            "count": len(results),
            "results": [
                {
                    "memory_id": r.memory_id,
                    "content": (r.content or "")[:200],
                    "memory_type": r.memory_type,
                    "importance_score": r.importance_score,
                    "created_at": str(r.created_at) if r.created_at else None,
                }
                for r in results
            ],
        }
    finally:
        mem.close()


# ── Verify (hash chain integrity) ───────────────────────────────────────────


def verify_integrity(
    agent_id: str,
    connection_string: str | None = None,
    mock: bool = False,
) -> dict:
    """Verify hash chain integrity for an agent's memories."""

    mem = _get_memory(agent_id, connection_string, mock)
    try:
        memories = mem.list_all()
        if not memories:
            return {"agent_id": agent_id, "status": "EMPTY", "total": 0}

        verified = broken = 0
        broken_ids = []
        sorted_mems = sorted(memories, key=lambda m: m.created_at or "")

        for i, mem_rec in enumerate(sorted_mems):
            if i == 0:
                # First memory has no previous hash to verify against
                verified += 1
                continue

            prev = sorted_mems[i - 1]
            if prev.cryptographic_hash == mem_rec.previous_hash:
                verified += 1
            else:
                broken += 1
                broken_ids.append(mem_rec.memory_id)

        status = "VALID" if broken == 0 else "BROKEN"
        return {
            "agent_id": agent_id,
            "status": status,
            "total": len(memories),
            "verified": verified,
            "broken": broken,
            "broken_ids": broken_ids[:20],
        }
    finally:
        mem.close()


# ── Status ───────────────────────────────────────────────────────────────────


def get_status(
    agent_id: str,
    connection_string: str | None = None,
    mock: bool = False,
) -> dict:
    """Get agent memory status and statistics."""
    mem = _get_memory(agent_id, connection_string, mock)
    try:
        memories = mem.list_all()
        type_counts: dict[str, int] = {}
        total_importance = 0.0
        pinned_count = 0

        for m in memories:
            t = m.memory_type or "unknown"
            type_counts[t] = type_counts.get(t, 0) + 1
            total_importance += m.importance_score or 0
            if getattr(m, "is_pinned", False):
                pinned_count += 1

        return {
            "agent_id": agent_id,
            "total_memories": len(memories),
            "by_type": type_counts,
            "avg_importance": round(total_importance / max(len(memories), 1), 2),
            "pinned_count": pinned_count,
            "mock_mode": mem._mock,
        }
    finally:
        mem.close()


# ── CLI Entry Point ──────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(description="Bastion CLI")
    subparsers = parser.add_subparsers(dest="action", help="Action to perform")

    # import
    p_import = subparsers.add_parser("import", help="Import memories from JSONL")
    p_import.add_argument("--file", required=True, help="Path to JSONL file")
    p_import.add_argument("--agent", required=True, help="Agent ID")
    p_import.add_argument("--conn", help="CockroachDB connection string")
    p_import.add_argument("--batch-size", type=int, default=50)
    p_import.add_argument("--mock", action="store_true")

    # export
    p_export = subparsers.add_parser("export", help="Export memories to JSONL")
    p_export.add_argument("--agent", required=True, help="Agent ID")
    p_export.add_argument("--output", required=True, help="Output JSONL path")
    p_export.add_argument("--conn", help="CockroachDB connection string")
    p_export.add_argument("--type", dest="memory_type", help="Filter by memory type")
    p_export.add_argument("--mock", action="store_true")

    # search
    p_search = subparsers.add_parser("search", help="Search memories")
    p_search.add_argument("--agent", required=True, help="Agent ID")
    p_search.add_argument("--query", required=True, help="Search query")
    p_search.add_argument("-k", type=int, default=10, help="Number of results")
    p_search.add_argument("--conn", help="CockroachDB connection string")
    p_search.add_argument("--mock", action="store_true")

    # verify
    p_verify = subparsers.add_parser("verify", help="Verify hash chain integrity")
    p_verify.add_argument("--agent", required=True, help="Agent ID")
    p_verify.add_argument("--conn", help="CockroachDB connection string")
    p_verify.add_argument("--mock", action="store_true")

    # status
    p_status = subparsers.add_parser("status", help="Get memory status")
    p_status.add_argument("--agent", required=True, help="Agent ID")
    p_status.add_argument("--conn", help="CockroachDB connection string")
    p_status.add_argument("--mock", action="store_true")

    args = parser.parse_args()

    if not args.action:
        parser.print_help()
        sys.exit(1)

    if args.action == "import":
        result = import_jsonl(args.file, args.agent, args.conn, args.batch_size, args.mock)
    elif args.action == "export":
        result = export_jsonl(args.agent, args.output, args.conn, getattr(args, "memory_type", None), args.mock)
    elif args.action == "search":
        result = search_memories(args.query, args.agent, args.k, args.conn, args.mock)
    elif args.action == "verify":
        result = verify_integrity(args.agent, args.conn, args.mock)
    elif args.action == "status":
        result = get_status(args.agent, args.conn, args.mock)
    else:
        parser.print_help()
        sys.exit(1)

    print(json.dumps(result, indent=2, default=str))
    sys.exit(1 if result.get("errors") or result.get("status") == "BROKEN" else 0)


if __name__ == "__main__":
    main()
