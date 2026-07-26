# Bastion MCP Client Configurations

All three configs connect to the same Bastion MCP server (25 tools).
Replace `BASTION_CONN` with your real CockroachDB connection string.

---

## OpenCode (`opencode.json` in project root)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "bastion": {
      "type": "local",
      "command": ["python", "-m", "bastion.mcp_server"],
      "enabled": true,
      "environment": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/bastion?sslmode=verify-full",
        "BASTION_MOCK": "false",
        "AWS_REGION": "us-east-1"
      }
    }
  }
}
```

Usage: `store this memory using bastion`

---

## Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
      }
    }
  }
}
```

Windows path: `%APPDATA%\Claude\claude_desktop_config.json`
macOS path: `~/Library/Application Support/Claude/claude_desktop_config.json`

---

## Cursor / VS Code (`.vscode/settings.json`)

```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
      }
    }
  }
}
```

---

## Remote (Docker)

```bash
docker run -p 9997:9997 -e BASTION_CONN="postgresql://..." bastion-mcp
```

Then point any MCP client to `http://localhost:9997`.

---

## Available Tools (25)

| Tool | What It Does |
|------|-------------|
| `memory_store` | Store memory with hash chain + vector embedding |
| `memory_search` | Semantic vector search across memories |
| `memory_timetravel` | Query memory state at any past timestamp |
| `memory_audit` | Verify hash chain integrity |
| `memory_heal` | Detect and repair corruption |
| `memory_health` | Memory health metrics |
| `graph_query` | Knowledge graph traversal |
| `resolve_conflict` | CRDT conflict resolution |
| `a2a_bridge` | Generate signed A2A Agent Card |
| `context_pack` | Pack memories into token budget |
| ... | 15 more tools (see `skills/manifest.json`) |
