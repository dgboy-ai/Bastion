# Bastion Memory Architecture

> One store, one hash chain, three memory tiers. Full claim reference — compact.

---

## 0. The Three Memory Tiers

All memory lives in **one CockroachDB store, on one HMAC-SHA256 chain**, partitioned by lifecycle (`schema/018_native_ttl.sql`):

| Tier | Types | Lifecycle |
|------|-------|-----------|
| **Short-term** | `session` (1h), `conversation`/`episodic` (24h), `task` (7d) | Expires via `expires_at` TTL; pruned by `memory_heal` |
| **Long-term** | `fact`, `semantic`, `procedural`, `preference`, `learned`, `thought_node` | Never (`expires_at = NULL`) |
| **Forensic** | `agent_audit` ledger + hash-chain metadata | **Never, no TTL** — append-only, tamper-evident |

Shared `agent_id` RLS boundary + same chain → a forensic record proves *what the agent knew at time T*, and a tampered short/long-term row is caught by the same chain walk.

---

## 1. Memory Stack

```
Layer 7  Knowledge Graph       LLM+regex triples · graph_at_time · CRDT coordination
Layer 6  Semantic Retrieval    Vector+BM25+Entity+Temporal · decay-weighted · keyword fallback
Layer 5  Integrity & Forensics HMAC-SHA256 chains · AS OF SYSTEM TIME (1s MVCC buffer) · self-heal
Layer 4  Consistency           SERIALIZABLE + retry · RLS (SET LOCAL app.current_agent_id) · 5 CRDTs
Layer 3  Retrieval & Context   Multi-signal fusion · budget packing (pinned→relevant→filler) · semantic cache
Layer 2  Durability & Hygiene  Row-level TTL (1h–never) · chain verify · S3+Glacier · dedup/prune
Layer 1  Storage (CRDB)        agent_memory (18 cols, 1024-dim) · C-SPANN · HMAC chain · audit/entities/relations
```

---

## 2. Core Tables

### agent_memory — base (`schema/002`) + migrations (`007`,`009`,`013`,`016`,`033`)

