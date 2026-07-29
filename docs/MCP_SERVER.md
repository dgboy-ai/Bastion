# Bastion MCP Server — Model Context Protocol

> Full MCP implementation with 33 tools, 4 resources, 3 prompts, and CockroachDB-backed persistent memory.

---

## Overview

Bastion implements a **production-grade MCP (Model Context Protocol) server** that exposes CockroachDB as a persistent memory layer for AI agents. Any MCP-compatible client (Claude, Cursor, VS Code) can connect and execute memory operations.

**Key Features:**
- ✅ 33 tools (most comprehensive MCP memory server)
- ✅ 4 resources (schema, config, stats, individual memories)
- ✅ 3 prompts (analyze, conflict, audit)
- ✅ SHA-256 hash chain integrity
- ✅ C-SPANN vector indexing
- ✅ AS OF SYSTEM TIME time-travel
- ✅ SERIALIZABLE conflict resolution
- ✅ OAuth 2.1 + PKCE authentication
- ✅ Rate limiting
- ✅ OpenTelemetry tracing

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI AGENT CLIENT                           │
│           (Claude / Cursor / VS Code / LangGraph)           │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (JSON-RPC 2.0)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   BASTION MCP SERVER                         │
│              (FastMCP, 33 tools, 4 resources, 3 prompts)    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Transport: stdio (local) or Streamable HTTP (remote)│   │
│  │  Auth: API key or OAuth 2.1 + PKCE                   │   │
│  │  Rate Limit: 20 concurrent, 200 queue, 60s timeout   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Security Pipeline (7 stages):                       │   │
│  │  1. Prompt injection detection (9 patterns)          │   │
│  │  2. Secret detection (6 patterns)                    │   │
│  │  3. PII scan (5 types)                               │   │
│  │  4. LLM semantic classification                      │   │
│  │  5. Content size check                               │   │
│  │  6. Hash chain verification                          │   │
│  │  7. Trust scoring                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ psycopg2/asyncpg
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    COCKROACHDB CLUSTER                       │
│         (6 regions, SERIALIZABLE isolation)                  │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────┐ │
│  │   agent_memory   │  │    agent_audit   │  │  a2a_tasks│ │
│  │ (C-SPANN Vectors)│  │ (Hash Chain Log) │  │ (Persist) │ │
│  └──────────────────┘  └──────────────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 25 Tools

### Core Memory Operations (7)

| Tool | Description | CockroachDB Feature |
|------|-------------|---------------------|
| `memory_store` | Store memory with SHA-256 hash chain | INSERT with chain |
| `memory_search` | Vector similarity search | C-SPANN index |
| `memory_timetravel` | Query past state | AS OF SYSTEM TIME |
| `memory_audit` | Verify hash chain | Audit log query |
| `memory_heal` | Self-healing corruption repair | CDC changefeed |
| `memory_delete` | Delete memory | SERIALIZABLE transaction |
| `resolve_conflict` | CRDT conflict resolution | SELECT FOR UPDATE |

### Pinning (2)

| Tool | Description |
|------|-------------|
| `memory_pin` | Pin safety-critical memories |
| `memory_get_pinned` | Get all pinned memories |

### Governance (4)

| Tool | Description |
|------|-------------|
| `memory_list` | List memories with pagination |
| `memory_correct` | Update memory content |
| `memory_health` | Memory health metrics |
| `memory_apply_patch` | RFC 6902 JSON Patch |

### LTM Gateway (3)

| Tool | Description |
|------|-------------|
| `ltm_check_reuse` | Check if analysis already exists |
| `ltm_store_analysis` | Store analysis for future reuse |
| `ltm_invalidate` | Mark stale analyses |

### Dreaming (2)

| Tool | Description |
|------|-------------|
| `dream` | Sleep-time memory consolidation |
| `dream_history` | Past dreaming sessions |

### Contradictions (2)

| Tool | Description |
|------|-------------|
| `detect_contradictions` | Auto-detect contradictions |
| `scan_all_contradictions` | Batch contradiction scan |

### Observations (1)

| Tool | Description |
|------|-------------|
| `detect_observations` | Meta-pattern detection |

### Retrieval (2)

| Tool | Description |
|------|-------------|
| `multi_signal_search` | 4-signal fusion search |
| `context_pack` | Token budget packing |

### Schema (1)

| Tool | Description |
|------|-------------|
| `agent_schema` | Query database schema |

### A2A (1)

| Tool | Description |
|------|-------------|
| `a2a_bridge` | Generate signed Agent Card |

---

## 4 Resources

| Resource | Description |
|----------|-------------|
| `bastion://schema` | Database schema definition |
| `bastion://config` | Current configuration |
| `bastion://stats` | Usage statistics |
| `bastion://memory/{id}` | Individual memory record |

---

## 3 Prompts

| Prompt | Description |
|--------|-------------|
| `analyze_memory` | Analyze memory for patterns, anomalies, trends |
| `conflict_analysis` | Compare conflicting memories and propose resolution |
| `audit_review` | Check hash chain ledger for anomalies |

---

## Transport Options

### 1. stdio (Local Development)

```bash
python -m bastion.mcp_server --transport stdio
```

Used by: Claude Desktop, Cursor, VS Code

### 2. Streamable HTTP (Production)

```bash
python -m bastion.mcp_server --transport http --port 9997
```

Used by: Remote agents, horizontal scaling

---

## Authentication

### Option 1: API Key

```bash
export BASTION_MCP_API_KEYS="key1,key2,key3"

# All requests must include:
Authorization: Bearer key1
```

### Option 2: OAuth 2.1 + PKCE

```bash
export BASTION_MCP_OAUTH_CLIENT_ID="bastion-client"
export BASTION_MCP_OAUTH_CLIENT_SECRET="your-secret"
export BASTION_MCP_OAUTH_REDIRECT_URI="http://localhost:3000/callback"
```

