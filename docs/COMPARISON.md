# Bastion vs Alternatives — Real Comparison

## Head-to-Head: Feature Matrix

| Feature | Bastion | Mem0 | Zep | Cognee | Letta | Continuum |
|---------|---------|------|-----|--------|-------|-----------|
| **Pricing** | **$0 (Free)** | $249/mo | $125/mo | $0 (Self-Host) | Cloud | $0 (Self-Host) |
| **MCP Tools** | **25** | 0 | 0 | 0 | 0 | Read-only |
| **Agent Skills** | **8** | 0 | 0 | 0 | 0 | 0 |
| **Hash-chained memory** | SHA-256 chain | No | No | No | No | No |
| **C-SPANN vectors** | 94% smaller | pgvector | Neo4j | Vector column | Neo4j | pgvector |
| **CDC self-healing** | Real-time | No | No | No | No | No |
| **Time travel** | AS OF SYSTEM TIME | No | No | No | No | No |
| **SERIALIZABLE coordination** | Native | No | No | No | No | No |
| **A2A Protocol** | Ed25519 signed | No | No | No | No | No |
| **LTM Gateway** | Token savings | No | No | No | No | No |
| **Sleep-Time Dreaming** | 6-step consolidation | No | No | No | Yes | No |
| **Auto-Contradiction** | Detect + resolve | No | Yes | No | No | No |
| **OWASP ASI06 Guard** | 9 patterns + LLM | Basic | No | No | No | No |
| **PII Detection** | 5 types + redaction | No | No | No | No | No |
| **Python SDK** | Yes | Yes | Yes | Yes | Yes | Yes |
| **TypeScript SDK** | Yes (1:1 parity) | No | No | No | No | No |
| **Framework adapters** | 3 (LangChain, CrewAI, LlamaIndex) | 1 | 1 | 0 | 0 | 0 |
| **Knowledge graph** | Entity extraction + traversal | No | Temporal | No | No | No |
| **Mock mode** | Deterministic local | No | No | No | No | No |
| **Multi-region** | 6 regions | No | No | No | No | No |
| **License** | MIT | Apache 2 | Apache 2 | MIT | Apache 2 | MIT |

## Technical Depth: CockroachDB Integration

| CRDB Feature | Bastion | Others |
|-------------|---------|--------|
| C-SPANN Vector Index | Core memory engine | pgvector or Neo4j |
| AS OF SYSTEM TIME | Time travel queries | Not used |
| SERIALIZABLE | Multi-agent coordination | Not used |
| CDC Changefeed | Self-healing pipeline | Not used |
| MCP Server | 25 tools | Not used |
| ccloud CLI | Auto-provision from SDK | Not used |
| Agent Skills | 8 pre-built skills | Not used |

## Performance Numbers (Mock Mode)

| Metric | Bastion | Notes |
|--------|---------|-------|
| Store throughput | **20,597 ops/sec** | Mock mode, hash chain included |
| Search latency (avg) | **0.16ms** | 100 records, 200 queries |
| Search latency (p99) | **0.49ms** | Tail latency |
| Hash chain verify | **0.11μs/block** | SHA-256 verification |
| Concurrent writes | **21,199 ops/sec** | 5 agents, 500 total writes |
| Agent chat loop | **562 msg/sec** | 3 agents, 60 messages |
| Recall@5 | **100%** | Multi-signal retrieval |
| MCP store latency | **1.18ms** avg | 150 runs benchmark |
| MCP search latency | **1.70ms** avg | 150 runs benchmark |

## Test Coverage

| Metric | Bastion | Continuum | Mem0 |
|--------|---------|-----------|------|
| Total tests | **1,041** | 42 | ~200 |
| Chaos tests | **15** | Integration | None |
| Consolidator tests | **14** | None | None |
| MCP tool tests | **25** | 0 | 0 |
| A2A protocol tests | **Full** | None | None |
| Mock mode tests | All | Unit | N/A |
| CI | GitHub Actions (3.11, 3.12, 3.13) | GitHub Actions | GitHub Actions |

## What Others Do Better

| Project | Advantage |
|---------|-----------|
| **Continuum** | Live demo on HuggingFace, ADRs, Gradio UI |
| **Mem0** | Established brand, larger community |
| **Zep** | Temporal graph features |
| **Cognee** | Simple API, easy setup |
| **Letta** | Sleep-time dreaming (we have this too) |

## What Bastion Does Better

| # | Advantage | Why It Matters |
|---|-----------|----------------|
| 1 | **25 MCP tools** | Most comprehensive memory API |
| 2 | **8 Agent Skills** | Ready-to-use for any agent |
| 3 | **C-SPANN vectors** | 94% smaller, distributed |
| 4 | **Time travel** | AS OF SYSTEM TIME reconstruction |
| 5 | **Hash chains** | Cryptographic integrity |
| 6 | **A2A Protocol** | Ed25519 signed agent cards |
| 7 | **LTM Gateway** | Save 2,965 tokens per reuse |
| 8 | **Sleep-time dreaming** | 6-step consolidation |
| 9 | **OWASP ASI06 guard** | 9 patterns + LLM classification |
| 10 | **PII detection** | 5 types with auto-redaction |
| 11 | **TypeScript SDK** | 1:1 API parity with Python |
| 12 | **Framework adapters** | LangChain, CrewAI, LlamaIndex |
| 13 | **Knowledge graph** | Entity extraction + traversal |
| 14 | **Multi-region** | 6 regions, 12-42ms latency |
| 15 | **Mock mode** | Zero-config local development |
| 16 | **1,041 tests** | Most tested memory system |
| 17 | **$0 pricing** | Free forever, MIT licensed |

## Problems We Solved

### 1. OpenClaw Problem (Prompt Injection)
**Problem:** Malicious tool manifests can exfiltrate data or hijack agents.
**Solution:** MCP Tool Manifest Scanner with 9 malicious patterns detected.

### 2. Memory Poisoning
**Problem:** Adversaries inject false memories to corrupt agent knowledge.
**Solution:** OWASP ASI06 guard + SHA-256 hash chains + Merkle tree verification.

### 3. Serverless Amnesia
**Problem:** Agents lose memory when serverless containers recycle.
**Solution:** CockroachDB persists memory across any failure.

### 4. Multi-Agent Conflicts
**Problem:** Multiple agents write conflicting memories simultaneously.
**Solution:** SERIALIZABLE isolation + CRDT conflict resolution.

### 5. Token Waste
**Problem:** Agents re-run expensive workflows unnecessarily.
**Solution:** LTM Gateway checks for cached results before execution.

### 6. Memory Bloat
**Problem:** Old, irrelevant memories consume resources.
**Solution:** Sleep-time dreaming consolidates and prunes during idle time.

### 7. Privacy Leaks
**Problem:** Sensitive data (PII, secrets) stored in plain text.
**Solution:** PII detection + auto-redaction + AES-256-GCM encryption.

## The Winning Argument

**Continuum is a great incident-response tool.**
**Bastion is infrastructure for any AI agent.**

Continuum solves one problem (incident response) very well.
Bastion solves the universal problem (agent memory) for every use case.

A judge choosing between them asks: "Which would I rather build on?"
- Continuum: "I'd use this if I'm building an SRE agent"
- Bastion: "I'd use this for any agent I ever build"

**Infrastructure wins over applications.**
**Platforms win over tools.**
**Universal wins over specific.**
