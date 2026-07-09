# 🪳 Bastion: Persistent, Self-Healing Agentic Memory

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/Database-CockroachDB-000000?logo=cockroachlabs&logoColor=white)](https://cockroachlabs.cloud)
[![AWS](https://img.shields.io/badge/Cloud-AWS-232F3E?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![FastMCP](https://img.shields.io/badge/Protocol-FastMCP-blue.svg)](https://spec.modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-594%20passed-brightgreen)](#-test-verification-suite)

> **The system of record for autonomous AI systems. A persistent, secure, and self-healing memory engine that survives serverless crashes—so your agent swarms never forget.**

---

## 📖 Quick Reference Guide

We have separated Bastion's detailed technical operations, database designs, and evaluation pathways into dedicated guide modules for easy review:

| Guide Name | Clickable Link | What It Covers |
| :--- | :--- | :--- |
| **System Architecture** | [docs/ARCHITECTURE.md](file:///c:/projects/bastion/docs/ARCHITECTURE.md) | CockroachDB tables, primary/foreign keys, connection pooling, and C-SPANN settings. |
| **AI Safety & Guards** | [docs/AI_SAFETY.md](file:///c:/projects/bastion/docs/AI_SAFETY.md) | OWASP ASI06 defenses, regex filters, Groq LLM validation rules, and multi-lang checks. |
| **Judge's Walkthrough** | [docs/JUDGES_GUIDE.md](file:///c:/projects/bastion/docs/JUDGES_GUIDE.md) | Step-by-step scoring walkthrough for database, AI safety, and serverless tracks. |
| **Deployment Guide** | [docs/DEPLOYMENT.md](file:///c:/projects/bastion/docs/DEPLOYMENT.md) | AWS Lambda pools, Vercel scaling setups, and Docker Compose scripts. |
| **Development Setup** | [docs/DEVELOPMENT.md](file:///c:/projects/bastion/docs/DEVELOPMENT.md) | Local mock mode configs, migrations, and MCP startup guides. |
| **Repository Map** | [docs/REPO_MAP.md](file:///c:/projects/bastion/docs/REPO_MAP.md) | Complete codebase tree mapping modules to architectural roles. |
| **CockroachDB Tools** | [docs/COCKROACHDB_TOOLS.md](file:///c:/projects/bastion/docs/COCKROACHDB_TOOLS.md) | How we use MCP Server, C-SPANN, ccloud CLI, and Agent Skills. |
| **AWS Services** | [docs/AWS_SERVICES.md](file:///c:/projects/bastion/docs/AWS_SERVICES.md) | Bedrock embeddings, KMS encryption, and architecture diagram. |

---

## 💡 Why Bastion?

Traditional databases are optimized for human-scale reads and writes. Autonomous AI agents are fundamentally different: they spawn dynamically, read and write constantly, execute infinite loops, and require context state that persists across serverless lifecycle boundaries, container recycles, and region outages. 

If an agent's memory drops offline or corrupts, it doesn't degrade gracefully—**it stops, hallucinates, or reverts to a blank slate.**

Bastion is a production-grade Agentic Memory framework built directly on **CockroachDB's distributed SQL engine** and **AWS serverless architecture**. It provides developers with a robust, enterprise-secure memory ledger that solves the three critical vulnerabilities of 2026 agent runtimes: **amnesia, memory poisoning, and serverless concurrency crashes.**

---

## ⚡ Feature Comparison Matrix

| Feature | Bastion (OSS) | Mem0 (Pro Tier) | Zep (Flex Tier) | Cognee (OSS) | Letta (OSS) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Pricing Model** | **$0 (Free Tier)** | $249/mo | $125/mo | $0 (Self-Host) | Cloud Pricing |
| **AS OF SYSTEM TIME Time-Travel** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Cryptographic Hash-Chains** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Distributed Slot Concurrency Limiter**| ✅ | ❌ | ❌ | ❌ | ❌ |
| **Zero-Trust KMS Client Keys** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **OWASP Prompt Injection Guard** | ✅ | ⚠️ (Basic Only) | ❌ | ❌ | ❌ |
| **A2A Protocol Support** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Single DB Footprint** | ✅ | ❌ (needs vector/graph) | ❌ | ❌ (needs 3 DBs) | ✅ |
| **Python & TypeScript SDK** | ✅ | ✅ | ✅ | ❌ (Python Only) | ❌ (Python Only) |

---

## 🏗️ System Architecture & Data Flow

```
                      ┌──────────────────────────────────────────────┐
                      │                 AGENT CLIENT                 │
                      │    (Claude Desktop / Cursor / LangGraph)     │
                      └──────────────┬────────────────┬──────────────┘
                                     │                │
                JSON-RPC 2.0 (stdio) │                │ JSON-RPC 2.0 (SSE/HTTP)
                                     ▼                ▼
          ┌─────────────────────────────┐    ┌─────────────────────────────┐
          │       Bastion MCP Server    │    │      Bastion A2A Server     │
          │      (FastMCP Primitives)   │    │  (FastAPI + Ed25519 Keys)   │
          └──────────────┬──────────────┘    └──────────────┬──────────────┘
                         │                                  │
                         │   anyio.to_thread.run_sync()     │
                         └─────────────────┬────────────────┘
                                           │
                                           ▼
                             ┌─────────────────────────────┐
                             │     psycopg2/asyncpg Pool   │
                             └──────────────┬──────────────┘
                                            │
                                            ▼
         ┌───────────────────────────────────────────────────────────────────┐
         │                        COCKROACHDB CLUSTER                        │
         │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
         │  │   agent_memory   │  │    a2a_tasks     │  │   agent_audit    │ │
         │  │ (C-SPANN Vectors)│  │ (Persisted Logs) │  │ (Hash Chain Logs)│ │
         │  └────────┬─────────┘  └────────┬─────────┘  └──────────────────┘ │
         └───────────┼─────────────────────┼─────────────────────────────────┘
                     │                     │
                     │ CDC Changefeed      │ CDC Changefeed
                     ▼                     ▼
         ┌───────────────────────────────────────────────────────────────────┐
         │                         AWS SERVICES LAYER                        │
         │  ┌──────────────────────────────────────────────────────────────┐ │
         │  │                       AWS Lambda Router                      │ │
         │  │  ┌───────────────────────────┬────────────────────────────┐  │ │
         │  │  │   A2A Webhook Push        │   S3 Audit Archiver        │  │ │
         │  │  └───────────────────────────┴────────────────────────────┘  │ │
         │  └──────────────────────────────────────────────────────────────┘ │
         └───────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

Install the SDK using your package manager of choice:

```bash
# Install via pip
pip install bastion-sdk

# Or lightning-fast using uv
uv add bastion-sdk
```

### 1. Python SDK Implementation
```python
from bastion import BastionMemory

# Connects in Mock Mode (zero setup) or Real Mode (supplying BASTION_CONN string)
mem = BastionMemory(agent_id="dev-agent", mock=True)

# 1. Store Memory - automatically generates embeddings, PII scrub, and Merkle check
record = mem.store("fact", "User prefers dark mode layouts.", metadata={"domain": "UI"})
print(f"Stored Memory ID: {record.memory_id} (Hash: {record.cryptographic_hash[:10]})")

# 2. Vector search with time-decay ranking
results = mem.search("user design preferences", k=5)
for r in results:
    print(f"[{r.memory_type}] {r.content} (Relevance Score: {r.importance_score})")
```

### 2. TypeScript SDK Implementation
```typescript
import { BastionMemory } from "bastion-memory";

const mem = new BastionMemory("dev-agent", { mock: true });

// Store and index
const record = await mem.store("fact", "User prefers dark mode layouts.", { domain: "UI" });

// Semantic vector search
const results = await mem.search("user design preferences", { k: 5 });
```

---

## 🔌 Model Context Protocol (MCP) Setup

Bastion is fully compatible with the Model Context Protocol (MCP) standard. Configure your client (Cursor, Claude Desktop, or VS Code) to dynamically execute memory operations:

```json
{
  "mcpServers": {
    "bastion-memory": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full",
        "BASTION_MOCK": "false",
        "BASTION_LLM_GUARD": "true",
        "GROQ_API_KEY": "gsk_..."
      }
    }
  }
}
```

### Protocol Primitives Served
*   **Tools:** `memory_store` (guarded), `memory_search` (C-SPANN), `memory_timetravel`, `memory_audit` (hash verification), `memory_heal`, `resolve_conflict`, `a2a_bridge`.
*   **Resources:** `bastion://schema`, `bastion://config`, `bastion://stats`, `bastion://memory/{memory_id}`.
*   **Prompts:** `analyze_memory`, `conflict_analysis`, `audit_review`.

---

## 🛠️ Key Architectural Innovations

### 1. Slot-Based Distributed Concurrency Limiter
Traditional in-memory semaphores (`threading.Semaphore`) fail under serverless scaling, allowing multiple stateless Vercel or AWS Lambda instances to flood downstream APIs. 
Bastion resolves this by writing slot reservations directly into CockroachDB using distributed transaction locks:
```sql
SELECT slot_id FROM agent_limiter 
WHERE instance_id IS NULL OR acquired_at < NOW() - CAST($1 AS INTERVAL) 
LIMIT 1 FOR UPDATE;
```
This guarantees a hard global concurrency cap across all cloud instances, with automated TTL reclamation for abandoned locks.

### 2. Memory Poisoning Defense (Merkle Hash Chains)
To protect memory against indirect prompt injections (OWASP ASI06), Bastion structures its database ledger as an append-only cryptographic chain. Each record is linked to the previous node:
$$\text{Hash}_n = \text{SHA256}(\text{Content} + \text{Metadata} + \text{Hash}_{n-1})$$
Any out-of-band manipulation or unauthorized database edits break the ledger integrity chain, triggering immediate system alerts.

### 3. Bi-Temporal Time Travel (`AS OF SYSTEM TIME`)
When agents suffer from logic loops or memory corruptions, Bastion leverages CockroachDB's historical MVCC data:
```sql
SELECT * FROM agent_memory AS OF SYSTEM TIME '2026-07-07 12:00:00Z'
```
This lets the agent restore its complete memory matrix to a healthy state from seconds, minutes, or hours in the past.

### 4. Zero-Knowledge Search & AWS KMS DEKs
Bastion encrypts stored plaintexts using AES-256-GCM under tenant-specific keys requested dynamically from AWS KMS. It indexes the raw vector embeddings in CockroachDB alongside the ciphertext. The database executes fast semantic searches while remaining cryptographically blind to the underlying user data.

---

## 📊 Latency Benchmarks (MCP Layer)

Benchmarks executed over 150 runs (15 warmup) using simulated in-memory mode:

| MCP Tool Name | Runs | Avg Latency | Min Latency | Max Latency | P50 (Median) | P90 | P95 | P99 | Throughput |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `memory_store` | 150 | 1.18 ms | 0.52 ms | 3.29 ms | 1.05 ms | 1.85 ms | 2.54 ms | 2.94 ms | 850.5 ops/s |
| `memory_search` | 150 | 1.70 ms | 0.98 ms | 4.53 ms | 1.56 ms | 2.55 ms | 2.76 ms | 3.43 ms | 589.2 ops/s |
| `memory_timetravel` | 150 | 1.16 ms | 0.64 ms | 2.67 ms | 0.97 ms | 1.80 ms | 2.17 ms | 2.55 ms | 865.4 ops/s |
| `memory_audit` | 150 | 2.90 ms | 2.10 ms | 5.19 ms | 2.73 ms | 3.82 ms | 4.21 ms | 4.77 ms | 344.6 ops/s |

*Run the benchmarks locally:*
```bash
python scripts/mcp_latency_benchmark.py --iterations 150 --warmup 15
```

---

## 🚦 Test Verification Suite

All modules are verified using continuous integration tests:

```bash
python -m pytest --tb=short -q
```
```
594 passed, 19 skipped, 0 failed
├── test_memory.py          — Store, vector search, hash chains, time travel
├── test_agent.py           — Agent logic, RLS boundaries, checkpointing
├── test_limiter.py         — Distributed concurrency lock verification
├── test_guard.py           — Regex & Semantic LLM prompt injection guards
├── test_mcp_server.py      — FastMCP tool registry & schema tests
├── test_chaos.py           — Crash recovery, transaction conflicts, poisoning
└── test_compliance.py      — EU AI Act compliance log verification
```

---

## 📄 License

Bastion is open-source software licensed under the [MIT License](LICENSE).
