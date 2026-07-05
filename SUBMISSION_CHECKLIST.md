# Bastion — Submission Checklist (Final Quality Gate)

## Why This Exists

This is a Devpost hackathon — judged by a panel of humans reviewing 50+ projects under time pressure. Judges have 5-10 minutes per project. They skim READMEs, watch videos, and spot-check claims against code. Any claim without visible evidence loses credibility.

**"What looks like project quality is actually project legibility"** — a judge who reviewed 1,000+ projects. A project that's easy to understand in 60 seconds will score higher than a technically superior project that's hard to evaluate.

This checklist exists to make sure every claim is provable and the project is maximally legible.

---

## Phase 1: Claim Inventory (Write Before Building)

Before writing a line of code, list every claim our submission will make. Then build to match.

### Required Claims (from BASTION.md)

| Claim | Evidence Required in Repo | Status |
|---|---|---|---|
| 5 memory types (semantic, episodic, procedural, coordination, audit) | 5 SQL tables in schema | Pending |
| C-SPANN vector indexing | `INVERTED INDEX ... USING C-SPANN` in schema | Pending |
| CDC self-healing | `CREATE CHANGEFEED` statement + Lambda handler code | Pending |
| AS OF SYSTEM TIME time travel | `SELECT ... AS OF SYSTEM TIME` in SDK code | Pending |
| SERIALIZABLE isolation coordination | Transaction retry logic in SDK | Pending |
| Hash-chained memory | `cryptographic_hash` column + SHA256 computation in SDK | Pending |
| Multi-agent conflict resolution | Catch 40001 → merge logic in SDK | Pending |
| Semantic caching | C-SPANN similarity check before LLM call in SDK | Pending |
| 4 CRDB tools (MCP, C-SPANN, ccloud, Skills) | MCP config, C-SPANN schema, ccloud script, Skills config | Pending |
| 3 AWS services (Bedrock, Lambda, S3) | Lambda code, Bedrock integration, S3 archive code | Pending |
| OpenTelemetry tracing | OTEL instrumentation in SDK + dashboard trace panel | Pending |
| Zero-Key Sandbox | Dashboard sandbox mode + rate-limited backend | Pending |
| ccloud auto-provisioning | `provision_cluster()` method in SDK wrapping `ccloud cluster create` | Pending |
| TypeScript/Node.js SDK | `bastion-memory` npm package with 1:1 Python API parity | Pending |
| Real-time CDC dashboard viz | WebSocket-connected CDC flow animation in dashboard | Pending |
| Hash chain visualizer | Dashboard component showing SHA256 chain with integrity indicator | Pending |

**Rule**: If it's not in the table above, don't claim it in the submission. Every claim costs credibility if unproven.

---

## Phase 2: README Legibility Standards

Judges and AI both read the README first. It must be scannable in 60 seconds.

### Structure (Top to Bottom)

```
1. [BADGES] — CI passing, test coverage, license, CRDB version
2. [DEMO GIF] — The "Welcome back, John" moment as a looping GIF (< 5MB)
3. [ONE-LINER] — "Memory that survives crashes — so AI agents never forget."
4. [QUICK START] — `pip install bastion-memory` + 5 lines of code
5. [ARCHITECTURE] — Clean diagram (use the one from TECHNICAL_SPEC.md)
6. [FEATURES] — Bullet list of claims WITH code snippets proving each
7. [COMPARISON] — Table vs DBOS, Temporal, Mem0, Zep
8. [SYSTEM DESIGN PATTERNS] — CQRS, Event Sourcing, Semantic Caching, etc.
9. [BUILT WITH] — CRDB + AWS badges
10. [CONTRIBUTING] — Standard
```

### README Anti-Patterns (Lose Points)
- ❌ "Coming soon" features — if it's not in the repo, don't mention it
- ❌ Walls of text — judges scan, they don't read
- ❌ Buzzwords without code evidence — "enterprise-grade" means nothing without OTEL traces
- ❌ Missing setup instructions — if the AI can't verify your claims by running the code, you lose

---

## Phase 3: Demo Video Production Standards

The video is watched by humans, not AI. But the AI audits the claims the video makes.

### Technical Requirements (from Rules)
- Must be < 3 minutes (judges can stop watching at 3:00)
- Must show CockroachDB memory layer at work (show SQL queries)
- Must be public on YouTube or Vimeo
- No third-party trademarks or copyrighted music
- Must include footage of project functioning

