# CockroachDB × AWS Hackathon — Judge Insights

**Source:** Rob Reid (Technical Evangelist, Cockroach Labs) Build Session

---

## What Judges Want to See (from the session)

### 1. Two Demos They Showed as Examples
- **Demo 1:** Conversational chat agent with **persistent memory** + **row-level TTL** (memories expire naturally)
- **Demo 2:** **Vector embeddings + semantic search** over live BlueSky social data

**Takeaway:** If the judges built these as demos, they want to see the SAME patterns in submissions but done BETTER.

### 2. "Agentic" Definition (40:00-42:30)
- Rob specifically defined what "agentic" means for this hackathon
- Agent must **store, retrieve, and ACT on memory** — not just CRUD
- Memory must be the thing that makes the agent useful in production

### 3. MCP Servers Are Important (40:00-53:16)
- Rob discussed MCP servers extensively in Q&A
- This means judges will CHECK if you used the CockroachDB MCP Server

### 4. Vector Embeddings + Semantic Search (37:30-40:00)
- They demoed this specifically over real social media data
- **We have this** (sentence-transformers + cosine similarity) — this is a strength

### 5. Row-Level TTL (29:40-37:30)
- They specifically showed memories that expire
- **We have this** (short-term memory with TTL) — this is a strength

### 6. Multi-Region Architecture (19:43-21:51)
- Critical blind spot: app logic MUST be near the data
- REGIONAL BY ROW in CockroachDB
- **We have multi-region in schema** — but need to demonstrate it

### 7. CockroachDB Cloud API + Service Accounts (21:50-29:40)
- They walked through this specifically
- **We have ccloud CLI integration** in `dba.py`

### 8. Terraform Deployment (28:00-32:00)
- They showed Terraform for multi-region
- **We have terraform/ directory** — need to verify it works

---

## What We Have vs What They Showed

| What They Demoed | What We Have | Gap |
|---|---|---|
| Conversational agent with persistent memory | ✅ Customer support agent + 5 agents | We're BETTER |
| Row-level TTL on memories | ✅ Short-term memory with TTL | We're EQUAL |
| Vector embeddings + semantic search | ✅ sentence-transformers + cosine sim | We're EQUAL |
| Live social media data | ❌ No real external data source | Need BlueSky or similar |
| CockroachDB Cloud API usage | ✅ ccloud CLI in `dba.py` | We're EQUAL |
| Multi-region deployment | ✅ Schema supports it | Need to DEMONSTRATE |

---

## What's MISSING from Our Submission

### Critical (Disqualifying)
1. **AWS service** — ZERO AWS code exists. Requirements say "All submissions must also use at least one AWS service"
2. **Video (< 3 min)** — Required, not optional
3. **Agent Skills Repo** — One of the 4 CockroachDB tools

### Important (Scoring)
4. **Real agent doing real work** — Judges showed agents working with live data. Our playground is a UI walkthrough, not an agent solving a problem
5. **External data source** — They used BlueSky social data. We need real data, not just injection test cases
6. **Row-level TTL demo** — They showed this explicitly. We should feature it prominently

---

## Winning Strategy

### Use What They Explicitly Demoed (copy their winners)
1. Vector embeddings + semantic search over real data → We have this
2. Persistent memory with TTL → We have this
3. MCP Server → We have this
4. ccloud CLI → We have this

### Add What They Didn't Show (differentiate)
1. OWASP ASI06 memory poisoning guard → UNIQUE, nobody else has
2. Time-travel debugging via AS OF SYSTEM TIME → UNIQUE
3. Cryptographic hash chains → UNIQUE
4. Self-healing memory → UNIQUE
5. Forensic audit trail → UNIQUE

### Fix What's Broken
1. Add AWS (Bedrock for embeddings is easiest)
2. Build a 2-min video
3. Create agent skills
4. Show the agent making decisions, not just API calls

---

## Judging Criteria Scores to Target

| Criterion | Weight | Our Current | Target |
|---|---|---|---|
| Agentic Memory Design | 25% | 7/10 | 9/10 |
| Technical Implementation | 25% | 8/10 | 9/10 |
| Real-World Impact | 20% | 5/10 | 8/10 |
| Production Readiness | 15% | 7/10 | 8/10 |
| Creativity & Originality | 15% | 9/10 | 9/10 |

**Biggest gap:** Real-World Impact (20% weight). Need to show agent solving a real problem.

---

## Action Items

### Phase 1: AWS Integration (Required)
- [ ] Add Amazon Bedrock for embeddings (replaces sentence-transformers)
- [ ] OR add AWS Lambda for CDC self-healing handler
- [ ] Update README with real AWS usage

