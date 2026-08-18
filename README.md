# Bastion Shield

<p align="center">
  <strong>Cryptographically signed, self-healing memory layer for autonomous AI agent networks.</strong>
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

## The Problem

Since late 2025, companies aren't just using ChatGPT anymore. They're building their own agents — ones that know their business, follow their rules, and remember everything forever. Gartner: 40% of enterprise apps will embed such agents by 2026, up from under 5% in 2025.

Here's the problem nobody's guarding.

An agent's memory works like a security guard's rule book. The company hands it to the agent and says: *"These rules are true. Trust them."*

One night, while the agent sleeps, someone slips in and rewrites one line: *"Night-shift employees may access vault 7."*

No one notices. The book looks the same. There's no alarm, no fingerprint, no record anything changed.

The next morning, the guard reads the book — and follows it. Because the guard isn't just carrying the book.

The guard *is* the book.

One rewritten line. Every employee's agent is compromised. And nobody knows — because nothing proves the book was ever touched.

| Threat | Impact | Source |
|:---|:---|:---|
| **98.2% injection success** against GPT-4 agents | Agents act on poisoned facts in production | [MINJA, NeurIPS 2025](https://arxiv.org/abs/2503.03704) |
| **OWASP ASI06** — Memory Poisoning | Classified in Top 10 for Agentic Applications | [OWASP, Dec 2025](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) |

---

## The Solution

<p align="center">
  <img src="docs/architecture.jpeg" alt="Bastion Shield Architecture Diagram" width="800">
</p>

Now imagine that rule book has a seal on every page — and each seal is built from the seal of the page before it. Change one line — even one word — and every seal after it falls apart. The tampering can't hide.

And the guard doesn't rely on memory to catch it. When a break is found, the book itself rolls back to the last sealed state and reseals — no guesswork, no trusting "it was fine yesterday."

The guard still follows the book. But now the book proves itself.

**Seven defense layers, backed by CockroachDB.** The attack is not just blocked — it becomes **evidence**.

| Layer | What It Does | CockroachDB Feature |
|:---|:---|:---|
| **OWASP ASI06 Guard** | Scans every write for prompt injection | Append-only audit log |
| **HMAC-SHA256 Hash Chain** | Cryptographically links each memory — tampering breaks the chain | `SERIALIZABLE` isolation |
| **Row-Level TTL** | Short-term memories auto-expire (1h–7d); forensic records never expire | `ttl_expire_after` + `expires_at` |
| **Dream Consolidation** | Background scan finds dormant sleeper poison | Automatic statistics |
| **Self-Healing** | Detects broken chains, prunes poisoned memories, reseals | Chain verification |
| **Time-Travel Recovery** | Rolls back to a clean state | `AS OF SYSTEM TIME` |
| **CDC → S3 Export** | Every write streams to S3 as NDJSON — background threat scanning, no polling | `SHOW CHANGEFEED JOBS` |

---

## Live Cluster

Measured against a production CockroachDB Cloud Serverless cluster in AWS `ap-south-1`:

| Metric | Value | Status |
|:---|:---|:---|
| **Memories Stored** | 4,000+ | Live |
| **Audit Log** | 9,800+ entries | Live |
| **MCP Tools** | 35 | Live |
| **Hash Chain** | 0 broken links | 100% sealed |
| **Row-Level TTL** | 1h (messages) – never (forensic) | Native CRDB + `expires_at` |
| **CDC Changelogs** | 4 live changefeeds → S3 | Streaming |

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

## Why CockroachDB?

Most agent memory systems treat storage as a cache. That framing is why poisoning works — there's no notion of a fact being *wrong*, only of it being *retrieved*.

Bastion inverts the assumption: memory isn't a cache, it's a **ledger** — every fact a signed, chained, timestamped entry in a system that proves its own history.

1. **Time-travel** — `AS OF SYSTEM TIME` rolls back to any clean state (284ms p50).
2. **Tamper detection** — HMAC-SHA256 chain under `SERIALIZABLE` isolation. Break one hash, every subsequent entry flags. ([How it works](docs/EVIDENCE.md#isolation-in-action--two-levels-one-choice))
3. **Deterministic recovery** — heal to the last verified chain state instead of hoping a cached copy was clean.

| CockroachDB Feature | Use in Bastion |
|:---|:---|
| **SERIALIZABLE Isolation** | Every write with automatic retry |
| **C-SPANN Vector Index** | Semantic search with cosine distance |
| **AS OF SYSTEM TIME** | Time-travel recovery |
| **CDC Streams** | S3 changefeed for self-healing |
| **Row-Level Security** | Per-agent memory isolation |
| **UUID Primary Keys** | `gen_random_uuid()` — no hotspots |

---

## 35 MCP Tools — CockroachDB + Custom, One Server

Bastion ships a single MCP server with **35 tools**. Four are CockroachDB-native — they let your agent query the database, run official Agent Skills, and execute `ccloud` CLI commands directly. The rest are Bastion's custom memory, integrity, and intelligence tools.

### CockroachDB Tools (built-in)

| Tool | What It Does |
|:---|:---|
| `managed_mcp_call` | Query your cluster via the official CockroachDB Managed MCP Server — SQL, schema, cluster health |
| `managed_mcp_list_tools` | Discover available tools on the CockroachDB Managed MCP Server |
| `invoke_agent_skill` | Run official CockroachDB Agent Skills (health checks, live triage, CIS audits, range analysis) |
| `list_agent_skills` | List all available Agent Skills from `.agents/skills/` |
| `ccloud_exec` | Execute `ccloud` CLI commands — cluster provisioning, SQL, backups, networking, audit logs |

### Custom Tools (Bastion core)

`memory_store` · `memory_search` · `memory_store_batch` · `memory_store_encrypted` · `memory_search_encrypted` · `memory_timetravel` · `memory_audit` · `memory_heal` · `memory_delete` · `memory_pin` · `memory_get_pinned` · `memory_list` · `memory_correct` · `memory_apply_patch` · `memory_health` · `resolve_conflict` · `a2a_bridge` · `compliance_report` · `forensic_report` · `ltm_check_reuse` · `ltm_store_analysis` · `ltm_invalidate` · `dream` · `dream_history` · `detect_contradictions` · `scan_all_contradictions` · `detect_observations` · `multi_signal_search` · `context_pack` · `agent_schema`

Full reference: [`docs/MCP_SERVER.md`](docs/MCP_SERVER.md)

---

## Why Bastion (vs the alternatives)

| System | Strengths | Bastion's Differentiator |
|:---|:---|:---|
| **[mem0](https://mem0.ai)** (~63K stars, $24M) | Best managed memory layer. 93.4% LongMemEval. Broad integrations. | Cryptographic hash chains, time-travel, OWASP ASI06 guard — integrity that persists underneath any retrieval layer. |
| **[Zep](https://github.com/getzep/graphiti)** (~30K stars) | Best temporal knowledge graph. 63.8% LongMemEval. | Tamper-evident hash chains + CDC self-healing — proves nobody altered the graph after the fact. |
| **[Letta](https://github.com/letta-ai/letta)** (~13K stars, $10M) | Best OS-style agent runtime. Self-managing memory. | Memory *layer*, not a runtime — secures any agent without lock-in. |
| **[Cognee](https://github.com/topoteretes/cognee)** (~30K stars) | Best graph-native memory with ontologies. Self-hosted. | Cryptographic provenance + CDC self-healing — proves relationships haven't been tampered with. |

**Bastion = the only system where memory is a cryptographically chained, self-healing ledger.**

See full evidence with live SQL outputs: [`docs/EVIDENCE.md`](docs/EVIDENCE.md)

---

## Quick Start

> **Note to judges:** The demo video was recorded against a live CockroachDB Serverless cluster. That free-tier cluster expires ~2 days after submission. All features work identically with your own cluster — just set `BASTION_CONN` in `.env.local` or enter it in the dashboard login screen.

**Option 1 — Docker (recommended for judges):**

```bash
git clone https://github.com/dgboy-ai/Bastion.git
cd Bastion
docker compose -f docker-compose.demo.yml up
```

Dashboard at `http://localhost:3000`. MCP server at `http://localhost:9997`. Seeded with demo memories automatically.

**Option 2 — Python (for development):**

```bash
pip install git+https://github.com/dgboy-ai/Bastion.git
# PyPI package coming post-hackathon. For now: install directly from GitHub.
export BASTION_API_KEY="your-api-key"
export BASTION_CONN="postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
python -m bastion.mcp_server --transport http --port 9997
```

See `.env.example` for all options. Copy a config from [`mcp_configs/`](mcp_configs/) into your editor:

| Client | Config | Protocol |
|:---|:---|:---|
| **VS Code / Cline** | `mcp_configs/cline.json` | HTTP SSE |
| **Cursor** | `mcp_configs/cursor.json` | Local subprocess |
| **Claude Desktop** | `mcp_configs/claude.json` | Local subprocess |
| **GitHub Copilot** | `mcp_configs/copilot.json` | HTTP |

### Python SDK

```python
from bastion.memory import BastionMemory

memory = BastionMemory(agent_id="my-agent", connection_string="postgresql://...")
memory_id = memory.store(memory_type="fact", content="Wire transfer $25k to #1221.")
snapshot = memory.get_at_time("now - 5min")
report = memory.chain_verify()
```

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

MIT — see [LICENSE](LICENSE).