### Production Quality (from Research)
| Element | Standard | Why |
|---|---|---|
| Audio | USB mic ($50-100) or phone recording in quiet room | Bad audio = instant disqualification for attention |
| Screen recording | Clean, no notification popups, no browser tabs | Distractions break the spell |
| Pacing | No dead air > 2 seconds | Loses momentum |
| Captions | Auto-captions enabled on YouTube | Accessibility + comprehension |
| Hook | First 5 seconds name the pain without jargon | "Your agent has amnesia" |
| Holy Shit | At 1:00 — the split screen reveal | Halo Effect for everything after |
| Close | "Bastion. Open source. MIT. Build agents that remember." | Memorable soundbite |

### Script (from DEMO_SCRIPT.md)
The full word-for-word script is in DEMO_SCRIPT.md. Read it aloud 3 times before recording. Time yourself.

---

## Phase 4: Pre-Submission Self-Audit

Before submitting, run a self-audit that simulates what Devfolio's AI judge will do:

### Step 1: Extract All Claims
From the Devpost submission text and README, extract every factual claim.

### Step 2: Verify Each Claim in Code
For each claim:
1. `grep` the codebase for the supporting code
2. If the code doesn't exist → either add it or remove the claim
3. If the code exists but is broken → fix it

### Step 3: Claim-Proof Gap Report
Create a report like:
```
Claim: "5 memory types on CRDB"
Evidence: 5 CREATE TABLE statements in schema/sql/
├── semantic: agent_memory ✅ (C-SPANN index present)
├── episodic: agent_checkpoints ✅ (CDC enabled)
├── procedural: agent_memory WHERE memory_type='procedure' ✅
├── coordination: agent_coordination ✅ (SERIALIZABLE documented)
└── audit: agent_audit ✅ (append-only, no UPDATE/DELETE)
VERDICT: PROVEN
```

### Step 4: Fix Gaps
Any claim marked UNPROVEN is either:
- A feature not yet built → remove from submission
- A feature built but not findable → move code or add comment markers

---

## Phase 5: Submission Text Optimization

The Devpost submission form has text fields. The AI judge reads these first.

### Field 1: Tagline
```
Memory that survives crashes — so AI agents never forget.
```

### Field 2: Description (Bullet Format)
```
Bastion is an open-source Python + TypeScript SDK that gives AI agents crash-proof memory on CockroachDB.

What it does:
- 5 memory types: semantic (C-SPANN vectors), episodic (checkpoints), procedural (skills), coordination (SERIALIZABLE), audit (append-only)
- CDC self-healing: changefeeds stream memory writes to Lambda for real-time anomaly detection
- Time travel: AS OF SYSTEM TIME reconstructs any agent's past state
- ccloud auto-provisioning: agent provisions its own CRDB cluster on first boot
- Hash-chained memory: SHA256 ledger detects prompt injection attacks
- Multi-agent coordination: serializable isolation prevents contradictory facts
- Semantic caching: C-SPANN similarity search serves repeated queries at 0ms latency
- Real-time dashboard: CDC pipeline viz, hash chain visualizer, C-SPANN HUD, OTEL traces
- OTEL tracing: every memory operation emits OpenTelemetry traces
- Python + TypeScript SDK: same API surface, both ecosystems covered

CockroachDB tools used:
1. MCP Server — agents query own memory schema dynamically via select_query
2. C-SPANN — distributed vector indexing for semantic memory with 94% compression
3. ccloud CLI — agent auto-provisions cluster via SDK provision_cluster() method
4. Agent Skills — 5 pre-built memory skills loaded at runtime

AWS services used:
1. Amazon Bedrock — LLM execution and embedding generation via Titan
2. AWS Lambda — CDC event processing and self-healing triggers
3. Amazon S3 — long-term memory archives and compliance snapshots
```

### Field 3: Video Link
YouTube URL (public).

### Field 4: GitHub Repo URL
Public repo with MIT license. Badges visible at top of About section.

---

## Final Verification

- [ ] All claims in submission text have code evidence
- [ ] README is skimmable in 60 seconds
- [ ] Demo video < 3 minutes, public, captioned
- [ ] Video shows CRDB memory layer (SQL queries on screen)
- [ ] Repo has MIT license visible in About section
- [ ] Repo has clear README with quick start
- [ ] CI pipeline passing with test badge
- [ ] Sandbox mode deployed and accessible
- [ ] OpenTelemetry traces visible in dashboard
- [ ] ccloud auto-provisioning coded and working (`provision_cluster()` method)
- [ ] TypeScript SDK published on npm (`bastion-memory`)
- [ ] Real-time CDC visualization animating in dashboard
- [ ] Hash chain visualizer showing integrity status
- [ ] Demo video shows all 4 CRDB tools with overlay labels (MCP, C-SPANN, ccloud, Skills)
- [ ] Demo video shows all AWS services (Bedrock, Lambda, S3)
- [ ] No third-party trademarks or copyrighted music in video
- [ ] Deadline: August 18, 2026 @ 5:00pm ET
