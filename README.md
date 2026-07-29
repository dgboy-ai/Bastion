# Bastion Shield — Production-Grade Memory Integrity for AI Agents

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Bastion** is a memory integrity layer for AI agents built on CockroachDB. It detects, verifies, and heals agent memories in real-time — combining SHA-256 hash chains, C-SPANN vector search, and multi-agent orchestration.

## Key Features

| Feature | What It Does |
|---------|-------------|
| **SHA-256 Hash Chains** | Every memory is cryptographically linked to the previous — tamper-proof ledger |
| **AS OF SYSTEM TIME** | Time-travel to any past moment using CockroachDB MVCC |
| **OWASP ASI06 Guard** | 40+ pattern detectors block prompt injection before memory is stored (95.8% TP, 0% FP, ~10ms avg, ~30ms p99) |
| **C-SPANN Vector Search** | Distributed vector index for semantic similarity search across all memories |
| **EU AI Act Compliance** | Article 12 tamper-evident logging out of the box — hash chains, append-only audit trails, compliance reporting |
| **Groq LLM Reasoning** | Real LLM-powered analysis of incidents using historical memory context |
| **MCP Server (35 tools)** | Model Context Protocol server for memory + compliance operations |
| **A2A Server (25 skills)** | Agent-to-Agent protocol for multi-agent coordination |
| **Multi-Agent SOC** | Analyst + Responder agents collaborate via A2A to detect and heal poisoning attacks |

## Architecture

```
┌──────────────────────────────────────────────┐
│              Bastion Shield                   │
│        Agent Memory Integrity Layer           │
├──────────────────────────────────────────────┤
│                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Dashboard │  │MCP Server│  │A2A Server│   │
│  │ :3000    │  │ :9997    │  │ :9998    │   │
│  │ Next.js  │  │ Python   │  │ Python   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       └──────┬──────┴──────┬──────┘          │
│       ┌──────▼─────────────▼──────┐           │
│       │     CockroachDB Cloud     │           │
│       │  C-SPANN + SQL + MVCC    │           │
│       │  SHA-256 Hash Chains     │           │
│       │  AS OF SYSTEM TIME       │           │
│       └──────────────────────────┘           │
│                                               │
│  ┌──────────────────────────────────────┐    │
│  │ Integration Points                   │    │
│  │ all-MiniLM-L6-v2 (embeddings)        │    │
│  │ AWS KMS (encryption)                 │    │
│  │ Groq LLM (reasoning)                 │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
```

## CockroachDB Tools Used

| Tool | Integration |
|------|-------------|
| **Managed MCP Server** | Live SQL queries against CockroachDB Cloud via `cockroachlabs.cloud/mcp` |
| **C-SPANN Vector Index** | Distributed vector index on `embedding_384` column for similarity search |
| **ccloud CLI** | Cluster management, audit trail, SQL access — integrated in playground |
| **Agent Skills** | 34 machine-executable skills from `cockroachlabs/cockroachdb-skills` — invoked via MCP `invoke_agent_skill` tool with live SQL execution against the cluster |

## Agent Skills Repo (Live Execution)

