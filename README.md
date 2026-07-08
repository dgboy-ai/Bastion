# 🪳 Bastion: Persistent, Self-Healing Agentic Memory

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/Database-CockroachDB-000000?logo=cockroachlabs&logoColor=white)](https://cockroachlabs.cloud)
[![AWS](https://img.shields.io/badge/Cloud-AWS-232F3E?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![FastMCP](https://img.shields.io/badge/Protocol-FastMCP-blue.svg)](https://spec.modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-558%20passed-brightgreen)](#-test-verification-suite)

> **Persistent, tamper-proof, and self-healing memory that survives host crashes—so your AI agents never forget.**

## Why Bastion?

```
Bastion: $0/mo (CockroachDB Serverless free tier)
Mem0:    $249/mo Pro tier
Zep:     $125/mo Flex tier
Letta:   Cloud pricing
```

| Feature | Bastion | Mem0 | Zep | Letta |
|---------|---------|------|-----|-------|
| Hash-chain integrity | ✅ | ❌ | ❌ | ❌ |
| AS OF SYSTEM TIME | ✅ | ❌ | ❌ | ❌ |
| CRDT conflict resolution | ✅ | ❌ | ❌ | ❌ |
| OWASP ASI06 detection | ✅ | ❌ (closed) | ❌ | ❌ |
| EU AI Act compliance | ✅ | ❌ | ❌ | ❌ |
| Row-Level Security | ✅ | ❌ | ❌ | ❌ |
| Live cost tracking | ✅ | ❌ | ❌ | ❌ |
| A2A protocol | ✅ | ❌ | ❌ | ❌ |
| Single database (no Neo4j) | ✅ | ❌ (needs Qdrant) | ❌ (needs Neo4j) | ✅ |
| Self-hostable full version | ✅ (MIT) | ❌ (graph = Pro) | ❌ (Community deprecated) | ✅ |
| Python + TypeScript SDK | ✅ | ✅ | ✅ | ❌ (Python only) |
| Framework adapters | 3 | 1 | 1 | 0 |

**Bastion is the only open-source memory layer with security, compliance, temporal travel, and multi-agent coordination — for free.**

Bastion is a production-grade Agentic Memory layer built on **CockroachDB’s distributed SQL database** and **AWS serverless architecture**. It acts as the system of record for autonomous AI systems, offering cryptographic state validation, zero-knowledge vector indexing, row-level session boundaries, and serverless background consolidation.

---

## 💡 The Problem

Traditional databases are optimized for human-scale workloads. Autonomous agents are different: they spawn processes dynamically, read/write constantly, run loops, and require memory state that persists across serverless lifecycle boundaries, container recycles, and region outages. 

If an agent's memory drops offline or corrupts, it doesn't degrade gracefully—it gets stuck, hallucinates, or resets to a blank slate:

```
❌ Traditional:
Agent runs task for 2 hours → Host Container recycles / AWS Lambda expires → Context Lost
"Hello, I am a helpful assistant. How can I help you today?"  ← Blank slate.

✔ Bastion:
Agent runs task for 2 hours → Host Container recycles / AWS Lambda expires → State Restored
"Welcome back. I have processed 12 files; continuing stage 3..."
```

---

## 🏗️ Architecture System Flow

Bastion integrates directly with your agent toolchain and coordinates securely with AWS and CockroachDB:

```
     AI Agent Framework (LangChain / CrewAI / LlamaIndex / raw SDK)
                                │
                        from bastion import BastionMemory
                                │
                                ▼
    ┌────────────────────────────────────────────────────────────────┐
    │                       Bastion Memory SDK                       │
    │  ┌──────────────┐ ┌───────────────────┐ ┌───────────────────┐  │
    │  │   C-SPANN    │ │ Cryptographic     │ │    Multi-Tenant   │  │
    │  │ Vector Index │ │ SHA-256 Ledger    │ │ Row-Level Safety  │  │
    │  └──────┬───────┘ └─────────┬─────────┘ └─────────┬─────────┘  │
    └─────────┼───────────────────┼─────────────────────┼────────────┘
              │                   │                     │
              ▼                   ▼                     ▼
    ┌────────────────────────────────────────────────────────────────┐
    │                      CockroachDB Cluster                       │
    │  • agent_memory: Vector embeddings search & plaintext KMS      │
    │  • agent_audit: Append-only ledger checks (AS OF SYSTEM TIME)  │
    │  • agent_checkpoints: Transaction state logs (CDC Enabled)     │
    └─────────┬──────────────────────────────────────────────────────┘
              │
              │ (Change Data Capture)
              ▼
    ┌──────────────────────────────────┐
    │          AWS Serverless          │
    │  • AWS Lambda: Consolidated drift│
    │    scans & self-healing runs     │
    │  • Bedrock: Titan V2 vectors     │
    │  • S3: Compliance snapshots      │
    └──────────────────────────────────┘
```

---

## ⚡ Quick Start

### Python SDK

```python
from bastion import BastionMemory

# Instantiated in Mock Mode (no DB required) or Real Mode (using connection string)
mem = BastionMemory("dev-agent", mock=True)

# 1. Store memory - automatically generates Bedrock/Mock embeddings and SHA-256 hash chains
record = mem.store("fact", "User prefers dark mode layouts.", metadata={"domain": "UI"})
print(f"Stored Memory ID: {record.memory_id} (Hash: {record.cryptographic_hash[:10]})")

# 2. Query memory - returns matches with decay scoring applied
results = mem.search("user design preferences", k=5)
for r in results:
    print(f"[{r.memory_type}] {r.content} (Relevance Score: {r.importance_score})")
```

### TypeScript SDK

```typescript
import { BastionMemory } from "bastion-memory";

const mem = new BastionMemory("dev-agent", { mock: true });

// Store and index
const record = await mem.store("fact", "User prefers dark mode layouts.", { domain: "UI" });

// Semantic vector search
const results = await mem.search("user design preferences", { k: 5 });
```

---

## 🛠️ The 12 Production Features

### 1. Hash-Chained Memory Ledger
Every memory record is appended to a cryptographic hash chain. Each node's `cryptographic_hash` is calculated as:
$$\text{Hash}_n = \text{SHA256}(\text{Content} + \text{Metadata} + \text{Hash}_{n-1})$$
Any out-of-order manipulation or raw database row editing breaks the ledger integrity and triggers instant security exception audits.

### 2. Zero-Knowledge Vector Search
To ensure privacy and compliance:
*   Titan V2 embeddings are generated on the **plaintext** first.
*   The plaintext is encrypted with **AES-256-GCM** using AWS KMS.
*   The raw vector is indexed in CockroachDB alongside the ciphertext.
*   *Result:* The database performs sub-millisecond semantic search, but remains cryptographically blind to the underlying text content.

### 3. C-SPANN Vector Indexing
Bastion leverages CockroachDB's native C-SPANN vector search indexes. This provides sub-linear vector retrieval speeds while avoiding the consistency gaps, reindexing delays, and scaling limitations of standard index models.

### 4. Time Travel Querying
Allows checking historical memory states using CockroachDB's `AS OF SYSTEM TIME`. If an agent detects a logical loop, it can restore its memory matrix to a verified snapshot in the past:
```sql
SELECT * FROM agent_memory AS OF SYSTEM TIME '2026-07-07 12:00:00Z'
```

### 5. Multi-Tenant Row-Level Security (RLS)
Forces context isolation when sharing connection pools. Bastion validates that connections are executing within transaction-level limits:
*   Rejects commands outside active transaction boundaries.
*   Applies a connection session reset (`RESET ALL`) on checkout to block database variable bleed between concurrent agent threads.

### 6. CDC-Triggered Self-Healing
CockroachDB Change Data Capture (CDC) streams memory updates to an AWS Lambda background worker. The worker cleans up expired objects, scans for recursive prompt injection indicators, and logs compliance audits out-of-band.

### 7. Semantic Caching
Caches repetitive LLM prompts and responses. Similar inputs bypass the LLM and return from local memory immediately, reducing inference cost and API latency.

### 8. Cognitive Decay Curves
Facts fade naturally unless validated or reinforced. Matches are ranked using a time-decay weight formula:
$$\text{Score} = \frac{\text{Similarity} \times \text{Importance}}{1.0 + (\text{Decay Rate} \times \text{Hours Elapsed})}$$

### 9. Conflict Resolution & CRDTs
Leverages `SERIALIZABLE` isolation transactions. If a newly registered fact contradicts a prior belief, Bastion executes conflict resolution, invoking LLM merges (or MCP sampling) to update database state without race conditions.

### 10. Multi-Agent Checkpointing
Atomically records agent run loops and metadata, guaranteeing crash recovery down to the exact instruction.

### 11. Framework Adapters
Drop-in integration layers for top agent frameworks:
*   `bastion.adapters.crewai`
*   `bastion.adapters.langchain`
*   `bastion.adapters.llamaindex`

### 12. OpenTelemetry Tracing
Full span observability is instrumented across all memory operations, showing trace spans extending from the agent execution context all the way to CockroachDB and Amazon Bedrock.

---

## 📈 MCP Tool Latency Benchmarks

To verify performance under high-concurrency workloads, Bastion includes a latency distribution profiler. Below are the performance results executed over 150 runs (15 warmup) using simulated in-memory SQLite/Mock DB mode:

| MCP Tool Name | Runs | Avg Latency | Min Latency | Max Latency | P50 (Median) | P90 | P95 | P99 | Throughput |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `memory_store` | 150 | 1.18 ms | 0.52 ms | 3.29 ms | 1.05 ms | 1.85 ms | 2.54 ms | 2.94 ms | 850.5 ops/s |
| `memory_search` | 150 | 1.70 ms | 0.98 ms | 4.53 ms | 1.56 ms | 2.55 ms | 2.76 ms | 3.43 ms | 589.2 ops/s |
| `memory_timetravel` | 150 | 1.16 ms | 0.64 ms | 2.67 ms | 0.97 ms | 1.80 ms | 2.17 ms | 2.55 ms | 865.4 ops/s |
| `memory_audit` | 150 | 2.90 ms | 2.10 ms | 5.19 ms | 2.73 ms | 3.82 ms | 4.21 ms | 4.77 ms | 344.6 ops/s |
| `memory_heal` | 150 | 0.48 ms | 0.33 ms | 1.14 ms | 0.43 ms | 0.69 ms | 0.78 ms | 1.01 ms | 2078.2 ops/s |
| `resolve_conflict` | 150 | 0.41 ms | 0.27 ms | 1.04 ms | 0.36 ms | 0.61 ms | 0.68 ms | 0.95 ms | 2431.1 ops/s |

### Running the Benchmarks
To run the latency suite locally:
```bash
python scripts/mcp_latency_benchmark.py --iterations 150 --warmup 15
```
You can execute it in **Real Mode** against a live CockroachDB cluster by supplying connection arguments:
```bash
python scripts/mcp_latency_benchmark.py --conn "postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
```

---

## 🔌 Model Context Protocol (MCP) Setup

Add Bastion directly to your MCP client configuration (Cursor, Claude Code, VS Code, etc.):

```json
{
  "mcpServers": {
    "bastion-memory": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full",
        "BASTION_MOCK": "false"
      }
    }
  }
}
```

### Protocol Primitives Served
*   **Tools:** `memory_search`, `memory_store`, `memory_timetravel`, `memory_audit`, `memory_heal`, `memory_delete`, `resolve_conflict`, `a2a_bridge`.
*   **Resources:** `bastion://schema`, `bastion://config`, `bastion://stats`, `bastion://memory/{memory_id}`.
*   **Prompts:** `analyze_memory`, `conflict_analysis`, `audit_review`.

---

## 🚦 Test Verification Suite

All modules are verified using continuous integration tests:

```bash
python -m pytest --tb=short -q
```
```
558 passed, 24 skipped, 0 failed
├── test_memory.py          — Store, vector search, hash chains, time travel
├── test_agent.py           — Agent logic, RLS boundaries, checkpointing
├── test_mcp_server.py      — FastMCP tool registry, schema tests
├── test_chaos.py           — Crash recovery, transaction conflicts, poisoning
├── test_compliance.py      — EU AI Act compliance log verification
├── test_knowledge_graph.py — Entity extraction, dynamic relational graphs
└── test_webhooks.py        — Thread-pool notification deliveries
```

---

## 📄 License

Bastion is open-source software licensed under the [MIT License](LICENSE).
