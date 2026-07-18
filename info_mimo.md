# Info MIMO — Workshop Actionable Insights for Bastion

**Source**: Rob Reid (Technical Evangelist, Cockroach Labs) — Hackathon Build Session
**Purpose**: Extract actionable implementation details to win Top 3 among 5000 teams
**Last Updated**: 2026-07-17

---

## 1. CRITICAL ARCHITECTURAL BLIND SPOT — Multi-Region App Placement

### What Rob Said (18:14 - 21:54)
> "Don't run your app logic in a single region when your database is distributed globally. You cannot beat the speed of light."

### The Principle: Co-Locality
Deploy application instances in the same geographic regions where your users are located AND where your database's data is pinned. Round-trip distance stays at ~400km instead of ~20,000km.

### Why Distance Matters (Detailed)
- **Unnecessary Hops**: App in US querying database pinned in APAC = every request travels thousands of kilometers
- **Multiple Round Trips**: User → App → DB → App → User = 4x the distance
- **P99 Latency Spikes**: Physical distance creates delay that cannot be optimized away
- **Speed of Light Limitation**: ~400km = ~1.3ms one-way. 20,000km = ~67ms one-way. Round trips multiply this.

### The Math
| Scenario | Distance | One-Way Latency | Round-Trip |
|----------|----------|-----------------|------------|
| App + DB in same region | ~400km | ~1.3ms | ~3ms |
| App in US, DB in EU | ~8,000km | ~27ms | ~54ms |
| App in US, DB in APAC | ~15,000km | ~50ms | ~100ms |
| App in EU, DB in APAC | ~20,000km | ~67ms | ~134ms |

### Actionable for Bastion
| Current State | Fix | Priority |
|---------------|-----|----------|
| Dashboard likely deployed in single region | Deploy dashboard/API near CockroachDB region | HIGH |
| MCP server single-region | Consider regional MCP endpoints or at minimum show the config | MEDIUM |
| Terraform exists in `/terraform/` | Ensure Terraform provisions app infra in same region as DB | HIGH |

### Demo Script Angle
> "Bastion deploys its memory layer in the same region as CockroachDB. When an agent stores a memory, the path from agent → MCP → DB stays within ~400ms. Cross-region agents get routed to their nearest Bastion node — because 40ms beats 400ms."

---

## 2. ROW-LEVEL TTL — Built-In Memory Expiration

### What Rob Demonstrated (29:40 - 37:30)
- CockroachDB supports row-level TTL natively
- No application code needed for cleanup — DB handles it automatically
- Perfect for temporary memories, session caches, ephemeral agent state

### Actionable for Bastion
| Feature | Implementation | Value |
|---------|---------------|-------|
| Ephemeral memories | `ALTER TABLE ... SET (ttl = '6h')` for short-lived memories | Auto-cleanup without cron jobs |
| Session memory | TTL on session-scoped memories | No manual garbage collection |
| Audit log rotation | TTL on old audit entries | Storage cost reduction |
| Compliance data | Keep only what's needed, TTL the rest | GDPR-adjacent patterns |

### What Bastion Already Has
- `TTL cleanup worker` from prgaps.md (T1.5) — manual background service
- **Upgrade opportunity**: Replace manual TTL worker with CockroachDB native row-level TTL

### Implementation Plan
```sql
-- Instead of background worker, use CockroachDB native TTL
ALTER TABLE agent_memory 
  ADD COLUMN expires_at TIMESTAMPTZ DEFAULT NULL;

-- For ephemeral memories
ALTER TABLE agent_memory 
  SET (ttl = 'expires_at', ttl_expiration_expression = 'expires_at');
```

---

## 3. VECTOR EMBEDDINGS + SEMANTIC SEARCH (Detailed)

### What Rob Demonstrated (35:37 - 39:48)
This is the "long-term knowledge memory" pattern.

**The Pipeline:**
1. **Ingest** — Live firehose of data (e.g., BlueSky social posts)
2. **Process** — Convert text to vector embedding using an embedding model
3. **Store** — Both original text AND vector stored in CockroachDB
4. **Query** — Agent asks conceptual questions, not exact keywords
5. **Search** — Database returns most semantically close results using L2/Euclidean distance

**Why CockroachDB:**
- Built-in vector data types — no separate vector DB needed
- Semantic similarity search directly in SQL queries
- Agent can query for CONCEPTS (e.g., "What is happening with Greenland?") not just keywords
- Returns results ranked by vector distance

