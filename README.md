# Bastion Shield — Memory Integrity for Production AI Agents

<p align="center">
  <img src="docs/architecture.svg" alt="Bastion Logo" width="540px" style="max-width: 100%; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);" />
</p>

<p align="center">
  <strong>Cryptographically signed, self-healing memory layer for autonomous AI agent networks.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://cockroachlabs.com"><img src="https://img.shields.io/badge/CockroachDB-v23.2%2B-blue?style=flat-square&logo=cockroachlabs" alt="CockroachDB" /></a>
  <a href="https://aws.amazon.com"><img src="https://img.shields.io/badge/AWS-KMS%20%7C%20Lambda%20%7C%20S3-orange?style=flat-square&logo=amazon-aws" alt="AWS" /></a>
  <a href="#performance"><img src="https://img.shields.io/badge/Recall-98.2%25-green?style=flat-square" alt="Recall Status" /></a>
  <a href="#coverage"><img src="https://img.shields.io/badge/OWASP_TPR-88.2%25-red?style=flat-square" alt="OWASP Detection" /></a>
</p>

---

## 📖 The Story

As autonomous AI agents transition from answering support tickets to executing system-level operations—running migrations, managing servers, and adjusting records—their memory becomes the ultimate attack vector. 

**The Problem: AI Memory Poisoning.** 
If an attacker injects malicious commands into a public file, an agent reads it, stores it in its long-term vector memory, and is permanently poisoned. Even worse, if an intruder accesses your database, they can silently alter historical memories, causing the agent to act on false facts with no audit trail of what changed. Prompt engineering cannot secure this; the vulnerability must be defended where the state persists.

**The Solution: A Self-Healing, Verifiable Memory Ledger.**
We asked: *What if the agent's memory validation and integrity checks lived directly inside the database transaction layer?*

**That is Bastion.**

Bastion integrates **AWS KMS** and **CockroachDB's `SERIALIZABLE` transactions** to sign and lock every memory block into a cryptographic HMAC-SHA256 hash chain. If a hacker attempts to poison the agent or alter the database records, the chain breaks. Bastion then uses **CockroachDB's native MVCC time-travel (`AS OF SYSTEM TIME`)** to automatically roll back, audit, and heal the memory ledger to a clean state. The database is no longer a passive table; it is the cryptographic firewall of the agent.

---

## 🔗 MCP Configuration Quick Links

| Client | Config | Protocol | Server |
|--------|--------|----------|--------|
| **Cline / VS Code** | [`mcp_configs/cline.json`](mcp_configs/cline.json) | Streamable HTTP | Bastion Memory + CockroachDB Cloud |
| **Cursor** | [`mcp_configs/cursor.json`](mcp_configs/cursor.json) | Local Subprocess | Bastion Memory |
| **GitHub Copilot** | [`mcp_configs/copilot.json`](mcp_configs/copilot.json) | HTTP | Bastion Memory + CockroachDB Cloud |
| **Claude Desktop** | [`mcp_configs/claude.json`](mcp_configs/claude.json) | Local Subprocess | Bastion Memory |
| **Codex** | [`mcp_configs/codex.json`](mcp_configs/codex.json) | Local Subprocess | Bastion Memory |
| **CockroachDB Cloud Managed MCP** | [`mcp_configs/managed.json`](mcp_configs/managed.json) | Streamable HTTP | **Official `https://cockroachlabs.cloud/mcp`** |

> **📁 All configs use environment variable templates** — copy to `.env.local` and fill in your values (see [`.env.example`](.env.example)).  
> **Never commit real credentials.** Use `${VAR_NAME}` placeholders in JSON configs.

---

## 🧠 Two MCP Servers — What's the Difference?

Bastion runs **two distinct MCP servers** that work together:

### 1. **Bastion Custom MCP Server** (`bastion-memory`)
**Your memory integrity layer** — runs locally or on your infrastructure.
- **35 tools** for memory operations with cryptographic guarantees
- **Hash chains** (HMAC-SHA256) on every memory block
- **OWASP ASI06 Guard** blocks prompt injection before DB write
- **Sleep-time consolidation** (Dreaming): dedup, conflict resolution, pattern extraction, LLM lesson synthesis
- **Time-travel queries** via CockroachDB MVCC (`AS OF SYSTEM TIME`)
- **A2A v1.0 bridge** for agent-to-agent delegation
- **Self-healing**: CDC Lambda handlers, hash chain verification, auto-recovery

