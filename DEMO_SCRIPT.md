# Bastion — Demo Script (3 Minutes)

## Critical Rule

**Judges decide in the first 30 seconds.** The "holy shit" must land at 1:00.

**Halo Effect:** One gasp at 1:00 makes every other category rate higher. Technical implementation looks better. Production readiness looks stronger. All because of one moment.

**Horn Effect we avoid:** Never apologize. Never say "this isn't working yet." If something fails, we use it — "THAT is exactly why you need Bastion."

---

## Open-Loop Hooks

Every segment opens a loop that the next segment closes:

| Segment | Opens Loop | Closes Loop |
|---|---|---|---|
| 0:00 Hook | "Your agent has amnesia." → Why? | 0:10-0:30 Shows the pain |
| 0:10-0:30 Pain | "Forgets everything after crash." → What if it didn't? | 0:30-0:50 Bastion remembers. **GASP.** |
| 0:50 Self-heal | "Survives crashes." → What about corruption? | 1:05 Anomaly heals before damage spreads |
| 1:05 Time-travel | "Knows the past." → What about infrastructure? | 1:20 Agent provisions own cluster via ccloud |
| 1:20 ccloud+MCP | "Agent provisions infra." → How does it find memory? | 1:35 MCP self-query + Skills load |
| 1:35 Coordination | "Multiple agents?" → Conflict? | 1:50 Serializable + hash chain resolves it |
| 1:50 Dashboard | "All that tech." → Can I see it work? | 2:05 Live CDC viz + OTEL + C-SPANN HUD |

**Each open loop pulls the judge to the next second. No lulls = no phone checking.**

---

## The Arc: Hook → Pain → Holy Shit → Depth → Close

| Time | Scene | Visual | CRDB/AWS Tool Shown | Psychology |
|---|---|---|---|---|---|
| **0:00-0:10** | **Hook**: "Your AI agent has amnesia. Every conversation starts from zero. **And that is broken.**" | Text on dark canvas: "YOUR AGENT HAS AMNESIA" | — | "Broken" is a judgment. Judge agrees. Now they're on your side. |
| **0:10-0:30** | **Pain (BEFORE)**: Split LEFT. Agent builds context over 50 interactions — name, preferences, task history. **Kill process.** Restart. *"Hello, I'm an AI assistant."* | Split left only. Chat: build context → crash → blank restart | — | **"This happens every damn day."** Every judge has lived this. |
| **0:30-0:50** | **THE HOLY SHIT MOMENT (AFTER)**: RIGHT side activates. Same START with Bastion. Build context. **Kill process.** Restart. *"Welcome back, John. Last session we were working on Project X. I had an idea about the architecture over the weekend."* | Split screen both active. Same crash. **Different outcome.** | **C-SPANN** (vector search retrieved memory from `agent_memory`) | **GASPS.** "It remembered my NAME, my PROJECT, and had IDEAS." Halo Effect kicks in. |
| **0:50-1:05** | **Self-healing**: CDC stream shows conflicting facts → Bastion detects anomaly → snapshots clean state → rolls back. Show `SHOW CHANGEFEEDS` in CRDB Console. | Live CDC feed. "MEMORY ANOMALY" → "ROLLING BACK TO SAFE STATE" | **CDC** (changefeed → Lambda anomaly detection) | **"Heals before corruption spreads."** No competitor does predictive protection. |
| **1:05-1:20** | **Time-travel**: "Drag this slider to July 3 at 2:47pm — see exactly what this agent knew." Show SQL: `SELECT * FROM agent_memory AS OF SYSTEM TIME '...'` | Slider UI. Drag. Full state reconstructs. SQL query visible. | **C-SPANN** + **AS OF SYSTEM TIME** | **"Version control for your agent's brain."** CRDB-exclusive feature. |
| **1:20-1:35** | **ccloud Auto-Provisioning + MCP**: Agent detects no memory store → terminal shows `ccloud cluster create bastion-memory --provider aws` → cluster provisions → CDC configured → agent queries own schema via MCP `select_query`. *"Your agent provisions its own database."* | Terminal window: ccloud CLI output. Split: MCP config showing `bastion_memory` schema. | **ccloud CLI** + **MCP Server** | **"Agent provisions its own infrastructure."** No other hackathon entry does this. |
| **1:35-1:50** | **Multi-agent + Hash Chain**: Two agents write simultaneously. Agent A: "user likes Python." Agent B: "user likes Rust." 40001 caught → LLM merges → "Python AND Rust." Dashboard shows hash chain: each memory block linked, chain validated. | Two panels writing. Conflict. Merge. Dashboard hash chain visualizer. Chain nodes linked with SHA256. | **SERIALIZABLE** + **Hash Chain** (anti-poisoning ledger) | **"Agents share memory safely at global scale."** Poisoning detected immediately. |
| **1:50-2:05** | **Dashboard Tour**: Real-time CDC pipeline visualization — events flow as animated particles from checkpoints → Lambda → memory. Hash chain visualizer shows every link green (intact). C-SPANN latency HUD. OTEL trace panel showing ms breakdowns. | Dashboard: CDC flow animation, hash chain visualizer, C-SPANN gauge, OTEL traces | **CDC** + **C-SPANN** + **MCP** + **OTEL** (all shown in dashboard) | **"Production readiness proven at a glance."** Judge sees live system, not screenshots. |
| **2:05-2:20** | **3-line integration + Skills**: Python and TypeScript code side-by-side. Agent loads `memory_heal` Skill. | `from bastion import DurableMemory` AND `import { BastionMemory } from 'bastion-memory'` | **Agent Skills** (loaded via Skills Repo) + **TypeScript SDK** | **"I can use this TODAY in any language."** Python + TypeScript = no ecosystem locked out. |
| **2:20-2:40** | **Architecture + Competitive Comparison**: Diagram flyover. Table: Bastion vs DBOS/Temporal/Mem0 — Bastion wins every row. "12 min/day wasted re-explaining. After Bastion: zero." | Architecture diagram. Comparison table. Stat cards. | All 4 CRDB tools in diagram | **"This is a platform, not a prototype."** Clear differentiation. |
| **2:40-3:00** | **Close**: "Bastion — Time Machine for your agent's brain. Open source. MIT. Python and TypeScript. Build agents that remember." | GitHub URL. BASTION logo. npm + pip install commands. | — | Memorable soundbite. Judge repeats "build agents that remember" in deliberation. |

