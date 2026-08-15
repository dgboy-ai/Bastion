# Bastion Integrations

Add persistent, trustworthy memory to any MCP-compatible coding agent in 2 minutes.

## Quick Start

### Cursor
```bash
# Option 1: Auto-setup
python integrations/setup_bastion.py --tool cursor

# Option 2: Manual
# Copy .cursor/mcp.json to your project root
# Restart Cursor
```

### Claude Code
```bash
# Option 1: Auto-setup
python integrations/setup_bastion.py --tool claude

# Option 2: Manual
claude mcp add bastion -- python -m bastion.mcp_server
```

### VS Code (GitHub Copilot Chat)
```bash
# Option 1: Auto-setup
python integrations/setup_bastion.py --tool vscode

# Option 2: Manual
# Copy .vscode/mcp.json to your project root
# Restart VS Code
```

### Cline
```bash
# Option 1: Auto-setup
python integrations/setup_bastion.py --tool cline

# Option 2: Manual
# Copy .cline/mcp.json to your project root
# Restart Cline
```

## What Your Agent Gets

Once installed, your coding agent has access to 35 tools:

| Category | Tools |
|----------|-------|
| **Memory** | `memory_store`, `memory_search`, `memory_list`, `memory_delete`, `memory_correct` |
| **Integrity** | `memory_heal`, `forensic_report`, `scan_all_contradictions`, `resolve_conflict` |
| **Audit** | `memory_audit`, `memory_timetravel`, `compliance_report` |
| **Context** | `context_pack`, `multi_signal_search`, `detect_observations` |
| **Knowledge** | `dream`, `dream_history`, `ltm_check_reuse`, `ltm_store_analysis` |
| **CockroachDB** | `invoke_agent_skill`, `ccloud_exec`, `managed_mcp_call` |

## Example Usage

Your agent will automatically use Bastion when it needs to remember things:

```
You: "Remember that the auth module uses JWT tokens with 15-minute expiry"

Agent calls: memory_store(
    content="Auth module uses JWT tokens with 15-minute expiry. RS256 algorithm.",
    memory_type="fact"
)

You: "What did we set up for authentication last week?"

Agent calls: memory_search(query="authentication setup JWT tokens")
```

## Configuration

Set your CockroachDB connection in `.env.local`:
```
BASTION_CONN=postgresql://user:pass@host:26257/defaultdb?sslmode=disable
```

## Architecture

```
Your Coding Agent (Cursor/Claude/VS Code)
    ↓ MCP Protocol
Bastion MCP Server (35 tools)
    ↓ SQL
CockroachDB (SERIALIZABLE, AS OF SYSTEM TIME, C-SPANN vectors)
    ↓ Hash Chain
SHA-256 HMAC Integrity (tamper-evident)
```
