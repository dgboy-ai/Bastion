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
    memory_type VARCHAR(64) NOT NULL, -- e.g., 'fact', 'preference', 'check'
    content TEXT NOT NULL,            -- Encrypted with AES-256-GCM
    importance_score FLOAT DEFAULT 0.5,
    namespace VARCHAR(128) DEFAULT 'default',
    metadata JSONB,                   -- Tracks source IDs, timestamps, and wrapped DEKs
    cryptographic_hash VARCHAR(64),   -- SHA-256 hash chaining link
    created_at TIMESTAMPTZ DEFAULT NOW(),
    embedding VECTOR(1536)            -- Bedrock Titan V2 embeddings
);
```

### 2. `agent_audit` (Cryptographic Merkle Hash Chain Ledger)
Stores append-only hash chains to verify database integrity:
```sql
CREATE TABLE agent_audit (
    audit_id SERIAL PRIMARY KEY,
    memory_id VARCHAR(64) NOT NULL,
    action_type VARCHAR(64) NOT NULL, -- 'WRITE', 'DELETE', 'TAMPER'
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
    status VARCHAR(64) NOT NULL,      -- 'active', 'committed', 'rolled_back'
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE saga_steps (
    step_id SERIAL PRIMARY KEY,
    saga_id VARCHAR(64) REFERENCES saga_states(saga_id),
    step_name VARCHAR(256) NOT NULL,
    status VARCHAR(64) NOT NULL,      -- 'pending', 'completed', 'failed'
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

---

## ⚡ Index & Performance Settings

### 1. C-SPANN Vector Indexing
We speed up vector retrieval using CockroachDB's native C-SPANN index scoped by agent and namespace boundaries:
```sql
CREATE INDEX ON agent_memory (agent_id, namespace, embedding);
```

### 2. Time-Travel Queries
Every table uses CockroachDB’s Multi-Version Concurrency Control (MVCC). We do not purge deleted records immediately during standard transactions—allowing us to execute time-travel queries:
```sql
-- Query the database as it existed exactly at a specific timestamp
SELECT * FROM agent_memory AS OF SYSTEM TIME '2026-07-08 12:00:00Z' WHERE agent_id = 'agent-1';
```

---

## 🚰 Connection Pool Configurations
To prevent serverless concurrency spikes from starving the database, Bastion utilizes isolated pool structures:
*   **Memory Client Pool:** `min_size=1`, `max_size=2` per instance (prevents Vercel scale-ups from exhausting limits).
*   **Limiter Pool:** Dedicated pool (`min_size=1`, `max_size=2`) to isolate lock acquisition from heavy semantic search operations.
