# Bastion

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/Database-CockroachDB-000000?logo=cockroachlabs&logoColor=white)](https://cockroachlabs.cloud)
[![AWS](https://img.shields.io/badge/Cloud-AWS-232F3E?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)

**Memory that survives crashes — so AI agents never forget.**

88% of AI agents fail in production. The #1 reason: their memory doesn't survive the crash. Bastion gives agents memory that persists across failures, detects corruption, and heals itself — built on CockroachDB's distributed SQL.

---

## The Problem

```
Agent builds context for 50 interactions → Process dies → Restart
"Hello, I'm an AI assistant."  ← Blank slate. Every time.
```

## The Fix

```
Agent builds context → Process dies → Restart
"Welcome back, John. Last session we were working on Project X."
```

---

## Quick Start (3 Lines)

```python
from bastion import BastionMemory

mem = BastionMemory("my-agent", mock=True)  # or pass CockroachDB connection string
mem.store("fact", "User prefers dark mode")  # SHA-256 hash-chained, vector-indexed
results = mem.search("design preferences")   # C-SPANN semantic search
```

```typescript
import { BastionMemory } from "bastion-memory";

const mem = new BastionMemory("my-agent");
await mem.store("fact", "User prefers dark mode");
const results = await mem.search("design preferences");
```

---

## 12 Features, One SDK

| # | Feature | How It Works |
|---|---------|-------------|
| 1 | **Hash-Chained Memory** | SHA-256 chain: each record links to the previous. Tampering detected instantly. |
| 2 | **C-SPANN Semantic Search** | Distributed vector indexing — 94% smaller than pgvector, real-time inserts. |
| 3 | **Knowledge Graph** | Entity extraction + multi-hop traversal across agent memories. |
| 4 | **Semantic Caching** | Identical queries return from C-SPANN cache at 0ms, zero LLM cost. |
| 5 | **Time Travel** | `AS OF SYSTEM TIME` — reconstruct agent state at any past moment. |
| 6 | **Memory Diff** | Compare agent state between two timestamps, see what changed. |
| 7 | **Audit Log** | Append-only, hash-chained operation history. Immutable. |
| 8 | **Self-Healing** | CDC changefeeds stream writes to Lambda for real-time anomaly detection. |
| 9 | **Conflict Resolution** | SERIALIZABLE isolation catches contradictions, LLM merges facts. |
| 10 | **PII Detection** | Automatic redaction of SSN, email, phone, API keys before storage. |
| 11 | **Memory Analytics** | Health scores, growth trends, topic distribution, decay curves. |
| 12 | **Agent Checkpointing** | Save/restore agent state at any point. Crash recovery in one call. |

---

## CockroachDB Tools Used

| Tool | Bastion Usage |
|------|---------------|
| **C-SPANN Vector Indexing** | Core semantic memory engine — every search uses distributed vector similarity |
| **MCP Server** | 6 tools for agents to query their own memory via Cursor, Claude Code, VS Code |
| **ccloud CLI** | `provision_cluster()` — agent provisions its own CockroachDB cluster on first boot |
| **Agent Skills** | 5 pre-built memory skills: store, search, timetravel, audit, heal |

## AWS Services Used

| Service | Bastion Usage |
|---------|---------------|
| **Amazon Bedrock** | Titan V2 embeddings for vector indexing |
| **AWS Lambda** | CDC event processing, anomaly detection, self-healing triggers |
| **Amazon S3** | Long-term memory archives and compliance snapshots |

---

## Comparison

| Capability | Bastion | Mem0 | Zep | DBOS | Temporal |
|-----------|---------|------|-----|------|----------|
| Hash-chained memory | **Yes** | No | No | No | No |
| C-SPANN vectors (94% smaller) | **Yes** | pgvector | Neo4j | pgvector | No |
| CDC self-healing | **Yes** | No | No | No | No |
| Time travel (AS OF SYSTEM TIME) | **Yes** | No | No | No | No |
| SERIALIZABLE coordination | **Yes** | No | No | No | No |
| MCP + ccloud + Skills | **Yes** | No | No | No | No |
| Python + TypeScript SDK | **Yes** | Python only | Python | Python | Python |
| Framework adapters | **3** (LangChain, CrewAI, LlamaIndex) | 1 | 1 | 0 | 0 |

---

## Architecture

```
    AI Framework (LangChain / CrewAI / LlamaIndex / raw Python)
                    │
            from bastion import BastionMemory
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │         Bastion Memory SDK            │
    │  ┌──────────┐ ┌────────┐ ┌─────────┐ │
    │  │ C-SPANN  │ │  CDC   │ │  Time   │ │
    │  │ Vectors  │ │Changefeed│ │ Travel │ │
    │  └────┬─────┘ └───┬────┘ └────┬────┘ │
    └───────┼────────────┼──────────┼───────┘
            │            │          │
            ▼            ▼          ▼
    ┌───────────────────────────────────────┐
    │           CockroachDB                 │
    │  agent_memory (C-SPANN)              │
    │  agent_checkpoints (CDC → Lambda)    │
    │  agent_audit (AS OF SYSTEM TIME)     │
    │  agent_coordination (SERIALIZABLE)   │
    └───────────────────────────────────────┘
```

---

## Running

```bash
# Mock mode (no database needed)
BASTION_MOCK=true python examples/full_demo.py

# Live mode (requires CockroachDB)
export BASTION_CONN="postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
python scripts/apply_schema.py
python examples/full_demo.py

# Benchmarks
BASTION_MOCK=true python examples/benchmark.py

# Tests
python -m pytest --tb=short -q    # 250+ tests
```

---

## MCP Server Setup

Add to your editor config (Cursor, Claude Code, VS Code):

```json
{
  "mcpServers": {
    "bastion-memory": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
      }
    }
  }
}
```

6 tools available: `memory_search`, `memory_store`, `memory_timetravel`, `memory_audit`, `memory_heal`, `resolve_conflict`.

---

## Tech Stack

- **Python SDK**: `psycopg3` (async CockroachDB driver)
- **TypeScript SDK**: `pg` (Node.js CockroachDB driver)
- **Database**: CockroachDB (C-SPANN vectors, CDC changefeeds, AS OF SYSTEM TIME, SERIALIZABLE)
- **Embeddings**: Amazon Bedrock Titan V2 (1024-dim)
- **Serverless**: AWS Lambda (CDC processing), Amazon S3 (archives)
- **Frameworks**: LangChain, CrewAI, LlamaIndex adapters
- **Observability**: OpenTelemetry traces on every memory operation

---

## Test Results

```
290 passed, 0 failed
├── test_memory.py        — Store, search, hash chain, time travel
├── test_agent.py         — Agent loop, PII detection, checkpointing
├── test_mcp_server.py    — MCP tools, schemas, descriptions
├── test_chaos.py         — Crash recovery, poisoning detection, multi-agent
├── test_consolidator.py  — Duplicate detection, merge, pruning
├── test_analytics.py     — Health scores, growth, topics, quality
├── test_knowledge_graph.py — Entity extraction, traversal
├── test_telemetry.py     — OpenTelemetry span verification
├── test_crdt_memory.py   — CRDT conflict resolution
├── test_drift.py         — Behavioral drift detection
├── test_trust.py         — Trust scoring and poisoning detection
├── test_compliance.py    — EU AI Act compliance reporting
├── adapters/             — LangChain, CrewAI, LlamaIndex adapters
└── sdk/typescript/       — TypeScript SDK tests
```

---

## License

MIT — use it, fork it, ship it.