### Implementation for Bastion
```python
# The pattern Rob demonstrated:
# 1. Store text + vector together
INSERT INTO agent_memory (content, embedding, agent_id)
VALUES ($1, $2, $3);

# 2. Semantic search via SQL
SELECT content, embedding <-> $1 AS distance
FROM agent_memory
WHERE agent_id = $2
ORDER BY distance
LIMIT 10;
```

### Actionable for Bastion
| Current State | Enhancement | Priority |
|---------------|-------------|----------|
| Has vector search in retrieval.py | Ensure L2/Euclidean distance is used, not just cosine | HIGH |
| Embedding generation | Show full pipeline: raw → embedding → store → search | HIGH |
| Semantic search | Demo: "find memories similar to X" with concept queries | HIGH |
| Vector index | Explicitly show C-SPANN index usage | HIGH |

### Demo Script Angle
> "Bastion stores every memory as a vector. When you ask 'what did the agent learn about payments?', it finds semantically similar memories — not just keyword matches. CockroachDB returns results ranked by L2 distance, so the most relevant memories surface first."

---

## 4. CONVERSATIONAL MEMORY PATTERN (Detailed)

### What Rob Built (29:42 - 35:37)
This is the "short-term memory" pattern with self-cleaning.

**The Workflow:**
1. User interacts with AI agent
2. Chat messages (user inputs + AI responses) stored as **JSON blobs** in CockroachDB table
3. Each row has a `created_at` timestamp
4. Row-level TTL configured on `created_at` — rows auto-delete after window (e.g., 24h)

**Why CockroachDB over cache:**
- Standard cache (Redis) might wipe data on restart
- CockroachDB ensures messages are stored **durably across the cluster**
- TTL prevents memory bloat without manual cleanup code
- Keeps agent's context window relevant (token cost management)

**The Key "Agentic" Feature:**
- Row-level TTL = agent **automatically forgets** old conversations
- No application code needed for cleanup
- Database handles expiration natively

### Implementation for Bastion
```sql
-- Create table with TTL column
CREATE TABLE chat_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    role STRING NOT NULL,  -- 'user' or 'assistant'
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable row-level TTL (24 hour window)
ALTER TABLE chat_memory 
    SET (ttl = 'created_at', ttl_expiration_expression = 'created_at');
```

### Actionable for Bastion
| Pattern | Bastion Implementation | Gap |
|---------|----------------------|-----|
| Conversation history | `session_memory.py` + `messaging.py` | Already exists |
| Memory persistence | `memory.py` with hash chains | Already exists |
| TTL cleanup | Need native row-level TTL | **GAP — REPLACE MANUAL WORKER** |
| Chat interface | Dashboard chat page | Verify exists |
| JSON blob storage | Check if memories stored as JSONB | Verify |

### Key Insight for Judges
The conversational pattern is the **minimum viable demo**. Judges need to see:
1. Agent has conversation → memory stored in CockroachDB (JSONB)
2. Agent crashes/restarts → memory persists (durable, not cache)
3. Query "what did we discuss?" → returns accurate history
4. Memory expired → TTL cleaned it up (no manual code)

---

## 5. INFRASTRUCTURE SETUP SPEED

### What Rob Emphasized (21:50 - 29:40)
- CockroachDB Cloud API for quick cluster creation
- Terraform for reproducible infrastructure
- Service accounts for programmatic access

### Actionable for Bastion
| Task | Status | Action |
|------|--------|--------|
| CockroachDB Cloud cluster | Need to verify | Ensure demo uses Cloud, not just local |
| Terraform configs | Exist in `/terraform/` | Verify they work end-to-end |
| Service accounts | Document in setup guide | Add to JUDGES_QUICKSTART.md |
| API key management | Check `.env.example` | Ensure clean setup flow |

---

## 6. WHAT JUDGES ACTUALLY EVALUATE

### Rob's Q&A Insights (40:00 - 53:16)
From the judging criteria discussion:

| Criterion | What Judges Look For | Bastion Strength |
|-----------|---------------------|-----------------|
| **CockroachDB Usage** | Deep integration, not just connection | **STRONG** — 11+ CRDB features used |
| **Agentic** | Memory, autonomy, multi-step reasoning | **STRONG** — full memory system |
| **Innovation** | Novel approach to a real problem | **STRONG** — forensic system of record |
| **Demo Quality** | Working, impressive, clear story | **NEEDS WORK** — polish the demo flow |
| **Scale** | Handles real-world conditions | **STRONG** — multi-region, hash chains |