### Phase 2: Real Agent Demo
- [ ] Build a security analyst agent that monitors incoming messages
- [ ] Show it storing memories, detecting poisoning, healing, proving with time-travel
- [ ] Make it work with real data (not just test injection cases)

### Phase 3: Video + Submission
- [ ] Record 3-min video: Problem → Solution → Live Demo → Why CockroachDB
- [ ] Upload to YouTube/Vimeo
- [ ] Update Devpost submission

### Phase 4: Agent Skills
- [ ] Register Bastion tools as CockroachDB Agent Skills
- [ ] Add to agent-skills repo pattern

---

## Additional Insights (Session Part 2)

### Serializable Isolation for Agents (49:19-50:13)
- Rob **strongly recommends** SERIALIZABLE for agentic systems
- Why: AI agents act autonomously — they don't pause to verify inconsistent data like humans do
- If data is inconsistent, agents "plow on" with wrong info, **compounding errors**
- We already use SERIALIZABLE by default — **this is a strength to highlight**

### Single-Node Is Fine (45:18-46:13)
- No penalty for starting simple
- Single-node cluster is perfectly valid for hackathon
- Can scale later if demo requires global distribution
- **We're already on a managed cloud cluster** — this is BETTER than minimum

### Key Patterns They Want to See
1. **Row-level TTL for memory management** — prevents memory bloat, keeps context window relevant
2. **Vector embeddings stored IN CockroachDB** — not a separate vector store
3. **Semantic recall over real data** — not just toy examples

### Architecture Best Practice to Demonstrate
- Co-locate app logic with database region
- If multi-region, show REGIONAL BY ROW
- Show that we understand the latency blind spot

### What This Means for Our Submission
1. **Highlight SERIALIZABLE** — we use it by default, judges care about this
2. **Highlight TTL** — we have short-term memory with expiry
3. **Highlight vector embeddings IN CockroachDB** — we store in `embedding_384` column
4. **No need to over-engineer infra** — our current setup is fine
5. **Focus on the agent USE CASE** — that's what differentiates us

### Updated Scoring Strategy
Our unique value proposition (nobody else in 2287 participants):
- **Forensic memory** — can prove what agent knew, when, and if tampered
- **OWASP ASI06 compliance** — industry standard for memory poisoning
- **Time-travel debugging** — AS OF SYSTEM TIME for investigation
- **Self-healing** — detect + recover from poisoning automatically
- **Hash chain integrity** — cryptographic proof of memory chain

The story: "Every other project builds memory FOR agents. Bastion builds memory that can PROVE ITSELF."

---

## Deep Dive: The Two Memory Patterns (from session)

### Pattern 1: Conversational Chat Memory with Row-Level TTL
**What they showed:**
- Chat messages stored as JSON blobs in CockroachDB
- Durable across cluster restarts (unlike cache)
- Row-level TTL auto-deletes old rows based on `created_at`
- Effectively "forgets" conversations after 24 hours
- Manages token costs, keeps memory focused

**What we have:**
- Short-term memory with TTL in `agent_memory` table
- `expires_at` column for TTL management
- Session memory for conversational history
- **We match this pattern exactly**

### Pattern 2: Vector Embeddings & Semantic Search
**What they showed:**
- Live firehose of BlueSky social media posts
- Each post converted to vector embedding
- Both text and vector stored in CockroachDB
- Semantic similarity search using L2/Euclidean distance
- Agent queries for CONCEPTS, not keywords
- Returns most semantically close posts

**What we have:**
- sentence-transformers embeddings (384-dim)
- Stored in `embedding_384` column (vector type)
- Cosine similarity search in `retrieval.py`
- Semantic search in `/api/demo/chat`
- **We match this pattern exactly**

### Pattern 3: Co-locality (Latency)
**What they showed:**
- Application MUST be in same region as database
- Cross-region = thousands of km round trips
- P99 latency spikes with distance
- Speed of light is the hard limit

**What we have:**
- Schema supports `REGIONAL BY ROW`
- Multi-region in schema definition
- **We need to DEMONSTRATE this**

### Judging Pro-Tip from Rob (41:20)
> "Creativity is key. Your agent doesn't need to be a complex 'React-style' loop to win. You can impress judges by demonstrating CockroachDB for persistent state, reliable audit trails, or complex task coordination—all of which are essential 'agentic' features."

**This is HUGE for us:**
- We have persistent state ✅
- We have reliable audit trails ✅ (append-only + hash chains)
- We have complex task coordination ✅ (A2A protocol)
- We have forensic memory ✅ (unique)

