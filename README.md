<h1 align="center">Bastion Shield</h1>

<p align="center">
  <strong>Immutable, cryptographically verified memory infrastructure for AI agents.</strong><br>
  <em>If your agent remembers, Bastion proves it was never told to forget.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://cockroachlabs.com"><img src="https://img.shields.io/badge/CockroachDB-v23.2%2B-blue?style=flat-square&logo=cockroachlabs" alt="CockroachDB" /></a>
  <a href="https://aws.amazon.com"><img src="https://img.shields.io/badge/AWS-KMS%20%7C%20S3-orange?style=flat-square&logo=amazon-aws" alt="AWS" /></a>
  <a href="#performance"><img src="https://img.shields.io/badge/Recall%405-100%25-brightgreen?style=flat-square" alt="Recall@5" /></a>
  <a href="#guard-accuracy"><img src="https://img.shields.io/badge/OWASP_TPR-87%25-red?style=flat-square" alt="OWASP Detection" /></a>
  <a href="#live-cluster"><img src="https://img.shields.io/badge/Live-4%2C080%20memories-green?style=flat-square" alt="Live Cluster" /></a>
</p>

<p align="center">
  <a href="https://bastion-self.vercel.app">Forensic Control Plane</a> ·
  <a href="docs/EVIDENCE.md">Live Proof</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/MCP_SERVER.md">MCP Tools</a>
</p>

---

## Why This Exists

AI agents accumulate persistent memory. Memory poisoning is permanent: a single malicious record corrupts every future interaction, and the agent has no way to know it was compromised.