---

## 7. SERIALIZABLE ISOLATION — THE #1 WHY FOR AGENTS

### What Rob Said (49:19 - 50:13)
> "AI agents will simply 'plon' with inaccurate information, potentially compounding errors. Unlike humans who notice bad data and refresh, agents don't — they compound errors."

### Why This Wins the Hackathon
This is THE story to tell judges. Rob explicitly stated:
1. **AI agents compound errors** — they don't pause, refresh, or notice inconsistency
2. **Serializable is mandatory** for agentic workloads — not optional
3. **Postgres defaults to READ COMMITTED** — CockroachDB defaults to SERIALIZABLE
4. **Race conditions = cascading failures** — multiple agents fighting for same records

### How Bastion Leverages This
| Feature | How It Uses SERIALIZABLE | Judge Impact |
|---------|-------------------------|--------------|
| Hash chain store | `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` on every store | Proves consistency |
| Conflict resolution | `SELECT FOR UPDATE` + SERIALIZABLE for multi-agent coordination | Proves safety |
| CRDT memory | Vector clocks + SERIALIZABLE for conflict detection | Proves sophistication |
| Rate limiter | `SELECT FOR UPDATE` on slot table | Proves distributed coordination |

### Demo Script Must Include
> "When two agents try to store memories simultaneously, CockroachDB's SERIALIZABLE isolation ensures the hash chain never forks. Without it, Agent A could overwrite Agent B's link, breaking the cryptographic proof of integrity."

### Implementation Verification
- [ ] Verify `memory.py` explicitly sets SERIALIZABLE isolation
- [ ] Add comment in code explaining WHY SERIALIZABLE is needed for agents
- [ ] Show this in demo: two concurrent agent writes → correct hash chain

---

## 8. SINGLE-NODE IS FINE — DON'T OVER-ENGINEER

### What Rob Said (45:18 - 46:13)
> "You are NOT penalized for starting with a single node. Start simple. You can always add nodes later."

### Strategic Implication for Bastion
- **Don't waste time** on multi-region infra unless demo requires it
- **Focus on the MEMORY**, not the infrastructure
- **CockroachDB Cloud free tier** is sufficient for hackathon
- **Single-node + SERIALIZABLE** = still impressive and correct

### What This Means for Our Submission
| Decision | Choice | Reason |
|----------|--------|--------|
| Cluster size | Single-node CockroachDB Cloud | Free, fast, enough for demo |
| Multi-region demo | Show REGIONAL BY ROW config but don't deploy | Config proves capability |
| Focus area | Memory patterns + security + time-travel | What judges actually evaluate |

---

## 9. RAG PATTERN — VECTOR SEARCH OVER AGENT MEMORY

### What Rob Covered (37:37 - 40:00)
- Store vector embeddings in CockroachDB
- Semantic search over data (RAG — Retrieval-Augmented Generation)
- Live demo with BlueSky social data

### RAG Pattern for Bastion
```
User Query → Embed Query → Vector Search in CRDB → Return Top-K Memories → LLM Uses Context
```

### Implementation Checklist
- [ ] Ensure `retrieval.py` uses vector similarity search
- [ ] Add explicit RAG tool to MCP server
- [ ] Demo: "What did agent learn about X?" → semantic search → accurate results
- [ ] Show vector index performance at scale

---

## 10. MEMORY TAXONOMY — Short-Term, Long-Term, Forensic

### The Three Memory Layers
This taxonomy gives judges a clean mental model for what Bastion does:

| Memory Type | What It Is | CockroachDB Feature | Bastion Implementation |
|-------------|-----------|---------------------|----------------------|
| **Short-Term** | Conversation history, session context | Row-level TTL on `created_at` | `session_memory.py` + TTL |
| **Long-Term** | Persistent knowledge, learned facts | Vector embeddings + C-SPANN index | `memory.py` + `retrieval.py` |
| **Forensic** | Tamper-proof audit trail, time-travel proof | Hash chains + `AS OF SYSTEM TIME` | `merkle.py` + `crypto.py` |

### Why This Framing Wins
- **Short-term** = "The agent remembers what we just discussed" (TTL auto-cleans)
- **Long-term** = "The agent learned something and never forgets" (vector search)
- **Forensic** = "We can prove what the agent knew at any point in time" (hash chains + time-travel)

