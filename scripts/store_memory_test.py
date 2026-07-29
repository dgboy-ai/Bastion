"""Store a memory from the terminal — shows up live in the dashboard.

Usage:
    python scripts/store_memory_test.py "Your memory content here"
    python scripts/store_memory_test.py "Revenue is $2M" --type fact
    python scripts/store_memory_test.py "User prefers dark mode" --type preference

The dashboard's Live Event Feed will show this event within 5 seconds.
Requires: BASTION_CONN or docker compose up
"""

import os
import sys
import time

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from bastion import BastionMemory


def main():
    content = sys.argv[1] if len(sys.argv) > 1 else f"Test memory stored at {time.strftime('%H:%M:%S')}"
    memory_type = "fact"

    # Parse --type flag
    if "--type" in sys.argv:
        idx = sys.argv.index("--type")
        if idx + 1 < len(sys.argv):
            memory_type = sys.argv[idx + 1]

    # Parse --agent flag
    agent_id = "demo-terminal"
    if "--agent" in sys.argv:
        idx = sys.argv.index("--agent")
        if idx + 1 < len(sys.argv):
            agent_id = sys.argv[idx + 1]

    # Use mock mode if no connection string
    conn_str = os.environ.get("BASTION_CONN")
    mock = not conn_str

    mem = BastionMemory(agent_id, connection_string=conn_str, mock=mock)

    print(f"Storing memory as agent '{agent_id}'...")
    print(f"  Type: {memory_type}")
    print(f"  Content: {content}")

    record = mem.store(memory_type, content, metadata={"source": "terminal", "timestamp": time.time()})

    print("\n  Stored successfully!")
    print(f"    Memory ID: {record.memory_id}")
    print(f"    Hash: {record.cryptographic_hash[:16]}...")
    print(f"    Chain: {record.previous_hash[:16] if record.previous_hash else 'GENESIS'}...")

    if not mock:
        print("\n  Dashboard will show this event within 5 seconds.")
    else:
        print("\n  Running in mock mode — dashboard shows simulated events.")

    mem.close()


if __name__ == "__main__":
    main()
