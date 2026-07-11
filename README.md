# 🪳 Bastion: Persistent, Self-Healing Agentic Memory

[![CI](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml/badge.svg)](https://github.com/dgboy-ai/Bastion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/Database-CockroachDB-000000?logo=cockroachlabs&logoColor=white)](https://cockroachlabs.cloud)
[![AWS](https://img.shields.io/badge/Cloud-AWS-232F3E?logo=amazon-aws&logoColor=white)](https://aws.amazon.com)
[![FastMCP](https://img.shields.io/badge/Protocol-FastMCP-blue.svg)](https://spec.modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-1041%20passed-brightgreen)](#-test-verification-suite)

> **The system of record for autonomous AI systems. A persistent, secure, and self-healing memory engine that survives serverless crashes—so your agent swarms never forget.**

[Live Demo](https://bastion-self.vercel.app/) · [Dashboard](https://bastion-self.vercel.app/dashboard) · [Documentation](https://bastion-self.vercel.app/docs)

---

## 🎯 Why Bastion?

AI agents are rapidly moving from experiments into real production workflows. But there's a critical problem: **agents need memory that never goes down.**

If an agent's memory drops offline or corrupts, it doesn't degrade gracefully—**it stops, hallucinates, or reverts to a blank slate.**

Bastion is a production-grade Agentic Memory framework built directly on **CockroachDB's distributed SQL engine** and **AWS serverless architecture**. It solves the three critical vulnerabilities of 2026 agent runtimes: **amnesia, memory poisoning, and serverless concurrency crashes.**

---

## ⚡ Feature Comparison Matrix

| Feature | Bastion (OSS) | Mem0 (Pro Tier) | Zep (Flex Tier) | Cognee (OSS) | Letta (OSS) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Pricing Model** | **$0 (Free Tier)** | $249/mo | $125/mo | $0 (Self-Host) | Cloud Pricing |
| **LTM Gateway (Memory Reuse)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Sleep-Time Dreaming** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Auto-Contradiction Detection** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **AS OF SYSTEM TIME Time-Travel** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Cryptographic Hash-Chains** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **OWASP Prompt Injection Guard** | ✅ | ⚠️ (Basic) | ❌ | ❌ | ❌ |
| **A2A Protocol Support** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Multi-Region Distributed** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Python & TypeScript SDK** | ✅ | ✅ | ✅ | ❌ | ❌ |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT CLIENT                              │
│           (Claude / Cursor / LangGraph)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (JSON-RPC 2.0)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   BASTION MCP SERVER                         │
│              (25 tools, 4 resources, 3 prompts)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Agent Memory │ │  Agent Audit │ │  Knowledge   │
│   (C-SPANN)  │ │ (Hash Chain) │ │    Graph     │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    COCKROACHDB CLUSTER                       │
│         (6 regions, SERIALIZABLE isolation)                  │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                       AWS LAYER                              │
│  Bedrock (embeddings) │ Lambda (CDC) │ S3 (archives)        │
│  KMS (encryption)     │ SNS (alerts) │ SQS (retries)        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 CockroachDB Tools Used

### 1. MCP Server ✅
Full MCP implementation with **25 tools**, **4 resources**, and **3 prompts**. Agents connect via stdio or Streamable HTTP.

### 2. Distributed Vector Indexing ✅
**C-SPANN** vector index with 1024-dimensional embeddings from Amazon Bedrock Titan V2. 94% smaller than pgvector.

### 3. ccloud CLI ✅
Integrated for cluster provisioning, schema migrations, and health checks.

### 4. Agent Skills Repo ✅
**8 machine-executable skills** in `skills/manifest.json` for memory store, search, time-travel, audit, heal, graph query, conflict resolution, and A2A bridge.

---

## ☁️ AWS Services Used

| Service | Usage |
|---------|-------|
| **Amazon Bedrock** | Titan V2 embeddings (1024-dim) |
| **AWS Lambda** | CDC handler, webhook dispatcher |
| **Amazon S3** | Memory archives with Glacier lifecycle |
| **AWS KMS** | AES-256-GCM envelope encryption |
| **Amazon SNS** | Chain break alert topic |
| **Amazon SQS** | Webhook retry queue |
| **Amazon EventBridge** | Keep-alive (cold start mitigation) |

---

## 🚀 Quick Start

```bash
# Install
pip install bastion-memory

# Initialize with mock mode (no database required)
python -c "from bastion import BastionMemory; mem = BastionMemory('test', mock=True)"

# Or connect to CockroachDB
export BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"

# Start MCP server
python -m bastion.mcp_server
```

### Python SDK
```python
from bastion import BastionMemory

mem = BastionMemory(agent_id="my-agent", mock=True)

# Store memory with hash chain integrity
record = mem.store("fact", "User prefers dark mode.", metadata={"domain": "UI"})

# Search with 4-signal fusion
results = mem.search("user preferences", k=5)

# Time-travel query
past_memories = mem.timetravel("5 minutes ago")
```

### TypeScript SDK
```typescript
import { BastionMemory } from "bastion-memory";

const mem = new BastionMemory("my-agent", { mock: true });

// Store and search with 1:1 API parity
const record = await mem.store("fact", "User prefers dark mode.");
const results = await mem.search("user preferences", { k: 5 });
```

---

## 🔌 MCP Configuration

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

**Available Tools:** `memory_store`, `memory_search`, `memory_timetravel`, `memory_audit`, `memory_heal`, `resolve_conflict`, `ltm_check_reuse`, `dream`, `detect_contradictions`, `multi_signal_search`, `context_pack`, and 14 more.

---

## 🛡️ Security Features

- **OWASP ASI06 Guard** — 9 injection patterns + LLM semantic classification
- **PII Detection** — Email, phone, SSN, credit card, IPv4 auto-redaction
- **Secret Blocking** — API keys, private keys, AWS credentials detected
- **OAuth 2.1 + PKCE** — Full authentication flow
- **Row-Level Security** — Per-agent data isolation
- **AES-256-GCM KMS** — Zero-knowledge encryption

---

## 📊 Performance Benchmarks

| Metric | Value |
|--------|-------|
| Store throughput | **20,597 ops/sec** (mock) |
| Search latency | **0.16ms** avg (mock) |
| Hash chain verify | **0.11μs/block** |
| Recall@5 | **100%** |
| MCP store latency | **1.18ms** avg |
| MCP search latency | **1.70ms** avg |
| Regions | **6 global** |
| Latency | **12-42ms** |

---

## 🧪 Test Suite

### Mock Tests (1,116 passed)
```bash
python -m pytest tests/ -v
# 1116 passed, 58 skipped, 0 failed
```

### Integration Tests (17 passed against real CockroachDB)
```bash
BASTION_CONN="postgresql://..." python -m pytest tests/test_crdb_integration.py -v
# 17 passed, 0 failed
```

### Total: 1,133 tests, 0 failures

**Test Coverage:**
- Memory operations (store, search, time-travel, audit)
- Hash chain integrity
- MCP tool registry (25 tools verified)
- OWASP ASI06 guard (9 injection patterns)
- A2A protocol (Ed25519 signing)
- LTM Gateway (token savings)
- Dreaming consolidation (6-step cycle)
- Knowledge graph traversal
- CRDT conflict resolution
- Stress/concurrency tests
- **Real CockroachDB integration** (17 tests against live database)

---

## 📁 Documentation

| Guide | Link |
|-------|------|
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| AI Safety | [docs/AI_SAFETY.md](docs/AI_SAFETY.md) |
| AWS Services | [docs/AWS_SERVICES.md](docs/AWS_SERVICES.md) |
| CockroachDB Tools | [docs/COCKROACHDB_TOOLS.md](docs/COCKROACHDB_TOOLS.md) |
| Deployment | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Development | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| Comparison | [docs/COMPARISON.md](docs/COMPARISON.md) |

---

## 🏆 Hackathon Submission

**Built for:** CockroachDB × AWS Hackathon - Build with Agentic Memory

**Demo:** https://bastion-self.vercel.app/

**Repository:** https://github.com/dgboy-ai/Bastion

**Video:** [Coming soon - 3 minute demo]

---

## 📄 License

MIT License — Free forever. See [LICENSE](LICENSE) for details.
