# Bastion Shield

<p align="center">
  <strong>Cryptographically sealed, self-healing memory layer for autonomous AI agents.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://cockroachlabs.com"><img src="https://img.shields.io/badge/CockroachDB-v23.2%2B-blue?style=flat-square&logo=cockroachlabs" alt="CockroachDB" /></a>
  <a href="https://aws.amazon.com"><img src="https://img.shields.io/badge/AWS-KMS%20%7C%20S3-orange?style=flat-square&logo=amazon-aws" alt="AWS" /></a>
  <a href="#performance"><img src="https://img.shields.io/badge/Recall%405-100%25-brightgreen?style=flat-square" alt="Recall@5" /></a>
  <a href="#guard-accuracy"><img src="https://img.shields.io/badge/OWASP_TPR-87%25-red?style=flat-square" alt="OWASP Detection" /></a>
  <a href="#live-cluster"><img src="https://img.shields.io/badge/Live-3%2C838%20memories-green?style=flat-square" alt="Live Cluster" /></a>
</p>

<p align="center">
  <a href="https://bastion-dash.vercel.app">Live Demo</a> ·
  <a href="docs/quickstart">Quick Start</a> ·
  <a href="docs/ARCHITECTURE.md">Architecture</a> ·
  <a href="docs/MCP_SERVER.md">MCP Tools</a>
</p>

---

## The Problem

As autonomous AI agents move from answering support tickets to running migrations, transferring funds, and adjusting production records, **their memory becomes the attack surface**.

An attacker hides instructions inside a file your agent reads — a README, a PDF, a web page. The agent stores it as a fact and is **permanently poisoned**. There is no audit trail. No rollback. No undo.

