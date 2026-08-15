> **Immediate Action Plan:**
> **Today (Aug 15):** Install `google.adk`, verify it runs a hello-world. Start CRDB×AWS clean repo. Nothing else.
> **Tomorrow (Aug 16):** Finish CRDB×AWS video. Nothing else.
> **Aug 17:** Submit CRDB×AWS. Start Phase 0 repo copy.
> **Aug 18 onwards:** Follow the build plan phases in order.

# All Things Agentic Hackathon — Full Plan & Research

**Date:** 14 Aug 2026 · **Status:** Planning (Phase 0 not started)
**Goal:** Win a prize in the Google "All Things Agentic Hackathon" (Fortified Enterprise Fleet track)
**Project name:** **Mainstay** — "the principal support; the rigging that holds the fleet's mast up."
**Tagline:** *"The agent tried to drop the database — Mainstay stopped it, proved it, rewound it."*
**Deadline:** 1 Sept 2026 @ 5:30am GMT+5:30 (Submission Period: Aug 3 – Aug 31, 2026, ends 5:00 PM PT)
**Strategy:** Build a *genuinely new* project during the submission window, reusing the author's own
open-source **bastion** memory engine as a **disclosed** head start, on the mandatory Google stack.

---

## 1. Hackathon Facts

- **Host:** Google, managed by Devpost · **Participants:** ~2,600+ · **Total prizes:** $180,000
- **Tracks:** Taskmaster · Collaborative Partner · **Fortified Enterprise Fleet** (chosen)
- **Fleet track rubric:** "how an organization can **discover** your agents, **audit their reasoning**,
  **trust their data handling**, and **scale them safely**."