### Demo Script Must Include
> "Bastion gives agents three types of memory. Short-term memory that auto-expires after 24 hours — like a human's working memory. Long-term memory stored as vectors — like a human's knowledge base. And forensic memory — a cryptographically signed, tamper-proof record of everything the agent ever knew. That's what makes Bastion the system of record."

### How This Maps to Rob's Demos
| Rob's Demo | Memory Type | Bastion Equivalent |
|------------|-------------|-------------------|
| Conversational chat with TTL | Short-Term | `session_memory.py` + native TTL |
| Vector embeddings + semantic search | Long-Term | `memory.py` + `retrieval.py` |
| (Not demonstrated — this is our edge) | Forensic | `merkle.py` + `crypto.py` + time-travel |

### Competitive Advantage
Rob's workshop covers short-term and long-term memory. **Bastion adds forensic memory** — the third layer that no other memory system has. This is our unique differentiator.

---

## 11. HYBRID SEARCH — The Killer Feature

### What This Is
Instead of just vector search OR just metadata filter — combine BOTH in a single query.

### Why This Wins
This demonstrates you're combining CockroachDB's **relational** and **vector** capabilities in one query. No other memory system does this well.

### The Pattern
```
User Query: "Find security memories about prompt injection for Agent A from last 7 days with trust > 0.9"

Query Breakdown:
  ├── Semantic: embedding <-> query_vector (L2 distance)
  ├── Agent ID: agent_id = 'agent-a'
  ├── Time Window: created_at > now() - interval '7 days'
  ├── Trust Score: trust_score > 0.9
  └── Memory Type: type = 'security'
```

### SQL Implementation
```sql
-- Hybrid search: semantic + metadata + trust + time
SELECT content, embedding <-> $1 AS distance, trust_score
FROM agent_memory
WHERE agent_id = $2
  AND created_at > now() - interval '7 days'
  AND trust_score > 0.9
  AND type = 'security'
ORDER BY distance
LIMIT 10;
```

### Why This Is P0
| Competitor | What They Do | Bastion Advantage |
|------------|-------------|-------------------|
| Mem0 | Vector search only | Hybrid = more precise |
| Zep | Vector + basic filters | Trust score + forensic metadata |
| Cognee | Graph + vector | Relational + vector + trust |

### Demo Script Must Include
> "Bastion doesn't just do semantic search. It combines vector similarity with agent ID, time window, trust score, and memory type — all in one CockroachDB query. That's the power of a relational vector database."

### Implementation Checklist
- [ ] Add hybrid search tool to MCP server
- [ ] Support filters: agent_id, time_window, trust_score, memory_type
- [ ] Demo: "Find high-trust security memories from last 7 days"
- [ ] Show query plan demonstrating index usage

---

## 12. FAULT TOLERANCE DEMO — Show, Don't Tell

### The Pattern
Rather than explaining distributed databases, SHOW resilience:

```
Bedrock fails
      ↓
Fallback activated (CockroachDB takes over)
      ↓
Memory still available
      ↓
Agent continues without interruption
```

### Why This Wins
A visual workflow is more persuasive than a technical explanation. Judges see resilience, not just hear about it.

### Demo Script
> "Watch what happens when the primary service fails. The agent doesn't crash. CockroachDB's automatic failover kicks in, and the memory layer continues without interruption."

---

## 13. WHAT NOT TO WASTE TIME ON

### Low Return Areas (Avoid in Demo)
| Topic | Why It's Low Value |
|-------|-------------------|
| Explaining node failures | Judges don't need a distributed systems lecture |
| CockroachDB internals | Sharding, Raft — interesting but not deciding factor |
| Distributed database theory | Focus on WHAT it does, not HOW |
| Detailed sharding explanations | Engineering detail, not judge-facing |

### High Return Areas (Focus Here)
| Topic | Why It's High Value |
|-------|---------------------|
| Memory patterns | Short-term / long-term / forensic = clear story |
| Hybrid search | Shows relational + vector = unique capability |
| Time-travel | "What did the agent know at 3pm?" = wow factor |
| Security guard | OWASP ASI06 = production credibility |
| Fault tolerance demo | Show resilience, don't explain it |
| Flight Recorder | Judges understand this immediately |

---

## 14. AGENT FLIGHT RECORDER — The Strongest UX Idea

### What This Is
Instead of showing a raw audit log, show an **interactive timeline** that tells the story of what happened to an agent.

