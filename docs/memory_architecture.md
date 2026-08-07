# Bastion Memory Architecture — Detailed Specification

> Complete technical reference for Bastion's memory integrity layer.

---

## 1. Memory Stack Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 7: Knowledge Graph Layer                            │
│  • Entity/Relation extraction (spaCy + custom)             │
│  • Graph queries with time-travel (graph_at_time)          │
│  • RGA/OR-Set CRDTs for distributed agent coordination     │
├─────────────────────────────────────────────────────────────┤
│  Layer 6: Semantic Retrieval Layer                         │
│  • Multi-signal: Vector + BM25 + Entity + Temporal         │
│  • Decay-weighted scoring (importance / recency)           │
│  • Keyword fallback when vector index unavailable          │
├─────────────────────────────────────────────────────────────┤
│  Layer 5: Integrity & Forensics                            │
│  • HMAC-SHA256 Hash Chains (prev_hash linkage)             │
│  • AS OF SYSTEM TIME time-travel (1s MVCC buffer)          │
│  • Self-healing (hash verification + reseal)               │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Consistency & Coordination                       │
│  • SERIALIZABLE Isolation (retry engine + adaptive backoff)│
│   • Row-Level Security (SET LOCAL app.current_agent_id)    │
│  • CRDTs: RGA, LWW-Register, OR-Set, OR-Map, PN-Counter   │
│   • Saga boundaries for multi-step operations              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Retrieval & Context                              │
│  • Multi-signal retrieval (vector + BM25 + entity + time)  │
│  • Context budget packing (pinned → query-relevant → filler)│
│  • Semantic cache (threshold-based LLM response reuse)     │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Durability & Hygiene                             │
│  • Row-Level TTL per memory type (1h–never)                │
│  • Hash-chain verification (memory_heal)                   │
│  • S3 snapshots + Glacier lifecycle                        │
│  • Duplicate detection & pruning                           │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Storage (CockroachDB)                            │
│  • agent_memory table (16 columns, 1024-dim vectors)       │
│  • C-SPANN HNSW index (cosine distance)                    │
│  • SHA-256 HMAC hash chains (HMAC-SHA256 + server secret)  │
│  • agent_audit, agent_relations, agent_entities tables    │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Tables Schema

### agent_memory

```sql
CREATE TABLE agent_memory (
    memory_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id       VARCHAR(255) NOT NULL,
    memory_type    VARCHAR(100) NOT NULL,
    content        TEXT NOT NULL,
    embedding      VECTOR(1024),                    -- C-SPANN index
    metadata       JSONB DEFAULT '{}',
    previous_hash  VARCHAR(64),                    -- HMAC-SHA256 hex
    cryptographic_hash VARCHAR(64) NOT NULL,       -- HMAC-SHA256 hex
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at     TIMESTAMPTZ,                    -- TTL enforcement
    access_count   INT DEFAULT 0,
    importance_score FLOAT DEFAULT 5.0,
    trust_level    INT DEFAULT 2,                  -- 0=untrusted, 2=trusted
    source_provenance VARCHAR(50) DEFAULT 'agent_direct',
    overwrite_count INT DEFAULT 0,
    is_pinned      BOOL DEFAULT FALSE,
    pin_priority   INT DEFAULT 0,                  -- 0=normal,1=important,2=CRITICAL
    needs_verification BOOL DEFAULT FALSE,         -- CDC flag
    crdb_region    VARCHAR(50)                     -- REGIONAL BY ROW
);

CREATE INDEX idx_agent_memory_vector 
  ON agent_memory USING vector (embedding vector_cosine_ops);
CREATE INDEX idx_agent_memory_agent_type 
  ON agent_memory (agent_id, memory_type);
```

### agent_audit (Append-Only)