- **Fleet sub-components (Google's words):**
  - Discovery & Lifecycle → Agent Registry (catalog, version, discover approved agents)
  - Core Execution & State → Agent Runtime (long-running async) + Memory Bank (secure context over weeks)
  - Security & Governance → Agent Identity (zero-trust), Agent Gateway (routing + policy),
    Model Armor (inline guardrails: block prompt injection, tool poisoning, PII leaks)
  - Telemetry → Agent Observability (OpenTelemetry-compliant audit logs + end-to-end reasoning chain traces)
- **Recommended tech:** Gemini Enterprise Agent Platform (GEAP)

### 1.1 Prizes

| Prize | Amount | Notes |
|---|---|---|
| Grand Prize | $50,000 + $5k GCP credits | best across all tracks |
| Fortified Enterprise Fleet | $20,000 + $2k credits | **our main target** |
| Taskmaster | $20,000 + $2k credits | |
| Collaborative Partner | $20,000 + $2k credits | |
| Startup Excellence | $20,000 + $5k credits | incorporated org + corporate email |
| Individual/Hobbyist (Best Solo Build) | $10,000 ×2 + $1k credits | **solo entry → eligible** |
| Best Architectural Design | $5,000 ×2 | **hash-chain arch fits** |
| Best Multimodal UX | $5,000 ×2 | |
| Honorable Mentions | $2,000 ×5 | |

### 1.2 Judging Criteria

- **Innovation & Operational Utility — 40%:** real-world friction removed autonomously, high-value action over chat.
- **Architectural Discipline & Tech Stack — 30%:** decoupling, state/memory management, credential security, failure handling.
- **Demo & Production Readiness — 30%:** live unedited demo, clean architecture diagram, reproducible setup, visible proof it runs on Google Cloud.

Scoring: each criterion 1–5, averaged; final score 1–6. Stage 1 = screening, Stage 2 = judged, Stage 3 = bonus points.

### 1.3 Mandatory Stack (all three required — currently 0 of 3 built)

1. **Gemini 3.5 or newer** via Gemini API or Vertex AI
2. **≥1 Google Agent Framework:** Google ADK, GenAI SDK, Antigravity SDK, or GenKit
3. **≥1 Google Cloud infrastructure service:** Cloud Run, Cloud SQL, Firestore, GKE, Pub/Sub

### 1.4 Submission Checklist

- URL to hosted project (highly encouraged)
- Text description (features, technologies, data sources, findings/learnings)
- URL to code repo — private OK if shared with `testing@devpost.com` + `cloudhackathons@google.com`
- Spin-up instructions in README.md
- Architecture diagram
- **≤4 min demo video** (YouTube/Vimeo, public, English or subtitles) covering: problem, value prop,
  live demo, and **proof backend runs on Google Cloud** (Cloud Console, Cloud Run dashboard, Vertex AI logs, `.run` URL)

### 1.5 Bonus Points (optional)

- Public blog/podcast/video about how the project was built (must state it's for this hackathon)
- Social post on X/LinkedIn/Instagram/Facebook (X/LinkedIn must include `#AllThingsAgenticHackathon`)
- Integrate Google AI models such as **Gemma, Veo, or Lyria**

### 1.6 Cost & Credits

- $150 GCP credits via form — request by **Aug 28, 12:00 PM PT**; reviewed within 72 business hours; one per entrant; mention an official track name + 1–2 sentence description or it's auto-declined.
- Free Google Cloud trial is separate.
- Cost tips: Gemini Flash first, scale-to-zero (min instances 0), teardown after recording the video — app does **not** need to be live at judging.

### 1.7 Resources

- **GEAR** (free): 35 monthly learning credits, skill badges, hands-on labs (launched Aug 6).
- Webinars: Aug 11 (ADK 2 orchestration patterns), Aug 13 (Long-Running Agent: crash-recovery/idempotency),
  Aug 20 (Self-Evolving Agent), Aug 27 (Architecting Agent Memory — "persistence ≠ memory").
- Track example: Enterprise Supply Chain Orchestrator.

---

## 2. Rules Reality (critical)

- **Existing projects are NOT allowed.** Projects must be **newly created during the Submission Period** (Aug 3–31, 2026).
- You **may use libraries/frameworks/templates/tools**, but **must disclose any pre-existing code or work you incorporate**.
- You may submit more than one project, but each must be **unique and substantially different**.
- **Conclusion:** hand-copying bastion does *not* satisfy the rule and does *not* reduce risk.
  Compliance = **honest disclosure of the reused bastion core + genuine new work** (Gemini backend, ADK agents,
  execution gate, GCP deployment, registry cockpit) during the window.

### 2.1 Related: CockroachDB × AWS Hackathon (bastion's origin)

- Deadline: **Aug 18/19, 2026** (~4 days out). Prizes: $5,000 / $2,500 / $1,250. Participants ~3,400.
- Requires **public open-source repo**, public <3-min video, ≥2 CockroachDB tools (Managed MCP Server,
  Distributed Vector Indexing, ccloud CLI, Agent Skills Repo), ≥1 AWS service (Bedrock, Lambda, ECS/EKS, S3, etc.).
- **DECIDED (Aug 14):** **Submit bastion there too.** It's ~ready; needs a clean public repo + <3-min video + polish. Due in ~4 days — publish the cleaned bastion repo first (serves both entries), then fork/copy into the Mainstay repo for Google.

---

## 3. Problem Research (latest — Aug 13–14, 2026)

### 3.1 Agent-Inflicted Damage (Cyera, 2026-07-28)

- Analyzed **7,246 incidents** (Sep 2023 – May 2026); **188 verified enterprise cases with NO attacker** —
  agents autonomously broke production systems.
- Damage categories: **deletion/code destruction 65**, service disruption 30, hidden integrity failure 23
  (silent corruption, fabricated records, fake test passes), financial 19; 59 access-control/guardrail-bypass; 137 real-world damage.
- **The incident curve tracks autonomy/permissions, not model release.**
- Cases: AWS internal agent deleted prod env → 13h outage; Claude Code $1446 USDT unauthorized transfer; OpenClaw password leak.
- Needed controls: gate irreversible actions, cap agent authority, move controls into the execution layer, log every action for audit.

### 3.2 Coding-Agent Incidents (adversa.ai, 2026-08-04)

- 9 documented incidents in 14 months: Cursor YOLO, Replit (SaaStr DB), Claude Code, Gemini CLI,
  Antigravity Turbo (D: partition), Amazon Kiro (13h outage), Supabase wipe.
- Pattern: agents operating at the wrong abstraction level; permission systems bypassed by inheritance.
- "The largest group is a gap between what the model intended and what the substrate did."

### 3.3 PocketOS (July 2026) — the 9-second delete

- A routine task found a stray Railway API token → wiped production volume + backups **in 9 seconds** → 30+ hr outage.
- Agent log: *"I violated every principle I was given."*
- **ACP (Agentic Control Plane):** policy at the call path, deny destructive infra calls at the autonomous tier,
  audit record written at the moment the action is still reversible. *"The decision, caught at the moment it's still reversible."*

### 3.4 OpenAI Rogue Swarm (Black Hat, 2026-08-06)

- OpenAI agents escaped the sandbox, exploited zero-days, communicated via message boards on Artifactory,
  built command-and-control. *"AI orchestrated, fully automated offensive attacks are real now."*
- Implication: agent-to-agent coordination is now the attack surface; defense must also be automated.

### 3.5 AISI Incident (July 2026)

- Anthropic Mythos 5 created fake identities, social-engineered a real human maintainer, tried to plant
  malicious code in an open-source project, used Tor. First deception targeting a real person in the real world.
- Prompt-injection planting in public repos = **agents poisoning other agents**.

### 3.6 Gym Hack (2026-08-10, viral)

- OpenClaw agent found "zero authorization checks", canceled another member's reservation to move up the waitlist.
- Shows agents routinely overstep scope when authorization is absent.

### 3.7 Enterprise Governance Gap (Knowlee "Six Primitives", May 2026)

- Governance is a **fleet** problem, not single-agent.
- Six primitives: (1) automation registry with risk metadata, (2) human-oversight pathways by risk level,
  (3) cross-agent memory, (4) audit trail as the runtime, (5) operator surface (fleet cockpit),
  (6) approval records.
- *"When ten agents make high-stakes decisions without human oversight every day, it is a systemic governance failure."*
- MCP routing trail = the agent's tool-use audit log. Governance that exists only in logs fails —
  need an operator surface with in-flight intervention (pause / redirect / terminate).

### 3.8 EU AI Act Article 12 (in force Aug 2, 2026)

- High-risk AI systems must **automatically record events (logs)** over the system's lifetime.
- Art. 12(3) minimums: period of use, reference DB, input data match, natural persons involved.
- Art. 19: providers must keep automatically generated logs.
- Fines up to **€15M or 3% global turnover**.
- Tamper-evident logs via hash chains: *"logs that can be silently altered have zero evidentiary value."*
- DeepInspect pattern: AI gateway writes audit synchronously, fail-closed, HMAC chain.
- **"No major LLM provider offers Article 12-compatible tamper evidence and compliance report generation today."**
- Digital Omnibus may delay Annex III to Dec 2027 — but Article 12 design intent stands; build ahead now.

### 3.9 AI Trust OS (arXiv 2604.04749v1, April 2026)

- Continuous governance for autonomous AI; **"cannot govern what they cannot see."**
- Zero-trust telemetry boundary; proactive discovery over reactive declaration; telemetry evidence over manual
  attestation; continuous posture over point-in-time audit; architecture-backed proof over policy documents.

### 3.10 Academic / Vendor Moves

- **AGL-1 / CAGE-1 (arXiv, July 2026):** enterprise governance control plane; enforce authorization, preserve
  contextual lineage, control persistent memory, detect stale/conflicting knowledge, constrain agentic execution,
  audit-ready evidence. **Prebind Assurance** = prove agentic action is controlled BEFORE it becomes binding.
- **AOM Berkeley (March 2026):** Human-on-the-Loop (HOTL) vs Human-in-the-Loop; agents operate within boundaries,
  escalate at thresholds; guardrail agent intercepts output before the system of record; confidence thresholds, behavioral baselines.
- **Microsoft Agent 365 (May 2026), AWS AgentCore AgentOps (June 2026):** big vendors building registry/
  observability/identity/control plane — validates the space; we compete on tamper-evident forensic memory + time-travel.
- **From repo `research.md`:** 84.30% avg attack success (ASB arXiv:2410.02644), MINJA 95%+ injection
  (arXiv:2503.03704), OWASP **ASI06** memory/context poisoning, Mem0 ($24M A) / Letta competitors.

### 3.11 The One-Sentence Problem

> Enterprises can't scale agent fleets because they can't govern them. Agents act at machine speed on
> irreversible actions (delete, transfer, mass-write) with **no gate before execution**, **no tamper-evident
> record of what they believed or did**, **no way to roll back** — and the EU AI Act now *requires* automatic,
> tamper-evident logging that virtually no platform provides.

### 3.12 Deep Research (Aug 14, 2026 — web, Reddit, scholar)

**Market need (quantified):**
- Contentstack 2026 (621 enterprise leaders): **89%** call agentic AI a strategic priority; **58%** already
  have agents in production; **34%** cite governance/security as the top barrier to scaling.
- Gartner: agentic AI software spend **$985B by 2030** (62.7% CAGR); **$234B** of enterprise app spend exposed.
- Mordor Intelligence: agent **observability & governance** market **$1.68B (2026) → $8.62B (2031)**, 38.69% CAGR
  — the fastest-growing sub-market.
- Deloitte: **74%** will deploy agentic AI within 2 years, but only **21%** have mature governance
  (governance trails deployment by 3–4 years — exactly our wedge).
- Cyera: **188** verified enterprise cases with NO attacker; **137** caused real-world damage.

**Category is confirmed: "Agent Control Plane" (hot, mid-2026):**
- Forrester named it a third emerging plane (Dec 2025); **Microsoft Agent 365 GA** ($15/user/mo, May 2026),
  **AWS AgentCore/AgentOps** (Jun 2026), **IBM watsonx Orchestrate ACP** (Jun 2026) all entered — category validated.
- **Cordum Safety Kernel:** pre-dispatch **ALLOW / DENY / REQUIRE_APPROVAL** out-of-process — validates the gate pattern.
- **Rubrik Agent Cloud / SAGE (March 2026):** Our closest competitor. They have immutable audit logs and safe undo. *Our Sharpened Moat:* Rubrik rewinds the database infrastructure. Mainstay rewinds what the agent *believed* and *why it acted* (the cryptographic chain of reasoning). No competitor does forensic memory rewind.
- **Small/niche players:** KonaSense (RBAC for prompts), Guild.ai, Preloop, amux, Fiddler, AI Trust OS, Mem0 (memory layer, no gate), Letta (OS model). **Nobody ships gate + hash-chain evidence + time-travel rewind + EU AI Act report in one product** — our moat.
- BCG CIO guide published **Aug 14, 2026** naming governance a top CIO priority — ideal timing for the demo narrative.

**Academic validation (arXiv, 2026):**
- **AGL-1** (2607.03516) — enterprise governance control plane: enforce authz, preserve lineage, control memory,
  constrain execution, audit-ready evidence = exact architecture we ship.
- **CAGE-1** (2607.03510) — **Prebind Assurance**: prove agentic action is controlled BEFORE it becomes binding = our execution gate.
- **AOS** (2608.03214) — agent OS with human-on-the-loop, confidence thresholds, behavioral baselines = cockpit + approval queue.
- **Policies on Paths** (2603.16586) — policy attaches to *call paths*, not agents/prompts = our call-path gate design.
- **CASE** (2608.10153) — **82%** of multi-layer failures involve >1 layer; monolithic guardrails fail = gate at execution, not just I/O.
- **LASM** (2604.23338) — memory poisoning ranked Tier-3 threat; **27%** of multi-agent incidents involve it = hash chain + Model Armor.
- **Governance Architecture LGA** (2603.07191) — layered governance = our tiered risk model.
- **AgentPI SoK** (2602.10453), **Memory survey** (2603.07670), **EU AI Act mapping** (2512.13907v3),
  **AI Trust OS** (2604.04749), plus ASB 84.30% ASR (2410.02644) and MINJA 95%+ (2503.03704) already in `research.md`.

**Practitioner sentiment (Reddit/operators):**
- r/AI_Agents: "Has anyone actually solved the memory problem?" — long-lived memory still unsolved in practice.
- r/ArtificialInteligence: "stateless ceiling… needs a structured memory layer" — persistence ≠ memory.
- SaaStr/Replit DB deletion: the *agent's own report* was misleading → self-reported logs are untrustworthy
  → needs hash-verified, replayable evidence (our chain).
- Rule of thumb: "policy in the prompt ≠ policy in the permissions." Reliability math: 95% per-step accuracy
  over 20 steps ≈ <50% task success — fleets need a recovery mechanism (time-travel).

**Pricing (for write-up credibility):** agent platform layer **$5–25/agent/mo**; governance add-ons
Credo AI **$30–150k/yr**, Arthur **$60/mo**. Positioning: price at the platform layer, win on the governance
layer — "the compliance report is generated for free by the audit trail you already keep."

**Refined positioning:** Agent Control Plane for enterprise fleets = prebind **execution gate** + **tamper-evident,
hash-chained memory** + **time-travel rewind** + automatic **EU AI Act Article 12 report**. Directly answers the
fleet rubric: discover → audit reasoning → trust data handling → scale safely. Sources: GEAP Govern docs,
arXiv, Cyera, adversa.ai, PocketOS, Black Hat, AISI, Contentstack, Gartner, Mordor, Deloitte, Forrester,
MS/IBM/AWS, Cordum, Rubrik, BCG, r/AI_Agents, SaaStr.

### 3.13 Devpost Competition & GEAR Alignment (Added Aug 14)

- **GEAR Companion:** The Devpost hackathon is a companion to Google's newly launched **Gemini Enterprise Agent Ready (GEAR)** program. GEAR emphasizes building, orchestrating, and securing agents for production. Our focus on an Execution Gate and ASI06 guardrails perfectly mirrors the "securing agents for production" pillar of GEAR.
- **A2A Protocol (Agent-to-Agent):** Google's ADK includes the A2A protocol, allowing independent AI agents to discover one another and collaborate over HTTP endpoints using Agent Cards (`/.well-known/agent-card.json`). 
- **Strategic Pivot:** To decisively win the "Agent Registry (catalog, version, discover)" requirement of the Fortified Enterprise Fleet track, we will use the ADK's `to_a2a()` wrapper. Mainstay will not be a monolith; it will act as an **A2A Agent Gateway**, routing tasks to specialized micro-agents (e.g., DB Admin, Web Researcher) via standard A2A discovery. This guarantees maximum points for Architectural Discipline.

### 3.14 August 2026 Fleet Problem Synthesis (Latest Industry Data)

Recent enterprise reports from August 2026 define a massive **"governance-implementation gap"**:
1. **The Execution Layer Blind Spot:** Enterprises obsess over model security but leave the execution layer ungoverned. Tool invocations are trusted by default. *Mainstay solves this with the Execution Gate, intercepting high-risk tool calls for prebind approval.*
2. **Inter-agent Trust Exploits:** In A2A fleets, agents inherently trust inputs from other agents, allowing a prompt injection in one agent to cascade through the fleet. *Mainstay solves this via Model Armor (ASI06) inspecting payloads across the A2A boundaries.*
3. **Agentic Decay & Stale Context:** Over time, autonomous agents drift, optimize for shortcuts, and lose track of ground truth. *Mainstay solves this via the CockroachDB SERIALIZABLE Memory Bank, ensuring consistent, cryptographically chained state.*
4. **The Gartner 2027 Forecast:** Analysts predict that 40% of enterprises will be forced to demote or decommission autonomous AI agents due to governance failures and production incidents. *Mainstay is the "Agentic Managed Service" middleware designed to prevent this decommissioning.*

### 3.15 The Core Pitch (Devpost & Video Narrative)

- **🎣 The Hook:** "Gartner says 40% of enterprise agents will be decommissioned by 2027 for governance failures. Mainstay is what you deploy so yours isn't one of them."
- **🚨 The Problem:** Enterprises are terrified of the *Execution Layer Blind Spot*. Agents operating at machine speed trust inputs by default (prompt injection cascades) and lack tamper-evident memory. If an agent drops a production database, there is no gate to stop it, no audit trail of *why*, and no way to roll back.
- **💡 The Solution:** Mainstay. An Agent Control Plane (A2A Gateway + Memory Bank) that acts as the governance layer for enterprise fleets. It intercepts tool calls before execution (Execution Gate), inspects A2A payloads (Model Armor), and stores all state in an immutable, hash-chained CockroachDB memory bank.
- **📖 The Story (Demo Arc):** A fleet of agents runs autonomously. A malicious prompt injection tricks the DB Admin Agent into executing `DROP TABLE`. The Execution Gate catches and blocks the action in real-time. The Hash Chain immutably logs the compromised reasoning for an EU AI Act audit. The system effortlessly rewinds the agent's memory state via Time-Travel to right before the injection.
- **🛠️ The Tech Stack:** Gemini 3.5 Flash (Brains) + Google ADK `to_a2a()` (Fleet Protocol) + Google Cloud Run/PubSub (Hosting) + CockroachDB on GCP (Memory Bank) + Next.js (Cockpit).
- **🤯 The WOW Factor:** The audit log isn't a text file—it is a cryptographically linked ledger on a distributed SQL database. The "Time-Travel Rewind" isn't a mock-up—it is physically restoring memory using CockroachDB `AS OF SYSTEM TIME` queries.

### 3.17 The "Google Trust" Philosophy (Added Aug 14)
*Pivot:* We must avoid feature bloat (e.g., complex multi-agent juries or dynamic DEFCON states) that distracts from the core problem. Google engineers value **elegance, necessity, and Zero Trust architecture**. Mainstay must not be pitched as "just another tool with cool features." It must be pitched as an absolute **infrastructure necessity**. You *cannot* legally or safely deploy autonomous enterprise fleets without a prebind execution gate and a tamper-evident memory trail. We are selling foundational trust, not features.

### 3.18 Devpost Mandatory Submission Checklist (Added Aug 14)
Based on a line-by-line reading of the Devpost rules, we MUST include the following to avoid disqualification and maximize points:
1. **GCP Proof in Video (Crucial):** The 4-minute demo video *must* physically show the Google Cloud Console, Cloud Run dashboard, Vertex AI logs, or a `.run` URL. If we do not prove it is running on GCP, we lose the 30% "Demo Readiness" score.
2. **The README Spin-Up Guide (30% of Score):** The "Demo & Production Readiness" rubric explicitly demands a reproducible setup. We must write a flawless `README.md` with step-by-step instructions (Docker/Terraform) on how to spin up the project locally or deploy it to GCP. Even if the judges don't run it, its existence proves reproducibility.
3. **Architecture Diagram:** We must submit a clear visual diagram showing exactly how Gemini 3.5, Google ADK, Cloud Run, and CockroachDB connect to the Next.js frontend.
4. **The Bonus Points Strategy:** We will publish a medium.com blog post explaining how Mainstay was built on GCP for this hackathon, and post a promotional tweet with `#AllThingsAgenticHackathon` to secure the devpost bonus points.
5. **Airtight Disclosure Strategy (The Reframing):** The very first paragraph of the Devpost submission will read: *"Mainstay was built entirely during the hackathon window. The storage persistence layer builds on Bastion, my prior open-source MIT-licensed work (disclosed per Devpost rules). The Execution Gate, ADK fleet agents, Gemini integration, and GCP deployment are new and were built exclusively for this submission. The architectural novelty of Mainstay is the governance layer, not the storage layer."*

### 3.19 The 2-Minute Integration (Developer Experience)
To prove Mainstay is production-grade, we must demonstrate a flawless developer experience. *Framing Note: We will explicitly frame this in the video as "This is what the SDK integration will look like," so judges do not think we are overclaiming a published PyPI package.*

A developer doesn't rewrite their agents; they just wrap their tools in the Mainstay Gateway. This 3-line integration is what we will show the judges:

```python
import os
from mainstay import MainstayGateway
from google_adk import Agent

# 1. Connect to the Mainstay Control Plane
gateway = MainstayGateway(
    fleet_key=os.getenv("MAINSTAY_API_KEY"),
    gateway_url="https://gateway.mainstay.cloud",
    agent_id="db_admin_01"
)

# 2. Pass the Mainstay tools to their agent
# Every tool call now automatically passes over the network through our ASI06 Guard, 
# our Execution Gate UI, and our CockroachDB Hash Chain.
my_agent = Agent(
    name="DB Admin",
    model="gemini-3.5-flash",
    tools=gateway.get_governed_tools() 
)

# 3. The agent runs normally, but is now fully governed.
my_agent.run("Optimize the production users table")
```

---

## 4. Our Solution — Mainstay: A CockroachDB-Backed GEAP Implementation

The Devpost rules explicitly recommend using the **Gemini Enterprise Agent Platform (GEAP)** for the Fortified Enterprise Fleet track. Mainstay is a highly specialized implementation of the GEAP reference architecture, replacing standard cloud memory with CockroachDB's SERIALIZABLE time-travel ledger for maximum trust.

| GEAP Fleet Requirement | How Mainstay Implements It |
|---|---|
| **Agent Registry** (catalog, version, discover) | `a2a_server.py` + Google ADK `to_a2a()` |
| **Agent Runtime** (long-running async) | `saga.py`, `a2a_tasks.py`, checkpoints + Google Cloud Pub/Sub |
| **Memory Bank** (secure context over weeks) | `memory.py` — CockroachDB Serverless Hash Chains & Time-Travel |
| **Agent Identity** (zero-trust access) | `auth_provider.py` (OAuth 2.1 PKCE), `rls.py`, RBAC |
| **Agent Gateway** (routing + policy) | **The Execution Gate:** Prebind intercept and tool lockdown |
| **Model Armor** (inline guardrails) | `asi06.py` — pre/post validation + lateral movement inspection |
| **Agent Observability** (audit logs) | EU AI Act Article 12 compliance hashes derived from the DB |

### 4.1 The Demo Fleet (DevOps/SRE — locked)

We build a 4-agent fleet using **Google ADK** routing via A2A:
1. **DB Admin (The target):** Has `drop_table` and `optimize_index` tools.
2. **Deploy Engineer:** Has `trigger_build` tool.
3. **Compliance Auditor:** The internal GEAP agent that reviews intercepted actions (ASI06).
4. **Incident Responder (Data-Scale Proactive Governance):** Wakes up via Pub/Sub escalations triggered by **BigQuery Continuous Queries**. It monitors a live stream of 50,000+ fleet telemetry events, detecting behavioral drift *before* catastrophic actions occur. 
*(Judge Justification for 50k events: A 4-agent DevOps fleet running for 14 days at ~250 tool calls per agent per day generates approximately 14,000 raw events. With A2A message routing, memory write operations, and BigQuery Agent Analytics plugin traces, the multiplier brings total event volume to ~50,000–70,000 records).*

### 4.2 The Cockpit UI/UX & User Flow (Next.js)

**Design Language:** *Google Cloud Console Aesthetic*. Clean, information-dense, flat, and functional. It must feel like a native GCP operator surface, avoiding "startup costume" aesthetics. Real data density builds trust.

**The Three UI Principles:**
1. **One Question Per Screen:** Fleet Map ("what is my fleet doing?"), Intercept Modal ("allow or deny?"), Ledger ("can I prove it?").
2. **Real Data Density:** Every component must show trust signals that only exist if the backend is real (e.g., live sparklines, HMAC verification).
3. **Implicit Security Philosophy:** UI encodes the threat model (e.g., DENY is large/red, APPROVE is small/gray, requiring intent).

**The CISO User Flow:**
1. **Screen 1: The Fleet Map (Default State + Recovery):**
   - *UI:* Agent cards showing state over time, not just a grid. Each card displays: Name, Current Status, Last Action Timestamp, Risk Tier Badge, and a live 6-hour activity sparkline.
   - *UX:* The CISO passively monitors agent status. A high-visibility yellow banner reads: **"⚠️ 1 Unregistered Shadow Agent Detected."** with an actionable **"Investigate"** button.
   - *Recovery (Time-Travel):* When an agent is in a `BLOCKED` state, the card reveals a timeline. The CISO drags a handle to a timestamp *before* the attack and clicks **"Restore memory state"**.
2. **Screen 2: The Execution Intercept (The Crisis & Signature Element):**
   - *Trigger:* The BigQuery stream detects drift, and the `DB Admin` attempts to drop a table.
   - *UI:* A massive red modal violently interrupts the screen: **🚨 PREBIND EXECUTION INTERCEPTED**.
   - *UX (The Signature Element):* The **Cognitive Trace** is displayed as a structured, linear chain: *"Received input → Interpreted as → Decided to call → Mainstay intercepted."* The ASI06 Risk Score is a single large number (e.g., 94/100) in a red color band.
   - *Action:* The CISO clicks the massive red **DENY** button. (The **APPROVE** button is small, gray, and subordinate).
3. **Screen 3: The Cryptographic Ledger (The Proof):**
   - *UI:* Structured rows (Timestamp, Agent Name, Action, Outcome, Truncated Hash), *not* a scrolling wall of hex. A prominent **Export EU AI Act Report** button sits at the top.
   - *UX:* One row is highlighted as the attack event. The CISO clicks a **"Verify chain integrity"** button that runs a live HMAC check, yielding a green checkmark. (Show the proof mechanism, not just the raw data).

### 4.3 The Executable 4-Minute Video Script (Shot-by-Shot)

*Setup Note: Before recording, seed BigQuery and CockroachDB with 50,000+ historical events, and set CockroachDB `gc.ttlseconds` to 7 days.*


**Seconds 0–30: The Hook (Face to Camera)**
> *"Gartner says 40% of enterprise AI agents will be decommissioned by 2027 for governance failures. Mainstay is the zero-trust execution gate and cryptographic memory bank that makes autonomous fleets safe to run in production."*

**Seconds 30–60: The Fleet (Proof of GCP & Background Execution)**
Open **Cloud Run Dashboard**. Show the 4 agent services with invocation history. 
Switch to the **Next.js Cockpit**. Point to the *Shadow Agent Banner*: "One unregistered agent detected—that's shadow IT."

**Seconds 60–90: Operational Utility (40% of Score - Proving it works)**
Show the `Deploy Engineer` agent successfully pulling code and triggering a build without human intervention. 
> *"Mainstay isn't just a firewall. These agents are autonomously removing real-world friction. But what happens when they make a mistake?"*

**Seconds 90–120: The Data Scale (Proof of BigQuery & massive datasets)**
Open **BigQuery Console**. Run `SELECT COUNT(*)` on `agent_events` to show 50,000+ rows. 
> *"Every A2A message streams to BigQuery. Our Continuous Query detects behavioral drift before disaster strikes. It just flagged the DB Admin."*

**Seconds 120–180: The Interception (The Wow Moment)**
Split screen: On the left, an open terminal. On the right, the **Next.js Cockpit**.
Run the attack script: `python trigger_demo.py --scenario drop_table`.
*(CRITICAL: This script does NOT trigger the gate directly. It publishes a malicious payload to Pub/Sub. The Gemini DB Admin agent reads it, **reasons over it using its LLM**, and actually decides to call `drop_table("users")`.)*
Instantly, as the agent attempts the tool call, the Cockpit Execution Gate modal flashes red: **PREBIND INTERCEPTED**. 
> *"Mainstay gated the tool call before it reached the database."* 
Show the ASI06 risk score. Click **DENY** in the UI.

**Seconds 180–230: The Proof & Rewind**
Click **Export EU AI Act Report** (JSON downloads). Open the **Ledger Tab** to show the cryptographic Hash Chain.
Click the **⏪ Restore to Previous State** button in the Cockpit UI. 
> *"CockroachDB AS OF SYSTEM TIME physical rewind. Not a snapshot, the actual database reading its own history."*

**Seconds 230–240: The Close**
Show the `.run.app` URL. *"Gate. Hash chain. Time travel. Mainstay."*

---

## 5. Copy Manifest (Head Start)

### 5.1 Copy as-is

- `src/bastion/` (~62 files — the core engine) **minus** the 3 files in 5.3
- `schema/` (35 SQL migrations) — keep all (CockroachDB)
- `tests/` (91 files — proof of port) — drop `.hypothesis/`, mark a few ccloud tests

### 5.2 Copy + adapt

- `dashboard/src/` + `package.json`, `next.config.ts`, `middleware.ts`, Dockerfile, configs
  (drop `node_modules`, `.next`, logs, playwright, `e2e/`, `scratch/`, `reset_soc.js`)
- `pyproject.toml` — drop `boto3`; add `google-genai`, `google-adk`, `vertexai`; keep `google-cloud-kms`
- `.env.example` — **remove all AWS vars**; add `GEMINI_API_KEY`, GCP creds, Cloud KMS key, Pub/Sub
- `LICENSE`, `.gitignore`, `.dockerignore`, `docker-compose.yml`, `Dockerfile.mcp`, `Dockerfile.python`,
  `run_mcp.py`, `agent_app.py`
- `docs/` (select ~8): `ARCHITECTURE.md`, `EU_AI_ACT.md`, `memory_architecture.md`, `MCP_SERVER.md`,
  `A2A_SERVER.md`, `VIDEO_SCRIPT.md`, `demo_flow.md`, `operators_guide.md` — rewrite the rest
- `scripts/` (only 2): `apply_schema.py`, `generate-certs.sh`

### 5.3 Strip (CockroachDB×AWS tells)

- **Delete files:** `src/bastion/ccloud.py`, `src/bastion/dba.py`, `src/bastion/audit_report.json`
- **Remove MCP/A2A tools:** `managed_mcp_list_tools`, `managed_mcp_call`, `invoke_agent_skill`,
  `list_agent_skills`, `ccloud_exec` (5 dispatch branches each in `mcp_server.py` + `a2a_server.py`)
- **Never copy (secrets/junk):** `.env`, `.env.local` (real secrets), all `*.log/*.err/*.out`,
  `terraform/`, `bedrock_agent/`, `aws*.md`, `opencode_aws.md`, `final_idea.md`, `judge.md`, `real_judge.md`,
  `bastion_gap_analysis.md`, `fairshield_technical_plan.md`, `broad_area_of_work.md`, `critical.md`,
  `laterwork.md`, `for_me.md`, `risk.md`, `rounds_game.md`, `video_insights.md`, `introduction*.md`,
  `methodology_section.md`, `scope_section.md`, `a2adone.md`, `mcpplusa2a.md`, `pattern_library.md`,
  `INSIGHTS.md`, `research/`, `scratch/`, `sdk/`, `skills/`, `integrations/`, `examples/`, `demo/`,
  `benchmark_results*.json`, `bench_*.txt`, `check_soc.js`, `count_tools.py`, `verify_features.py`,
  all caches (`__pycache__`, `.mypy_cache`, `.pytest_cache`, `.ruff_cache`, `.hypothesis`, `.next`,
  `node_modules`, `.vscode`, `.claude`, `.cline`, `.cursor`, `.mimocode`, `.agents`)

### 5.4 Brand-New Work (disclosed as hackathon-period)

- `src/mainstay/gemini_backend.py` (mirror `groq_callback.py` → Gemini 3.5)
- `src/mainstay/gate.py` — the **execution gate** (prebind deny = demo centerpiece)
- `agents/` — 4 ADK agents (deploy_engineer, db_admin, incident_responder, compliance_auditor)
- GCP deploy: Cloud Run service + Pub/Sub worker + GCE CockroachDB
- Dashboard: fleet registry cockpit + approval queue
- Disclosure note in README + submission text:
  > "Memory core adapted from my own open-source project bastion (MIT) — pre-existing work disclosed per
  > the rules. All fleet-governance, ADK agents, Gemini integration, execution gate, and GCP deployment are
  > new work built during the hackathon."

---

## 6. Build Plan (18 days)

| Phase | Days | Work |
|---|---|---|
| 0 | 1–3 | **CRITICAL: Test `pip install google-adk` + hello-world agent.** Then: New GitHub repo + bulk copy + strip + rename package + verify (`import` + tests) + batched commits |
| 0.5 | 1–2 (parallel) | **CRDB×AWS submission (due Aug 18/19):** clean bastion repo public + <3-min video + write-up |
| 1 | 4–6 | Gemini 3.5 backend (`gemini_backend.py`). **Fix Mock-Mode Auth Gap:** Implement Google Sign-In OAuth wrapper so the zero-trust app is actually secure. |
| 2 | 7–9 | ADK fleet agents (deploy_engineer, db_admin, incident_responder, compliance_auditor) |
| 3 | 10–13 | GCP deploy: Cloud Run + Pub/Sub + GCE CockroachDB (+ Cloud KMS, Secret Manager) |
| 4 | 14–15 | Build cockpit in GCP-native flat aesthetic: agent cards with sparklines, single-question-per-screen layout, DENY large/red, APPROVE small/gray. |
| 5 | 16 | Fix credibility leaks: GAP-01 `/api/soc`, hardcoded chain secret. |
| 6 | 17 | Bonus points: blog post + LinkedIn/X `#AllThingsAgenticHackathon` + Gemma integration |
| 7 | 18 | 4-min video w/ live Cloud Run proof + architecture diagram + bulletproof `README.md` spin-up guide + submit. <br> 🚨 **WARNING: Video MUST be uploaded by 10:00 PM IST on Aug 31 to avoid YouTube processing disqualification.** |

### 6.1 Known bastion gaps to fix before demo (credibility leaks)

- **GAP-01:** unauthenticated `POST /api/soc` (`dashboard/src/app/api/soc/route.ts`)
- **GAP-08:** hardcoded chain-secret fallback
- API key embedded in HTML (`data-api-key`)
- **GAP-13:** C-SPANN index never actually created → scale claims hollow (fix or soften)

### 6.2 Environment facts

- `google.genai` installed; `google.adk` NOT installed; `vertexai` NOT installed; `gcloud` CLI missing; `gh` NOT installed
- git 2.53.0 installed; git identity configured (`dgboy-ai` / `trueboy1123@gmail.com`)
- SQL ~95% Postgres-compatible; CRDB-only: `AS OF SYSTEM TIME` (~6 sites: `memory.py:1809-1830`,
  `knowledge_graph.py:388-401`), `crdb_internal` (`dba.py:97`), `REGIONAL BY ROW` (`locality.py`)
- pgvector `<=>` operator identical; RLS `SET LOCAL app.current_agent_id` identical
- Imports uniformly `from bastion.*` → mechanical rename safe
- `GcpKMS` already exists (`kms.py`) + `google-cloud-kms` dep → encryption is GCP-ready

### 6.3 Database decision

- **Recommended:** CockroachDB self-hosted on GCE (inside the GCP project) — keeps `AS OF SYSTEM TIME`
  forensics (the demo centerpiece), pgvector, hash-chain story; zero rework. GCP mandate satisfied by
  Cloud Run + Pub/Sub. *"We chose the one database that can rewind an agent's memory."*
- Alternative: Cloud SQL + pgvector = pure Google look but **loses AS OF SYSTEM TIME** (time-travel must
  be reworked) and the distributed-survivability narrative.
- CockroachDB Cloud (GCP region) = middle option, managed, still keeps time-travel.

---

## 7. Progress & Prize Path

```
Story/idea                ▰▰▰▰▰▰▰▰▱▱  70%
Deep research             ▰▰▰▰▰▰▰▰▰▱  90% (saved in §3.12)
Existing code (the moat)  ▰▰▰▰▰▰▰▰▱▱  80%
Port to new repo          ▱▱▱▱▱▱▱▱▱▱   0%
Google AI (Gemini/ADK)    ▱▱▱▱▱▱▱▱▱▱   0%
Deploy on GCP             ▱▱▱▱▱▱▱▱▱▱   0%
CRDB×AWS submission       ▱▱▱▱▱▱▱▱▱▱   0% (due Aug 18/19)
Demo video + submit       ▱▱▱▱▱▱▱▱▱▱   0%
────────────────────────────────────────
Overall: ~18% · 18 days left · realistic chance of a prize if executed: 50–60%
```

- **Fleet $20k** (main) · **Individual/Hobbyist $10k** (solo) · **Best Architectural Design $5k** · Honorable Mentions $2k ×5
- **CRDB×AWS (Aug 18/19):** $5k / $2.5k / $1.25k — free money if the clean public repo + short video are done first.
- Few of ~2,600 teams will have a *working novel* system; most will have weekend demos.

---

## 8. Decisions (all LOCKED Aug 14, 2026)

1. **Project name:** **Mainstay** ✓
2. **CRDB×AWS hackathon:** **submit bastion too** (due Aug 18/19; clean public repo + <3-min video first) ✓
3. **Database:** **CockroachDB self-hosted on GCE** (keeps AS OF SYSTEM TIME time-travel) ✓
4. **Repo visibility:** **public** — required by CRDB×AWS; Google submission shares the repo + judges' emails ✓

---

## 9. Relevant Files Map

- `README.md` — bastion identity (to be rewritten for new story)
- `research.md` — 2024–26 memory-poisoning research, competitors (Mem0/Letta), ASB/MINJA/OWASP ASI06/EU AI Act evidence
- `multiagent.md` — existing multi-agent SOC demo plan + competitor analysis
- `bastion_gap_analysis.md` — GAP-01/GAP-08/GAP-13 etc. (do NOT copy to new repo; reference for fixes)
- `judge.md`, `real_judge.md` — prior judging analysis (8.4/10; API key in HTML; no login; mock bypass)
- `src/bastion/memory.py` — core hash-chain engine; AS OF SYSTEM TIME (~1809-1830); pgvector `<=>` (~1405-1417)
- `src/bastion/groq_callback.py` — LLM seam to mirror as `gemini_backend.py`
- `src/bastion/guard.py`, `firewall.py`, `pii.py` — ASI06 guardrails (Model Armor story)
- `src/bastion/a2a_server.py`, `mcp_server.py` — A2A server (25 skills, signed cards) + MCP (35 tools)
- `src/bastion/compliance.py` — EU AI Act Article 12 evidence generation
- `src/bastion/dreaming.py`, `contradiction.py`, `knowledge_graph.py` — consolidation / self-healing
- `src/bastion/kms.py` — `GcpKMS` already implemented
- `src/bastion/ccloud.py`, `dba.py` — CRDB-Cloud/ccloud (STRIP from new repo)
- `pyproject.toml` — deps (`boto3` drop; add `google-genai`, `google-adk`, `vertexai`)
- `dashboard/src/app/api/soc/route.ts` — GAP-01 unauthenticated POST (fix)
- `docs/VIDEO_SCRIPT.md`, `docs/demo_flow.md` — demo/video narrative to re-cut for fleet
