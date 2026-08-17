# Bastion vs Alternatives — Real Comparison

## Head-to-Head: Feature Matrix

| Feature | Bastion | Mem0 | Zep | Cognee | Letta | Continuum |
|---------|---------|------|-----|--------|-------|-----------|
| **Pricing** | **$0 (Free)** | $249/mo | $125/mo | $0 (Self-Host) | Cloud | $0 (Self-Host) |
| **MCP Tools** | **35** | 0 | 0 | 0 | 0 | Read-only |
| **Agent Skills** | **34** | 0 | 0 | 0 | 0 | 0 |
| **Hash-chained memory** | SHA-256 chain | No | No | No | No | No |
| **C-SPANN vectors** | 94% smaller | pgvector | Neo4j | Vector column | Neo4j | pgvector |
| **CDC self-healing** | Real-time | No | No | No | No | No |
| **Time travel** | AS OF SYSTEM TIME | No | No | No | No | No |
| **SERIALIZABLE coordination** | Native | No | No | No | No | No |
| **A2A Protocol** | Ed25519 signed | No | No | No | No | No |
| **LTM Gateway** | Token savings | No | No | No | No | No |
| **Sleep-Time Dreaming** | 6-step consolidation | No | No | No | Yes | No |
| **Auto-Contradiction** | Detect + resolve | No | Yes | No | No | No |
| **OWASP ASI06 Guard** | 40+ patterns + LLM | Basic | No | No | No | No |
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
| MCP Server | 35 tools | Not used |
| ccloud CLI | Auto-provision from SDK | Not used |
| Agent Skills | 34 pre-built skills | Not used |

## Performance Numbers (Live CockroachDB)

| Metric | Bastion | Notes |
|--------|---------|-------|
| Memory Write (HMAC Chained) | **909ms p50** | Real CockroachDB cluster |
| Semantic Search (C-SPANN) | **307ms p50** | 1024-dim embeddings |
| Time-Travel Recovery (MVCC) | **310ms p50** | AS OF SYSTEM TIME |
| Attack Detection (Guard Scan) | **6.7ms p50** | 40+ OWASP ASI06 patterns |
| Hash chain verify | **0.11μs/block** | SHA-256 verification |
| Recall@5 | **70%** | Multi-signal retrieval |
| OWASP ASI06 TPR | **88.2%** | 426/483 across 9 obfuscation families |

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
| 1 | **35 MCP tools** | Most comprehensive memory API |
| 2 | **34 Agent Skills** | Ready-to-use for any agent |
| 3 | **C-SPANN vectors** | 94% smaller, distributed |
| 4 | **Time travel** | AS OF SYSTEM TIME reconstruction |
| 5 | **Hash chains** | Cryptographic integrity |
| 6 | **A2A Protocol** | Ed25519 signed agent cards |
| 7 | **LTM Gateway** | Save tokens per reuse |
| 8 | **Sleep-time dreaming** | 6-step consolidation |
| 9 | **OWASP ASI06 guard** | 40+ patterns + LLM classification |
| 10 | **PII detection** | 5 types with auto-redaction |
| 11 | **TypeScript SDK** | 1:1 API parity with Python |
| 12 | **Framework adapters** | LangChain, CrewAI, LlamaIndex |
| 13 | **Knowledge graph** | Entity extraction + traversal |
| 14 | **Multi-region** | 6 regions, 12-42ms latency |
| 15 | **Mock mode** | Zero-config local development |
| 16 | **EU AI Act compliant** | Article 12 record-keeping |
| 17 | **$0 pricing** | Free forever, MIT licensed |

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
