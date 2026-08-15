#!/usr/bin/env python
"""
Bastion 2-Minute Setup
Adds Bastion persistent memory to your coding agent in one command.

Usage:
    python setup_bastion.py --tool cursor
    python setup_bastion.py --tool claude
    python setup_bastion.py --tool vscode
    python setup_bastion.py --tool cline
    python setup_bastion.py --tool all
"""

import argparse
import json
import os
import sys
import subprocess
from pathlib import Path

BASTION_DIR = Path(__file__).parent.parent
CONFIG_TEMPLATE = {
    "command": "python",
    "args": ["-m", "bastion.mcp_server"],
    "env": {
        "BASTION_CONN": "postgresql://root@localhost:26257/defaultdb?sslmode=disable"
    }
}


def check_prerequisites():
    """Check Python and CockroachDB are available."""
    errors = []
    
    # Check Python
    try:
        result = subprocess.run([sys.executable, "--version"], capture_output=True, text=True)
        if result.returncode != 0:
            errors.append("Python not found")
    except Exception:
        errors.append("Python not found")
    
    # Check bastion module
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import bastion; print('ok')"],
            capture_output=True, text=True, cwd=str(BASTION_DIR)
        )
        if result.returncode != 0:
            errors.append(f"Bastion module not importable: {result.stderr[:200]}")
    except Exception as e:
        errors.append(f"Cannot import bastion: {e}")
    
    return errors


def setup_cursor():
    """Add Bastion to Cursor MCP config."""
    config_dir = BASTION_DIR / ".cursor"
    config_dir.mkdir(exist_ok=True)
    config_file = config_dir / "mcp.json"
    
    config = {"mcpServers": {"bastion": CONFIG_TEMPLATE}}
    config_file.write_text(json.dumps(config, indent=2))
    print(f"  [OK] Cursor config written to {config_file}")
    print(f"  [!] Restart Cursor to load Bastion")


def setup_claude():
    """Add Bastion to Claude Code via CLI."""
    try:
        result = subprocess.run(
            ["claude", "mcp", "add", "bastion", "--",
             sys.executable, "-m", "bastion.mcp_server"],
            capture_output=True, text=True, cwd=str(BASTION_DIR)
        )
        if result.returncode == 0:
            print(f"  [OK] Bastion added to Claude Code")
        else:
            print(f"  [WARN] claude CLI returned: {result.stderr[:200]}")
            print(f"  [!] Add manually: claude mcp add bastion -- python -m bastion.mcp_server")
    except FileNotFoundError:
        print(f"  [!] Claude CLI not found. Add manually:")
        print(f"      claude mcp add bastion -- python -m bastion.mcp_server")


def setup_vscode():
    """Add Bastion to VS Code MCP config."""
    config_dir = BASTION_DIR / ".vscode"
    config_dir.mkdir(exist_ok=True)
    config_file = config_dir / "mcp.json"
    
    config = {"servers": {"bastion": CONFIG_TEMPLATE}}
    config_file.write_text(json.dumps(config, indent=2))
    print(f"  [OK] VS Code config written to {config_file}")
    print(f"  [!] Restart VS Code to load Bastion")


def setup_cline():
    """Add Bastion to Cline MCP config."""
    config_dir = BASTION_DIR / ".cline"
    config_dir.mkdir(exist_ok=True)
    config_file = config_dir / "mcp.json"
    
    config = {"mcpServers": {"bastion": CONFIG_TEMPLATE}}
    config_file.write_text(json.dumps(config, indent=2))
    print(f"  [OK] Cline config written to {config_file}")
    print(f"  [!] Restart Cline to load Bastion")


SETUP_FUNCS = {
    "cursor": setup_cursor,
    "claude": setup_claude,
    "vscode": setup_vscode,
    "cline": setup_cline,
}


def main():
    parser = argparse.ArgumentParser(description="Bastion 2-Minute Setup")
    parser.add_argument("--tool", choices=["cursor", "claude", "vscode", "cline", "all"],
                        default="cursor", help="Which coding agent to configure")
    args = parser.parse_args()
    
    print("Bastion Setup")
    print("=" * 50)
    
    # Check prerequisites
    print("\nChecking prerequisites...")
    errors = check_prerequisites()
    if errors:
        for e in errors:
            print(f"  [FAIL] {e}")
        print("\nFix the above and retry.")
        sys.exit(1)
    print("  [OK] Python + Bastion module found")
    
    # Check connection string
    conn = os.environ.get("BASTION_CONN", "")
    if not conn:
        env_file = BASTION_DIR / ".env.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("BASTION_CONN="):
                    conn = line.split("=", 1)[1].strip().strip('"').strip("'")
                    os.environ["BASTION_CONN"] = conn
                    break
    
    if not conn:
        print("  [WARN] BASTION_CONN not set. Using default (local CockroachDB).")
        print("  [!] Set BASTION_CONN in .env.local for production use.")
    
    # Setup
    print(f"\nConfiguring {args.tool}...")
    if args.tool == "all":
        for name, func in SETUP_FUNCS.items():
            print(f"\n  Setting up {name}...")
            func()
    else:
        SETUP_FUNCS[args.tool]()
    
    print("\n" + "=" * 50)
    print("Setup complete!")
    print("\nBastion gives your coding agent:")
    print("  - Persistent memory across sessions")
    print("  - SHA-256 hash chain integrity")
    print("  - Poison detection & self-healing")
    print("  - Time-travel audit (AS OF SYSTEM TIME)")
    print("  - 35 tools via MCP protocol")
    print("\nYour agent can now:")
    print("  memory_store(content='Fixed auth bug', memory_type='fact')")
    print("  memory_search(query='previous auth issues')")
    print("  memory_timetravel(timestamp='2026-08-01T00:00:00Z')")
    print("  memory_heal()")


if __name__ == "__main__":
    main()