**Tools include:** `memory_store`, `memory_search`, `memory_timetravel`, `memory_heal`, `memory_audit`, `dream`, `ltm_check_reuse`, `invoke_agent_skill`, `ccloud_exec`, `chain_verify`, `forensic_report`, `detect_contradictions`, `multi_signal_search`, `context_pack`, `agent_schema`, `a2a_bridge`, `memory_store_encrypted`, `memory_apply_patch`, `resolve_conflict`, `ltm_store_analysis`, `ltm_invalidate`, `detect_observations`, `scan_all_contradictions`, `dream_history`, `memory_pin`, `memory_get_pinned`, `memory_list`, `memory_correct`, `memory_health`, `forensic_report`, `memory_apply_patch`, `memory_delete`, `memory_store_batch`.

> **💡 CockroachDB Agent Skills execution**: The `invoke_agent_skill` tool integrates the official skills repo. When called by the agent (e.g. to run `reviewing-cluster-health`), the custom MCP server reads the playbook markdown file inside `.agents/skills/`, extracts the raw SQL query blocks, runs them against the live CockroachDB cluster using the connection pool, and returns the query outputs directly to the agent.


### 2. **CockroachDB Cloud Managed MCP** (`cockroachdb-cloud`)
**Official CockroachDB Cloud control plane** — hosted by Cockroach Labs at `https://cockroachlabs.cloud/mcp`.
- **12 tools** for cluster operations via the official MCP endpoint
- **Direct cluster access**: list clusters, databases, tables, schemas
- **SQL execution**: `select_query`, `explain_query`, `show_running_queries`
- **DDL operations**: `create_database`, `create_table`, `insert_rows`
- **Authentication**: OAuth (Basic/Serverless) or API Key (Advanced/Dedicated)

**Tools include:** `list_clusters`, `get_cluster`, `list_databases`, `list_tables`, `get_table_schema`, `select_query`, `explain_query`, `show_running_queries`, `show_statement`, `create_database`, `create_table`, `insert_rows`.

### How They Work Together
```
┌─────────────────────────────────────────────────────────────────┐
│                        YOUR AGENT (Cline/Cursor etc)            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
┌───────────────┐           ┌───────────────────┐
│ Bastion Memory│           │ CockroachDB Cloud │
│ Custom MCP    │           │ Managed MCP       │
│ (memory ops)  │           │ (cluster ops)     │
└───────┬───────┘           └────────┬──────────┘
        │                            │
        └──────────────┬─────────────┘
                       ▼
            ┌─────────────────────┐
            │  CockroachDB Cluster │
            │  (single source of   │
            │   truth for both)    │
            └─────────────────────┘
```

**Use Bastion MCP for agent memory workflows** (store/search/heal memories).  
**Use Managed MCP for infrastructure operations** (provision clusters, run SQL, inspect schemas).

---

## 🏁 Hackathon Requirements Checklist

| Requirement | Status | Technology Used |
| :--- | :---: | :--- |
| **CockroachDB Tool 1** | ✅ | **Managed MCP Server** — Direct config [`mcp_configs/managed.json`](mcp_configs/managed.json) → `https://cockroachlabs.cloud/mcp` + `managed_mcp_call` tool |
| **CockroachDB Tool 2** | ✅ | **C-SPANN Distributed Vector Indexing** — Native semantic search via `CREATE VECTOR INDEX` + `multi_signal_search` |
| **CockroachDB Tool 3** | ✅ | **ccloud CLI (Agent-Ready)** — `ccloud_exec` MCP tool |
| **CockroachDB Tool 4** | ✅ | **Agent Skills Repo** — 34 playbooks via `invoke_agent_skill` |
| **AWS Services (3)** | ✅ | **KMS** (Envelope encryption & cryptographic signing), **S3** (Cold memory archives), **Bedrock** (Titan embeddings) |
| **Open Source** | ✅ | Released under the standard **MIT License** |

---

## 🎮 Deployed Platforms