| Column | Type | Notes |
|--------|------|-------|
| `memory_id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `agent_id` | `STRING NOT NULL` | RLS key |
| `memory_type` | `STRING NOT NULL` | TTL selector |
| `content` | `TEXT NOT NULL` | |
| `embedding` | `VECTOR(1024) NOT NULL` | C-SPANN indexed |
| `metadata` | `JSONB` | |
| `previous_hash` / `cryptographic_hash` | `STRING` | HMAC-SHA256 hex |
| `created_at` / `expires_at` | `TIMESTAMPTZ` | TTL enforcement |
| `access_count` | `INT` | |
| `importance_score` (007) · `trust_level` (009) · `source_provenance` (009) · `overwrite_count` (009) | | trust = 0..2 |
| `crdb_region` (013) | | REGIONAL BY ROW |
| `is_pinned` · `pin_priority` (016) | | pin 0..2 |
| `needs_verification` (033) | | CDC flag |

```sql
CREATE VECTOR INDEX IF NOT EXISTS idx_memory_embedding ON agent_memory (agent_id, embedding);  -- C-SPANN, v25.2+
```

### agent_audit — append-only forensic ledger (`schema/003`)
`audit_id UUID PK` · `agent_id` · `workflow_id UUID` · `action` · `details JSONB` · `recorded_at`

### agent_entities — KG nodes (`schema/005`)
`entity_id UUID PK` · `agent_id` · `entity_type` · `name` · `attributes JSONB` · `valid_from/valid_until` · `created_at`

### agent_relations — KG edges (`schema/006`)
`relation_id UUID PK` · `source_entity_id → agent_entities` · `target_entity_id → agent_entities` · `relation_type` · `confidence FLOAT` · `valid_from/valid_until` · `source_memory_id → agent_memory`

---

## 3. Memory Types & TTL

| Type | TTL |
|------|-----|
| `session` | 1h (3600s) |
| `conversation` / `episodic` | 24h (86400s) |
| `task` | 7d (604800s) |
| `fact` / `semantic` / `procedural` / `preference` / `learned` / `system_event` / `security` / `thought_node` / `saga` | **Never** (`NULL`) |

> **EU AI Act Mode** (`compliance_mode="eu_ai_act"`): all TTLs overridden to minimum **6 months (15,552,000s)** — Article 12 (`memory.py:394`).

Cleanup: `DELETE FROM agent_memory WHERE agent_id=$1 AND expires_at <= now()` on every `store()` + during `memory_heal`.

---

## 4. Hash Chain Integrity

```
hash_n = HMAC-SHA256(server_secret, content_n + json(meta_n) + hash_(n-1))
Memory 1: hash_1 = HMAC(content_1 + meta_1 + "")
Memory 2: hash_2 = HMAC(content_2 + meta_2 + hash_1)
Memory 3: hash_3 = HMAC(content_3 + meta_3 + hash_2) ...
```

Verify = walk rows ASC, recompute each hash, compare `cryptographic_hash` + `previous_hash`; any mismatch = tampered link. **Self-heal**: `memory_heal` verifies chain → creates S3 snapshot → reseals broken hashes → logs to audit.

---

## 5. Time-Travel — AS OF SYSTEM TIME

```sql
SELECT content, cryptographic_hash, created_at
FROM agent_memory AS OF SYSTEM TIME '2026-07-29 14:30:00+00:00'
WHERE agent_id = 'soc-analyst' ORDER BY created_at DESC;
```

`get_at_time(t)` adds a **1-second MVCC buffer** (commit timestamps can lag app timestamps → prevents "future read"), fallback `WHERE created_at <= t`. *"CockroachDB MVCC time-travel restoring the ledger to its last known-good state."*

---

## 6. SERIALIZABLE Isolation & Retry

> "AI agents plow on with wrong info if data is inconsistent — SERIALIZABLE stops this." — Rob Reid, Cockroach Labs

Every write runs `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` under a retry engine (5 retries, 50ms→5s exponential + jitter, rollback + backoff on `40001`). Why not REPEATABLE READ: phantom reads possible → hash-chain fork risk; SERIALIZABLE → no phantoms, no forks.

---

## 7. Row-Level Security (RLS)

```sql
CREATE POLICY agent_isolation ON agent_memory
  USING (agent_id = current_setting('app.current_agent_id'));
-- per-transaction: SET LOCAL app.current_agent_id = 'soc-analyst'
```

`SET LOCAL` dies after `COMMIT` → Bastion re-applies via `_refresh_rls_context()` after every commit.

---

## 8. Vector Search (C-SPANN) + Decay

```sql
SELECT memory_id, content, importance_score,
       (1.0 - (embedding <=> $1::vector)) * importance_score /
       (1.0 + decay_rate * EXTRACT(EPOCH FROM (now() - created_at)) / 3600) AS decay_score
FROM agent_memory WHERE agent_id=$agent
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY decay_score DESC LIMIT $k;
```

```
score = cosine_similarity × importance / (1 + decay_rate × hours_since_creation)
```
Fallback: vector index unavailable → BM25 → ILIKE.

---

## 9. Multi-Signal Retrieval

Fused score = **0.4×vector + 0.3×keyword(BM25) + 0.15×entity-overlap + 0.15×temporal**(`exp(-days/30)`), threshold-filtered. Weights = `retrieval.py:52`.

---

## 10. Knowledge Graph + CRDTs

- **Extraction**: LLM (Groq) triples → regex fallback (`knowledge_graph.py:146`) — no spaCy. `"Alice works at Google" → (Alice, works_at, Google)`.
- **Time-travel graph**: `graph_at_time(t, entity)` → memory snapshot → reconstruct entity/relation state at that moment.
- **CRDTs** (`crdt_memory.py`, for distributed agent coordination):

| CRDT | Use | | CRDT | Use |
|------|-----|-|------|-----|
| RGA | ordered conversation logs | | OR-Map | agent state maps |
| LWW-Register | last-writer-wins prefs | | PN-Counter | access counts |
| OR-Set | tags / entity sets | | | |

---

## 11. Self-Healing + S3 Archive

```
write → chain sealed → memory_heal: 1) verify chain  2) broken? S3 snapshot → reseal → audit
                                     3) anomalies (dups, rapid writes, size spikes)  4) archive → Glacier @90d