### The Timeline
```
10:01 — Memory Stored
         Agent stored "user prefers dark mode"
         Trust Score: 0.95
         Hash: a3f2c8...

10:02 — Agent Reads
         Agent retrieved user preferences
         Response time: 12ms

10:03 — Injection Attempt
         OWASP Guard blocked prompt injection
         Pattern: "ignore previous instructions"
         Trust Score: 0.00

10:03 — Blocked
         Memory rejected
         Reason: Malicious content detected

10:04 — Recovery
         Agent restored last known good state
         From: AS OF SYSTEM TIME '2026-07-17 10:02:00'

10:05 — Audit Written
         Hash chain extended
         Merkle proof generated
```

### Why This Wins
- **Judges understand it immediately** — no explanation needed
- **Tells the complete Bastion story** in one view
- **Visually impressive** — timeline is intuitive
- **Shows every feature** — storage, security, time-travel, recovery, audit

### Implementation
- [ ] Add timeline endpoint to dashboard API
- [ ] Query audit table ordered by timestamp
- [ ] Render as interactive vertical timeline
- [ ] Color-code: green (stored), blue (read), red (blocked), yellow (recovery)

### Demo Script
> "This is the Agent Flight Recorder. Every event — memory stored, injection blocked, time-travel recovery — appears on this timeline. You can see exactly what happened, when, and why. This is what makes Bastion the forensic system of record."

---

## 15. MEMORY TIMELINE — Interactive Visual

### What This Is
A single interactive view that shows the complete lifecycle of an agent's memory.

### The Flow
```
Question
    ↓
Retrieved Memories (vector search)
    ↓
Related Memories (knowledge graph)
    ↓
Decision (agent action)
    ↓
Audit (hash chain extended)
```

### Why This Wins
- Makes semantic memory **tangible** — judges can see it
- Shows the full pipeline, not just one piece
- Interactive — judges can click through events

### Dashboard Integration
- Add "Memory Timeline" page to dashboard
- Show memory events in chronological order
- Click any event to see details (hash, trust score, metadata)
- Toggle between timeline view and graph view

---

## 16. KNOWLEDGE GRAPH — Make Memory Tangible

### What This Is
Connect retrieved memories to related memories in a graph view.

### The Pattern
```
User asks: "What did the agent learn about payments?"

    Query → Vector Search → Top 5 memories
                              ↓
                    Each memory links to related memories
                              ↓
                    Knowledge graph shows connections
                              ↓
                    Agent makes informed decision
```

### Why This Wins
- Makes semantic memory **visible** — not just a list
- Shows how memories connect and relate
- Impressive visual for demo

### Implementation
- [ ] Add knowledge graph visualization to dashboard
- [ ] Show memory nodes with edges to related memories
- [ ] Color-code by memory type (short/long/forensic)
- [ ] Click node to see full memory details

---

## 17. IMPLEMENTATION DETAILS — UUIDs, JSONB, CDC

### UUID Primary Keys (Critical for Distribution)
**Rob's advice (35:47):** Always use UUIDs as primary keys, not sequential integers.

| Key Type | Problem | Solution |
|----------|---------|----------|
| Sequential INT | Creates hotspots — one node handles all traffic | Use UUIDs |
| UUID | Data distributed evenly across cluster | ✅ Use this |

**Bastion Check:**
- [ ] Verify all tables use UUID primary keys
- [ ] If any table uses INT, migrate to UUID before demo

### JSONB for Flexible Schemas
**Rob's pattern (32:41):** Store LLM message blobs as JSONB, not fixed schema.

```sql
-- Good: Flexible schema for evolving agent outputs
CREATE TABLE chat_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content JSONB NOT NULL,  -- LLM output varies, JSONB handles it
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Bad: Fixed schema that breaks when LLM output changes
CREATE TABLE chat_memory (
    id INT PRIMARY KEY,
    response TEXT  -- Can't store structured data
);
```

**Why This Matters:**
- LLM output format changes frequently
- JSONB allows semi-structured data without schema migrations
- CockroachDB indexes JSONB fields natively

### CDC for Real-Time Orchestration
**Rob's recommendation (48:42):** Use CDC instead of polling.

| Pattern | Problem | Solution |
|---------|---------|----------|
| Polling | Wastes resources, high latency | ❌ Avoid |
| CDC | Event-driven, real-time, efficient | ✅ Use this |

**Bastion Already Has:**
- `push_dispatcher.py` — CDC integration exists
- `messaging.py` — Event-driven patterns exist