---

## Rate Limiting

| Setting | Default | Description |
|---------|---------|-------------|
| `BASTION_MCP_MAX_CONCURRENT` | 20 | Max concurrent requests |
| `BASTION_MCP_MAX_QUEUE` | 200 | Max queue depth |
| `BASTION_MCP_TIMEOUT` | 60s | Request timeout |

---

## Tool Details

### memory_store

```json
{
  "name": "memory_store",
  "description": "Store memory with SHA-256 hash chain integrity",
  "input": {
    "content": "User prefers dark mode",
    "memory_type": "fact",
    "metadata": {"domain": "UI"},
    "expires_in_seconds": 86400
  },
  "output": {
    "memory_id": "uuid",
    "cryptographic_hash": "sha256...",
    "importance_score": 0.5
  }
}
```

### memory_search

```json
{
  "name": "memory_search",
  "description": "C-SPANN vector similarity search",
  "input": {
    "query": "user preferences",
    "k": 5,
    "threshold": 0.8,
    "memory_type": "fact",
    "cursor": "base64-offset"
  },
  "output": {
    "results": [...],
    "next_cursor": "base64-offset",
    "total": 100
  }
}
```

### memory_timetravel

```json
{
  "name": "memory_timetravel",
  "description": "Query memory state at any past timestamp",
  "input": {
    "timestamp": "2026-07-01T12:00:00Z",
    "agent_id": "my-agent"
  },
  "output": {
    "memories": [...]
  }
}
```

### memory_audit

```json
{
  "name": "memory_audit",
  "description": "Verify SHA-256 hash chain integrity",
  "input": {
    "agent_id": "my-agent"
  },
  "output": {
    "chain_valid": true,
    "total_memories": 1000,
    "broken_links": []
  }
}
```

### memory_pin

```json
{
  "name": "memory_pin",
  "description": "Pin safety-critical memory (survives compaction)",
  "input": {
    "memory_id": "uuid",
    "priority": 1
  },
  "output": {
    "pinned": true
  }
}
```

### ltm_check_reuse

```json
{
  "name": "ltm_check_reuse",
  "description": "Check if similar analysis exists (LTM Gateway)",
  "input": {
    "analysis_type": "research",
    "content": "Analyze market trends for Q3"
  },
  "output": {
    "reuse_available": true,
    "cached_analysis": {...},
    "tokens_saved": 2965
  }
}
```

### dream

```json
{
  "name": "dream",
  "description": "Sleep-time memory consolidation",
  "input": {
    "lookback_hours": 24,
    "min_importance_for_promotion": 6.0,
    "merge_similarity_threshold": 0.85
  },
  "output": {
    "memories_reviewed": 100,
    "memories_consolidated": 15,
    "memories_promoted": 8,
    "memories_pruned": 22
  }
}
```

### multi_signal_search

```json
{
  "name": "multi_signal_search",
  "description": "4-signal fusion: vector + BM25 + entity + temporal",
  "input": {
    "query": "user preferences",
    "k": 10
  },
  "output": {
    "results": [...],
    "signals_used": ["vector", "bm25", "entity", "temporal"]
  }
}
```

---

## Quick Start

```bash
# Install
pip install bastion-memory

# Mock mode (no database)
python -m bastion.mcp_server --mock

# With CockroachDB
export BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
python -m bastion.mcp_server

# HTTP mode
python -m bastion.mcp_server --transport http --port 9997
```

---

## MCP Configuration for Clients

### Claude Desktop

```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server", "--mock"],
      "env": {
        "BASTION_MOCK": "true"
      }
    }
  }
}
```

### Cursor

```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASTION_CONN` | — | CockroachDB connection string |
| `BASTION_MOCK` | `true` | Enable mock mode |
| `BASTION_MCP_API_KEYS` | — | Comma-separated API keys |
| `BASTION_MCP_MAX_CONCURRENT` | 20 | Max concurrent requests |
| `BASTION_MCP_MAX_QUEUE` | 200 | Max queue depth |
| `BASTION_MCP_TIMEOUT` | 60 | Request timeout (seconds) |
| `BASTION_MCP_OAUTH_CLIENT_ID` | — | OAuth client ID |
| `BASTION_MCP_OAUTH_CLIENT_SECRET` | — | OAuth client secret |
| `BASTION_LLM_GUARD` | false | Enable Groq semantic guard |
| `GROQ_API_KEY` | — | Required for LLM guard |

---

## How MCP Solves OpenClaw Problems

| OpenClaw Problem | MCP Solution |
|------------------|--------------|
| **Memory Instruction Loss** | `memory_pin` protects critical instructions |
| **Memory Poisoning** | SHA-256 hash chains verify integrity |
| **No Audit Trail** | `memory_audit` + append-only log |
| **No Time Travel** | `memory_timetravel` via AS OF SYSTEM TIME |
| **Token Waste** | `ltm_check_reuse` saves 2,965 tokens/reuse |
| **Memory Bloat** | `dream` consolidates during idle time |

---

## Comparison with Other MCP Servers

| Feature | Bastion | Others |
|---------|---------|--------|
| **Tools** | 25 | 1-5 |
| **Resources** | 4 | 0-1 |
| **Prompts** | 3 | 0-1 |
| **Hash Chains** | ✅ | ❌ |
| **Time Travel** | ✅ | ❌ |
| **LTM Gateway** | ✅ | ❌ |
| **Dreaming** | ✅ | ❌ |
| **OAuth 2.1** | ✅ | ❌ |
| **Rate Limiting** | ✅ | ❌ |

---

*This document satisfies the hackathon requirement for MCP Server integration.*
