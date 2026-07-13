# Bastion — Agentic Memory on CockroachDB

> **The only memory layer with cryptographic integrity, time-travel, and multi-region distribution.**

## Try It Now (2 minutes)

```bash
git clone https://github.com/dgboy-ai/Bastion
cd Bastion
docker compose -f docker-compose.demo.yml up
# Dashboard: http://localhost:3000
```

## What It Does

Bastion gives AI agents **persistent memory** that:
- **Never forgets** — SHA-256 hash chains prove every memory is tamper-evident
- **Time-travels** — Query memory state at any past point (via CockroachDB MVCC)
- **Self-heals** — Detects and repairs corruption automatically
- **Stays secure** — OWASP ASI06 guard blocks prompt injection attacks
- **Scales globally** — 6 CockroachDB regions with 12-42ms latency

## Why CockroachDB (Not Postgres)

| Feature | CockroachDB | Postgres |
|---------|-------------|----------|
| AS OF SYSTEM TIME | ✅ Native | ❌ Extensions |
| Multi-Region | ✅ Automatic | ❌ Manual |
| SERIALIZABLE | ✅ Default | ❌ READ COMMITTED |
| C-SPANN Vector | ✅ Distributed | ❌ pgvector |
| CDC Changefeeds | ✅ Built-in | ❌ Debezium |

## Quick Start

### Docker (Recommended)
```bash
docker compose -f docker-compose.demo.yml up
```

### Python
```bash
pip install bastion-memory
python scripts/demo.py
```

### MCP Server
```bash
python -m bastion.mcp_server
# Connect from Claude/Cursor/LangGraph
```

## 3 Lines of Code

```python
from bastion import BastionMemory

mem = BastionMemory(agent_id="my-agent", mock=True)
record = mem.store("fact", "User prefers dark mode.")
results = mem.search("user preferences", k=5)
```

## What Makes It Different

1. **SHA-256 Hash Chains** — Cryptographic proof every memory is tamper-evident
2. **AS OF SYSTEM TIME** — Query memory state at any past point
3. **OWASP ASI06 Guard** — Blocks prompt injection attacks
4. **LTM Gateway** — Saves 2,965 tokens per reuse
5. **Sleep-Time Dreaming** — Consolidates memories during idle time

## Production Proof

- **1,147 tests** passing
- **25 MCP tools** for AI agents
- **6 global regions** with 12-42ms latency
- **OWASP ASI06** security guard
- **OAuth 2.1 + PKCE** authentication

## Links

- **Dashboard**: https://bastion-self.vercel.app/dashboard
- **Docs**: https://bastion-self.vercel.app/docs
- **GitHub**: https://github.com/dgboy-ai/Bastion
- **Video**: [Coming soon]
