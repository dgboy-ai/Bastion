# System & Database Architecture

This document catalogs Bastion's core database schemas, indexing, cryptographic integrity layer, and connection handling. It is the authoritative architecture reference — README claims point here.

---

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    YOUR AGENT (Cline / Cursor / Codex / A2A)        │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ MCP (memory ops) · A2A (delegation)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Bastion MCP / A2A Servers                       │
│  ┌────────────┐ ┌───────────────┐ ┌────────────┐ ┌───────────────┐ │
│  │ OWASP ASI06│ │ Hash Chain    │ │ Dream      │ │ Self-Heal     │ │
│  │ Guard      │ │ (HMAC-SHA256) │ │ Consol.    │ │ (chain verify)│ │
│  └────────────┘ └───────────────┘ └────────────┘ └───────────────┘ │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ psycopg pool · SERIALIZABLE · RLS (SET LOCAL)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CockroachDB Cluster (source of truth)            │
│  agent_memory (VECTOR(1024) + hash chain)  · agent_audit (ledger)   │
│  27 tables · C-SPANN vector index · MVCC time-travel · CDC          │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ CDC changefeed → S3 (cdc-live/)
                            ▼
                    S3CdcTailer (self-healing events)
```

---

## 🗄️ CockroachDB Tables (27)

The schema is applied idempotently via `python -m bastion.migrate` from `schema/*.sql` (36 migration files). The hash-chain and integrity machinery lives on the four core tables below; the rest support coordination, security, and observability.

### Core Integrity Tables

#### 1. `agent_memory` — Semantic & Episodic Memory with Hash Chain

The heart of the system. Every row carries a `cryptographic_hash` chained to the previous row's hash, so tampering breaks the chain.

```sql
CREATE TABLE IF NOT EXISTS agent_memory (
    memory_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id           STRING NOT NULL,
    memory_type        STRING NOT NULL,
    content            TEXT NOT NULL,
    embedding          VECTOR(1024) NOT NULL,     -- MiniLM / bge-large-en-v1.5
    metadata           JSONB,
    previous_hash      STRING,                    -- HMAC of previous row
    cryptographic_hash STRING NOT NULL,           -- HMAC(content, metadata, previous_hash)
    created_at         TIMESTAMPTZ DEFAULT now(),
    expires_at         TIMESTAMPTZ,
    access_count       INT DEFAULT 0,
    INDEX idx_memory_agent (agent_id)
);

-- C-SPANN distributed vector index (cosine distance), CockroachDB v25.2+
CREATE VECTOR INDEX IF NOT EXISTS idx_memory_embedding ON agent_memory (agent_id, embedding);
```

**Write pipeline** (`memory.py:1192`): guard → PII redact → embed → read last `cryptographic_hash` → `crypto_hash = HMAC(content, metadata, prev_hash)` → INSERT under **SERIALIZABLE** with retry (`memory.py:1291`).

#### 2. `agent_audit` — Append-Only Ledger

Every block, heal, and guard rejection is logged here. This is the EU AI Act Article 12 audit trail.

```sql
CREATE TABLE IF NOT EXISTS agent_audit (
    audit_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id     STRING NOT NULL,
    workflow_id  UUID NOT NULL,
    action       STRING NOT NULL,
    details      JSONB,
    recorded_at  TIMESTAMPTZ DEFAULT now()
);
```

#### 3. `agent_entities` / `agent_relations` — Knowledge Graph

```sql
CREATE TABLE IF NOT EXISTS agent_entities (
    entity_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    STRING NOT NULL,
    name        STRING NOT NULL,
    entity_type STRING NULL,
    metadata    JSONB NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (agent_id, name)
);

CREATE TABLE IF NOT EXISTS agent_relations (
    relation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id          STRING NOT NULL,
    source_entity_id  UUID NOT NULL REFERENCES agent_entities(entity_id),
    target_entity_id  UUID NOT NULL REFERENCES agent_entities(entity_id),
    relation_type     STRING NOT NULL,
    metadata          JSONB NULL,
    created_at        TIMESTAMPTZ DEFAULT now()
);
```

#### 4. `agent_coordination` — Distributed Concurrency / Locks

```sql
CREATE TABLE IF NOT EXISTS agent_coordination (
    lock_id     SERIAL PRIMARY KEY,
    agent_id    STRING NOT NULL,
    resource    STRING NOT NULL,
    lock_type   STRING NOT NULL,
    payload     JSONB NOT NULL,
    acquired_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (agent_id, resource)
);
```

### Supporting Tables

| Table | Purpose |
|:---|:---|
| `a2a_tasks`, `a2a_handoffs` | Agent-to-agent delegation & task tracking |
| `a2a_rate_limits` | Rate limiting for A2A bridge |
| `agent_auth`, `agent_keys`, `sender_key_cache` | Authentication, key management, message verification |
| `agent_budgets`, `agent_limiter` | Per-agent budget / distributed rate limiting |
| `agent_checkpoints` | Agent state checkpoints |
| `agent_drift_baselines`, `agent_drift_scores` | Memory drift / anomaly detection |
| `agent_messages` | Agent message history |
| `agent_region_mapping` | Multi-region locality mapping |
| `auth_brute_force`, `oauth_revoked_tokens` | Security: brute-force & OAuth revocation tracking |
| `cache_stats`, `semantic_cache` | Semantic cache statistics |
| `crdb_tools_usage`, `tool_usage_log` | CRDB tool usage tracking |
| `memory_compaction_log` | Dream/compaction history |
| `push_notification_log` | CDC push notification tracking |
| `thought_graph` | Reasoning trace storage |
| `vector_health` | Vector index health monitoring |

---

## 🔐 Integrity & Forensics Layer

### HMAC-SHA256 Hash Chain
- `crypto.py` — HMAC-SHA256 with rotating server secrets; key rotation supported via versioned secrets.
- **Production mode**: AWS KMS asymmetric signing (ECDSA-P256) — private key never leaves KMS, so an attacker with DB write access cannot forge the chain.
- Chain semantics (`memory.py:1237`): `crypto_hash = HMAC(content, metadata, previous_hash)`.

### AS OF SYSTEM TIME (Time-Travel Recovery)
- Statement-level MVCC query with a 1s buffer for clock skew (`memory.py:1802`):
  ```sql
  SELECT * FROM agent_memory AS OF SYSTEM TIME '<literal_timestamp>'
  WHERE agent_id = %s ORDER BY created_at;
  ```
- Fallback: `WHERE created_at <= %s::TIMESTAMPTZ` when the literal-timestamp path is unavailable.

### Self-Healing (`memory_heal`, `memory.py:1945`)
1. Prune expired rows.
2. Walk the chain in order; recompute each row's hash.
3. **Content-integrity**: row whose own hash mismatches is pruned (never blessed).
4. **Link-integrity**: a valid row whose `previous_hash` is stale (predecessor pruned) is resealed.
5. Full forensic record of tampered hashes written to `agent_audit` (`heal_pruned_tampered`).

### Row-Level Security
- Per-agent isolation via `SET LOCAL app.current_agent_id = %s` inside every transaction (`memory.py:330`); `_set_rls_context` fails hard if isolation cannot be guaranteed.

---

## 🚰 Connection Pooling & Transactions

- `psycopg` connection pools, per-agent isolation, configurable timeouts.
- **SERIALIZABLE isolation with retry** (`SerializationRetryEngine`, `memory.py:344`): adaptive backoff + jitter; every chain-linking write runs inside a retryable serializable transaction so concurrent writers cannot split the hash chain.

---

## 📡 CDC & Self-Healing Pipeline

- CockroachDB changefeeds stream every memory/audit write to **AWS S3** (`s3://bastion-memory-archives/cdc-live/`, SSE-KMS encrypted).
- `S3CdcTailer` (`cdc_consumer.py:27`) tails the CDC NDJSON output and dispatches events to handlers — database pushes changes, no polling (beyond the tailer's poll interval), no Lambda.
- Drives `memory_heal` hash-chain verification and anomaly detection.

---

## 🧠 Search & Retrieval

- **C-SPANN vector index** (`CREATE VECTOR INDEX ... ON agent_memory (agent_id, embedding)`).
- Hybrid ranking (`memory.py:1353`): `cosine(embedding, query_vector) * importance / decay(age)` fused with a BM25-like keyword boost; keyword fallback when the vector index is unavailable on older CockroachDB versions.
- `multi_signal_search` fuses vector + BM25 + entity + temporal recency for higher recall.

---

## 🛰️ CockroachDB Features Used

| Feature | How Bastion Uses It | Where |
|:---|:---|:---|
| **C-SPANN Vector Index** | Distributed semantic search | `schema/002_agent_memory.sql` |
| **AS OF SYSTEM TIME** | Time-travel recovery to pre-attack snapshot | `memory.py:1802` |
| **MVCC** | Versioned data powering time-travel | — |
| **CDC Changefeeds** | Stream writes to S3 for self-healing | `cdc_consumer.py:27` |
| **SERIALIZABLE Isolation** | Concurrent-writer-safe hash chains | `memory.py:344` |
| **Row-Level Security** | Per-agent data isolation (Morris-II defense) | `memory.py:330` |
| **JSONB** | Flexible memory metadata | `agent_memory.metadata` |
| **Global Distribution / Multi-Region** | Memory co-located with executors | `agent_region_mapping` |