### What This Means for Our Strategy
1. **Don't over-engineer the demo** — judges value creativity over complexity
2. **Focus on what makes us unique** — forensic memory, time-travel, self-healing
3. **Show the memory patterns clearly** — TTL + vector search are the two they care about
4. **Highlight SERIALIZABLE** — judges explicitly want this for agents
5. **Show audit trail** — they mentioned "reliable audit trails" as key agentic feature

---

## Advanced Technical Considerations

### 1. Database Operations & Resilience
- **Change Data Capture (CDC):** CockroachDB's built-in CDC streams changes to Kafka/Pulsar
  - We have `push_dispatcher.py` and `messaging.py` — could demonstrate this
  - Transforms Bastion from polling to event-driven architecture
- **Serializable Isolation:** Prevents "agentic stampedes" when multiple agents write simultaneously
  - We use SERIALIZABLE by default — HIGHLIGHT THIS
- **JSONB for Flexible Schemas:** Store LLM message blobs without schema migrations
  - We use JSONB in `metadata` columns — we match this pattern
- **UUIDs as Primary Keys:** Ensures even data distribution across cluster
  - We use UUIDs for `memory_id` — we match this pattern

### 2. Agentic Performance Optimization
- **Hybrid Search Patterns:** Vector similarity + metadata filtering in single SQL query
  - We filter by `agent_id`, `memory_type`, `trust_level` — we do this
  - Should DEMONSTRATE hybrid search explicitly in demo
- **Row-Level TTL:** Data hygiene + cloud storage cost management
  - We have TTL in short-term memory — we match this
  - Shows understanding of data lifecycle management

### 3. Strategic Hackathon Tips
- **Creativity > Complexity:** Unique use case wins, not complex loops
  - Our unique use case: forensic memory + self-healing
- **Leverage Ecosystem:** Use MCP server for development workflow
  - We have full MCP server — we match this
- **Start Simple:** CockroachDB Cloud Basic tier is free and serverless
  - We're already on managed cluster — BETTER than minimum

### 4. Demonstrating Agentic Maturity
- **Audit Trail Advantage:** Immutable history of agent decisions
  - We have append-only audit log + hash chains — STRONG
  - Makes system explainable and trustworthy
- **Terraform Configuration:** One-click deployment for judges
  - We have `terraform/` directory — need to verify it works
  - "Deploy to AWS" button would be massive differentiator
- **CDC for Real-Time Orchestration:** Event-driven vs polling
  - We have CDC infrastructure — could demonstrate

### 5. Dashboard Features to Add
- **Agent Audit Trail View:** Chronological, tamper-proof decision history
  - We have Flight Recorder page — HIGHLIGHT THIS
- **Knowledge Graph Visualization:** Show semantic memory connections
  - We have Graph page — HIGHLIGHT THIS
- **Hybrid Search Demo:** Vector + metadata filtering
  - We have this in chat endpoint — DEMONSTRATE
- **"Deploy to AWS" Button:** One-click infrastructure provisioning
  - We have Terraform — could add deployment script

---

## What Judges Will Check (from all insights)

### Must-Have (Disqualifying)
1. ✅ Public open source repo — We have this
2. ✅ Functional demo app — We have this (playground)
3. ❌ Video (< 3 min) — MISSING
4. ✅ 2+ CockroachDB tools — We have MCP + Vector Indexing + ccloud CLI
5. ❌ 1+ AWS service — MISSING
6. ❌ Agent Skills Repo — MISSING

### Scoring Criteria
1. **Agentic Memory Design (25%)** — We're STRONG (forensic memory, TTL, vector search)
2. **Technical Implementation (25%)** — We're STRONG (SERIALIZABLE, hash chains, time-travel)
3. **Real-World Impact (20%)** — We're WEAK (need real agent doing real work)
4. **Production Readiness (15%)** — We're STRONG (security, observability, resilience)
5. **Creativity & Originality (15%)** — We're STRONG (forensic memory is unique)

### What Will Win
1. **Forensic memory** — nobody else has this
2. **OWASP ASI06 compliance** — industry standard, we're first
3. **Time-travel debugging** — AS OF SYSTEM TIME, unique
4. **Self-healing memory** — detect + recover, unique
5. **Hash chain integrity** — cryptographic proof, unique

---

## Winning Checklist (from all session insights)

### What Judges WILL Check
- [ ] Public open source repo with MIT license
- [ ] Functional demo app URL
- [ ] Video < 3 min on YouTube/Vimeo
- [ ] 2+ CockroachDB tools used (MCP, Vector Indexing, ccloud CLI, Agent Skills)
- [ ] 1+ AWS service used (Bedrock, Lambda, S3, etc.)
- [ ] README with clear setup instructions
- [ ] Architectural diagram (optional but recommended)

