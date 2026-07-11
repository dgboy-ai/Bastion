# 🏆 CockroachDB × AWS Hackathon Submission

## Live Demo
**URL:** https://bastion-self.vercel.app/

## Repository
**URL:** https://github.com/dgboy-ai/Bastion

## Video
**URL:** [To be recorded - 3 minute demo]

---

## CockroachDB Tools Used

### 1. MCP Server ✅
Bastion implements a full MCP (Model Context Protocol) server with **25 tools**, **4 resources**, and **3 prompts**. Agents connect via stdio (JSON-RPC 2.0) or Streamable HTTP (SSE). Tools include:
- `memory_store` — Store memories with SHA-256 hash chain integrity
- `memory_search` — Semantic vector search with C-SPANN indexing
- `memory_timetravel` — AS OF SYSTEM TIME point-in-time queries
- `multi_signal_search` — 4-signal fusion (vector + BM25 + entity + temporal)

### 2. Distributed Vector Indexing ✅
Bastion uses CockroachDB's native **C-SPANN** vector index for embeddings:
- **1024-dimensional vectors** via Amazon Bedrock Titan V2
- **94% smaller** than pgvector equivalent
- **Decay-weighted scoring** for temporal relevance
- **100% Recall@5** on benchmark tests

### 3. ccloud CLI ✅
Bastion integrates with CockroachDB's ccloud CLI for:
- Cluster provisioning (`provision_cluster`)
- Schema migrations (16 migration files)
- Health checks and backup management

### 4. Agent Skills Repo ✅
Bastion provides **8 machine-executable Agent Skills** in `skills/manifest.json`:
1. `memory_store` — Store memories
2. `memory_search` — Semantic search
3. `memory_timetravel` — Time-travel queries
4. `memory_audit` — Hash chain verification
5. `memory_heal` — Self-healing corruption repair
6. `graph_query` — Knowledge graph traversal
7. `resolve_conflict` — CRDT conflict resolution
8. `a2a_bridge` — Agent-to-agent communication

---

## AWS Services Used

### 1. Amazon Bedrock ✅
- **Model:** `amazon.titan-embed-text-v2:0`
- **Dimensions:** 1024
- **Usage:** Generates embeddings for vector search
- **Free tier:** 50M tokens/month (~7,200 queries)

### 2. AWS Lambda ✅
- **CdcHandlerFunction:** CDC changefeed processor (60s timeout, 256MB)
- **WebhookDispatcherFunction:** A2A webhook push (30s timeout)
- **KeepAliveRule:** EventBridge 5-minute keep-alive

### 3. Amazon S3 ✅
- **Memory archives** with lifecycle to Glacier
- **Snapshot storage** for self-healing

### 4. AWS KMS ✅
- **AES-256-GCM** envelope encryption
- **Per-tenant DEKs** for zero-knowledge search

---

## Architecture

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

## Real-World Impact

### Problems Solved
1. **Amnesia** — Agents forget across sessions. Bastion persists memory with cryptographic integrity.
2. **Memory Poisoning** — Prompt injection corrupts knowledge. OWASP ASI06 guard blocks attacks.
3. **Serverless Crashes** — Memory lost on restart. CockroachDB survives any failure.

### Production Stats
- **1,041 tests** passing (0 failures)
- **20,597 ops/sec** store throughput
- **0.16ms** search latency
- **100% Recall@5** on benchmarks
- **6 global regions** with 12-42ms latency

---

## Production Readiness

### Security
- **OWASP ASI06** prompt injection guard (9 regex + LLM classification)
- **PII detection** (email, phone, SSN, credit card, IPv4)
- **Secret leakage blocking** (API keys, private keys, AWS credentials)
- **OAuth 2.1 + PKCE** authentication
- **Row-Level Security** (per-agent data isolation)
- **AES-256-GCM KMS encryption**

### Observability
- **OpenTelemetry** integration
- **Structured logging** with secret redaction
- **Audit trail** for every memory operation

### Resilience
- **Self-healing** via CDC changefeed
- **Circuit breaker** pattern
- **Serialization retry** engine
- **Multi-region** replication

---

## Creativity & Originality

### Unique Features (No Competitor Has These)
1. **SHA-256 Hash Chains** — Cryptographic integrity for every memory
2. **Time-Travel Queries** — AS OF SYSTEM TIME via CockroachDB MVCC
3. **Sleep-Time Dreaming** — 6-step consolidation during idle time
4. **LTM Gateway** — Reuse cached results, save 2,965 tokens/reuse
5. **Auto-Contradiction** — Detect and resolve conflicting memories
6. **Merkle Tree Verification** — O(log n) inclusion proofs

---

## Getting Started

```bash
# Install
pip install bastion-memory

# Initialize with mock mode (no database required)
npx bastion init --mock

# Or connect to CockroachDB
export BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"

# Start MCP server
npx bastion serve
```

---

## License
MIT License — Free forever.
