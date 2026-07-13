# The Winning Narrative for CockroachDB Judges

## One Sentence (30 seconds)

> **Bastion is the only agentic memory layer that provides cryptographic integrity, time-travel queries, and multi-region distribution out of the box — because it's built on CockroachDB.**

## Why CockroachDB (3 bullet points)

1. **Hash chains require SERIALIZABLE isolation** — Postgres READ COMMITTED allows phantom reads that break cryptographic chains
2. **Time-travel requires AS OF SYSTEM TIME** — Only CockroachDB exposes this natively via SQL
3. **Multi-region requires automatic replication** — Postgres needs manual setup, CockroachDB handles it

## How to Try It (1 command)

```bash
docker compose -f docker-compose.demo.yml up
# Dashboard: http://localhost:3000
# Real CockroachDB with 150+ memories, hash chains, time-travel
```

## What Makes It Different (3 features)

1. **SHA-256 Hash Chains** — Every memory is cryptographically linked. Tamper-proof.
2. **AS OF SYSTEM TIME** — Query memory state at any past point. Debug "what did the agent know?"
3. **OWASP ASI06 Guard** — Blocks prompt injection attacks before they reach memory.

## Real-World Use Case

**Customer Support Agent** that:
- Remembers every customer interaction across sessions
- Uses time-travel to debug "what did the agent know at time T?"
- Self-heals when memories get corrupted
- Saves tokens via LTM Gateway (2,965 tokens per reuse)

## Production Proof

- **1,147 tests** passing
- **OWASP ASI06** security guard
- **OAuth 2.1 + PKCE** authentication
- **Row-Level Security** for multi-tenant isolation
- **AES-256-GCM** encryption

## Video Script (3 minutes)

### 0:00-0:30 — The Problem
"AI agents forget. They crash. They get poisoned. Traditional databases can't handle autonomous agents that spawn, write constantly, and need memory that persists across regions and failures."

### 0:30-1:00 — The Solution
"Bastion is the system of record for autonomous AI. Built on CockroachDB, it provides persistent, self-healing memory with cryptographic integrity, time-travel queries, and multi-region distribution."

### 1:00-1:30 — Live Demo (CockroachDB)
Show:
1. Dashboard with real CockroachDB data (not mock)
2. Hash chain verification passing
3. Time-travel query: "What did the agent know 5 minutes ago?"
4. 6 global regions with 12-42ms latency

### 1:30-2:00 — Why CockroachDB
Show:
1. SERIALIZABLE isolation preventing phantom reads
2. AS OF SYSTEM TIME enabling time-travel
3. C-SPANN vector index (94% smaller than pgvector)
4. CDC changefeed for real-time self-healing

### 2:00-2:30 — Unique Features
Show:
1. OWASP ASI06 guard blocking prompt injection
2. LTM Gateway saving 2,965 tokens per reuse
3. Sleep-time dreaming consolidating memories
4. Auto-contradiction detection

### 2:30-3:00 — Call to Action
"Bastion is open source, MIT licensed, and free forever. Deploy on CockroachDB Serverless today. 1,147 tests. 25 MCP tools. 6 regions. The fortress of memory."

---

## What Judges Will Think

1. **"This is the only memory system that uses CockroachDB properly"** → Win
2. **"Hash chains + time-travel are unique"** → Win
3. **"Production-ready with 1147 tests"** → Win
4. **"I can try this in 2 minutes"** → Win
5. **"This solves a real problem"** → Win

## The Competition Can't Copy This

| Feature | Bastion | Mem0 | Zep | Cognee |
|---------|:-------:|:----:|:---:|:------:|
| Hash chains | ✅ | ❌ | ❌ | ❌ |
| Time-travel | ✅ | ❌ | ❌ | ❌ |
| CockroachDB-native | ✅ | ❌ | ❌ | ❌ |
| SERIALIZABLE | ✅ | ❌ | ❌ | ❌ |
| Multi-region | ✅ | ❌ | ❌ | ❌ |

Mem0 uses Postgres. Zep uses Neo4j. Cognee uses Neo4j. None of them can add hash chains or time-travel without rewriting their entire stack.
