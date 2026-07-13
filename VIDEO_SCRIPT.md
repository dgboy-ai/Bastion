# 3-Minute Video Script — Bastion Hackathon Submission

## Scene 1: The Problem (0:00-0:30)

**Visual:** Split screen showing:
- Left: Agent crashing, losing memory
- Right: Agent getting poisoned by prompt injection

**Narration:**
"AI agents forget. They crash. They get poisoned. Traditional databases were built for human-scale reads and writes. Autonomous agents are different — they spawn dynamically, write constantly, and need memory that persists across regions, failures, and scale. When an agent's memory drops offline, it doesn't degrade gracefully — it stops, hallucinates, or reverts to a blank slate."

---

## Scene 2: The Solution (0:30-1:00)

**Visual:** Bastion logo with tagline "The Fortress of Memory"

**Narration:**
"Bastion is the system of record for autonomous AI. Built on CockroachDB, it provides persistent, self-healing memory with cryptographic integrity, time-travel queries, and multi-region distribution. Your agents never forget. Your agents never get poisoned. Your agents survive anything."

---

## Scene 3: Live Demo — Store & Search (1:00-1:30)

**Visual:** Dashboard showing real-time metrics

**Actions:**
1. Open dashboard at bastion-self.vercel.app
2. Show KPI cards updating in real-time
3. Show memory distribution chart
4. Show decay curve visualization

**Narration:**
"Bastion provides a real-time dashboard showing your agent's memory health. Every memory is stored with SHA-256 hash chain integrity. The decay curve shows how memories age and consolidate. Search uses 4-signal fusion — vector similarity, keyword matching, entity recognition, and temporal recency — for 100% recall."

---

## Scene 4: Live Demo — Time-Travel (1:30-2:00)

**Visual:** Code terminal showing time-travel query

**Actions:**
1. Run `memory_timetravel` query
2. Show memories as they existed 5 minutes ago
3. Show hash chain verification

**Narration:**
"Bastion's time-travel queries use CockroachDB's AS OF SYSTEM TIME. Any memory can be restored to any past state. The hash chain verifies every memory is tamper-evident. If someone tries to modify a memory, the chain breaks and alerts fire."

---

## Scene 5: Architecture (2:00-2:30)

**Visual:** Architecture diagram showing CockroachDB + AWS

**Actions:**
1. Show CockroachDB cluster across 6 regions
2. Show AWS Bedrock embeddings
3. Show Lambda CDC handler
4. Show KMS encryption

**Narration:**
"Bastion runs on CockroachDB with C-SPANN vector indexing — 94% smaller than pgvector. AWS Bedrock generates 1024-dimensional embeddings. Lambda handles CDC changefeed. KMS provides AES-256-GCM encryption. 6 global regions with 12-42ms latency."

---

## Scene 6: Unique Features (2:30-3:00)

**Visual:** Feature cards appearing one by one

**Actions:**
1. Show LTM Gateway — "Save 2,965 tokens per reuse"
2. Show Sleep-Time Dreaming — "6-step consolidation"
3. Show OWASP ASI06 Guard — "9 injection patterns blocked"
4. Show Auto-Contradiction — "Conflicts resolved automatically"

**Narration:**
"Bastion has features no competitor offers. The LTM Gateway saves tokens by reusing cached analyses. Sleep-time dreaming consolidates memories during idle time. OWASP ASI06 guard blocks prompt injection attacks. Auto-contradiction detects and resolves conflicting memories. Bastion is open source, MIT licensed, and free forever. Deploy on CockroachDB Serverless today."

---

## Closing (3:00)

**Visual:** Bastion logo + GitHub link + Demo link

**Text on screen:**
- bastion-self.vercel.app
- github.com/dgboy-ai/Bastion
- 1,147 tests | 25 MCP tools | 6 regions

---

## Recording Tips

1. **Use screen recording** — OBS Studio (free) or Loom
2. **Keep it under 3 minutes** — Judges won't watch beyond that
3. **Show real data** — Live dashboard, real queries, real metrics
4. **No copyrighted music** — Use royalty-free or no music
5. **Upload to YouTube** — Set to public
6. **Test the link** — Make sure it works before submitting

## Tools Needed
- OBS Studio (free screen recording)
- Microphone (built-in is fine)
- YouTube account (free upload)