### What Judges WILL Score
1. **Agentic Memory Design (25%)**
   - Is CockroachDB used meaningfully? ✅ Yes — 898+ memories, hash chains, time-travel
   - More than toy queries? ✅ Yes — real SQL, real cluster, real data
   - State, embeddings, context at real scale? ✅ Yes — vector embeddings, trust scores, audit logs

2. **Technical Implementation (25%)**
   - Quality integration with CRDB tools? ✅ Yes — MCP server, ccloud CLI, vector indexing
   - Correct and safe tool usage? ✅ Yes — SERIALIZABLE, parameterized queries, auth
   - Code quality? ✅ Yes — 2000+ tests, linting, type checking

3. **Real-World Impact (20%)**
   - Meaningful use case? ⚠️ Need to show agent solving real problem
   - Could impact real users? ⚠️ Need to show production scenario
   - Not just technically impressive? ⚠️ Need to show business value

4. **Production Readiness (15%)**
   - Secure? ✅ Yes — OWASP ASI06, auth, rate limiting, encryption
   - Observable? ✅ Yes — audit logs, metrics, flight recorder
   - Scalable? ✅ Yes — CockroachDB multi-region, connection pooling
   - Resilient? ✅ Yes — circuit breaker, retry engine, self-healing

5. **Creativity & Originality (15%)**
   - Genuinely new idea? ✅ YES — forensic memory is completely new
   - Novel application of technology? ✅ YES — time-travel for agent debugging
   - Insight into agentic systems? ✅ YES — memory poisoning defense

### What Will Make Us WIN
1. **Forensic Memory** — nobody else has this
2. **OWASP ASI06 Compliance** — industry standard, we're first
3. **Time-Travel Debugging** — AS OF SYSTEM TIME, unique
4. **Self-Healing Memory** — detect + recover, unique
5. **Hash Chain Integrity** — cryptographic proof, unique

---

## Deep Research: 2026 Multi-Agent Systems

### The 5 Orchestration Patterns (2026)

| Pattern | Structure | Best For |
|---|---|---|
| Sequential Pipeline | A → B → C | Linear dependencies |
| **Supervisor** | 1 planner, N doers | **Most production systems** |
| Router | Router → 1 of N | Classification + dispatch |
| Handoff | Dynamic agent changes | Customer support flows |
| Swarm | Decentralized handoffs | Well-partitioned problems |

**Key insight:** "Most agent failures are orchestration and context-transfer issues, not model failures." — AI Workflow Lab

### MCP = "USB-C for AI" (2026 Standard)

- De facto standard for agent-to-tool communication
- Three primitives: **Tools** (POST), **Resources** (GET), **Prompts** (templates)
- Governed by Linux Foundation's Agentic AI Foundation
- **We have 25 MCP tools** — this is STRONG

### A2A Protocol (Agent-to-Agent)

- Launched by Google with 50+ partners (Atlassian, Salesforce, SAP)
- Agent Cards for discovery
- JSON-RPC 2.0 over HTTP(S)
- Supports sync, streaming (SSE), and async push notifications
- **We have full A2A implementation** — this is RARE

### Framework Comparison (2026)

| Framework | Best For | Speed | Tokens |
|---|---|---|---|
| LangGraph | Performance, control | 2.2x faster | 2,589 |
| CrewAI | Rapid prototyping | Baseline | 5,339 |
| AutoGen | Conversational collaboration | Moderate | 3,316 |
| OpenAI SDK | Handoff-heavy, OpenAI-native | N/A | N/A |

### Production Best Practices (2026)

1. **Structured handoff schemas** — Don't pass free-form text between agents
2. **Tiered memory** — Working, short-term, long-term, semantic cache
3. **Semantic cache** — Up to 90% cost reduction, 15x faster responses
4. **Stateless with external state** — Best of both worlds
5. **Observability** — Audit trails, decision traces, token tracking, latency breakdowns
6. **Security** — RBAC, OAuth 2.0, rate limiting, input sanitization
7. **Testing** — Simulation, integration, AND chaos testing

---

## Competitor Deep Dive: "Continuum"

### What They Built
- Incident-response memory that survives agent being killed
- Uses CockroachDB + AWS Lambda + Bedrock
- Has chaos demo (kill agent, watch it resume)
- Gradio UI on HuggingFace Spaces

### Their Architecture
```
Alert → Lambda (cold start) → Recovery Read → Correlation Agent → 
Remediation Agent → Memory Agent → CockroachDB (SERIALIZABLE)
```