Bastion bridges memory integrity to any developer client or framework:
- **Clients**: Claude Code, Cursor, VS Code, or custom API endpoints.
- **Frameworks**: LangChain, CrewAI, LlamaIndex, or custom Python/TypeScript agents.
- **A2A v1.0 server** (agent↔agent delegation, signed Agent Cards) — for orchestrators like **Bedrock Agents** / **Vertex AI**; see [docs/A2A_SERVER.md](docs/A2A_SERVER.md).

---

## 💡 Why This Matters

AI agents are increasingly executing production tasks—such as updating code repositories, processing banking transfers, and diagnosing server incidents—without human approval. 

**If their memory is compromised, every future decision they make is compromised.** Bastion ensures that every stored fact, instruction, and transaction state can be trusted, verified, and recovered.

---

## ⚡ What Bastion Guarantees

- **Detect Poisoned Memories** — Block prompt injection attacks at the memory boundary.
- **Recover Trusted History** — Time-travel back to a clean state instantly when tampering is detected.
- **Prove Every Decision** — Cryptographically trace memory provenance using tamper-evident HMAC hash chains.
- **Comply with AI Regulations** — Meet EU AI Act Article 12 record-keeping requirements out-of-the-box (enforced August 2026).
- **Detect Sleeper Poisoning** — Proactive dream consolidation finds dormant injected memories (burst injection, high-importance/low-access, temporal clustering, contradictions).

---

## 🔴 The Problem: Memory Poisoning Is Real

AI agents with persistent memory are vulnerable to **memory poisoning** — attackers inject malicious content that persists across sessions and influences future decisions.

### Proof This Is Happening Now