---

## Rules Compliance

The rules require the video to "include footage showing the CockroachDB memory layer at work." We make it explicit. Also the rules require identifying "which CockroachDB tools you used and how — what did the agent actually do with them?" Every tool gets a named segment:

- **C-SPANN (0:30-0:50, 1:05-1:20, 1:50-2:05)**: Vector search retrieves memory after crash. Semantic similarity in time-travel. C-SPANN latency HUD in dashboard.
- **CDC (0:50-1:05, 1:50-2:05)**: Changefeed streams writes → Lambda detects anomaly → rollback. Dashboard shows real-time CDC pipeline animation. Show `SHOW CHANGEFEEDS` in CRDB Console.
- **AS OF SYSTEM TIME (1:05-1:20)**: `SELECT * FROM agent_memory AS OF SYSTEM TIME '2026-07-03 14:47:00'` executing in CRDB Cloud Console or terminal.
- **SERIALIZABLE (1:35-1:50)**: 40001 serialization error caught → LLM merge → atomic re-commit. Two agents coordinate without data loss.
- **ccloud CLI (1:20-1:35)**: Agent shells out to `ccloud cluster create` to provision its own cluster. Terminal output visible.
- **MCP Server (1:20-1:35, 1:50-2:05)**: Agent queries own memory schema via `select_query`. MCP config snippet shown.
- **Agent Skills (2:05-2:20)**: Agent loads `memory_heal` Skill from the Skills Repo. Config shown.
- **Overlay labels**: "CockroachDB Distributed SQL" during C-SPANN, "C-SPANN Vector Index" during search, "CDC Changefeed" during healing, "ccloud CLI" during provisioning, "MCP Server" during schema query, "Agent Skills" during skill load, "SERIALIZABLE" during conflict resolution.

---

## Winning Narrative (Spoken Word Script)

- **Hook (0:00)**: "88% of AI agents fail in production. The #1 reason? Their memory doesn't survive the crash."
- **Problem (0:15)**: "Your agent learns your name, your preferences, your project context — then the process dies. Restart. 'Hello, I'm an AI assistant.' Blank slate. Every time."
- **Proof (0:40)**: "Watch what happens WITH Bastion. Crash. Restart. 'Welcome back, John. Last session we were working on Project X.'"
- **Self-healing (0:55)**: "CDC changefeeds stream every memory write to Lambda for real-time anomaly detection. Corruption detected. Snapshot. Rollback. Healed before you notice."
- **Time-travel (1:10)**: "AS OF SYSTEM TIME — reconstruct any agent's past state. CockroachDB exclusive."
- **ccloud + MCP (1:25)**: "Your agent provisions its own cluster via ccloud, then queries its own memory schema via MCP. Zero ops team needed."
- **Coordination (1:40)**: "Multiple agents writing simultaneously? SERIALIZABLE isolation catches conflicts. LLM merges them. Hash chain detects poisoning."
- **Dashboard (1:55)**: "Real-time CDC pipeline. Hash chain visualizer. C-SPANN latency. OTEL traces. This is production-ready."
- **Solution (2:10)**: "Bastion — Python AND TypeScript. Three lines. Works with every agent framework."
- **Close (3:00)**: "Open source. MIT license. Bastion on GitHub. Build agents that remember."

---

## Why This Demo Is Unforgettable

1. **First 10 seconds name the pain** — no intro, no logo, no team name. Just the problem.
2. **The "without" side** shows the exact pain every developer has felt. Emotional recognition.
3. **Holy shit at 0:35** — "Welcome back, John." Triggers Halo Effect for everything after.
4. **CDC self-healing** — predictive protection, not reactive. No competitor can do this.
5. **Time-travel** — CockroachDB exclusive. "Version control for agent brain."
6. **ccloud auto-provisioning** — agent provisions its own database. No other entry has SDK-level ccloud integration.
7. **MCP self-querying** — agent explores its own memory schema dynamically.
8. **Serializable coordination + hash chain** — enterprise shared memory with anti-poisoning.
9. **Real-time dashboard** — CDC viz, hash chain viz, C-SPANN HUD, OTEL traces. Production readiness proven visually.
10. **Dual-language SDK** — Python AND TypeScript. Every ecosystem covered.
11. **3-line integration** — "I can use this TODAY."
12. **Agent Skills** — agent loads `memory_heal` from the Skills Repo.
13. **Every moment demonstrates a CRDB tool + feature** — C-SPANN, CDC, AS OF SYSTEM TIME, SERIALIZABLE, MCP, ccloud, Skills — all named with overlay labels.
14. **Open-loop hooks** — every answer reveals a new question. No lulls.