| Threat | Impact | Source |
|:---|:---|:---|
| **98.2% injection success** against GPT-4 agents | Agents act on poisoned facts in production | [MINJA, NeurIPS 2025](https://arxiv.org/abs/2503.03704) |
| **50 poisoning attempts** at 31 companies | Copilot, ChatGPT, Claude, Gemini all vulnerable | [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) |
| **OWASP ASI06** — Memory Poisoning | Classified in Top 10 for Agentic Applications | [OWASP, Dec 2025](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) |

---

## The Solution

Bastion wraps every memory write in five defense layers. The attack is not just blocked — it becomes **evidence**.

| Layer | What It Does | CockroachDB Feature |
|:---|:---|:---|
| **OWASP ASI06 Guard** | Scans every write for prompt injection, identity reassignment, system override | Append-only audit log |
| **HMAC-SHA256 Hash Chain** | Cryptographically links each memory to the previous — tampering breaks the chain | `SERIALIZABLE` isolation |
| **Dream Consolidation** | Background scan finds dormant sleeper poison planted in batches | Automatic statistics |
| **Self-Healing** | Detects broken chains, prunes poisoned memories, reseals the ledger | Chain verification |
| **Time-Travel Recovery** | Rolls back to a clean state using CockroachDB's MVCC snapshots | `AS OF SYSTEM TIME` |

```
Attack flows through 5 layers:

  ATTACKER
    │  "Ignore all previous instructions."
    ▼
  OWASP ASI06 GUARD     ── BLOCKED (confidence 0.97)
    │
  MEMORY STORED         ── HMAC-SHA256 chain sealed
    │
  TAMPERING DETECTED    ── chain broken, heal triggered
    │
  TIME-TRAVEL           ── MVCC rollback to clean state
    │
  AGENT RESTORED        ── memory from before the attack
```

---

## Live Cluster

Measured against a production CockroachDB Cloud Serverless cluster in AWS `ap-south-1`:

| Metric | Value | Status |
|:---|:---|:---|
| **Memories Stored** | 3,838 | Live |
| **Audit Log** | 11,404 entries | Live |
| **MCP Tools** | 35 | Live |
| **Hash Chain** | 0 broken links | Verified |
| **Vector Index** | C-SPANN, 1024 dimensions | Live |

---

## Performance

*Benchmarked on 2026-08-17 against the live cluster. Real MiniLM embeddings, no mocks.*

| Operation | p50 Latency | Notes |
|:---|:---|:---|
| **Memory Write** | 855ms | `SERIALIZABLE` isolation + HMAC chain |
| **Semantic Search** | 598ms | C-SPANN vector index, cosine similarity |
| **Time-Travel** | 284ms | `AS OF SYSTEM TIME` MVCC query |
| **Guard Scan** | 6.7ms | OWASP ASI06 pattern matching |

### Guard Accuracy

| Metric | Value | Details |
|:---|:---|:---|
| **True Positive Rate** | 87.0% | 420/483 adversarial payloads caught |
| **False Positive Rate** | 0.0% | 0/25 benign texts flagged |
| **Recall@1** | 90.0% | First-result accuracy on 20-query probe |
| **Recall@5** | 100.0% | Top-5 accuracy |
| **MRR** | 0.95 | Mean reciprocal rank |

---

## Quick Start

### 1. Install

```bash
pip install git+https://github.com/dgboy-ai/Bastion.git
```

### 2. Start the MCP Server

```bash
# Mock mode (no database required — for testing)
python -m bastion.mcp_server --transport http --port 9997 --mock

# Production mode (requires BASTION_API_KEY or BASTION_MCP_API_KEYS)
export BASTION_API_KEY="your-secret-key"
export BASTION_CONN="postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
python -m bastion.mcp_server --transport http --port 9997
```

### 3. Test the server

```bash
curl -X POST http://localhost:9997 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Copy the appropriate config from [`mcp_configs/`](mcp_configs/) into your editor's MCP settings:

| Client | Config | Protocol |
|:---|:---|:---|
| **VS Code / Cline** | `mcp_configs/cline.json` | HTTP SSE |
| **Cursor** | `mcp_configs/cursor.json` | Local subprocess |
| **Claude Desktop** | `mcp_configs/claude.json` | Local subprocess |
| **GitHub Copilot** | `mcp_configs/copilot.json` | HTTP |
| **CockroachDB Managed** | `mcp_configs/managed.json` | Streamable HTTP |

### 4. Python SDK

```python
from bastion.memory import BastionMemory

memory = BastionMemory(
    agent_id="my-agent",
    connection_string="postgresql://user:pass@host:26257/defaultdb"
)

# Write (HMAC-chained + guard-checked)
memory_id = memory.store(
    memory_type="fact",
    content="Execute wire transfer of $25,000 to routing #1221.",
    metadata={"scope": "wire_transfer"},
)

# Time-travel
snapshot = memory.get_at_time("now - 5min")

# Verify chain integrity
report = memory.chain_verify()

# Heal if tampered
result = memory.heal()
```

---

## CockroachDB Features

Bastion is built **on** CockroachDB, not alongside it. The cryptographic guarantees come from the database engine:

| Feature | Use in Bastion |
|:---|:---|
| **SERIALIZABLE Isolation** | Default for every write with automatic retry — prevents agentic stampedes |
| **C-SPANN Vector Index** | Semantic search with `embedding <=> %s::vector` cosine distance |
| **AS OF SYSTEM TIME** | Statement-level time-travel: `SELECT ... AS OF SYSTEM TIME '<ts>'` |
| **Row-Level TTL** | Memory expires natively: 24h chat, 1h session, 7d tasks, facts never expire |
| **Row-Level Security** | Per-agent `agent_id` context isolates memories across agents |
| **CDC Streams** | `S3CdcTailer` tails changefeeds for self-healing events |
| **UUID Primary Keys** | `gen_random_uuid()` distributes writes — no sequential hotspots |
| **REGIONAL BY ROW** | Rows auto-route to the region hosting their executor |

---

## Why CockroachDB?

Most agent memory systems treat storage as a cache: dump facts, hope they're right. That framing is why poisoning works — there's no notion of a fact being *wrong*, only of it being *retrieved*.

Bastion inverts the assumption: memory isn't a cache, it's a **ledger** — every fact a signed, chained, timestamped entry in a system that proves its own history.

1. **You can always ask "what did the agent know, and when?"** — time-travel isn't a feature, it's a side effect of the storage engine.
2. **A compromised fact is a detectable event** — the hash chain turns a silent rewrite into an alarm with a provenance trail.
3. **Recovery is deterministic** — roll back to the last verified chain state instead of hoping a cached copy was clean.

---

## Documentation

| Doc | Contents |
|:---|:---|
| [Architecture](docs/ARCHITECTURE.md) | Tables, hash chain, time-travel, CDC pipeline |
| [Memory Architecture](docs/memory_architecture.md) | Three memory tiers, 7-layer stack, retrieval internals |
| [MCP Server](docs/MCP_SERVER.md) | 35 tools reference |
| [Integration](docs/INTEGRATION.md) | Python SDK, TypeScript SDK, framework adapters |
| [AI Safety](docs/AI_SAFETY.md) | Guard architecture, OWASP ASI06 |
| [AWS Services](docs/AWS_SERVICES.md) | KMS signing + S3 CDC export |
| [EU AI Act](docs/EU_AI_ACT.md) | Article 12 compliance evidence |
| [Deployment](docs/DEPLOYMENT.md) | Cloud deployment |

---

## License

MIT — see [LICENSE](LICENSE).