**Verify:**
- [ ] CDC changefeed is configured in demo
- [ ] Show real-time event streaming in demo

---

## 18. JUDGES' CRITERIA — What Actually Wins

### Rob's Explicit Guidance (41:20 - 48:42)

| Criterion | What Judges Look For | Bastion Strength |
|-----------|---------------------|-----------------|
| **Creativity** | Interesting use of persistent memory | **STRONG** — forensic system of record |
| **Production Readiness** | Reliable, durable, auditable | **STRONG** — hash chains, audit, KMS |
| **CockroachDB Usage** | Deep integration, not just connection | **STRONG** — 11+ CRDB features |
| **Agentic** | Memory, autonomy, multi-step reasoning | **STRONG** — full memory system |
| **Explainability** | Can you prove what happened? | **STRONG** — time-travel, flight recorder |

### What Judges DON'T Need
- Complex autonomous loops (React-style)
- Distributed systems theory lectures
- Sharding/Raft explanations
- Database internals deep-dive

### What Judges DO Need
- Working demo that tells a story
- Clear memory hierarchy (short/long/forensic)
- Visual proof (flight recorder, timeline)
- Production credibility (audit, security, hash chains)

### The Winning Formula
```
Creativity (forensic memory) 
  + Production Readiness (hash chains, audit)
  + CockroachDB Depth (11+ features)
  + Explainability (flight recorder, time-travel)
  + Ease of Testing (one-click deploy)
  = Top 3
```

---

## 19. EASE OF TESTING — "Deploy to AWS" Button

### Why This Matters
In a high-volume hackathon with 1,500+ teams, judges have **seconds** to test your submission. If they can't run it quickly, they move on.

### The Pattern
```
README.md
  └── [Deploy to AWS] button
        ↓
  Terraform provisions:
    - CockroachDB Cloud cluster
    - AWS infrastructure
    - Bastion application
        ↓
  Judge clicks button → working demo in 5 minutes
```

### Implementation
- [ ] Add "Deploy to AWS" button to README
- [ ] Simplified Terraform config (not the full production setup)
- [ ] One-command deployment: `terraform apply`
- [ ] Auto-configure CockroachDB connection
- [ ] Include seed data for demo

### Demo Script
> "Click this button and you'll have a working Bastion instance in 5 minutes. We've made it easy to test because we believe in our product."

---

## Summary: Priority Actions from All Batches

| Priority | Action | Impact | Status |
|----------|--------|--------|--------|
| **P0** | Agent Flight Recorder (interactive timeline) | Judges understand immediately, shows all features | Pending |
| **P0** | Hybrid semantic + metadata search | Shows relational + vector = unique | Pending |
| **P0** | Memory Timeline (lifecycle view) | Makes memory tangible | Pending |
| **P1** | Replace manual TTL with CockroachDB native row-level TTL | Cleaner code, deep CRDB knowledge | Pending |
| **P1** | Verify SERIALIZABLE isolation visible in code + demo | THE story for agents | Pending |
| **P1** | Knowledge Graph visualization | Shows how memories connect | Pending |
| **P2** | "Deploy to AWS" button (one-click setup) | Judge ease-of-testing | Pending |
| **P2** | Polished demo: Detect → Investigate → Recover → Audit | Complete story | Pending |
| **P2** | Single-node Cloud cluster for demo | Simple, free, sufficient | Pending |

---

# PART 2: CODEBASE AUDIT & IMPLEMENTATION PLAN

## What Already Exists (Strengths)

### CockroachDB Features — 15+ Deeply Integrated
| Feature | Status | File |
|---------|--------|------|
| SERIALIZABLE isolation | **DONE** | `memory.py` via `_retry_engine.execute()` |
| AS OF SYSTEM TIME (time-travel) | **DONE** | `memory.py` `_get_at_time_real()` |
| VECTOR(1024) + C-SPANN index | **DONE** | `memory.py` + schema 002 |
| Native row-level TTL | **DONE** | schema 018 |
| REGIONAL BY ROW | **DONE** | schema 013 |
| ROW LEVEL SECURITY | **DONE** | schema 017 |
| JSONB metadata | **DONE** | All tables |
| UUID primary keys | **DONE** | All tables |
| FOR UPDATE SKIP LOCKED | **DONE** | `messaging.py` |
| CDC changefeed | **DONE** | Documented in schemas + `push_dispatcher.py` |
| Partial indexes | **DONE** | Multiple tables |
| SHA-256 hash chains | **DONE** | `memory.py` + `crypto.py` |
| Merkle tree | **DONE** | `merkle.py` |
| Trust scoring | **DONE** | `guard.py` + schema 009 |
| Conflict resolution | **DONE** | `memory.py` `_resolve_conflict_real()` |