| Attack | Success Rate | Year | Source |
|:---|:---|:---|:---|
| **MemMorph**: tool hijacking via 3 planted memory records | 85.9% | 2026 | [arXiv 2605.26154](https://arxiv.org/abs/2605.26154) |
| **GhostWriter**: persistent memory subsystem poisoning | 80-99.8% | 2026 | [arXiv 2607.06595](https://arxiv.org/abs/2607.06595) |
| **MINJA**: query-only memory injection across 10 agent backbones | 95%+ | 2025 | [NeurIPS 2025](https://arxiv.org/abs/2503.03704) |
| **AI Recommendation Poisoning**: hidden instructions in "Summarize" buttons | 50 attack variants across 31 companies | 2026 | [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) |
| **OWASP ASI06**: Memory & Context Poisoning | Classified in Top 10 for Agentic Applications | 2026 | [OWASP Top 10](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) |

---

## The Solution

Memory isn't a cache. It's a ledger. Every fact is a signed, chained, timestamped entry that proves its own history. The attack becomes evidence.

**Seven defense layers, backed by CockroachDB.**

| Layer | What It Does | CockroachDB Feature |
|:---|:---|:---|
| **OWASP ASI06 Guard** | Scans every write for prompt injection | Append-only audit log |
| **HMAC-SHA256 Hash Chain** | Cryptographically links each memory, tampering breaks the chain | `SERIALIZABLE` isolation |
| **Row-Level TTL** | Short-term memories auto-expire (1h-7d); forensic records never expire | `ttl_expire_after` + `expires_at` |
| **Dream Consolidation** | Background scan finds dormant sleeper poison | Automatic statistics |
| **Self-Healing** | Detects broken chains, prunes poisoned memories, reseals | Chain verification |
| **Time-Travel Recovery** | Rolls back to a clean state | `AS OF SYSTEM TIME` |
| **CDC to S3 Export** | Every write streams to S3 as NDJSON, background threat scanning, no polling | `SHOW CHANGEFEED JOBS` |

<p align="center">
  <img src="docs/architecture.jpeg" alt="Bastion Shield Architecture Diagram" width="800">
</p>

---

## Live Cluster

Measured against a production CockroachDB Cloud Serverless cluster in AWS `ap-south-1`:

| Metric | Value | Status |
|:---|:---|:---|
| **Memories Stored** | 4,000+ | Live |
| **Audit Log** | 9,800+ entries | Live |
| **MCP Tools** | 35 | Live |
| **Hash Chain** | 0 broken links | 100% sealed |
| **Row-Level TTL** | 1h (messages), never (forensic) | Native CRDB + `expires_at` |
| **CDC Changelogs** | 4 live changefeeds to S3 | Streaming |

---

## Performance

*Benchmarked on 2026-08-17 against the live cluster. Real MiniLM embeddings, no mocks.*

| Operation | p50 Latency | Notes |
|:---|:---|:---|
| **Memory Write** | 855ms | `SERIALIZABLE` + HMAC chain |
| **Semantic Search** | 598ms | C-SPANN vector index |
| **Time-Travel** | 284ms | `AS OF SYSTEM TIME` |
| **Guard Scan** | 0.52ms raw / 6.7ms E2E | OWASP ASI06 pattern matching |

### Guard Accuracy

| Metric | Value | Details |
|:---|:---|:---|
| **True Positive Rate** | 87.0% | 420/483 adversarial payloads caught |
| **False Positive Rate** | 0.0% | 0/25 benign texts flagged |
| **Recall@5** | 100.0% | Top-5 accuracy |

---

## 35 MCP Tools: CockroachDB + Custom, One Server

Bastion ships a single MCP server with **35 tools**. Four are CockroachDB-native. The rest are custom memory, integrity, and intelligence tools (full list in [`docs/MCP_SERVER.md`](docs/MCP_SERVER.md)).

### CockroachDB Tools (built-in)

| Tool | What It Does |
|:---|:---|
| `managed_mcp_call` | Query your cluster via the official CockroachDB Managed MCP Server (SQL, schema, cluster health) |
| `managed_mcp_list_tools` | Discover available tools on the CockroachDB Managed MCP Server |
| `invoke_agent_skill` | Run official CockroachDB Agent Skills (health checks, live triage, CIS audits, range analysis) |
| `list_agent_skills` | List all available Agent Skills from `.agents/skills/` |
| `ccloud_exec` | Execute `ccloud` CLI commands (cluster provisioning, SQL, backups, networking, audit logs) |

---

## Why Bastion (vs the alternatives)

| System | Strengths | Bastion's Differentiator |
|:---|:---|:---|
| **[mem0](https://mem0.ai)** (~63K stars, $24M) | Best managed memory layer. 93.4% LongMemEval. Broad integrations. | Cryptographic hash chains, time-travel, OWASP ASI06 guard. Integrity that persists underneath any retrieval layer. |
| **[Zep](https://github.com/getzep/graphiti)** (~30K stars) | Best temporal knowledge graph. 63.8% LongMemEval. | Tamper-evident hash chains + CDC self-healing. Proves nobody altered the graph after the fact. |
| **[Letta](https://github.com/letta-ai/letta)** (~13K stars, $10M) | Best OS-style agent runtime. Self-managing memory. | Memory *layer*, not a runtime. Secures any agent without lock-in. |
| **[Cognee](https://github.com/topoteretes/cognee)** (~30K stars) | Best graph-native memory with ontologies. Self-hosted. | Cryptographic provenance + CDC self-healing. Proves relationships haven't been tampered with. |

**Bastion = the only system where memory is a cryptographically chained, self-healing ledger.**

See full evidence with live SQL outputs: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)

---

## Quick Start

> **Note to judges:** The demo was recorded on a live CockroachDB Serverless cluster. All features work with your own cluster via `BASTION_CONN` or the dashboard login.

**Option 1: Live Hosted Dashboard (Recommended for Judges)**
1. Go to **[bastion-self.vercel.app](https://bastion-self.vercel.app)**
2. Enter the passphrase: `bastion` to access the live forensic dashboard.
3. To test with your own cluster, click **Connect Cluster** in the navbar and enter your `postgresql://` URI.

**Option 2: Docker (Local Full Stack)**

```bash
git clone https://github.com/dgboy-ai/Bastion.git
cd Bastion
docker compose -f docker-compose.demo.yml up
```

Dashboard at `http://localhost:3000`. MCP server at `http://localhost:9997`.

---

## Documentation

| Doc | Contents |
|:---|:---|
| [Evidence Pack](docs/EVIDENCE.md) | Live SQL outputs, S3/KMS artifacts, file:line citations |
| [Architecture](docs/ARCHITECTURE.md) | Tables, hash chain, time-travel, CDC pipeline |
| [MCP Server](docs/MCP_SERVER.md) | 35 tools reference |
| [AI Safety](docs/AI_SAFETY.md) | Guard architecture, OWASP ASI06 |
| [AWS Services](docs/AWS_SERVICES.md) | KMS signing + S3 CDC export |
| [EU AI Act](docs/EU_AI_ACT.md) | Article 12 compliance evidence |

---

## License

MIT, see [LICENSE](LICENSE).
