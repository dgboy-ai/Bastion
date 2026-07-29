# Bastion Shield — Production-Grade Memory Integrity for AI Agents

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CockroachDB](https://img.shields.io/badge/CockroachDB-v26.2.1-blue)](https://cockroachlabs.com)
[![AWS](https://img.shields.io/badge/AWS-Lambda%20%7C%20Bedrock%20%7C%20S3-orange)](https://aws.amazon.com)
[![MCP](https://img.shields.io/badge/MCP-35%20tools-purple)](https://modelcontextprotocol.io)
[![A2A](https://img.shields.io/badge/A2A-25%20skills-green)](https://a2a-protocol.org)

> **"Every other project builds memory *for* agents. Bastion builds memory that can *prove itself*."**

---

## 🤖 The Agent Is Cline

**Cline IS the agent.** Every memory stored, vector searched, hash chain verified happens because **Cline (your IDE agent) calls Bastion's MCP server as its memory layer** through the Model Context Protocol.

---

## Problem → Solution

| Problem | Bastion Solution |
|---------|-----------------|
| **Memory poisoning** — silent fact overwrite | **OWASP ASI06 Guard** — 40+ detectors, 95.8% TP, 0% FP, ~10ms |
| **Compliance exposure** — EU AI Act Article 12 | **Tamper-evident HMAC hash chains** — cryptographic proof |
| **No forensics** — can't prove what agent knew | **AS OF SYSTEM TIME** — time-travel to any moment via MVCC |

---

## Key Features

| Feature | What It Does |
|---------|-------------|
| **⚡ SERIALIZABLE Isolation** | Prevents "agent stampedes" |
| **🕐 Row-Level TTL** | Short-term memories expire automatically |
| **🔍 Hybrid Vector Search** | Semantic + metadata in single SQL query |
| **SHA-256 HMAC Hash Chains** | Every memory cryptographically linked |
| **AS OF SYSTEM TIME** | Time-travel to any moment via MVCC |
| **OWASP ASI06 Guard** | 40+ detectors, 95.8% TP, 0% FP, ~10ms |
| **Self-Healing Memory** | Detects breaks → queries MVCC → restores snapshot |
| **EU AI Act Compliance** | Article 12 tamper-evident logging (enforceable Aug 2, 2026) |
| **MCP Server (35 tools)** | Model Context Protocol for memory + compliance |
| **A2A Server (25 skills)** | Agent-to-Agent protocol, Ed25519-signed |
| **Multi-Agent SOC** | Analyst + Responder via A2A |

---

## Architecture

```
Bastion Shield — Agent Memory Integrity Layer
├── Dashboard (:3000) — Next.js
├── MCP Server (:9997) — 35 tools
├── A2A Server (:9998) — 25 skills
└── CockroachDB Cloud
    ├── C-SPANN Vector Index (vectors IN same DB)
    ├── SERIALIZABLE Isolation
    ├── AS OF SYSTEM TIME MVCC
    ├── Row-Level TTL + RLS
    └── SHA-256 HMAC Hash Chains
AWS: Lambda (CDC), S3 (snapshots), KMS (keys), SNS (alerts), CloudWatch, Bedrock
```

---

## CockroachDB Tools Used (4/4 Required)

| Tool | How We Use It |
|------|--------------|
| Managed MCP Server | Live SQL via `cockroachlabs.cloud/mcp` |
| C-SPANN Vector Index | `embedding_384 VECTOR(384)` + cosine distance |
| ccloud CLI | Cluster mgmt, audit, SQL — `ccloud_exec` MCP tool |
| Agent Skills Repo | 34 skills from `cockroachlabs/cockroachdb-skills` via `invoke_agent_skill` |

---

## AWS Services (6)

| Service | Role |
|---------|------|
| Amazon Bedrock | Titan Embed v2 (1024-dim) → C-SPANN |
| AWS Lambda | CDC changefeed → hash verification + self-healing |
| Amazon S3 | Memory snapshots + Glacier archive |
| AWS KMS | Encryption key management |
| Amazon SNS | Real-time breach alerts |
| Amazon CloudWatch | Lambda error alarms |

---

## Quick Start

```bash
git clone https://github.com/dgboy-ai/Bastion.git && cd Bastion

# Dashboard
cd dashboard && npm ci && npm run dev &

# Python services
python -m venv .venv && source .venv/bin/activate
pip install -e ".[mcp,a2a,groq]"

# Start MCP + A2A servers
python -m bastion.mcp_server --transport http --host 0.0.0.0 --port 9997 &
python -m bastion.a2a_server &

# Deploy Lambda (AWS)
python lambda/deploy.py --conn "$BASTION_CONN" --stack bastion-lambda --region ap-south-1
```

---

## Documentation

| Doc | Link |
|-----|------|
| EU AI Act Compliance | [docs/EU_AI_ACT.md](docs/EU_AI_ACT.md) |
| MCP Server | [docs/MCP_SERVER.md](docs/MCP_SERVER.md) |
| A2A Server | [docs/A2A_SERVER.md](docs/A2A_SERVER.md) |
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| AWS Services | [docs/AWS_SERVICES.md](docs/AWS_SERVICES.md) |
| CockroachDB Tools | [docs/COCKROACHDB_TOOLS.md](docs/COCKROACHDB_TOOLS.md) |
| Deployment | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Architecture Decisions | [docs/adr/](docs/adr/) |

---

## Memory Architecture (Deep Dive)

| Layer | Tech | Purpose |
|-------|------|---------|
| **Hash Chain** | HMAC-SHA256 (server secret) | Tamper-proof ledger |
| **Time-Travel** | `AS OF SYSTEM TIME` | MVCC forensics |
| **Vector Search** | C-SPANN `VECTOR(1024)` | Semantic + metadata in one query |
| **TTL** | `expires_at` + background GC | Auto-expiry by tier |
| **RLS** | `app.current_agent_id` | Zero-trust isolation |
| **Self-Heal** | CDC Lambda + MVCC | Auto-repair hash breaks |

---

## Quick Reference

```python
from bastion import BastionMemory

mem = BastionMemory(agent_id="soc-analyst")

# Store (guard → hash → TTL)
record = mem.store("fact", "User prefers Python", importance=8.0)

# Search (hybrid vector + keyword + entity + temporal)
results = mem.search("Python preferences", k=5, threshold=0.8)

# Time-travel
past = mem.get_at_time("2026-07-28T10:00:00Z")

# Hash chain verification
report = mem.forensic_report()

# Self-heal
result = mem.heal()

# Compliance
report = mem.compliance_report(start_date="2026-07-01")
```

---

## Performance (Live AWS ap-south-1)

| Operation | p50 | p99 |
|-----------|-----|-----|
| `memory_store` (with hash chain) | ~45ms | ~120ms |
| `memory_search` (C-SPANN vector) | ~38ms | ~95ms |
| OWASP ASI06 guard scan | ~10ms | ~30ms |
| `AS OF SYSTEM TIME` read | ~25ms | ~60ms |

---

## License

MIT — see [LICENSE](LICENSE)