34 skills from [cockroachlabs/cockroachdb-skills](https://github.com/cockroachlabs/cockroachdb-skills) installed. Invoked via MCP `invoke_agent_skill` tool — reads SKILL.md, extracts SQL, executes against the cluster:

```bash
# Via MCP: invoke_agent_skill("reviewing-cluster-health", execute=True)

--- Cluster version ---
('CockroachDB CCL v26.2.1 (x86_64-pc-linux-gnu, built 2026/05/21)')

--- Memory count ---
(1869,)

--- Cluster settings ---
('kv.rangefeed.enabled', 'true')
('sql.stats.automatic_collection.enabled', 'true')
```

Skills cover health checks, performance triage, schema analysis, security audits, and migrations.
| **AS OF SYSTEM TIME** | MVCC time-travel for memory forensics |
| **SERIALIZABLE Isolation** | Prevents hash chain forks in concurrent multi-agent scenarios |
| **VECTOR Data Type** | Native 1024-dim vector storage with cosine distance operator `<=>` |

## AWS Services Used

- **Sentence Transformers** — all-MiniLM-L6-v2 for local embedding generation
- **AWS KMS** — Encryption key management for memory encryption
- **Amazon EC2** — Production deployment target
- **AWS Lambda** — CDC handler for hash chain verification + self-healing (via Terraform)
- **Amazon S3** — Memory archives with Glacier lifecycle (via Terraform)

## ccloud CLI (Authenticated — Live Cluster)

```bash
$ ccloud cluster list -o json
[
  {
    "id": "<cluster-id>",
    "name": "bastion-memory",
    "cloud_provider": "AWS",
    "plan": "SERVERLESS",
    "cockroach_version": "v26.2.1",
    "state": "CREATED",
    "regions": [
      {
        "name": "ap-south-1",
        "primary": true,
        "sql_dns": "<sql-endpoint>"
      }
    ]
  }
]
```

Used in `dba.py` (`_run_ccloud`) for auto-scaling, SQL queries, cluster health checks, and in `mcp_server.py` (`ccloud_exec` MCP tool) for agent-driven cluster management.

## EU AI Act Compliance

Bastion provides **automatic, tamper-evident logging** that satisfies EU AI Act Article 12 record-keeping requirements — enforceable since **2 August 2026**.

| Requirement | Bastion Feature |
|---|---|
| Automatic event recording | `agent_audit` table logs every memory operation |
| Tamper-evident logs | SHA-256 hash chain — cryptographic proof of integrity |
| Traceability | `forensic_report` and `compliance_report` MCP tools |
| 6-month retention | CockroachDB durable storage with TTL |
| Time-travel reconstruction | `AS OF SYSTEM TIME` queries |

Generate a regulator-ready compliance report via the MCP tool:
```
compliance_report(start_date="2026-07-01T00:00:00Z")
```

See [docs/EU_AI_ACT.md](docs/EU_AI_ACT.md) for the full compliance mapping.

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- CockroachDB Cloud cluster (Serverless or Dedicated)
- Groq API key (for LLM reasoning)

### 1. Clone & Install

```bash
git clone https://github.com/dgboy-ai/Bastion.git
cd Bastion

# Dashboard
cd dashboard
npm ci
npm run dev &

# Python services
cd ..
python -m venv .venv
source .venv/bin/activate
pip install -e ".[mcp,a2a,groq]"

# Start MCP + A2A servers
python -m bastion.mcp_server --transport http --host 0.0.0.0 --port 9997 &
python -m bastion.a2a_server &
```

### 2. Configure Environment

```bash
cp .env.local.example .env.local
# Edit .env.local with your credentials
```

### 3. Open Dashboard

Navigate to [http://localhost:3000](http://localhost:3000) and run the 19-step demo.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/demo/poison` | Inject a poisoned memory with real OWASP guard detection |
| `/api/demo/heal` | Time-travel recovery via `AS OF SYSTEM TIME` |
| `/api/demo/chat` | Semantic vector search with cosine similarity |
| `/api/demo/reason` | Groq LLM-powered reasoning chain with memory context |
| `/api/soc` | Multi-agent orchestration (Analyst → Responder) |
| `/api/mcp/*` | 35 MCP tools (memory_store, search, timetravel, compliance_report, etc.) |
| `/api/a2a` | A2A agent card with 25 skills |
| `/api/compliance/report` | EU AI Act Article 12 compliance report |
| `/api/skills` | 34 CockroachDB Agent Skills |
| `/api/ccloud` | ccloud CLI proxy (`cluster list`, `audit list`) |
| `/api/official-mcp` | Official CockroachDB Managed MCP tool listing |

## Demo (19 Steps)

1. **Memory Poisoning Detection** — Inject malicious payload, OWASP guard blocks it
2. **Time Travel Recovery** — Restore clean state via `AS OF SYSTEM TIME '-5s'`
3. **Semantic Vector Search** — Query memories using C-SPANN vector index
4. **Multi-Agent Orchestration** — Analyst detects, Responder heals via A2A
5. **LLM Reasoning** — Groq analyzes incident with memory context
6. **Official Tools** — Managed MCP, ccloud CLI, Agent Skills

## Project Structure

```
Bastion/
  dashboard/       Next.js 16 dashboard (playground, API)
  src/bastion/      Python MCP + A2A servers (63 modules)
  scripts/         EC2 deployment scripts
  .agents/skills/  34 CockroachDB Agent Skills
  terraform/       Terraform deployment config
  lambda/          AWS Lambda handlers (CDC, webhooks)
```

## License

MIT
