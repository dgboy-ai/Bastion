# CockroachDB Tools Usage

> Required for hackathon submission: "Identify which CockroachDB tools you used and how."

---

## 1. CockroachDB Cloud Managed MCP Server ✅

Bastion implements a **full MCP (Model Context Protocol) server** that exposes CockroachDB as a persistent memory layer for AI agents.

### How We Use It

Our MCP server (`src/bastion/mcp_server.py`) provides **33 tools**, **4 resources**, and **3 prompts** that any MCP-compatible client can call:

| MCP Tool | What It Does | CockroachDB Feature Used |
|----------|-------------|-------------------------|
| `memory_store` | Store memories with hash chain integrity | INSERT with SHA-256 chain |
| `memory_search` | Vector similarity search with decay scoring | C-SPANN distributed vector index |
| `memory_timetravel` | Query memory state at any past timestamp | `AS OF SYSTEM TIME` |
| `memory_audit` | Verify append-only audit trail | Hash chain verification |
| `memory_heal` | Self-healing: prune expired, detect anomalies | CDC-triggered cleanup |
| `memory_delete` | Delete memory with confirmation | SERIALIZABLE transaction |
| `resolve_conflict` | Multi-agent conflict resolution | CRDT + SELECT FOR UPDATE |
| `memory_pin` | Pin safety-critical memories | Partial index on `is_pinned` |
| `memory_get_pinned` | Get all pinned memories | Filtered query with priority |
| `memory_list` | List memories with pagination | Offset/limit pagination |
| `memory_correct` | Update memory content | UPDATE with hash chain |
| `memory_health` | Memory health metrics | Aggregation queries |
| `memory_apply_patch` | RFC 6902 JSON Patch on metadata | Atomic metadata update |
| `a2a_bridge` | Agent-to-agent discovery | A2A Agent Card |
| `ltm_check_reuse` | LTM Gateway: check cached analyses | C-SPANN similarity search |
| `ltm_store_analysis` | LTM Gateway: store analysis results | INSERT with embedding |
| `ltm_invalidate` | LTM Gateway: mark stale analyses | UPDATE status flag |
| `dream` | Sleep-time memory consolidation | Multi-table transaction |
| `dream_history` | Past dreaming sessions | SELECT from audit |
| `detect_contradictions` | Auto-detect contradictions | Semantic comparison |
| `scan_all_contradictions` | Batch contradiction scan | Full table scan |
| `detect_observations` | Meta-pattern detection | Aggregation queries |
| `multi_signal_search` | 4-signal fusion search | Vector + BM25 + Entity + Temporal |
| `context_pack` | Token budget packing for LLM | Ranked result selection |
| `agent_schema` | Query own database schema | INFORMATION_SCHEMA |

### MCP Resources

| Resource | Purpose |
|----------|---------|
| `bastion://schema` | Database schema definition |
| `bastion://config` | Current configuration |
| `bastion://stats` | Usage statistics |
| `bastion://memory/{id}` | Individual memory record |

### MCP Prompts

| Prompt | Purpose |
|--------|---------|
| `analyze_memory` | Analyze a memory record |
| `conflict_analysis` | Analyze conflicting memories |
| `audit_review` | Review audit trail |

### Transport Support
- **stdio** (local development, single process)
- **Streamable HTTP** (production, horizontally scalable)
- **OAuth 2.1 + PKCE** (enterprise authentication)

---

## 2. Distributed Vector Indexing (C-SPANN) ✅

Bastion uses CockroachDB's native C-SPANN vector index for semantic search at scale.

### Schema

```sql
CREATE TABLE agent_memory (
    memory_id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(128) NOT NULL,
    embedding VECTOR(1024),  -- Bedrock Titan V2 embeddings
    content TEXT NOT NULL,
    importance_score FLOAT DEFAULT 5.0,
    cryptographic_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_pinned BOOLEAN DEFAULT false,
    pin_priority INT DEFAULT 0
);

-- Tenant-partitioned vector index
CREATE VECTOR INDEX idx_memory_embedding ON agent_memory (agent_id, embedding);
```

### How It Works

1. **Store**: Memory content is embedded via AWS Bedrock Titan V2 (1024-dim vectors), then stored with the vector in CockroachDB
2. **Search**: Cosine similarity search with importance decay weighting
3. **Time-Travel**: Query vector search results at any historical timestamp

### Why CockroachDB Vector Indexing

| Feature | Benefit |
|---------|---------|
| Distributed index | Scales horizontally across regions |
| ACID transactions | Vector writes are consistent with relational data |
| No separate vector store | Single database footprint |
| Time-travel on vectors | Query historical embedding states |
| C-SPANN quantization | 94% storage reduction |

---

## 3. ccloud CLI (Agent-Ready) ✅

Bastion wraps CockroachDB's `ccloud` CLI for agent-driven cluster management.

### Usage in Bastion

```python
class AutonomousDBA:
    """Wraps ccloud CLI for agent-driven cluster operations."""
    
    def provision_cluster(self, name: str, region: str) -> ClusterInfo:
        """Provision a new CockroachDB Serverless cluster."""
        
    def get_cluster_info(self) -> ClusterInfo:
        """Get current cluster connection details."""
```

### ccloud Commands Used

| Command | Purpose | Bastion Use |
|---------|---------|-------------|
| `ccloud cluster create` | Provision new cluster | `provision_cluster()` |
| `ccloud cluster list` | List available clusters | Cluster discovery |
| `ccloud sql connect` | Connect to cluster | Connection pool setup |
| `ccloud audit log` | Get audit logs | Compliance reporting |

---

## 4. CockroachDB Agent Skills Repo ✅

Bastion provides **8 machine-executable Agent Skills** in `skills/manifest.json`:

| Skill | What It Provides |
|-------|-----------------|
| `memory_store` | Store memories with hash chain integrity |
| `memory_search` | Semantic vector search |
| `memory_timetravel` | Time-travel queries |
| `memory_audit` | Hash chain verification |
| `memory_heal` | Self-healing corruption repair |
| `graph_query` | Knowledge graph traversal |
| `resolve_conflict` | CRDT conflict resolution |
| `a2a_bridge` | Agent-to-agent communication |

---

## 5. Key CockroachDB Features Demonstrated

| Feature | How Bastion Uses It |
|---------|-------------------|
| **AS OF SYSTEM TIME** | Time-travel queries for memory state at any point |
| **SERIALIZABLE isolation** | Conflict resolution with SELECT FOR UPDATE |
| **Row-Level Security** | Multi-tenant memory isolation |
| **JSONB** | Flexible metadata storage on memories |
| **CDC Changefeeds** | Real-time event streaming for SSE dashboard |
| **MVCC** | Versioned data for time-travel and audit |
| **Vector Indexing (C-SPANN)** | Distributed semantic search |
| **Global Distribution** | Multi-region memory with zero downtime |

---

*This document satisfies the hackathon requirement: "Identify which CockroachDB tools you used and how."*
