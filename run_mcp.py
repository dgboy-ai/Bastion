"""Clean entry point for Bastion MCP Server — avoids circular import in bastion/__init__.py.

Usage:
    python run_mcp.py [--transport http] [--host 0.0.0.0] [--port 9997] [--mock]
"""

import os
import sys

# Ensure src is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from bastion.mcp_server import main

if __name__ == "__main__":
    main()