### What They Do Well
1. **Chaos testing** — Kill process mid-step, prove recovery
2. **Cold start recovery** — Every invocation recovers from CockroachDB
3. **Dual memory** — Transactional + vector in one store
4. **MCP integration** — Read-only queries via Managed MCP Server
5. **SERIALIZABLE transactions** — Forward-step claim with ON CONFLICT DO NOTHING

### What They DON'T Have (OUR ADVANTAGES)
1. **No time-travel** — Can't investigate what agent knew at past time
2. **No hash chains** — Can't prove memory hasn't been tampered with
3. **No OWASP ASI06** — No memory poisoning detection
4. **No self-healing** — Can't detect + recover from poisoning
5. **No forensic audit trail** — No append-only hash-chained log
6. **No three-layer memory** — No short-term/long-term/forensic architecture

### How We Beat Continuum

| Feature | Continuum | Bastion | Advantage |
|---|---|---|---|
| Incident response | ✅ | ✅ | Equal |
| CockroachDB | ✅ | ✅ | Equal |
| AWS Lambda | ✅ | ❌ | They win |
| Bedrock | ✅ | ❌ | They win |
| Vector search | ✅ | ✅ | Equal |
| Chaos demo | ✅ | ❌ | They win |
| **Time-travel** | ❌ | ✅ | **WE WIN** |
| **Hash chains** | ❌ | ✅ | **WE WIN** |
| **OWASP ASI06** | ❌ | ✅ | **WE WIN** |
| **Self-healing** | ❌ | ✅ | **WE WIN** |
| **Forensic audit** | ❌ | ✅ | **WE WIN** |
| **Three-layer memory** | ❌ | ✅ | **WE WIN** |
| **A2A protocol** | ❌ | ✅ | **WE WIN** |
| **MCP tools** | 1 (read-only) | 25 | **WE WIN** |

### Our Winning Strategy Against Continuum

**Don't compete on THEIR terms (chaos demo). Compete on OUR terms (forensic memory).**

Our narrative:
> "Continuum survives the agent being killed. Bastion survives the agent being POISONED — and proves what happened with cryptographic certainty."

---

## Memory Frameworks Comparison (2026)

### The 4 Approaches

| Framework | Architecture | Temporal | Best For |
|---|---|---|---|
| Mem0 | Hybrid vector+graph+KV | Weak | Personalization, stable facts |
| Zep | Graphiti temporal graph | Strong (63.8% LongMemEval) | Changing state, "as of" queries |
| Letta | OS-style RAM/disk paging | Indirect | Long-running stateful agents |
| Cognee | ECL pipeline → typed graph | Structural | Document-heavy knowledge graphs |

### Key Benchmarks
- **Zep:** 63.8% on LongMemEval (GPT-4o)
- **Mem0:** 49.0% on LongMemEval (GPT-4o)
- **Gap:** 15 points on temporal retrieval

### Where We Fit
We're NOT competing with Mem0/Zep/Letta/Cognee. We're building something different:
- **They build memory FOR agents** — storage and retrieval
- **We build memory that can PROVE ITSELF** — forensic, tamper-proof, recoverable

### Our Unique Position
> "Every other project builds memory FOR agents. Bastion builds memory that can PROVE ITSELF."

---

## Risk Factors (Updated)

### Risk 1: AWS Usage (CRITICAL)
- **Continuum has:** Lambda + Bedrock
- **We have:** KMS only
- **Impact:** Disqualifying without AWS
- **Mitigation:** Add Lambda for CDC handler

### Risk 2: Real Agent Demo
- **Continuum has:** Chaos demo (kill + resume)
- **We have:** Playground walkthrough
- **Impact:** Lower "Real-World Impact" score
- **Mitigation:** Multi-agent demo with A2A communication

### Risk 3: Video Quality
- **Continuum has:** Demo video planned
- **We have:** None yet
- **Impact:** Incomplete submission
- **Mitigation:** Record 3-min video of playground + multi-agent demo

### Risk 4: Agent Skills Repo
- **Continuum has:** None (they cut it — "2 tools done well beats 3 done thin")
- **We have:** None
- **Impact:** Missing one of 4 CockroachDB tools
- **Mitigation:** Register MCP tools as skills

### Risk 5: Production Readiness
- **Continuum has:** CI/CD, chaos testing, benchmarks
- **We have:** 2000+ tests, linting, type checking
- **Impact:** Comparable
- **Mitigation:** Add chaos testing demo

### Quick Wins (can do now)
1. Add CockroachDB icon ✅ Done
2. Highlight SERIALIZABLE in README
3. Highlight TTL in README
4. Add "Deploy to AWS" button
5. Verify Terraform works
