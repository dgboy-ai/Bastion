# Bastion Shield — Production-Grade Memory Integrity for AI Agents

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Bastion** is a memory integrity layer for AI agents built on CockroachDB. It detects, verifies, and heals agent memories in real-time — combining SHA-256 hash chains, C-SPANN vector search, and multi-agent orchestration.

## Key Features

| Feature | What It Does |
|---------|-------------|
| **SHA-256 Hash Chains** | Every memory is cryptographically linked to the previous — tamper-proof ledger |
| **AS OF SYSTEM TIME** | Time-travel to any past moment using CockroachDB MVCC |
| **OWASP ASI06 Guard** | 40+ pattern detectors block prompt injection before memory is stored (94% detection, ~32ms) |
| **C-SPANN Vector Search** | Distributed vector index for semantic similarity search across all memories |
| **Groq LLM Reasoning** | Real LLM-powered analysis of incidents using historical memory context |
| **MCP Server (25 tools)** | Model Context Protocol server for memory operations (store, search, heal, audit) |
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
│  │ AWS Bedrock (embeddings)             │    │
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
| **Agent Skills** | 34 machine-executable skills from `cockroachlabs/cockroachdb-skills` |
| **AS OF SYSTEM TIME** | MVCC time-travel for memory forensics |
| **SERIALIZABLE Isolation** | Prevents hash chain forks in concurrent multi-agent scenarios |
| **VECTOR Data Type** | Native 384-dim vector storage with cosine distance operator `<=>` |

## AWS Services Used

- **Amazon Bedrock** — Sentence embedding models (Titan V2, all-MiniLM-L6-v2)
- **AWS KMS** — Encryption key management for memory encryption
- **Amazon EC2** — Production deployment target

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
| `/api/mcp/*` | 25 MCP tools (memory_store, search, timetravel, etc.) |
| `/api/a2a` | A2A agent card with 25 skills |
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
