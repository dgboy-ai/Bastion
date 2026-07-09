# CockroachDB Tools Usage

> Required for hackathon submission: "Identify which CockroachDB tools you used and how."

---

## 1. CockroachDB Cloud Managed MCP Server

Bastion implements a **full MCP (Model Context Protocol) server** that exposes CockroachDB as a persistent memory layer for AI agents.

### How We Use It

Our MCP server (`src/bastion/mcp_server.py`, 1000+ lines) provides **14 tools** that any MCP-compatible client (Claude Code, Cursor, OpenCode, Gemini CLI) can call:

| MCP Tool | What It Does | CockroachDB Feature Used |
|----------|-------------|-------------------------|
| `memory_search` | Vector similarity search with decay scoring | C-SPANN distributed vector index |
| `memory_store` | Store memories with hash chain integrity | INSERT with SHA-256 chain |
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

### MCP Config Template (One-Click Setup for Judges)

```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server", "--mock"],
      "env": { "BASTION_MOCK": "true" }
    }
  }
}
```

### Transport Support
- **stdio** (local development, single process)
- **Streamable HTTP** (production, horizontally scalable)
- **OAuth 2.1 + PKCE** (enterprise authentication)

---

## 2. Distributed Vector Indexing (C-SPANN)

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

-- Tenant-partitioned vector index (sub-10ms per tenant)
CREATE VECTOR INDEX idx_memory_embedding ON agent_memory (agent_id, embedding);
```

### How It Works

1. **Store**: Memory content is embedded via AWS Bedrock Titan V2 (1024-dim vectors), then stored with the vector in CockroachDB
2. **Search**: Cosine similarity search with importance decay weighting:
   ```sql
   (1.0 - (embedding <=> %s::vector)) * importance_score /
   (1.0 + decay_rate * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score
   ```
3. **Time-Travel**: Query vector search results at any historical timestamp:
   ```sql
   SELECT * FROM agent_memory AS OF SYSTEM TIME '2026-07-01' WHERE agent_id = 'agent-1';
   ```

### Why CockroachDB Vector Indexing

| Feature | Benefit |
|---------|---------|
| Distributed index | Scales horizontally across regions |
| ACID transactions | Vector writes are consistent with relational data |
| No separate vector store | Single database footprint (vs. Neo4j + Pinecone + Postgres) |
| Time-travel on vectors | Query historical embedding states |
| C-SPANN quantization | 94% storage reduction with RaBitQ |

---

## 3. ccloud CLI (Agent-Ready)

Bastion wraps CockroachDB's `ccloud` CLI for agent-driven cluster management.

### Usage in Bastion

```python
# src/bastion/dba.py
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

## 4. CockroachDB Agent Skills Repo

Bastion integrates with the official CockroachDB Agent Skills repository for schema design, performance tuning, and security best practices.

### Skills Used

| Skill | What It Provides |
|-------|-----------------|
| Schema Design | Best practices for table design, indexing, and partitioning |
| Query Optimization | Query plan analysis and index recommendations |
| Security | RLS policies, encryption at rest, connection security |
| Performance | Connection pool tuning, query latency optimization |
| Observability | Metrics, alerts, and dashboard configurations |

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