```

```
s3://bastion-artifacts-<env>-<suffix>/
  snapshots/{agent_id}/2026-07-29T14:30:00Z.json
  archives/{agent_id}/2026-06-01/...            (Glacier)
```

---

## 12. EU AI Act (Article 12)

| Requirement | Implementation |
|-------------|----------------|
| Automatic event recording | `agent_audit` + `store_audit()` every op |
| Tamper-evident logs | HMAC chain — forgery needs server secret |
| Traceability | `compliance_report()` + `forensic_report()` MCP tools |
| 6-month retention | `compliance_mode="eu_ai_act"` → 180-day minimum TTL |
| Time-travel reconstruction | `AS OF SYSTEM TIME` + `diff(t1,t2)` |

---

## 13. Performance — Live Cluster

Real MiniLM embeddings, **no mocks** ([`benchmark_results.json`](../benchmark_results.json)):

| Operation | p50 | p90 |
|-----------|-----|-----|
| `memory_store` (hash chain + guard) | 909ms | 1021ms |
| `memory_search` (C-SPANN) | 307ms | 409ms |
| `memory_timetravel` (AS OF SYSTEM TIME) | 310ms | 512ms |
| `memory_audit` (chain integrity) | 305ms | 411ms |
| OWASP ASI06 guard scan | 6.7ms | 19.9ms |
| Hash-chain verify (1000-link) | 0.03ms | 0.05ms |

**Accuracy**: Recall@1 **65%** · Recall@5 **70%** · Recall@10 **75%** · OWASP TPR **88.2%** (426/483, 9 obfuscation families) · FPR **0%** (0/25).

> Cluster: **CockroachDB Cloud Serverless**, AWS ap-south-1, v26.2.5 · ~3,800+ memories live.

---

## 14. Key Files

| File | Purpose |
|------|---------|
| `src/bastion/memory.py` | Core `BastionMemory` (~2400 lines) |
| `src/bastion/crypto.py` | HMAC-SHA256 chain · KMS signing · DPAPI secret |
| `src/bastion/guard.py` | OWASP ASI06 MemoryGuard (multi-detector) |
| `src/bastion/retrieval.py` | MultiSignalRetriever (4-signal fusion) |
| `src/bastion/knowledge_graph.py` | LLM+regex triples · `graph_at_time` |
| `src/bastion/crdt_memory.py` | RGA · LWW-Register · OR-Set · OR-Map · PN-Counter |
| `src/bastion/context_budget.py` · `dreaming.py` · `observations.py` · `archive.py` | context packing · consolidation · patterns · S3/Glacier |
| `schema/` | DDL migrations 001-036 |

---

## 15. Quick API

```python
from bastion.memory import BastionMemory
mem = BastionMemory(agent_id="soc-analyst")

record = mem.store("fact", "User prefers Python", metadata={"importance_score": 8.0})
results = mem.search("Python preferences", k=5, threshold=0.8)
past = mem.get_at_time("2026-07-28T10:00:00Z")
report = mem.chain_verify()          # hash-chain walk
forensic = mem.forensic_report()     # live integrity report
result = mem.heal()                  # verify → snapshot → reseal
from bastion.compliance import ComplianceReporter
report = ComplianceReporter(mem).generate_report(agent_id="soc-analyst", start_date="2026-07-01")
```

---

## Related Docs

[MCP Server (35 tools)](MCP_SERVER.md) · [A2A Server (25 skills)](A2A_SERVER.md) · [AWS Services](AWS_SERVICES.md) · [EU AI Act](EU_AI_ACT.md) · [System & DB Architecture](ARCHITECTURE.md)