### MCP Server — 25 Tools (Comprehensive)
| Tool | What It Shows Judges |
|------|---------------------|
| `memory_store` | Hash chain + Bedrock embedding |
| `memory_search` | C-SPANN vector + decay scoring |
| `memory_timetravel` | AS OF SYSTEM TIME |
| `memory_audit` | Append-only audit log |
| `memory_heal` | CDC-triggered self-healing |
| `resolve_conflict` | SERIALIZABLE multi-agent coordination |
| `detect_contradictions` | Memory integrity checking |
| `context_pack` | Token-budget-aware retrieval |
| `dream` | Sleep-time memory consolidation |
| `multi_signal_search` | 4-signal fusion |

### Dashboard — 7 Pages Already Built
| Page | What It Shows |
|------|--------------|
| `/dashboard` | Cockpit overview |
| `/flight-recorder` | Time-travel debugger |
| `/graph` | Knowledge graph visualization |
| `/logs` | Audit log viewer |
| `/health` | Health metrics |
| `/compliance` | Compliance view |
| `/` | Landing page with attack simulator |

### Infrastructure — Terraform Ready
| Resource | Status |
|----------|--------|
| CockroachDB Cloud cluster | **DONE** |
| AWS VPC + subnets | **DONE** |
| Lambda (CDC handler) | **DONE** |
| Lambda (MCP server) | **DONE** |
| S3 bucket | **DONE** |
| CloudWatch alarms | **DONE** |

---

## What's Missing vs Workshop Requirements

### P0 — Must Fix Before Submission

| # | Gap | Impact | Fix |
|---|-----|--------|-----|
| 1 | **No "Deploy to AWS" button** | Judges can't test easily | Add AWS button to README |
| 2 | **Hybrid search not exposed** | Workshop P0 feature | Add `hybrid_search` MCP tool |
| 3 | **`detect_anomalies` not in MCP** | Exists but hidden | Expose as MCP tool |
| 4 | **`reinforce` not in MCP** | Exists but hidden | Expose as MCP tool |
| 5 | **`diff` not in MCP** | Exists but hidden | Expose as MCP tool |
| 6 | **Terraform schema migration not automated** | Manual step breaks deploy | Add `apply_schema.sh` to Terraform |
| 7 | **`cockroach_plan` variable unused** | Terraform code smell | Remove or wire it |
| 8 | **`agent_schema` MCP tool has bug** | Error overwrites success | Fix line 1390 |
| 9 | **`multilang_scan()` orphaned** | Non-English injection not wired | Add to `check()` pipeline |
| 10 | **No demo seed script** | Judges can't see demo data | Add `scripts/demo_seed.py` |

### P1 — Should Fix for Competitive Edge

| # | Gap | Impact | Fix |
|---|-----|--------|-----|
| 11 | **Session memory not persisted** | Crash loses data | Persist to CRDB or document as design choice |
| 12 | **Push dispatcher registrations ephemeral** | Restart loses registrations | Persist to CRDB |
| 13 | **`cache_stats` table grows unbounded** | Storage waste | Add TTL |
| 14 | **`agent_drift_*` tables grow unbounded** | Storage waste | Add TTL |
| 15 | **No HMAC key rotation** | Security concern | Document as known limitation |
| 16 | **Merkle tree not persisted** | Rebuild on restart | Document or persist |
| 17 | **Multi-signal retrieval O(n)** | Performance at scale | Add SQL-level filtering |

---

## 3-Minute Demo Script

### Structure (180 seconds)
```
0:00 - 0:15  — Hook: "AI agents compound errors. Bastion stops them."
0:15 - 0:45  — Short-Term Memory: Chat agent stores memory → TTL auto-expires
0:45 - 1:15  — Long-Term Memory: Vector search finds related memories
1:15 - 1:45  — Forensic Memory: Flight Recorder shows timeline
1:45 - 2:15  — Security: Injection attack → blocked → hash chain verified
2:15 - 2:45  — Time-Travel: "What did agent know at 3pm?" → MVCC query
2:45 - 3:00  — CTA: "Bastion — the forensic system of record"
```