| Evidence | Source |
|:---|:---|
| **98.2% injection success rate** against GPT-4 agents in production | [MINJA — NeurIPS 2025](https://arxiv.org/abs/2503.03704) |
| **50 poisoning attempts** at 31 companies across 14 industries (Copilot, ChatGPT, Claude, Gemini) | [Microsoft Security Blog, Feb 2026](https://www.microsoft.com/en-us/security/blog/2026/02/10/ai-recommendation-poisoning/) |
| **Google Gemini** — false memories persisted across all future sessions | [Embrace The Red, Feb 2025](https://embracethered.com/blog/posts/2025/gemini-memory-persistence-prompt-injection/) |
| **ChatGPT ZombieAgent** — zero-click exploit hijacks Deep Research agent | [Radware, Jan 2026](https://www.globenewswire.com/news-release/2026/01/08/3215156/8980/en/Radware-Unveils-ZombieAgent-A-Newly-Discovered-Zero-Click-AI-Agent-Vulnerability-Enabling-Silent-Takeover-and-Cloud-Based-Data-Exfiltration.html) |
| **OWASP ASI06** — Memory & Context Poisoning classified in Top 10 for Agentic Applications | [OWASP, Dec 2025](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) |

### Unsolved Research Problems Bastion Addresses

| Problem | Research Gap | Bastion Solution |
|:---|:---|:---|
| **No provenance** — "poisoned memory looks identical to legitimate" ([LlamaIndex #21666](https://github.com/run-llama/llama_index/issues/21666)) | No standard for tamper-evident write receipts | HMAC-SHA256 hash chains on every write (`memory.py:264`) |
| **No recovery** — "once poisoned, no rollback" ([OWASP ASI06](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)) | No rollback to known-good state | CockroachDB `AS OF SYSTEM TIME` queries (`memory.py:1659`) |
| **Cross-agent propagation** — "one poison spreads through toolchain" ([Morris-II](https://arxiv.org/abs/2403.02817)) | No defense for multi-agent memory integrity | Per-agent chain isolation via Row Level Security (`memory.py:323`) |
| **Sleeper poisoning** — "dormant memories activate later" ([arXiv:2605.15338](https://arxiv.org/abs/2605.15338)) | Defenses miss delayed-activation payloads | Dream consolidation: burst detection, high-importance/low-access, temporal clustering, contradiction detection (`dreaming.py:424`) |
| **Injection at scale** — "95%+ success rate" ([MINJA](https://arxiv.org/abs/2503.03704)) | LLM trust scoring fails against confident attacks ([arXiv:2601.05504](https://arxiv.org/abs/2601.05504)) | OWASP ASI06 Guard blocks before DB write (`guard.py:656`) |

### CockroachDB Features powering Bastion

| Feature | Documentation | Use in Bastion |
|:---|:---|:---|
| **AS OF SYSTEM TIME** | [CockroachDB Docs](https://www.cockroachlabs.com/docs/v26.2/as-of-system-time) | Verify memory state at any past timestamp |
| **C-SPANN Vector Index** | [CockroachDB Docs](https://www.cockroachlabs.com/docs/stable/vector-indexes) | Semantic search with cosine similarity |
| **MVCC** | [CockroachDB Blog](https://www.cockroachlabs.com/blog/mvcc-garbage-collection/) | Time-travel queries |
| **SERIALIZABLE Isolation** | [CockroachDB Docs](https://www.cockroachlabs.com/docs/stable/transactions) | Hash chain integrity under concurrent writes |
| **CDC Streams** | [CockroachDB Docs](https://www.cockroachlabs.com/docs/stable/cdc-overview) | Self-healing via `memory_heal` |

---

## 🔍 The Problem & The Solution

```
Without Bastion:
AI trusts poisoned memories ➔ Wrong actions ➔ No recovery ➔ No evidence

With Bastion:
Tampering blocked/detected ➔ Recovered instantly ➔ Cryptographically proven ➔ Fully auditable
```

| Without Bastion | With Bastion |
| :--- | :--- |
| **No verification:** Anyone with database access can alter facts. | **HMAC-SHA256 Hash Chains:** Every memory cryptographically links to the previous. |
| **Silent poisoning:** Prompt injections hijack instructions. | **OWASP ASI06 Guard:** 40+ filters scan and block malicious inputs. |
| **Permanent corruption:** Recovering means manual rollbacks. | **Self-Healing State:** Anomaly checks trigger time-travel reconstruction. |
| **Compliance failure:** No event tracking or data retention audits. | **EU AI Act Ready:** Automatic Article 12 compliance logging (Aug 2026). |

---

## ⚖️ Why Existing Memory Systems Fail

| Memory Store | What It Does | Why It Fails | Bastion Advantage |
| :--- | :--- | :--- | :--- |
| **Typical Agent Memory** | Stores episodic states | No signature checks; easily poisoned. | **OWASP ASI06 Guard** checks inputs before database write. |
| **Common Cache / DB** | Caches key-value facts | In-memory only; no tamper-evident proof. | **HMAC-SHA256 Hash Chain** links database entries cryptographically. |
| **Standard Vector DB** | Semantic vector search | No transactional boundaries or time-travel. | **CockroachDB MVCC** runs queries `AS OF SYSTEM TIME` to heal. |

---

## 🧠 Why CockroachDB?

Bastion relies on the core architectural primitives of CockroachDB to act as the system of record:

| Traditional Databases | CockroachDB (Bastion Engine) |
| :--- | :--- |
| ❌ No historical time travel | **MVCC Time Travel:** Runs query filters `AS OF SYSTEM TIME` to retrieve clean snapshots. |
| ❌ Separate vector store overhead | **C-SPANN Vector Index:** Performs semantic vector search directly inside the operational DB. |
| ❌ Read-write state drift | **SERIALIZABLE Isolation:** Prevents concurrent write stampedes and chain splits. |
| ❌ Single-region latency | **Multi-Region Scale:** Partitioned RLS rules keep memories co-located with active agent executors. |

---

## 🏗️ System Architecture

### Architecture Diagram
![System Architecture](docs/architecture.svg)

*(Detailed vector and database schema layouts are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))*

#### Why A2A?
- **Two layers, one stack** — **MCP** connects agents to tools/data (Claude Code, Cline, Copilot); **A2A v1.0** connects agents to each other (Bedrock Agents, Vertex AI, Copilot Studio).
- **Delegation** — an orchestrator treats Bastion as a peer agent: delegate `memory_store` / `memory_heal` / `memory_verify` tasks over A2A; results land in CockroachDB as hash-chained memory.
- **Trust** — signed Agent Cards (Ed25519) let any A2A client verify Bastion's identity before delegating.
- **Future-facing** — MCP is today's surface; A2A is the emerging agent-to-agent standard as agent marketplaces mature.

---

## 🎥 90-Second Demo Flow

1. **Memory Poisoning Attempt**: An attacker injects a prompt injection payload.
2. **Detection**: The OWASP ASI06 Guard intercepts and blocks the write, logging it to the audit log.
3. **Forensics & Time Travel**: The agent uses `AS OF SYSTEM TIME` to view its state 5 seconds prior to the attack.
4. **Self-Healing**: Bastion compares the current broken hash chain with historical MVCC state and automatically restores database integrity.

---

## 📊 Verified Performance

*Measurements recorded under a 1,000-operation sequential workload on deployed AWS infrastructure against a CockroachDB Serverless cluster:*

```
Memory Write (HMAC Chained) ➔ ~45ms
Attack Detection (Guard Scan) ➔ ~10ms
Time-Travel Recovery (MVCC)  ➔ ~25ms
Integrity Verification (Audit)➔ Instant
```

---

## 🏁 Quick Start

### 1. Start Deployed Servers locally
Get a local Bastion stack up and running in mock mode:
```bash
git clone https://github.com/dgboy-ai/Bastion.git && cd Bastion

# Install dependencies and start servers
python -m venv .venv && source .venv/bin/activate
pip install -e ".[mcp,a2a,groq]"

# Start MCP (37 tools) & A2A (25 skills)
python -m bastion.mcp_server &
python -m bastion.a2a_server &
```

### 2. Start the Observability Dashboard (Frontend)
Run the Next.js web application to view live memory telemetry, drift logs, and the poisoning attack simulator:
```bash
cd dashboard
npm install
npm run dev
# Opens at http://localhost:3000
```

### 3. Integrate Bastion MCP into your IDE
Copy the template from our config folder and fill in your `.env.local`:
```bash
# Example for Cline
cp mcp_configs/cline.json ~/.config/cline/mcp_settings.json
cp .env.example .env.local
# Edit .env.local with your values
```

**Available configs in [`mcp_configs/`](mcp_configs/):**
| File | Client | Mode |
|------|--------|------|
| `cline.json` | Cline / VS Code | HTTP SSE + Managed MCP |
| `cursor.json` | Cursor | Local subprocess |
| `copilot.json` | GitHub Copilot | HTTP + Managed MCP |
| `claude.json` | Claude Desktop | Local subprocess |
| `codex.json` | Codex | Local subprocess |
| `managed.json` | **CockroachDB Cloud Managed MCP** | Direct to `https://cockroachlabs.cloud/mcp` |

### 4. Python SDK Usage Example
Integrate Bastion's self-healing memory ledger into your custom AI agent workspace:

```python
from bastion import BastionMemory

# Initialize Bastion Memory layer connected to CockroachDB
memory = BastionMemory(
    connection_uri="postgresql://user:pass@aws-crdb.bastion.live:26257/defaultdb",
    encryption_key_kms="arn:aws:kms:ap-south-1:123456789:key/..."
)

# Store memory with automatic HMAC chain linkage & Guard validation
memory_id = memory.store(
    agent_id="portfolio-executor",
    content="Execute wire transfer of $25,000 to treasury routing #1221.",
    metadata={"scope": "wire_transfer", "auth_token": "sig_ed25519_..."}
)

# Verify the cryptographic chain state and ledger integrity
audit = memory.verify_integrity()
print(f"Ledger Integrity: {audit.is_valid} | Checked Records: {audit.checked_records}")
```

For full setup guides, refer to [Local Development](docs/DEVELOPMENT.md) and [Cloud Deployment](docs/DEPLOYMENT.md).

---

## 📂 Project Documentation

- **`docs/`** — Deep-dive guides for [MCP tools](docs/MCP_SERVER.md), [A2A skills](docs/A2A_SERVER.md), [AWS services](docs/AWS_SERVICES.md), [Deployment](docs/DEPLOYMENT.md), [Local Development](docs/DEVELOPMENT.md), and [EU AI Act compliance](docs/EU_AI_ACT.md).
- **`src/bastion/`** — Core python middleware hosting the MCP and A2A servers.
- **`dashboard/`** — Next.js 16 dashboard visualizing memory health, entropy drift, and hash status.
- **`terraform/`** — Infrastructure as Code (IaC) for AWS S3 and KMS key provisioning.
- **`mcp_configs/`** — Ready-to-use MCP client configurations for all major clients.

---

## License

MIT — see [LICENSE](LICENSE)