```sql
CREATE TABLE agent_audit (
    audit_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      VARCHAR(255) NOT NULL,
    workflow_id   UUID NOT NULL,
    action        VARCHAR(50) NOT NULL,
    details       JSONB,
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### agent_entities / agent_relations (Knowledge Graph)

```sql
CREATE TABLE agent_entities (
    entity_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      VARCHAR(255) NOT NULL,
    entity_type   VARCHAR(50) NOT NULL,    -- PERSON, ORG, CONCEPT, etc.
    name          VARCHAR(255) NOT NULL,
    canonical_name VARCHAR(255),
    properties    JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agent_relations (
    relation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id      VARCHAR(255) NOT NULL,
    source_entity UUID REFERENCES agent_entities(entity_id),
    target_entity UUID REFERENCES agent_entities(entity_id),
    relation_type VARCHAR(50) NOT NULL,     -- "works_at", "knows", "part_of", etc.
    properties    JSONB DEFAULT '{}',
    created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## 2. Memory Types & TTL

| Type | TTL | Use Case |
|------|-----|----------|
| `session` | 1 hour (3600s) | Working memory, ephemeral context |
| `conversation` / `episodic` | 24 hours (86400s) | Chat history, recent interactions |
| `task` | 7 days (604800s) | Task state, workflow progress |
| `fact` / `semantic` / `procedural` / `preference` / `learned` / `system_event` / `security` / `thought_node` / `saga` | **Never** (NULL) | Long-term knowledge, facts, skills, audit records |

> **EU AI Act Mode**: When `compliance_mode="eu_ai_act"`, all TTLs are overridden to minimum **6 months (15,552,000s)** per Article 12.

---

## 3. Hash Chain Integrity

### Algorithm: HMAC-SHA256 with Server Secret

```python
def compute_hash(content: str, metadata: dict, previous_hash: str | None) -> str:
    meta_str = json.dumps(metadata, sort_keys=True) if metadata else ""
    payload = content + meta_str + (previous_hash or "")
    return hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
```

### Chain Structure

```
Memory 1: hash_1 = HMAC(content_1 + meta_1 + "")
Memory 2: hash_2 = HMAC(content_2 + meta_2 + hash_1)
Memory 3: hash_3 = HMAC(content_3 + meta_3 + hash_2)
...
```

### Verification (Self-Healing)

```python
def verify_chain(agent_id: str) -> dict:
    rows = fetch_all_memories(agent_id, order_by="created_at ASC")
    prev_hash = None
    breaks = []
    for row in rows:
        expected = compute_hash(row.content, row.metadata, prev_hash)
        if row.cryptographic_hash != expected or row.previous_hash != prev_hash:
            breaks.append({"memory_id": row.memory_id, "type": "hash_mismatch"})
        prev_hash = row.cryptographic_hash
    return {"status": "valid" if not breaks else "broken", "breaks": breaks}
```

> **Self-Healing**: `memory_heal` runs on-demand → verifies chain → reseals broken hashes → logs to audit.

---

## 4. Time-Travel (AS OF SYSTEM TIME)

### Query

```sql
SELECT content, cryptographic_hash, created_at
FROM agent_memory
AS OF SYSTEM TIME '2026-07-29 14:30:00+00:00'
WHERE agent_id = 'soc-analyst'
ORDER BY created_at DESC;
```

### Implementation Details

```python
def get_at_time(self, timestamp: str) -> list[MemoryRecord]:
    # 1. Parse & validate timestamp (relative or absolute)
    # 2. Add 1-second buffer for MVCC clock skew
    # 3. Try: SELECT ... AS OF SYSTEM TIME 'literal_timestamp'
    # 4. Fallback: WHERE created_at <= timestamp (created_at filter)
```

> **MVCC Buffer**: CockroachDB commit timestamps can slightly precede application timestamps. A **1-second buffer** prevents "future read" errors.

---

## 5. Row-Level TTL

### Configuration

```python
_MEMORY_TTL_SECONDS = {
    "episodic": 86400,      # 24h
    "conversation": 86400,  # 24h
    "session": 3600,        # 1h
    "task": 604800,         # 7d
    "fact": None,           # never
    "semantic": None,
    "procedural": None,
    "preference": None,
    "learned": None,
    "system_event": None,
    "security": None,
    "thought_node": None,
    "saga": None,
}
```

### Automatic Cleanup

```sql
DELETE FROM agent_memory WHERE agent_id = $1 AND expires_at <= now();
```

Runs on every `store()` and during `memory_heal`.

---

## 5. SERIALIZABLE Isolation & Retry Engine

### Why SERIALIZABLE?

> "AI agents plow on with wrong info if data is inconsistent — SERIALIZABLE stops this." — Rob Reid, Cockroach Labs

### Retry Engine

```python
class SerializationRetryEngine:
    def __init__(self, max_retries=5, base_delay_ms=50, 
                 max_delay_ms=5000, jitter_factor=0.3):
        ...
    
    def execute(self, conn, operation, isolation="serializable"):
        for attempt in range(max_retries):
            try:
                conn.execute(f"SET TRANSACTION ISOLATION LEVEL {isolation}")
                result = operation(conn)
                conn.commit()
                return result
            except SerializationError:
                conn.rollback()
                sleep(exponential_backoff(attempt))
        raise MaxRetriesExceeded()
```

### Why Not REPEATABLE READ?

| Isolation | Phantom Reads | Hash Chain Fork Risk |
|-----------|---------------|---------------------|
| REPEATABLE READ | Possible | High (concurrent appends) |
| SERIALIZABLE | Impossible | None |

---

## 6. Row-Level Security (RLS)

### Policy

```sql
CREATE POLICY agent_isolation ON agent_memory
  USING (agent_id = current_setting('app.current_agent_id'));
```

### Per-Transaction Context

```python
def _set_rls_context(self, conn):
    with conn.cursor() as cur:
        cur.execute("SET LOCAL app.current_agent_id = %s", (self.agent_id,))
```

> **Auto-refresh**: After every `COMMIT`, `SET LOCAL` is lost. Bastion re-applies in `_refresh_rls_context()` called after every commit.

---

## 6. Vector Search (C-SPANN)

### Index

```sql
CREATE INDEX idx_agent_memory_vector 
  ON agent_memory USING vector (embedding vector_cosine_ops);
```

### Hybrid Search (Single Query)

```sql
SELECT memory_id, content, importance_score,
       (1.0 - (embedding <=> $1::vector)) * importance_score /
       (1.0 + decay_rate * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score
FROM agent_memory
WHERE agent_id = $agent
  AND memory_type = $type
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY decay_score DESC
LIMIT $k;
```

### Decay Formula

```
score = cosine_similarity * importance_score / (1 + decay_rate * hours_since_creation)
```

> Recency + importance = better ranking than pure cosine similarity.

### Fallback

If vector index unavailable → **BM25 keyword search** → ILIKE fallback.

---

## 7. Multi-Signal Retrieval

```python
def search(query, k=10, threshold=0.8, memory_type=None):
    # 1. Vector search (cosine + decay)
    vector_results = vector_search(query, k*3, threshold)
    
    # 2. BM25 keyword scoring
    keyword_scores = bm25_score(query_terms, doc_terms)
    
    # 3. Entity overlap
    entity_scores = entity_overlap(query_entities, doc_entities)
    
    # 4. Temporal recency
    temporal_score = exp(-days_old / 30)
    
    # 5. Weighted fusion
    final = 0.4*vector + 0.3*keyword + 0.15*entity + 0.15*temporal
    return top_k(filter(threshold), k)
```

---

## 7. Knowledge Graph Layer

### Extraction

```python
def _extract_triples(self, content: str) -> list[Triple]:
    # spaCy NER + dependency parsing → (subject, predicate, object)
    # Example: "Alice works at Google" → (Alice, works_at, Google)
```

### Time-Travel Graph Queries

```python
def graph_at_time(self, timestamp: str, entity: str = None) -> dict:
    # 1. Get memory snapshot at timestamp
    # 2. Reconstruct entity/relation state at that moment
    # 3. Return subgraph
```

### CRDTs for Distributed Agents

| CRDT | Use Case |
|------|----------|
| RGA | Ordered conversation logs |
| LWW-Register | Last-writer-wins preferences |
| OR-Set | Tags, entity sets |
| OR-Map | Agent state maps |
| PN-Counter | Access counts, usage stats |

---

## 8. S3 Snapshots + Self-Healing

### Self-Healing Flow

```
Memory write → hash chain sealed → memory_heal on demand → 
  1. Verify hash chain per agent
  2. If broken → create S3 snapshot → reseal chain → log to audit
  3. Detect anomalies (duplicates, rapid writes, size spikes)
  4. Archive to S3 → Glacier after 90 days
```

### S3 Structure

```
s3://bastion-artifacts-<env>-<suffix>/
  snapshots/
    agent_id/
      2026-07-29T14:30:00Z.json  (full memory snapshot)
  archives/
    agent_id/
      2026-06-01/... (Glacier)
```

---

## 9. EU AI Act Compliance (Article 12)

| Requirement | Implementation |
|-------------|----------------|
| Automatic event recording | `agent_audit` table + `store_audit()` on every op |
| Tamper-evident logs | HMAC hash chain — forgery requires server secret |
| Traceability | `compliance_report()` + `forensic_report()` MCP tools |
| 6-month retention | `compliance_mode="eu_ai_act"` → minimum 180-day TTL |
| Time-travel reconstruction | `AS OF SYSTEM TIME` + `diff(t1, t2)` |

```python
# Generate regulator-ready report
compliance_report(start_date="2026-07-01T00:00:00Z")
```

---

## 10. Performance (Live AWS ap-south-1)

| Operation | p50 | p99 |
|-----------|-----|-----|
| `memory_store` (with hash chain) | ~45ms | ~120ms |
| `memory_search` (C-SPANN vector) | ~38ms | ~95ms |
| OWASP ASI06 guard scan | ~10ms | ~30ms |
| `AS OF SYSTEM TIME` read | ~25ms | ~60ms |

> Cluster: **CockroachDB Cloud BASIC**, AWS ap-south-1, v26.2.1  
> Memories stored: **1,430+** in production cluster

---

## 11. Key Files Reference

| File | Purpose |
|------|---------|
| `src/bastion/memory.py` | Core `BastionMemory` class (2152 lines) |
| `src/bastion/crypto.py` | HMAC-SHA256 hash chain, DPAPI secret protection |
| `src/bastion/guard.py` | OWASP ASI06 MemoryGuard (40+ detectors) |
| `src/bastion/retrieval.py` | MultiSignalRetriever (vector+BM25+entity+temporal) |
| `src/bastion/observations.py` | ObservationDetector (meta-patterns) |
| `src/bastion/context_budget.py` | ContextBudgetManager (pack for LLM) |
| `src/bastion/dreaming.py` | MemoryDreamer (background consolidation) |
| `src/bastion/archive.py` | S3 snapshot + Glacier archive writer |
| `terraform/main.tf` | AWS IaC (CRDB, KMS, S3) |
| `schema/` | CockroachDB DDL migrations (001–033) |

---

## 12. Quick API Reference

```python
from bastion import BastionMemory

mem = BastionMemory(agent_id="soc-analyst")

# Store (with guard, hash chain, TTL)
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

## Related Documentation

- [MCP Server (35 tools)](MCP_SERVER.md)
- [A2A Server (25 skills)](A2A_SERVER.md)
- [AWS Services](AWS_SERVICES.md)
- [EU AI Act Compliance](EU_AI_ACT.md)
- [Architecture Decisions](adr/)