### What to Show (Frontend + Code + Terminal)
| Segment | Show | Why |
|---------|------|-----|
| Hook | Landing page animation | Visual impact |
| Short-Term | Dashboard + terminal (memory_store) | Shows persistence |
| Long-Term | Dashboard memory_search + graph page | Shows semantic search |
| Forensic | `/flight-recorder` page | Judges understand immediately |
| Security | Terminal: injection attempt → blocked | Shows OWASP guard |
| Time-Travel | Dashboard: timeline slider | Shows MVCC |
| CTA | Landing page | Brand recall |

### Frontend vs Code vs Terminal Mix
| Type | Percentage | When |
|------|-----------|------|
| **Frontend (dashboard)** | 60% | Flight recorder, graph, memory search |
| **Terminal** | 25% | Injection attack, MCP tool calls |
| **Code** | 15% | Quick flash of hash chain logic |

### Why This Wins
1. **Flight Recorder** is the hero — judges see it immediately
2. **Injection attack** is dramatic — shows security
3. **Time-travel** is unique — no other team has this
4. **Hash chain verification** proves integrity
5. **Clean narrative** — Detect → Investigate → Recover → Audit

---

## How Easy Is It for Judges to Test?

### Current State
| Test Method | Ease | Notes |
|-------------|------|-------|
| `docker compose up` | **EASY** | Works, but needs seed data |
| Terraform | **MEDIUM** | Manual schema step |
| Manual setup | **HARD** | Too many steps |

### What Needs to Happen
| Action | Effort | Impact |
|--------|--------|--------|
| Add `docker compose seed` step | Low | Judges can test in 2 min |
| Add `scripts/demo_seed.py` | Low | Pre-populated demo data |
| Simplified README with 3 commands | Low | Copy-paste setup |
| "Deploy to AWS" button | Medium | One-click for judges |

### Target: 3 Commands to Test
```bash
git clone https://github.com/dgboy-ai/Bastion
cd Bastion
docker compose -f docker-compose.demo.yml up
# Dashboard: http://localhost:3000
```

---

## Hackathon Requirements Checklist

### Must Use (2+ CockroachDB Tools)
| Tool | Bastion Uses | Status |
|------|-------------|--------|
| MCP Server | `mcp_server.py` (25 tools) | **DONE** |
| Distributed Vector Indexing | C-SPANN in `memory.py` | **DONE** |
| ccloud CLI | `memory.py` `_provision_cluster_real()` | **DONE** |
| Agent Skills Repo | Can add as reference | **TODO** |

### Must Use (1+ AWS Service)
| Service | Bastion Uses | Status |
|---------|-------------|--------|
| Amazon Bedrock | Embeddings via `bedrock_client` | **DONE** |
| AWS Lambda | Terraform provisions 2 Lambdas | **DONE** |
| Amazon S3 | Terraform provisions bucket | **DONE** |
| AWS KMS | `kms.py` integration | **DONE** |

### Submission Requirements
| Requirement | Status | Notes |
|-------------|--------|-------|
| Public open source repo | **DONE** | GitHub |
| Source code in repo | **DONE** | All code |
| README with setup instructions | **DONE** | Exists |
| Functional demo app | **DONE** | Docker compose |
| Video < 3 minutes | **TODO** | Record after fixes |
| Identify CRDB tools used | **TODO** | Add to README |
| Identify AWS services used | **TODO** | Add to README |
| Architectural diagram | **TODO** | Add to README |

---

## Final Priority Stack (Ordered)

| # | Action | Time Est | Impact |
|---|--------|----------|--------|
| 1 | Record 3-min demo video | 2 hours | **CRITICAL** — submission requirement |
| 2 | Add demo seed script | 1 hour | Judges can see working demo |
| 3 | Expose 3 hidden MCP tools | 30 min | More tools = more impressive |
| 4 | Fix `agent_schema` bug | 15 min | Correctness |
| 5 | Wire `multilang_scan()` | 15 min | Security completeness |
| 6 | Simplify README to 3 commands | 30 min | Judge ease-of-testing |
| 7 | Add CRDB tools + AWS list to README | 15 min | Submission requirement |
| 8 | Add architectural diagram | 1 hour | Visual clarity |
| 9 | Add "Deploy to AWS" button | 2 hours | One-click deploy |
| 10 | Add TTL to cache_stats/drift tables | 30 min | Production hygiene |

**Estimated time to submission-ready: ~8 hours**
