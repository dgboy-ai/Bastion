# Bastion Shield — Memory Integrity for Production AI Agents

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/CockroachDB-v26.2.1-blue)](https://cockroachlabs.com)
[![AWS](https://img.shields.io/badge/AWS-Lambda%20%7C%20KMS%20%7C%20S3-orange)](https://aws.amazon.com)
[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-green.svg)](#)

AI agents are rapidly entering production workflows across finance, healthcare, and software engineering. But today's agentic systems suffer from a critical vulnerability: **they cannot prove whether a memory has been modified, poisoned, or silently corrupted.** 

When an agent's memory is hijacked, the agent acts on compromised facts without detection.

**Bastion is a production-grade memory integrity layer for autonomous AI agents. It doesn't just store memory. It proves memory.**

*Built on CockroachDB's distributed SQL engine and deployed on AWS for resilient, globally available agent memory.*

---

## 🏁 Hackathon Requirements Checklist

| Requirement | Status | Technology Used |
| :--- | :---: | :--- |
| **CockroachDB Tool 1** | ✅ | **Managed MCP Server** — Live SQL queries via the official console endpoint. |
| **CockroachDB Tool 2** | ✅ | **C-SPANN Distributed Vector Indexing** — Native semantic search on the memory table. |
| **CockroachDB Tool 3** | ✅ | **ccloud CLI (Agent-Ready)** — Auto-introspecting cluster topology and scaling rules. |
| **CockroachDB Tool 4** | ✅ | **Agent Skills Repo** — 34 playbooks execution wrapper from `cockroachdb-skills`. |
| **AWS Services (6)** | ✅ | **Lambda** (CDC & Webhooks), **KMS** (Key encryption), **S3** (Snapshots & Glacier), **SNS** (Breach alarms), **CloudWatch** (Alarms), **Bedrock** (Titan config fallbacks). |
| **Open Source** | ✅ | Released under the standard **MIT License**. |

---

## 🎮 Deployed Platforms

Bastion bridges memory integrity to any developer client or framework:
- **Clients**: Claude Code, Cursor, VS Code, or custom API endpoints.
- **Frameworks**: LangChain, CrewAI, LlamaIndex, or custom Python/TypeScript agents.

---

## 💡 Why This Matters

AI agents are increasingly executing production tasks—such as updating code repositories, processing banking transfers, and diagnosing server incidents—without human approval. 

**If their memory is compromised, every future decision they make is compromised.** Bastion ensures that every stored fact, instruction, and transaction state can be trusted, verified, and recovered.

---

## ⚡ What Bastion Guarantees

-   **Detect Poisoned Memories** — Block prompt injection attacks at the memory boundary.
-   **Recover Trusted History** — Time-travel back to a clean state instantly when tampering is detected.
-   **Prove Every Decision** — Cryptographically trace memory provenance using tamper-evident HMAC hash chains.
-   **Comply with AI Regulations** — Meet EU AI Act Article 12 record-keeping requirements out-of-the-box (enforced August 2026).

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

---

## 🎥 90-Second Demo Flow

1.  **Memory Poisoning Attempt**: An attacker injects a prompt injection payload.
2.  **Detection**: The OWASP ASI06 Guard intercepts and blocks the write, logging it to the audit log.
3.  **Forensics & Time Travel**: The agent uses `AS OF SYSTEM TIME` to view its state 5 seconds prior to the attack.
4.  **Self-Healing**: Bastion compares the current broken hash chain with historical MVCC state and automatically restores database integrity.

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

Get a local Bastion stack up and running in mock mode:
```bash
git clone https://github.com/dgboy-ai/Bastion.git && cd Bastion

# Install dependencies and start servers
python -m venv .venv && source .venv/bin/activate
pip install -e ".[mcp,a2a,groq]"

# Start MCP (35 tools) & A2A (25 skills)
python -m bastion.mcp_server &
python -m bastion.a2a_server &
```

For full setup guides, refer to [Local Development](docs/DEVELOPMENT.md) and [Cloud Deployment](docs/DEPLOYMENT.md).

---

## 📂 Project Documentation

-   **`docs/`** — Deep-dive guides for [MCP tools](docs/MCP_SERVER.md), [A2A skills](docs/A2A_SERVER.md), [AWS services](docs/AWS_SERVICES.md), [Deployment](docs/DEPLOYMENT.md), [Local Development](docs/DEVELOPMENT.md), and [EU AI Act compliance](docs/EU_AI_ACT.md).
-   **`src/bastion/`** — Core python middleware hosting the MCP and A2A servers.
-   **`dashboard/`** — Next.js 16 dashboard visualizing memory health, entropy drift, and hash status.
-   **`lambda/`** — AWS Lambda CDC handlers and webhook dispatchers.
-   **`terraform/`** — Infrastructure as Code (IaC) for AWS S3 and KMS key provisioning.

---

## License

MIT — see [LICENSE](LICENSE)