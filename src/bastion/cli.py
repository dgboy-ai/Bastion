"""JSONL Import CLI — Import memories from JSONL files.

Usage:
    python -m bastion.cli import --file memories.jsonl --agent my-agent
    python -m bastion.cli import --file data.jsonl --agent my-agent --batch-size 100
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from bastion.log_setup import get_logger

logger = get_logger(__name__)


def import_jsonl(
    file_path: str,
    agent_id: str,
    connection_string: str | None = None,
    batch_size: int = 50,
    mock: bool = False,
) -> dict:
    """Import memories from a JSONL file.

    Each line should be a JSON object with at minimum:
    - "content": the memory content (required)
    - "memory_type": optional type (default: "imported")
    - "metadata": optional dict of additional metadata

    Returns import statistics.
    """
    from bastion.memory import BastionMemory

    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}

    mem = BastionMemory(agent_id, connection_string=connection_string, mock=mock)

    imported = 0
    skipped = 0
    errors = 0

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


def main():
    parser = argparse.ArgumentParser(description="Bastion JSONL Import CLI")
    parser.add_argument("action", choices=["import"], help="Action to perform")
    parser.add_argument("--file", required=True, help="Path to JSONL file")
    parser.add_argument("--agent", required=True, help="Agent ID for imported memories")
    parser.add_argument("--conn", help="CockroachDB connection string")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for progress logging")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode")
    args = parser.parse_args()

    if args.action == "import":
        result = import_jsonl(
            file_path=args.file,
            agent_id=args.agent,
            connection_string=args.conn,
            batch_size=args.batch_size,
            mock=args.mock,
        )
        print(json.dumps(result, indent=2))
        sys.exit(1 if result.get("errors") else 0)


if __name__ == "__main__":
    main()
