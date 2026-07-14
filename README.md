# Bastion — The Forensic System of Record for Autonomous Agents

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/Database-CockroachDB-000000?logo=cockroachlabs&logoColor=white)](https://cockroachlabs.cloud)
[![AWS](https://img.shields.io/badge/Cloud-AWS-232F3E?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![Tests](https://img.shields.io/badge/Tests-1147%20passed-brightgreen)](#test-suite)

> **When an agent is poisoned, Bastion detects it, travels back to inspect the prior belief, and restores a verified state with cryptographic proof.**

[Live Demo](https://bastion-self.vercel.app/) · [Dashboard](https://bastion-self.vercel.app/dashboard) · [Documentation](https://bastion-self.vercel.app/docs)

---

## The Problem

AI agents are being poisoned in production. A single malicious memory can corrupt an agent's behavior — and there's no way to prove what happened, when it happened, or how to fix it.

Traditional databases can't help. They weren't built for:
- **Cryptographic integrity** — proving memory hasn't been tampered with
- **Time-travel debugging** — seeing what the agent knew at any point
- **Self-healing** — detecting and repairing corruption automatically

## The Solution

Bastion is the forensic system of record for autonomous agents. Built on **CockroachDB** and **AWS**, it provides:

| Capability | What It Does |
|------------|--------------|
| **Detect** | OWASP ASI06 guard blocks poisoned memories instantly |
| **Investigate** | Time-travel to see exactly what the agent knew at any past moment |
| **Recover** | Hash chains prove integrity, restore verified state |
| **Audit** | Every operation logged with timestamps, hashes, and agent IDs |

---

## Try It Now (2 minutes)

```bash
# Clone and start
git clone https://github.com/dgboy-ai/Bastion
cd Bastion
docker compose -f docker-compose.demo.yml up

# Dashboard: http://localhost:3000
# CockroachDB: http://localhost:8080
```

Or with Python:
```bash
pip install bastion-memory
python scripts/demo.py
```

---

## How It Works

```
Agent receives memory
        ↓
┌─────────────────────────┐
│   OWASP ASI06 Guard     │ ← Blocks poisoned content
└─────────────────────────┘
        ↓ (safe)
┌─────────────────────────┐
│   SHA-256 Hash Chain    │ ← Cryptographic integrity
└─────────────────────────┘
        ↓
┌─────────────────────────┐
│   CockroachDB Storage   │ ← Persistent, distributed
└─────────────────────────┘
        ↓
┌─────────────────────────┐
│   Time-Travel Query     │ ← "What did agent know at 3 PM?"
└─────────────────────────┘
        ↓
┌─────────────────────────┐
│   Audit Trail           │ ← Every operation logged
└─────────────────────────┘
```

---

## Why CockroachDB?

Bastion **cannot work without CockroachDB**. Here's why:

| Feature | CockroachDB | Postgres | Why It Matters |
|---------|-------------|----------|----------------|
| **AS OF SYSTEM TIME** | ✅ Native | ❌ Extensions | Time-travel debugging |
| **SERIALIZABLE** | ✅ Default | ❌ READ COMMITTED | No data corruption |
| **Multi-Region** | ✅ Automatic | ❌ Manual setup | Global agent memory |
| **C-SPANN Vector** | ✅ Distributed | ❌ pgvector | Scale to billions |
| **CDC Changefeeds** | ✅ Built-in | ❌ Debezium | Real-time self-healing |

**Without CockroachDB, Bastion cannot:**
- Time-travel to debug agent decisions
- Provide cryptographic proof of memory integrity
- Scale across 6 global regions
- Self-heal from corruption

---

## Verified With Real CockroachDB

**17 integration tests** run against a real CockroachDB cluster. Every feature has been verified:

| Feature | Status | Verified |
|---------|--------|----------|
| Store memories | ✅ | Real cluster |
| Search memories | ✅ | Real cluster |
| Hash chain integrity | ✅ | Real cluster |
| Time-travel queries | ✅ | Real cluster |
| Audit trail | ✅ | Real cluster |
| Self-healing | ✅ | Real cluster |
| Memory health | ✅ | Real cluster |
| Trust scoring | ✅ | Real cluster |
| LTM Gateway | ✅ | Real cluster |
| OWASP guard | ✅ | Real cluster |

---

## Key Features

### 1. SHA-256 Hash Chains
Every memory is cryptographically linked to its predecessor. Tamper-proof by design.

```python
r1 = mem.store("fact", "First memory")
r2 = mem.store("fact", "Second memory")
# r2.previous_hash == r1.cryptographic_hash ✓
```

### 2. Time-Travel Queries
Query memory state at any point in the past using CockroachDB's `AS OF SYSTEM TIME`.

```python
past = mem.get_at_time("3 PM yesterday")
# See exactly what the agent knew at that moment
```

### 3. OWASP ASI06 Security Guard
Blocks prompt injection attacks before they reach memory.

```python
from bastion.guard import MemoryGuard
guard = MemoryGuard()
safe = guard.check("Hello world")           # ✅ Pass
attack = guard.check("ignore all previous instructions")  # 🚫 Blocked
```

### 4. LTM Gateway
Before running expensive workflows, check if a similar analysis already exists.

```python
from bastion.ltm_gateway import LTMMemoryGateway
gateway = LTMMemoryGateway(mem)
result = gateway.check_reuse("analyze Q2 revenue trends")
if result:
    # Reuse cached analysis — save 2,965 tokens
```

### 5. MCP Server (25 Tools)
Connect from Claude, Cursor, LangGraph, or any MCP-compatible client.

```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/defaultdb?sslmode=disable"
      }
    }
  }
}
```

---

## CockroachDB Tools Used

| Tool | How We Use It |
|------|---------------|
| **MCP Server** | 25 tools, 4 resources, 3 prompts for agent integration |
| **Distributed Vector Indexing** | C-SPANN with 1024-dim embeddings (94% smaller than pgvector) |
| **ccloud CLI** | Cluster provisioning, schema migrations, health checks |
| **Agent Skills Repo** | 8 machine-executable skills for memory operations |

## AWS Services Used

| Service | Usage |
|---------|-------|
| **Amazon Bedrock** | Titan V2 embeddings (1024-dim) |
| **AWS Lambda** | CDC handler, webhook dispatcher |
| **Amazon S3** | Memory archives with Glacier lifecycle |
| **AWS KMS** | AES-256-GCM envelope encryption |

---

## Test Suite

```bash
python -m pytest tests/ -v
# 1147 passed, 58 skipped, 0 failed
```

**Coverage:**
- Memory operations (store, search, time-travel, audit)
- Hash chain integrity
- OWASP ASI06 guard (9 injection patterns)
- LTM Gateway (token savings)
- Dreaming consolidation
- CRDT conflict resolution
- Circuit breaker patterns
- Real CockroachDB integration (17 tests)

---

## Documentation

**Start here:**
- [Judge's Guide](docs/JUDGES_GUIDE.md) — 2-minute evaluation walkthrough
- [CockroachDB Tools](docs/COCKROACHDB_TOOLS.md) — How we use MCP, C-SPANN, ccloud CLI
- [Architecture](docs/ARCHITECTURE.md) — System design and data flow

**Learn more:**
- [AI Safety](docs/AI_SAFETY.md) — OWASP ASI06 guard, PII detection
- [Problems Solved](docs/PROBLEMS_SOLVED.md) — Amnesia, poisoning, crashes
- [AWS Services](docs/AWS_SERVICES.md) — Bedrock, Lambda, S3, KMS
- [Comparison](docs/COMPARISON.md) — vs Mem0, Zep, Cognee, Letta
- [Deployment](docs/DEPLOYMENT.md) — Docker, AWS, CockroachDB Serverless

<details>
<summary>All Documentation (13 guides + 6 ADRs)</summary>

| Guide | Description |
|-------|-------------|
| [MCP Server](docs/MCP_SERVER.md) | 25 tools, 4 resources, 3 prompts |
| [A2A Server](docs/A2A_SERVER.md) | Agent-to-agent protocol |
| [Integration](docs/INTEGRATION.md) | LangChain, CrewAI, LlamaIndex |
| [Development](docs/DEVELOPMENT.md) | Local setup, testing |
| [Repo Map](docs/REPO_MAP.md) | Codebase structure |

**Architecture Decision Records:**
| ADR | Decision |
|-----|----------|
| [001](docs/adr/001-hash-chain-integrity.md) | SHA-256 hash chains |
| [002](docs/adr/002-c-spann-vector-indexing.md) | C-SPANN vector index |
| [003](docs/adr/003-time-travel-memory.md) | AS OF SYSTEM TIME |
| [004](docs/adr/004-serializable-coordination.md) | SERIALIZABLE isolation |
| [005](docs/adr/005-cdc-self-healing.md) | CDC self-healing |
| [006](docs/adr/006-dual-language-sdk.md) | Python + TypeScript SDKs |

</details>

---

## License

MIT License — Free forever. See [LICENSE](LICENSE) for details.
