# Bastion — Agentic Memory Infrastructure on CockroachDB

## Identity

**3-Second Pitch:** "Memory that survives crashes — so AI agents never forget."

**One-Sentence Positioning:** "AI engineering teams use Bastion to give their agents crash-proof memory by storing every session, decision, and state on CockroachDB — so when an agent restarts, it remembers exactly where it left off."

**The Analogy:** "You backup your laptop. You backup your database. You backup your code with Git. But your agent's memory has NO backup. Bastion is that backup — Time Machine for your agent's brain."

**Why Now:** Agents in 2026 have the intelligence of a genius and the memory of a goldfish. They can pass the bar exam but can't remember your name five minutes later. Bastion fixes the half that everyone ignored.

**What We Are Not:** Bastion is NOT a durable execution engine (DBOS's lane). NOT a vector store (Mem0's lane). NOT a workflow engine (Temporal's lane). Bastion is what ALL of them are missing: unified agent memory on CockroachDB.

---

## The Problem

- **88% of agent pilots die before production** (Anaconda/Forrester, March 2026)
- **"Agent amnesia" is the #1 user complaint** — 34% of all Reddit complaints about AI tools in 2026
- **12 min/day wasted re-establishing context** — $625K/year for a 250-person team (Forrester)
- **93.8% memory poisoning success rate** (OWASP, June 2026)
- **No existing system** provides crash recovery + vector search + time travel + audit on one database

---

## Why This Wins

### 7 Locks

1. **Theme Lock**: "Agentic Memory" IS the product, not a bolt-on. 5 memory types on CockroachDB's deepest features.

2. **Tools Lock**: All 4 CRDB tools used deeply (MCP, C-SPANN, ccloud, Skills). Most entries use 1-2 at surface level. Bastion uses all 4 meaningfully.

3. **Technical Moat Lock**: C-SPANN, CDC, AS OF SYSTEM TIME, SERIALIZABLE, hash-chained ledger, async CDC reflection — 6 features NO competitor combines.

4. **Pain Point Lock**: 34% of complaints = the #1 universal pain. Every judge has felt "agent forgot my name."

5. **Demo Lock**: Hook at 0:05, holy shit at 1:00. Open-loop hooks between every segment. Halo Effect engineered.

6. **Positioning Lock**: "NOT DBOS, NOT Mem0, NOT Temporal — fills the gap they all leave." No confusion.

7. **Production Readiness Lock**: Security, observability, resilience IS the product — not an afterthought.

### The Math

| Criterion | Weight | Score | Rationale |
|---|---|---|---|
| Agentic Memory Design | 20% | **95** | 5 memory types on CRDB's deepest features |
| Technological Implementation | 20% | **95** | All 4 tools + CDC + AS OF SYSTEM TIME + SERIALIZABLE |
| Real-World Impact | 20% | **95** | #1 user complaint, universal pain |
| Product Readiness | 20% | **95** | Production readiness IS the product |
| Creativity & Originality | 20% | **95** | First CRDB-native unified memory platform |

**Projected: ~98/100.** Sandbox mode + ccloud auto-provisioning + TypeScript SDK + real-time CDC viz + hash chain visualizer eliminate every vulnerability. **No team of any size can match this across all 5 criteria.**

---

## The Unfair Advantage

C-SPANN, CDC, AS OF SYSTEM TIME, and SERIALIZABLE isolation do not exist in any other database. Bastion is the only hackathon entry combining all four for agent memory. A team with 100 PhDs and unlimited resources couldn't build Bastion on Postgres, MySQL, MongoDB, or SQLite. Only CockroachDB.

---

## Key Decisions

| Date | Decision | Rationale |
|---|---|---|
| Jul 5 | Reframe: Agentic Memory, NOT Durable Execution | DBOS already owns "durable execution on CRDB." Bastion fills the gap DBOS/Temporal/Mem0/Zep all leave. |
| Jul 5 | Demo: "Forget my name" split-screen | More emotional than crash comparison. Shows memory persistence, not crash recovery. |
| Jul 5 | Cost: $0 | CRDB free tier + Groq free tier + AWS free tier + $187 credits buffer |
| Jul 5 | Frontend: Next.js 16 + shadcn/ui | Streamlit is "hella basic." Server Components query CRDB directly. |
| Jul 5 | X-Factor: Hash chaining + CDC reflection + Conflict resolution | Gemini recommendations — anti-poisoning, async consolidation, serializable merge. |
| Jul 5 | Official rules verified | Deadline Aug 18 @ 5pm ET. All 5 criteria equally weighted 20%. Video must show CRDB memory layer. |
| Jul 5 | 11 production patterns baked in | Added: CQRS+Event Sourcing (implicit architecture), Semantic Caching (core, ~1 day). Total: Idempotency, Structured Outputs, Circuit Breaker, CQRS, Semantic Caching, Event-Driven CDC, Observability, Checkpointing, Fan-Out/Fan-In, Memory as Primitive, Router (stretch). |
| Jul 5 | Local-First Hybrid skipped | 3-5 days complexity, hard to demo in 3 min cloud demo. README note only. |
| Jul 5 | C-SPANN Performance HUD + SQL Explainer added to dashboard | Real C-SPANN latency gauge. SQL explainer opens raw CRDB query behind every visualization. |
| Jul 5 | Zero-Key Sandbox mode added | Pre-provisioned CRDB demo cluster + rate-limited Bedrock proxy. Judge plays live in browser with zero config. Highest ROI feature. |
| Jul 5 | OpenTelemetry tracing added | Key SDK ops emit OTEL traces visible in dashboard. Proves production readiness. |
| Jul 5 | Test suite: 40+ tests + CI badge | SDK core + MCP + hash chain. Not chasing 100 — meaningful coverage with passing CI pipeline. |
| Jul 5 | SUBMISSION_CHECKLIST.md created | Devfolio uses AI judging that audits claims against code. Every claim must have grep-able code evidence. Self-audit phase added to Week 5. |
| Jul 5 | Build plan extended to 5 weeks | Week 5 is submission prep: claim inventory, README legibility, self-audit, video recording, submission text optimization. Buffer reduced but deadline confidence remains high. |
| Jul 5 | Ecosystem adapters added (LangGraph, CrewAI, LlamaIndex) | Drop-in replacements for popular framework memory classes. Proves Bastion is a platform, not a prototype. ~3 days. |
| Jul 5 | Local Mock Mode added | `BASTION_MOCK=true` — deterministic fallback with zero external API dependencies. Demo is bulletproof against Bedrock/CRDB outages. ~1 day. |
| Jul 5 | Brand assets added to plan | AI-generated architecture infographic + hero asset for README. Dark theme, xAI-inspired. 2-4 hours. |
| Jul 5 | Discord community strategy | Post early in CRDB + AWS Discord. Ask technical questions. Get sponsor engineers looking at the repo before judging. 15 min. |
| Jul 6 | ccloud auto-provisioning added to SDK | `BastionMemory.provision_cluster()` wraps `ccloud cluster create`. Agent provisions own CRDB cluster on first boot. Kill demo moment — no competitor can do this. $0 cost. |
| Jul 6 | TypeScript/Node.js SDK added to Week 3 | Python + TS = no ecosystem locked out. Same API surface. Mirror Python SDK 1:1. $0 cost. |
| Jul 6 | Real-time CDC viz + hash chain visualizer added to dashboard | Live WebSocket CDC flow animation. Visual "blockchain for agent brain" hash chain. Makes Production Readiness + Creativity scores visually undeniable. $0 cost. |
 
---

## How to Use This File

When opening a NEW opencode session in the project directory:

1. **Read BASTION.md first** — Executive summary (this file, ~200 lines)
2. **Read TECHNICAL_SPEC.md** — Architecture, schema, build plan, X-Factor innovations
3. **Read DEMO_SCRIPT.md** — Word-for-word demo beats, open-loop hooks, judge psychology notes
4. **Read DESIGN.md** — xAI-inspired design system for the dashboard
5. Start with Week 1 of the build plan in TECHNICAL_SPEC.md

---

## Related Files

- [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) — Architecture, schema, build plan, competitive analysis
- [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) — Demo script, hooks, judge psychology
- [`DESIGN.md`](./DESIGN.md) — xAI-inspired dashboard design system
