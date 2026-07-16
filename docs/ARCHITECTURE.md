# System & Database Architecture

This document catalogs Bastion's core database schemas, indexing configurations, and connection pools designed for high-concurrency serverless execution.

---

## 🗄️ CockroachDB Table Schemas

Bastion executes relational schemas, vector indexing, and state coordination inside a single CockroachDB cluster across **six core tables**:

### 1. `agent_memory` (Semantic and Episodic Vector Store)
Stores long-term semantic records, conversation contexts, and pinned instructions:
```sql
CREATE TABLE agent_memory (
    memory_id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(128) NOT NULL,
    memory_type VARCHAR(64) NOT NULL,        -- 'fact', 'preference', 'check'
    content TEXT NOT NULL,                    -- Encrypted with AES-256-GCM
    importance_score FLOAT DEFAULT 0.5,
    namespace VARCHAR(128) DEFAULT 'default',
    metadata JSONB,                           -- Tracks source IDs, timestamps, wrapped DEKs
    cryptographic_hash VARCHAR(64),           -- SHA-256 hash chaining link
    previous_hash VARCHAR(64),                -- Chain pointer
    created_at TIMESTAMPTZ DEFAULT NOW(),
    embedding VECTOR(1024),                   -- Bedrock Titan V2 embeddings
    is_pinned BOOLEAN DEFAULT false,
    pin_priority INT DEFAULT 0
);

-- Tenant-partitioned vector index (sub-10ms per tenant)
CREATE VECTOR INDEX idx_memory_embedding ON agent_memory (agent_id, embedding);
```

### 2. `agent_audit` (Cryptographic Merkle Hash Chain Ledger)
Stores append-only hash chains to verify database integrity:
```sql
CREATE TABLE agent_audit (
    audit_id SERIAL PRIMARY KEY,
    memory_id VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL,        -- 'WRITE', 'DELETE', 'TAMPER'
    previous_hash VARCHAR(64),
    current_hash VARCHAR(64) NOT NULL,
    merkle_root VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `agent_limiter` (Distributed Concurrency Lock Table)
Coordinates slot locks across stateless, concurrent Vercel/Lambda processes:
```sql
CREATE TABLE agent_limiter (
    slot_id INT PRIMARY KEY,
    instance_id VARCHAR(128),
    acquired_at TIMESTAMPTZ
);
```

### 4. `saga_states` & `saga_steps` (Crash-Safe Multi-Agent Transactions)
Tracks the state of distributed, multi-agent transactional workflows:
```sql
CREATE TABLE saga_states (
    saga_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    status VARCHAR(64) NOT NULL,             -- 'active', 'committed', 'rolled_back'
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE saga_steps (
    step_id SERIAL PRIMARY KEY,
    saga_id VARCHAR(64) REFERENCES saga_states(saga_id),
    step_name VARCHAR(256) NOT NULL,
    status VARCHAR(64) NOT NULL,             -- 'pending', 'completed', 'failed'
    payload JSONB
);
```

### 5. `a2a_tasks` (Agent-to-Agent Coordination Queues)
Tracks delegated tasks across agent swarms:
```sql
CREATE TABLE a2a_tasks (
    task_id VARCHAR(64) PRIMARY KEY,
    sender_id VARCHAR(128) NOT NULL,
    recipient_id VARCHAR(128) NOT NULL,
    payload JSONB,
    status VARCHAR(64) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. `agent_entities` & `agent_relations` (Knowledge Graph)
Stores entity-relationship triples for knowledge graph traversal:
```sql
CREATE TABLE agent_entities (
    entity_id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(128) NOT NULL,
    entity_name VARCHAR(256) NOT NULL,
    entity_type VARCHAR(64),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_relations (
    relation_id VARCHAR(64) PRIMARY KEY,
    agent_id VARCHAR(128) NOT NULL,
    source_entity_id VARCHAR(64) REFERENCES agent_entities(entity_id),
    target_entity_id VARCHAR(64) REFERENCES agent_entities(entity_id),
    relation_type VARCHAR(64) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ⚡ Index & Performance Settings

### 1. C-SPANN Vector Indexing
We speed up vector retrieval using CockroachDB's native C-SPANN index scoped by agent and namespace boundaries:
```sql
CREATE INDEX idx_memory_embedding ON agent_memory (agent_id, embedding);
```

### 2. Time-Travel Queries
Every table uses CockroachDB's Multi-Version Concurrency Control (MVCC). We do not purge deleted records immediately—allowing time-travel queries:
```sql
-- Query the database as it existed at a specific timestamp
SELECT * FROM agent_memory 
AS OF SYSTEM TIME '2026-07-08 12:00:00Z' 
WHERE agent_id = 'agent-1';
```

### 3. Hash Chain Index
Fast hash chain verification:
```sql
CREATE INDEX idx_audit_hash ON agent_audit (current_hash, previous_hash);
```

### 4. Knowledge Graph Index
Multi-hop traversal optimization:
```sql
CREATE INDEX idx_relation_source ON agent_relations (source_entity_id);
CREATE INDEX idx_relation_target ON agent_relations (target_entity_id);
CREATE INDEX idx_relation_type ON agent_relations (relation_type);
```

---

## 🚰 Connection Pool Configurations

To prevent serverless concurrency spikes from starving the database, Bastion utilizes isolated pool structures:

| Pool | min_size | max_size | Purpose |
|------|----------|----------|---------|
| Memory Client | 1 | 2 | Main memory operations |
| Limiter | 1 | 2 | Distributed lock acquisition |
| Knowledge Graph | 1 | 2 | Entity/relation operations |

**Why isolated pools?**
- Prevents lock contention between memory writes and searches
- Ensures lock acquisition doesn't block on heavy queries
- Prevents Vercel scale-ups from exhausting connections

---

## 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT CLIENT                              │
│           (Claude / Cursor / LangGraph)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │ MCP Protocol (JSON-RPC 2.0)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                   BASTION MCP SERVER                         │
│              (25 tools, 4 resources, 3 prompts)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Agent Memory │ │  Agent Audit │ │  Knowledge   │
│   (C-SPANN)  │ │ (Hash Chain) │ │    Graph     │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    COCKROACHDB CLUSTER                       │
│         (6 regions, SERIALIZABLE isolation)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │ CDC Changefeed
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                       AWS LAYER                              │
│  Bedrock (embeddings) │ Lambda (CDC) │ S3 (archives)        │
│  KMS (encryption)     │                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ CockroachDB Features Used

| Feature | How Bastion Uses It |
|---------|-------------------|
| **C-SPANN Vector Index** | Distributed semantic search |
| **AS OF SYSTEM TIME** | Time-travel queries |
| **MVCC** | Versioned data for time-travel |
| **CDC Changefeed** | Self-healing pipeline |
| **SERIALIZABLE Isolation** | Multi-agent coordination |
| **Row-Level Security** | Per-agent data isolation |
| **JSONB** | Flexible metadata storage |
| **Global Distribution** | Multi-region memory |

---

*This document provides the technical architecture for the CockroachDB × AWS Hackathon submission.*
