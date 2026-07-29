# System & Database Architecture

This document catalogs Bastion's core database schemas, indexing configurations, and connection pools designed for high-concurrency serverless execution.

---

## 🗄️ CockroachDB Table Schemas

Bastion executes relational schemas, vector indexing, and state coordination inside a single CockroachDB cluster across **six core tables**:

### 1. `agent_memory` (Semantic and Episodic Vector Store)
Stores long-term semantic records, conversation contexts, and pinned instructions:
```sql
CREATE TABLE agent_memory (
    memory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    memory_type STRING NOT NULL,
    content STRING NOT NULL,
    embedding VECTOR(1024) NULL,  -- Amazon Bedrock Titan v2 (1024-dim)
    embedding_384 VECTOR(384) NULL, -- local MiniLM fallback
    metadata JSONB NULL,
    cryptographic_hash STRING NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NULL,
    importance_score FLOAT8 DEFAULT 5.0,
    trust_level INT8 DEFAULT 2,
    is_pinned BOOL DEFAULT false,
    pin_priority INT8 DEFAULT 0
);

-- Tenant-partitioned vector index (sub-10ms per tenant)
CREATE INDEX idx_memory_embedding_384 ON agent_memory (agent_id, embedding_384);
```

### 2. `agent_audit` (Cryptographic Merkle Hash Chain Ledger)
Stores append-only hash chains to verify database integrity:
```sql
CREATE TABLE agent_audit (
    audit_id SERIAL PRIMARY KEY,
    agent_id STRING NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now(),
    action STRING NOT NULL,
    details JSONB NOT NULL
);
```

### 3. `agent_coordination` (Distributed Concurrency Lock Table)
Coordinates locks across stateless, concurrent Vercel/Lambda/Agent processes:
```sql
CREATE TABLE agent_coordination (
    lock_id SERIAL PRIMARY KEY,
    agent_id STRING NOT NULL,
    resource STRING NOT NULL,
    lock_type STRING NOT NULL,
    payload JSONB NOT NULL,
    acquired_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (agent_id, resource)
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
    task_id STRING PRIMARY KEY,
    agent_id STRING NOT NULL,
    sender_id STRING NOT NULL,
    recipient_id STRING NOT NULL,
    skill_id STRING NOT NULL,
    status STRING NOT NULL,
    input_data JSONB NULL,
    artifacts JSONB NULL,
    callback_url STRING NULL,
    runtime_metadata JSONB NULL,
    error_message STRING NULL,
    retry_count INT8 DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 6. `agent_entities` & `agent_relations` (Knowledge Graph)
Stores entity-relationship triples for knowledge graph traversal:
```sql
CREATE TABLE agent_entities (
    entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    name STRING NOT NULL,
    entity_type STRING NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (agent_id, name)
);

CREATE TABLE agent_relations (
    relation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    source_entity_id UUID NOT NULL REFERENCES agent_entities(entity_id),
    target_entity_id UUID NOT NULL REFERENCES agent_entities(entity_id),
    relation_type STRING NOT NULL,
    metadata JSONB NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## ⚡ Index & Performance Settings

### 1. C-SPANN Vector Indexing
We speed up vector retrieval using CockroachDB's native C-SPANN index scoped by agent and namespace boundaries.

### 2. Time-Travel Queries
Every table uses CockroachDB's Multi-Version Concurrency Control (MVCC). We do not purge deleted records immediately—allowing time-travel queries:
```sql
-- Query the database as it existed at a specific timestamp
SELECT * FROM agent_memory 
AS OF SYSTEM TIME '-300s' 
WHERE agent_id = 'agent-1';
```

---

## 🚰 Connection Pool Configurations

To prevent serverless concurrency spikes from starving the database, Bastion utilizes isolated pool structures (using `psycopg` connection pools) configured for fast, stateless execution.

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
