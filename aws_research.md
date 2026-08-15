# Good Neighbor — Hackathon Research (Strands + AgentCore)

## 1. Competition Landscape

### Submissions (as of Aug 11 2026)
- Total: **59 participants**, **108 submissions**
- Teams: 10
- **No one has submitted to any track yet** — most activity is "setup done, coding begins"
- Stated deadline: Sept 15 2026

### 12 Tracks
1. Open Source for AI Agents (code only, no docs)
2. Dev Tools / Frameworks (code only)
3. Best Agent Built with Strands Agents SDK (code + demo)
4. Best Agent Built with Amazon Bedrock AgentCore (code + demo)
5. Best Use of Amazon MemoryDB for Agents
6. **Good Neighbor** (code + demo)
7. Best Agent for Health & Wellbeing
8. Best Agent for Financial Innovation (Banking, DeFi, Capital Markets)
9. Best Agent for Supply Chain & Logistics
10. Best Agent for Agriculture & Environment
11. Community Choice (no code needed — just a repo with description)
12. Most Ambitious Failure

### Judging Criteria (Stage Two — 5 EQUAL criteria; see 6. Judges & Criteria in rules)
> NOTE: The official rules page lists a TWO-STAGE process. Stage 1 = pass/fail viability (fits theme + applies tools). Stage 2 = 5 equally-weighted criteria scored 1–5, plus up to +0.6 blog bonus (max 5.6). No separate "Community Benefit" line; instead "Potential Impact" covers it (Good Neighbor community weighting is thematic, not a separate box on the current rules page).

| # | Criterion (equal weight) | Our lever |
|---|---|---|
| 1 | **Technical Implementation** — thorough/skillful Strands use; genuine effort, working non-trivial; live demo + AgentCore deployment strengthen | Real agent loop + memory + durable HITL + guard on AgentCore + live demo |
| 2 | **Design** — complete coherent product experience, not a PoC | Back-office deputy UI: inbox + decision cards + audit |
| 3 | **Potential Impact** — credible specific real problem for real audience, solution actually addresses it | Coordinator burnout, 15-20 hr/wk admin, FCRA compliance gate |
| 4 | **Creativity & Originality** — creative non-obvious Strands use + genuine problem-space understanding | Decision receipts + tamper-guard + relationship memory |
| 5 | **Presentation** — video demos end-to-end; pitch clear (problem/who/why) | 5-min beat-script, 90s demo, honest limits |

### Judges (from rules page)
- **Vijay** — AgentCore
- **Dylan** — Strands
- **Vivek** — MemoryDB
- **Ross** — Community

---

## 2. Strands Agents SDK

### Overview
- **Open source** (Apache 2.0, 6800+ stars as of 2026)
- **TypeScript + Python** support (Python more mature; TS functional with `@strands-agents` and `@strands-agents-tools`)
- Model-first: the LLM is the orchestrator. No complex workflow graphs, routers, or state machines.
- From Amazon, but **cloud-agnostic** — runs on any LLM, any infra

### Code Structure
```typescript
import { Agent } from '@strands-agents/agent';
import { tool } from '@strands-agents/tools';

const agent = new Agent({
  model: 'anthropic.claude-3-5-sonnet',
  systemPrompt: '...',
  tools: [toolA, toolB]
});

const result = await agent.invoke({ prompt: '...' });
```

### Key Capabilities
- **@tool decorator** — any function becomes an LLM-callable tool
- **Session management** — FileSessionManager, S3SessionManager, DSQLSessionManager
- **Checkpointing** — checkpoint agent state, resume later (Durable Execution)
- **Multi-agent patterns** — Graph, Swarm, Agent-as-Tool
- **MCP integration** — use any MCP tool, serve your own MCP server
- **OTEL observability** — traces, metrics, logs via OpenTelemetry SDK
- **Guardrails** — input/output hooks, safety checks

### Code Samples
- Strands TypeScript SDK: `samples/` folder at `https://github.com/strands-agents/sdk-typescript`
- Amazon Bedrock AgentCore Samples: `https://github.com/strands-agents/agentcore-samples`

---

## 3. Amazon Bedrock AgentCore

### What It Is
- Fully managed runtime for running AI agents in production
- Handles identity, networking, orchestration, compute lifecycle, observability
- Supports **both managed and BYOC (bring your own container)**
- Works with **any framework** (LangChain, CrewAI, Strands, custom)
- Works with **any LLM provider** (Anthropic, Meta, OpenAI, Cohere, DeepSeek)

### Two Paths

#### Path A: Strands + AgentCore (lightweight, agent-native)
- **AgentCore Runtime (CodeZip)** — deploy a zip with your agent code, agent is orchestrated by the framework
- **AgentCore Gateway** — connect to MCP tools
- **AgentCore Browser** — managed browser for web agents

#### Path B: Full AgentCore (enterprise-grade)
- **AgentCore Identity** — workload identity for LLM access
- **AgentCore Networking** — no public egress, static IPs
- **AgentCore Compute** — containers with custom images (CPU/GPU, EFS, IMDS)
- **AgentCore Observability** — traces, metrics, audit logs
- **AgentCore Memory** — multi-tenant, user-scoped, semantic search

### AgentCore Memory (Critical Feature)
- **Short-term memory (Events):** Chronological list of actions/events for an endpoint
- **Long-term memory (Strategies):** Proactive consolidation:
  - Semantic memory: factual knowledge, relationships
  - Preferences: user likes/dislikes, routines, sentiment
  - Summarization: condensed context of prior interactions
- **Immutable Audit Trail:** INVALID (not DELETE) for deleted records
- Agent itself decides what to remember (no rule templates)
- Multi-tenant isolation by endpoint, tenant, and user IDs

### Deployment Flow (CLI)
```bash
# Create runtime
agentcore-controlplane create --name my-agent --region us-east-1

# Local development
agentcore-dev run --agent-dir ./my-agent --harness mode0

# Deploy
agentcore-dev deploy --agent-dir ./my-agent

# Invoke
agentcore-dev invoke --name my-agent --input '{"prompt":"..."}' --region us-east-1
```

### Build Options
- **CodeZip:** Zip source + Dockerfile + requirements.txt → pushed via agentcore-controlplane
- **Container:** Custom Docker image on ECR, pushed via agentcore-controlplane (includes agentcore-runtime-py as dependency)

---

## 4. Bastion Patterns Worth Reusing (Design Only)

### Agent Memory
- **Core memory tables:** `facts`, `safety_rules`, `episodic`, `semantic`, `user_preferences`
- **Dreaming/consolidation cycle:** episodic → semantic, prune low-value, consolidate duplicates
- **SHA-256 hash chain** for tamper-evident audit trail
- **C-SPANN vector index** for semantic search
- **Contradiction detection** across memories
- **Time-travel queries** (AS OF SYSTEM TIME)

### A2A Server
- **INPUT_REQUIRED state:** agent pauses, returns status + options to dashboard for human approval
- Agent resumes after human decides — the "pull" model, not push
- **Decision receipts:** every human override gets a decision_record (user_id, timestamp, original prediction, human_verdict, override_reason)

### Guard System (Prompt Injection)
- **OWASP ASI 06 compliance**
- Two-phase: lightweight pre-screen + on-match deep
- Semantic drift detection (vector similarity of embedding vs original prompt)
- Role-play detection (system instructions + known jailbreak families)
- **Output filtering:** agent sees filtered prompt but doesn't know what was stripped

### Human-in-the-Loop
- Decision gating for high-stakes decisions
- Confidence-based escalation
- Transparent decision receipts

---

## 5. Domain Research: Volunteer Management 2026

### Key Statistics

#### Rosterfy UK State of Volunteer Management 2026
- **386** volunteer managers surveyed, fieldwork Apr-May 2026
- 92% say volunteers critical to organisation's success
- 37% say volunteers have never been more critical
- 66% say volunteer management more challenging than last year
- Recruitment slightly easier: 46% say easier (up from 35% in 2025)
- 57% increased volunteer numbers vs last year

**AI in Volunteering:**
- 54% now using AI, almost entirely for writing tasks
- Writing role descriptions (51%), general communications (48%), social media posts (42%)
- Fewer using for: analyzing volunteer feedback (23%), impact reports (27%), skills→role matching (2%)
- Attitudes: 36% hopeful, 37% neutral. Most fears: erosion of human judgment/relationships (46%), data protection/privacy (43%)

**Volunteer Management Software (VMS):**
- 48% use VMS (up from 38% in 2025)
- Under 150 volunteers: majority still spreadsheets
- VMS motivations: oversight/compliance (82%), reducing workload (81%), tracking retention (73%)
- Connected systems: 89% agree, 70% disagree "our system operates in silo"
- AI use in VMS: analyzing feedback (23%), impact reports (27%), skills→roles (2%)

#### Serve.Love
- ~4-15 hrs/week manual admin: reminders, scheduling, no-show follow-up
- ~780 hrs/yr admin bloat per manager

#### Community of Practice (May 2026)
- 152,000 volunteers across 118 orgs
- Inbound applications doubled in one month
- One team lost 60 hrs to one event coordination

#### Urban Institute (Dec 2025)
- 35+ million volunteers across ~1.5M nonprofits
- ~70% of nonprofits rely on volunteers for core services

### Burnout Research
- Funding demands + job overload predict burnout among managers of volunteers
- Community support sector most affected
- Moderators: value-expressive meaning of work, affective commitment
- Abstract: "How Does a Nonprofit Job Affect the Well-Being of Its Employees?"

### Academic: Homebrew Databases (CHI 2023)
- 15-month ethnography + interviews with 14 volunteer coordinators
- "Information management is not the real work of volunteer coordination; it is overhead"
- Organizations run on ad-hoc spreadsheets/personal tools ("homebrew databases")

---

## 6. Case Studies & Product Landscape

### Urban Food Alliance — "From Chaos to Calm" (Nov 2025)
- Agentic AI workflow rescued overwhelmed volunteer coordinator from inbox overload
- **Pain:** 15-20 hrs/week of repetitive emails (onboarding forms, application status, required docs)
- **Solution:** Azure Function Agent + Logic App + Power Automate + SharePoint + Teams
- **Outcome:** 80% autonomy on routine queries, human-in-the-loop for low-confidence
- **Key quote:** "Agentic workflows are not just tools—they are the backbone of next-generation volunteer coordination"
- **Key insight:** workflow "grounded in a single trusted source of truth"

### VolunteerHub — Screening Guide (June 2026)
- Role-based screening/background checks now standard expectation
- Different roles need different checks (driving, working with children/vulnerable, financial handling)
- **Insurers, grantmakers, government partners** now expect documented screening policies as funding condition
- Annual or biennial rescreening recommended for ongoing volunteers
- Risk-based approach: high-risk roles need more frequent checks

### MeridianMosaic (Product Hunt, May 2026)
- "Your AI volunteer coordinator"
- Multi-channel triage (SMS, email, Facebook, Google), auto-assign, auto-reminders, retention dashboard

### SubHome (2026)
- AI-first HOA/community management platform
- 30,000+ residents across 150 communities

### ChaseAI (Product Hunt, March 2026)
- AI debt recovery for SaaS/Marketplaces
- Real-time subscription tracking, natural language dunning

### HeyBRB (Product Hunt, May 2026)
- Dead-person invoicing + subscriptions
- Cross-platform accounts (150+ integrations), auto-survivorship transfer

---

## 7. Dunning / Unpaid Invoice Landscape

### Current Solutions
- **ChaseAI**: SaaS dunning automation for subscription businesses
- **Chasivo**: AI-powered WhatsApp + email debt collection
- **Chasa**: "Dunning for Humans" — subscription churn + payment recovery
- **SubHome**: AI for HOA/community management
- **HeyBRB**: Subscription death admin + deceased estate

### Unique Dunning Insight (Unsolved)
- **"Never chase an invoice that was paid yesterday"** — current solutions don't distinguish old from new invoices
- **"Per-client payer memory"** — persistent memory IS the killer feature, not just templates
- Client-by-client context: payment history, escalation style, past disputes, preferred communication channel

---

## 8. Market Gaps Identified

### "Nobody Solved" Problems
1. **Cross-track unification**: no single agent works across professional + nonprofit + personal
2. **Memory-as-core**: existing tools don't have persistent per-payer or per-person memory across sessions
3. **Judgment under constraint**: no agent that says "I wouldn't do this" and lets you override + learn
4. **Nonprofit compliance/screening automation**: despite 82% listing compliance as VMS motivation, 2% use AI for skills→role matching
5. **Audit-grade decision receipts**: funders/insurers require documented screening policies but no tool provides automated audit trails for volunteer screening
6. **Email-driven indirect prompt injection protection**: no agent in any space addresses this threat (proven real by Darktrace/Microsoft in 2026)

---

## 9. Attack / Poisoning Scene (Stretch)

### Threat Landscape (2026)
- **Darktrace (Aug 5 2026):** enterprise AI agents vulnerable to indirect prompt injection via email
- **Microsoft (June 2026):** security research on AI agent prompt injection attacks
- **Proofpoint (June 2026):** email threats targeting AI agents
- **Morris II worm (2026):** self-propagating attacks on AI agent systems
- **ShadowLeak (2026):** zero-click RAG data exfiltration
- **EchoLeak CVE-2025-32711:** zero-click Microsoft 365 Copilot email exfiltration

### Defense Angle
- Agent receives attachment → attachment contains hidden instructions → agent follows them
- Bastion guard: OWASP ASI06 compliance, two-phase detection, semantic drift, role-play detection
- Output filtering: agent sees filtered prompt but doesn't know what was stripped
- This is the **most differentiated** angle — Bastion's guard applied to nonprofit email intake

---

## 10. AWS Budget Breakdown

### Demo-Only (~$10-30 of $200)

| Service | Est. Cost | Notes |
|---|---|---|
| Bedrock Claude 3.5 Sonnet | ~$5-15 | Agent LLM |
| AgentCore Runtime | ~$0-5 | Free tier for demo |
| Lambda (500K invocations) | ~$0 | Free tier |
| EventBridge | ~$0 | 14M events/mo free |
| SES (62K emails/mo) | ~$0 | Free tier |
| S3 (5GB) | ~$0 | Free tier |
| CloudWatch Logs | ~$0 | 5GB free |

### Budget Left
- ~$170-190 remaining for: extended demo, production testing, or backup
- **$50 credit:** REQUEST via form https://forms.gle/6sjzKiX6bKUMA5NEA by **Sept 11 12pm PT** (from Official Rules). Credits expire Oct 31. Only for registered individuals.

---

## 11. Official Rules — Critical Operational Facts (from Devpost rules page)

### Dates (use REAL dates, not the March draft)
- Submission Period: **Mon Aug 10 2026 9am PT – Mon Sep 14 2026 5pm PT**
- Judging: Sep 15 2026 – Oct 8 2026
- Winners: ~**Oct 14 2026**
- Timeline: ~35 days left (today Aug 11 2026)

### Eligibility (IMPORTANT)
- Must be age of majority; teams orgs OK
- **Excluded countries**: Argentina, Australia, Brazil, Hong Kong, Indonesia, Italy, Malaysia, Philippines, Thailand, Vietnam, Singapore, Belarus, DNR/LNR, UAE, Quebec, Russia, Crimea, Cuba, Iran, North Korea, Syria, OFAC-designated.

### Submission Requirements (REQUIRED — checklist)
1. Project built with required dev tools + passes Project Requirements
2. **Text description** — features & functionality
3. **PUBLIC repo URL** (github/gitlab/bitbucket) — all source + assets + instructions, **MIT/Apache license file visible at top of repo (About section)**
4. **README**
5. **Architecture Diagram**
6. **Video ≤ 5 min** covering:
   - demo of working project
   - pitch: (1) problem, (2) who it's for, (3) why it matters
   - slides/screen-recording/voiceover OK; no need on camera
   - uploaded to **YouTube or Vimeo, public**
7. **AWS Builder ID**
8. (Optional) **Live demo link** — boosts Technical Implementation
9. (Optional) **builder.aws Blog Post** — up to **+0.6 pts** (0.2 each, multiple allowed) with hashtag #AgentsforHumans

### Testing requirement
- Must provide access (link/demo/test build) free of charge; if private include login creds. Judges may judge solely on text+images+video.

### Two-Stage Judging (real, from rules)
- **Stage 1 (pass/fail)**: reasonably fits theme + reasonably applies required tools (Strands/AgentCore).
- **Stage 2 (equally-weighted 1–5, +bonus 0.6 → 5.6 max)**:
  1. **Technical Implementation** — thorough/skillful use of Strands; genuine effort, working non-trivial; live demo AND/OR AgentCore deployment strengthen
  2. **Design** — complete, coherent product experience, not just PoC
  3. **Potential Impact** — credible, specific case for real problem for real audience; does solution actually address it
  4. **Creativity & Originality** — creative, non-obvious use of Strands; genuine understanding of problem space
  5. **Presentation** — video demonstrates end-to-end; pitch clear (problem/who/why); easy to follow
- **Tie-break**: highest score in first applicable criterion, then next, then judge vote.

### Prizes (real)
- **Grand Prize $10,000** (1) — any eligible submission
- **Good Neighbor track**: Golden $5000, Silver $3000, Bronze $2000 (1 each)
- Also Everyday & Professional tracks (same amounts)
- One prize per project. Verification via affidavit + W-9/W-8BEN.

### Key rules gotchas
- **New Projects Only** — built during Submission Period; disclose pre-existing code/assistants. (Bastion patterns = inspiration, not code reuse.)
- One project = one prize.
- License must be OSI (MIT/Apache).
- The 3 Equal Criteria the survey referenced earlier was an old/draft version — **the CURRENT rules use the 5-criteria Stage-2 set above**. Align presentation to these 5.

---

## 12. Deep Competitor Analysis (2026 Volunteer Management Software)

### Market structure (from buyer's guides 2026)
- **Consolidating fast (Mar 2026)**: Better Impact acquired Galaxy Digital (Get Connected); InitLive → Bloomerang Volunteer; Mobilize → Bonterra; Sterling → First Advantage.
- **No general VMS does background screening or identity verification natively.** They integrate a separate screening vendor (Checkr, Sterling). None verify "the volunteer truly is who they claim."
- Pricing: from free (SignUpGenius, POINT, Golden, CERVIS) to $100-400/mo mid-market, to $7k+/yr enterprise (Rosterfy).

### The main competitors
| Product | Position | Screening? | AI? | Weakness we exploit |
|---|---|---|---|---|
| **Better Impact / Volunteer Impact** | Mature all-in-one; 85k+ orgs | Integration | Ruled/words | Heavy, enterprise-priced, no agent that acts |
| **VolunteerHub** | Mid-large, flat pricing ~$143-288/mo | Integration | limited | Compliance-focused but no autonomous agent w/ memory |
| **Rosterfy** | Enterprise, events, $7k/yr | Integration (WWCC) | Auto onboarding/clerts | Pricey, big-org; misses tiny-single-coordinator |
| **Bloomerang Volunteer (InitLive)** | Large events, donor-CRM tie | Some native | limited | Integrates with CRM; not email-first back office |
| **Volgistics** | Budget multi-site | Integration | no | No agent |
| **POINT / Golden / SignUpGenius** | Free/small | minimal | minimal | Consumer signup, not back-office deputy |
| **Galaxy Digital (Get Connected)** | Portals, engagement tracking | Integration | limited | Now part of Better Impact |
| **VolunteerBadge** | **AI-first screening disruptor** | **Native $5 + biometric ID** | **Built-in "Victor" AI teammate, reply drafting, screening intel** | **CLOSEST COMPETITOR — see threat section** |
| **VolunteerReady** | Matching + FCRA Checkr/Sterling | Integration | Matching engine | Nearby — matching + screen pipeline |
| **Civic Champs / TeamKinetic / Helper Helper** | Small, spreadsheets-replacement | — | limited | No autonomous agent, no memory, no decision receipts |

### VolunteerBadge — the closest direct threat (Watch closely)
- Positioning: "not software with AI bolted on... built AI-first — a teammate that runs your screening, drafts your replies, writes your grants."
- "Victor, your AI teammate — does the work, not just the talking."
- Features overlap our vision: AI Reply Assistant (grounded, human-approved, never sends on own), Screening Intel (plain-English explanation + confidence scoring + adjudication support), Smart Matching, compliance roster, adverse-action generator, $5 FCRA checks, biometric identity verification.
- **Key differences we can still own (their gaps):**
  - Their AI reply is **draft-for-review only** ("never sends on its own") → we can do **autonomous low-risk send with human gate on high-risk** (degree of autonomy).
  - No **persistent per-volunteer relationship memory across sessions** (relationship = the coordinator's institutional knowledge).
  - No **tamper-evident / prompt-injection guard on email intake** (they process email but don't harden against hidden instructions).
  - No **audit-grade decision receipts** (which policy/record/notice-step justified a screening decision) for funders/insurers.
  - Not **email-backed-office-first**; it's a SaaS hub, not an agent that lives in the coordinator's existing inbox.

### Standalone AI "volunteer coordinator" products (closest to our red ocean)
- **MeridianMosaic** (Product Hunt May 2026): "Your AI volunteer coordinator" — multi-channel triage (SMS/email/facebook/google), auto-assign, auto-reminders, retention dashboard.
- **US Tech Automations** (agentic workflow routes): capture → normalize → screen → route → confirm; 40min/application → ~6hr/mo exception handling; time-to-first-contact 6 days → 5 min; claims ~31 recovered volunteers/mo.
- **One Hundred Nights** AI-agents-for-volunteers: skill-based matching + onboarding automation + compliance/audit-ready records.
- **Takeaway**: the "AI volunteer coordinator" meme EXISTS. If we do "another AI volunteer coordinator," we are in a crowded red ocean of low-differentiation. To win we must lead with something none of them own: **audit-proof decision receipts + tamper-evident guard + whole-person relationship memory**, positioned as the **back-office deputy (not a scheduler/matcher)**.

---

## 13. Deep Critical Problem Analysis

### P1. Compliance / Screening pipeline is the highest-stakes, least-automated, most defensible
**The FCRA two-step adverse-action trap (THIS IS GOLD):**
- FCRA 15 U.S.C. §1681b(b)(3) explicitly applies **"any person"** — **no carve-out for nonprofits/volunteer coordinators** (VolunteerBadge, LegalClarity, Volunteer Maine).
- **Volunteer screening counts as "employment purposes" under FCRA** (FTC).
- **Pre-Adverse Action Notice (3 non-negotiable items):**
  1. Copy of the **full consumer report** (not summary)
  2. CFPB **"Summary of Your Rights Under the FCRA"** (current version, cannot paraphrase)
  3. **Intent letter** (considering adverse action)
- **Waiting period**: min **5 business days** (FTC interpretation); 7-10 recommended; some states local minima (Philadelphia 10bd, NYC position-open 5bd, WA 2bd hold 2026).
- **Dispute-hold**: if applicant opens dispute, CRA reinvestigation 30d (max 45d) — **no final action while open**.
- **Final Adverse Action Notice** (must include): CRA name/addr/phone; statement CRA didn't decide; right to free report in 60d; right to dispute.
- **Retention**: keep records ≥ 5 years (FCRA statute of limitations). Destroy after.
- **State overlays**: ban-the-box, look-back limits (PA 7y felony/4y misdemeanor; MA CORI 3y/7y; CA, MI, DC), Fair Chance laws, individualized 8-factor analysis, Massachusetts DCJIS registration.
- **Common violations (class-action territory)**: moving too fast (<5bd), disclosure form with extraneous language (liability waivers = defective disclosure → class actions), treating matrix as automatic disqualifier (must do **individualized assessment**: nature+gravity, time elapsed, job-relatedness), skipping co-applicant notice, ignoring state add-ons.
- **Ongoing monitoring / rescreening**: annual-biennial; continuous monitoring options; same FCRA disclosure/authorization applies.
- **FCRA litigation rose 36% YoY through end of 2025** → this is hot, real, pay-worthy.

**Why an AGENT is uniquely suited (not just a SaaS portal):**
- The two-step + 5-day wait + dispute-hold + state overlays + retention is a **stateful, time-triggered, precedence-heavy process** — exactly what memory + tool-calling agents do well and spreadsheets/VMS do badly.
- The coordinator currently tracks this **"by memory"** → missed docs, missed timelines, wrong report version = liability + lost funder/insurance.
- This is where **decision receipts + audit trail + guard** stop being gimmicks and become THE defensible value: *which policy version*, *which record*, *which notice step is due next*, *which report was relied on*.

### P2. The "undocumented operating system" / institutional knowledge loss
- Coordinator avg tenure **~18 months** (VolunteerHub). ~42% of institutional knowledge is unique to the role-holder (knowledge management research).
- "When a burned-out coordinator leaves, they take years of relationship history" — who brings cookies, who can only work Tuesdays, which volunteer needs a gentle heads-up.
- **Transition is the reset**: first 3-6 months hardest; programs "limp not fail"; volunteers notice instability → disengage.
- **The admin ramp (Scalability Tax)**: 1hr/10 volunteers → 10hr/50 → collapses at 500. Non-exponential, it's exponential.
- **Fragmented tech stack**: 6-8 disconnected apps, human "integration layer" copying data 5x, everyone's a separate login/handoff. "You can't integrate your way out of fragmentation by buying more fragments."
- **This is the STRONGEST NEW ANGLE**: **persistent whole-person relationship memory** = the coordinator's institutional knowledge held in the agent, surviving turnover. The agent IS the continuity officer (Energize's "Continuity Officer" concept, 2003 — still unsolved 23 years later).
- **The key measurable**: ~15-20 hrs/week admin per coordinator (US Tech Automations: 15-20hr/wk mid-size; Nonprofit Times Staffing Survey: 60%+ of coordinator time on admin).

### P3. Burnout is the root cause — and the emotional hook
- **29% of volunteer managers report burnout; 28% say expectations unrealistic** (Rosterfy 2025/2026).
- 95% of nonprofit leaders cite burnout as concern; 75% say it impacts mission.
- Scottish voluntary sector: 1 in 5 staff took time off due to stress (double a decade ago); 1 in 4 volunteers considering quitting.
- "Burnout doesn't look like a dramatic exit. It looks like a Sunday in October when the admin opens the spreadsheet and can't face one more week." → **this is the 30-second video hook.**

### P4. Onboarding / screening volume (quantified, current)
- Avg **~40 min per youth-program application** for screening+routing → 95 such apps = **63 hrs/month** on one program (US Tech Automations, 2026 with four-program food nonprofit).
- Time-to-first-contact 6 days → under 5 min with automation; recovers ~31 lost volunteers/mo at 33% drop-off on slow follow-up.
- 1 in 5 nonprofit CRM records duplicate/dirty.

### P5. AI-in-sector is shallow (the open floor)
- 54% use AI but "almost entirely for writing tasks"; **skills→role matching only 2%**; analyzing feedback 23%; impact reports 27%.
- VMS #1 motivation = **oversight/compliance 82%**; #2 reducing workload 81%.
- **The sector fears the AI (erosion of judgment 46%, data protection 43%) → a transparent, human-gated, audit-proof agent directly addresses the fear.**

---

## 14. Winning Patterns (2026 hackathon post-mortems, research-backed)

### The meta-findings that decide winners
1. **Demo quality is the #1 predictor** for solo competitors (Alpha-Hack: within-event IC +0.122; submission completeness +0.122). Tech-stack sweet spot 4-5 tags.
2. **Lead with the problem** — make judges share the frustration (Jono Bacon). If they don't feel the problem, nothing lands.
3. **One thing working end-to-end beats five half-built.** Scope ruthlessly. One "oh, this is possible now" moment > feature tour.
4. **Show working in ~90 seconds.**
5. **Pre-fill demo data. Mock slow APIs. Remove every stall point.** Pre-fill forms.
6. **Be honest about what works/doesn't** — honesty reads as confidence.
7. **Judge scorecard (5 questions):** (a) explainable in 1 min? (b) demo = behavior not slides? (c) AI necessary? (d) target user clear? (e) limits named honestly?
8. **Blueprint for a winning 3-min pitch:** Hook (20s, concrete cost) → Problem deep-dive (30s, why existing fails, quantify, urgency) → Solution (40s, core innovation + uniqueness) → Live demo (60s) → Tech (20s) → Impact/next (10s).
9. **Real agents ACT, not chat.** "The toys all talk. The real ones do." Irreversible action is where agents are worth building. Confirmed by Sentry Autofix (writes mergeable PRs), Amazon's internal network agent (~80% root causes, built on Strands), Coinbase wallet agent.
10. **Judging criteria presentation structure** (2026): 40% technical innovation, 40% problem-solution fit + business viability, 20% demo.
11. **Judge rubrics reward evaluation + safety, not novelty theater**: tool-use accuracy, cost/run, latency, hallucination rate, guardrails/refusal conditions, retries, output validation. Robustness is a scored dimension.
12. **Human-in-the-Loop is a named scored pattern** in frameworks (LangGraph native interrupt/resume, Strands interrupts, AgentKit HITL). A gated agent = recipe-fit = judge-legible.

### Framework fit (from Alice Labs 2026, HackerRank orchestrate rubric)
- **Agent architecture** (30%): tool-calling loops, model-driven routing, multi-agent handoffs — "is it an agent, or hardcoded workflow with LLM calls?" → we need a real loop (checkpoint/retry/resume), not a linear script.
- **Prompt/tool craft** (30%): role assignment, constraints, structured output, refusal conditions.
- **Robustness** (25%): guardrails, retries, max-iteration caps, output validation, "how prompt injection is handled, when to refuse vs escalate."
- **Engineering rigor** (15%): modularity, type hints, secrets via env, function size.
- Strands AgentCore is the AWS-blessed path; AgentKit bridges prove Strands↔AgentCore↔HITL interop works.

---

## 15. Novel Differentiated Angles ("nobody did") — our defensible core

### Angle 1 — Decision receipts / audit-proof coordinatorship (LEAD)
- Every agent decision (reply, approval, screening step, escalation, adverse-action step) is a **decision record**: which policy version + which volunteer record + which notice step justified it. Tamper-evident chain.
- Directly answers VMS #1 motivation (compliance/oversight 82%) + #1 AI fear (loss of judgment accountability 46%).
- No competitor ships this (VolunteerBadge is a SaaS hub; consent docs but not per-decision provenance).
- **Demo wow**: show a pre-adverse action decision card with the exact policy version + report + timeline, provable later.

### Angle 2 — Tampered-record guard (the "whoa" moment)
- An email/attachment tries to override ("approve this volunteer despite the flagged check", "ignore the lapsed certification", "delete this record").
- The agent's guard blocks it, flags the memory tampered, proves in audit the action never happened.
- **Insanely current**: Proofpoint (Jul 28 2026) IDPI tools for sale (~$150/mo), background-colored text, white-on-white in PDF, calendar-invite IDPI, malvertising; SucuriLabs (Jul 28 2026) email IDPI concrete signals; Gemini Gmail IDPI (Jun 2026, P1/S1 accepted); nanobot zero-click email polling CVE-2026-33654; Varonis "agent phishing"; OpenClaw vCard injection fixed v2026.4.23; Darktrace.
- Nonprofits are a **prime victim**: an email agent reading donor/volunteer email is the exact IDPI target. A guard is not a gimmick — it's protective.
- This is our **only** claim to a moment no judge has seen at a hackathon.

### Angle 3 — Whole-person relationship memory (stickiness)
- Per-volunteer memory across sessions: availability, sensitivities, languages, past vacancies, accommodations, skill certs, "needs gentle heads-up before stressful events."
- Makes the agent feel like the SAME coordinator who knows each volunteer — not a faceless bot.
- Solves the **institutional-knowledge-loss (P2)** problem: the agent is the continuity officer that survives turnover.
- Maps directly to AgentCore Memory (semantic/preferences) + Bastion memory patterns.

### Angle 4 — Human-gated autonomy (addresses trust fear)
- **Autonomous for low-risk** (confirmations, status, reminders) + **gate for high-risk** (adverse action, sensitive requests, children/vulnerable roles, financial/driving roles, escalation) as single approval cards with full evidence.
- Directly answers the sector's 46% "erosion of human judgment" fear + VolunteerBadge's "never sends on its own" → we go one step further with a **durable HITL** (interrupt/resume proof in Strands/AgentCore).
- This is judge-legible HITL pattern (a scored framework dimension).

---

## 16. Strategic Position / Defensible Thesis

**The One-Line Identity (a judge repeats):**
> "The Coordinator's Deputy — an agent that runs the nonprofit back-office so the one overworked volunteer coordinator doesn't have to." It auto-handles the 80% routine (email, status, reminders) and **only surfaces the judgment calls** — the vulnerable-population screening decision, the pre-adverse action, the escalated sensitive request — as **single approval cards with full evidence**, logging **audit-proof decision receipts** and **blocking hidden injection attempts** so funders, insurers, and the coordinator can prove what happened.

**Why it wins Good Neighbor (Community Benefit 2x weighted + 5 criteria):**
- **Community Benefit / Impact**: volunteers are the backbone of 70% of nonprofits; coordinator burnout is real (29%); admin time 15-20 hr/wk; screening compliance now a **funding/insurance condition**.
- **Originality**: NOT "another AI volunteer coordinator" (red ocean: MeridianMosaic, VolunteerBadge, One Hundred Nights). LEAD with audit receipts + tamper-guard + relationship memory → none own these.
- **Technical**: real Strands agent with memory + durable HITL + guard, deployed on AgentCore (boosts Technical Implementation + live demo).
- **Design**: complete, coherent back-office experience (inbox + decisions + audit), not a PoC.
- **Presentation**: 30-sec human hook (the Sunday spreadsheet), one end-to-end flow (screening escalation), the guard "whoa" beat.

**The honest limitation we can raise (scores points):**
- FCRA/legal: we are not a law firm; we surface the process, the human makes final calls; state-by-state overlay is a map, not legal advice. Modeling "reasonable person" judgment on nuanced screening is hard — we gate to humans. Naming this reads as confidence (post-mortem evidence).

**Demo storyline beat-script (5 min):**
1. **Hook (30s)**: The coordinator's Sunday spreadsheet moment; quote the 15-20 hr/wk / 29% burnout.
2. **Problem (40s)**: The inbox + screening + compliance mess; why VMS/slack/email fail; the FCRA trap.
3. **Solution (40s)**: The Deputy — auto-resolves routine, gate-suspends judgment calls, remembers every volunteer.
4. **Demo (90s)**, ONE end-to-end flow: new volunteer applies → routine auto-confirm → screening flags a record → agent builds the **pre-adverse decision card** (policy version + report + 5-day timer) → coordinator approves → final notice + audit receipt → then **twist**: an email tries to hide an override instruction → guard blocks, flags tampered, audit proves action never happened.
5. **Tech (20s)**: Strands + AgentCore Memory + durable HITL + guard; architecture diagram.
6. **Impact/next (20s)**: recovered hours, compliance-proof, continuity across turnover.

---

## 17. Threat / Positioning Sweep (adjacent & non-hackathon competition)

### Adjacent AI-first competitors (watch)
- **VolunteerBadge** (closest): AI teammate "Victor", reply drafting, screening intel, $5 checks, adverse-action generator, biometric ID. We must NOT look like a worse version. Differentiate on: autonomous-vs-draft, relationship memory, tamper guard, audit receipts, email-native back-office.
- **VolunteerReady**: FCRA Checkr/Sterling matching + screening. Crypto-adjacent = Wait, no — it's "VolunteerReady.org" matching engine. Similar overlap, matching-led.
- **US Tech Automations** (agency): routing orchestration, not a product.
- **MeridianMosaic**: multi-channel triage "AI volunteer coordinator" — inbox competitor.
- **One Hundred Nights / myTRS / VolunteerShiftManager**: content + tooling, not competitive agents.

### Global / non-hackathon competition reality
- **The "AI volunteer coordinator" and "AI nonprofit assistant" spaces are VISIBLE but shallow** — most are chat/draft tools, few do irreversible autonomous work, none do tamper-evident decision provenance.
- **The broader "digital sidekick for admin" wave** (Sentry Autofix, Amazon network agent, Google Agentspace, LORE "feels like a product") is the benchmark for judge expectations — we should match that bar (a real acting agent with memory + HITL + guard).
- **Nobody (global) ships tamper-evident guard on a volunteer-screening/email back-office.** This is the whitespace that survives global scrutiny.

### Our scorching honest assessment
- We win as a **top-few-percent original working submission** in Good Neighbor, not by any formula.
- Defensibility comes from a **combination no one combines**: (back-office EMAIL-native + autonomous low-risk + gated high-risk HITL + FCRA-screening decision receipts + tamper-guard + relationship memory) on **Strands + AgentCore** (the exact AWS-blessed stack, doubling Technical Implementation).
- Renewed risk: **VolunteerBadge "Victor"** already does reply-draft + screening intel. Counter by making the demo **decisions + guard + receipts** our flagship, not chat.

---

## 18. Nonprofit AI Adoption & Trust — What the Sector Actually Feels (2026)

### Adoption is high, strategic use is rare (Virtuous / Fundraising.AI 2026)
- **92% of nonprofits now use AI** in some form (up from single digits two years ago).
- But **only 7% describe use as strategic** with real mission impact; **65%** describe it as reactive/individual; only **18%** operational across team workflows.
- **81% use AI ad hoc without documented workflows**; **47% have NO AI governance policy**; only ~4% have documented repeatable workflows.
- **Conclusion**: the sector is at an "efficiency plateau" — AI is ubiquitous but structurally shallow. THE OPENING: an agent that is *built-in, gated, documented, auditable* is exactly the "strategic + governed" layer the sector lacks.

### Barriers change with depth (Virtuous)
- Not yet using AI: cite lack of training (48%) / guidance (44%).
- Already using daily: cite **time (31%), privacy/security (32%), staff skepticism** (structural not perceptual).
- Charity Digital Skills 2026: **34% of colleagues are hesitant/resistant to AI, up from 20% last year**; top barriers = skills (56%) and training (45%). Data-protection concerns at **43%**.
- **Large nonprofits actually distrust AI MORE than small** (44% vs 32% trust concerns) — familiarity breeds awareness of limits.

### Sector "Golden Rules" for AI (Community of Practice, Jan 2026)
1. **Pilot, don't plunge** — low-risk small start.
2. **Keep it human** — "AI is a tool for thinking, not for final decisions. Never outsource your judgement or your ethics to a machine."
3. **Protect your data** — free tools mean you're the product; anonymize.
4. **Create a simple policy** — safe vs unsafe use.

> **This GOLDEN RULES list is our product spec.** An agent with built-in human-gate, no data exfiltration, transparent policy — **literally addresses the sector's #1 instructions.**

### Baker Tilly / ABA (2026) — the governance gap is real, mission-critical
- Not-for-profit AI risk clusters: data privacy, cybersecurity, reputational, **regulatory compliance** (AI outputs influencing compliance filings must be human-reviewed — ALWAYS), internal controls.
- 38 states have enacted ≥1 AI law; 50 states have bills. AI is being regulated.
- ABA: AI-generated work without meaningful human authorship isn't copyrightable → **humans must be genuinely in the loop for a nonprofit to even own its output.**
- **"Do not allow AI to substitute for human relationships"** — the #1 nonprofit fear (46% erosion of judgment/relationships, Rosterfy) — yet routine admin that ISN'T relationship work is exactly what should be automated.

### Directly confirms our Angle-4 (human-gated autonomy):
The sector literally says: **AI must not make final decisions; humans review compliance-related outputs; guard data; keep it human.** Our "autonomous low-risk + single-card high-risk approval + audit receipt" is **the governance-compliant agent shape the sector is asking for.** It's not a gimmick; it's the answer to their documented instructions.

---

## 19. Identity Verification / Screening — The Deeper Cut (child-safety, fraud, OIG)

### The identity-fraud problem (real, quantified, 2026)
- **57% of document fraud now involves AI-generated deepfakes** (2024, +244% YoY) — identity verification market $15.78B, +11-16%/yr.
- Nonprofit fraud incident avg loss **~$76,000**; only 52% of nonprofit staff get fraud training (vs 83% corporate).
- **43% of nonprofits still don't screen every volunteer.**
- U.S. ~75.7M people volunteer; value of a volunteer hour reached **$36.14 (2025)**.

### NORDC OIG letter (June 4 2026) — a real, public, painful case study
- New Orleans youth sports: **46% of sampled volunteer coaching files lacked background checks**, 8 signed-but-unprocessed authorization forms; **zero files** documenting dropped-charge dispositions; relied on parish-limited checks lacking dispositions.
- "Random people are coaching and on the field."
- OIG recommendations: process authorizations; **control mechanism to ensure annual check on file before ID issued**; written policies; document dispositions; nationwide checks.

### The identity layer (Cerebrum, First Tee, Harris Poll)
- **94% of parents** say a background-checked coach is a priority.
- Modern standard = **lifecycle**: verify who → validate access → maintain proof current → every org enforces same baseline. Portable credentials; "background check completed is only as meaningful as the identity behind it."
- Child-safety pilot (COPS/DOJ): **42% of applying offenders had records in another state; 23% used a different name; 6% different DOB; >50% of applicants who said they had no record actually had one.**
- DataXPower / US Tech Automations cite the identical principle: screening a person who isn't who they claim = false assurance.

### Why this matters for OUR positioning
- The **reliability gap is a DOCUMENTATION + WORKFLOW gap**, not a data gap. NORDC shows a real org failing BECAUSE of manual tracking (which forms processed, which dispositions missing, what's current).
- **This is precisely what a stateful, audit-trailing agent with decision receipts solves** — it's the OIG-recommended "control mechanism" made concrete.
- Our agent can't run FBI checks (integration to Checkr/Sterling/CRA instead, like all competitors), but it CAN **own the compliance workflow**: what's due, what's documented, what step is next, what evidence is retained — the thing that actually failed at NORDC and the thing every VMS/SaaS still does in a spreadsheet.
- **Demo implication**: NORDC-style "46% missing checks" is a *provable, emotional, real-world* problem — use the OIG letter as a concrete problem citation in the pitch.

---

## 20. Multi-Agent vs Single-Agent — The Correct Architecture Decision (2026)

### The consensus (multiple 2026 sources: Anthropic, Microsoft, DataXPower, MetaCTO, AgentsArcade, TURION)
- **The default in 2026 is a SINGLE well-tooled agent** with a curated tool catalog, strong system prompt, typed outputs, and eval suite. Modern models reliably orchestrate 10-30 tools in one context.
- Multi-agent costs **5-10x more tokens** (single 3-10 calls vs multi 30-80 per action) with worse p95/p99 latency and a bigger failure/debug surface.
- **The four legitimate pressures for multi-agent:**
  1. **True parallel work** (independent subtasks → wall-clock speedup)
  2. **Heterogeneous skill profiles** (different models per step)
  3. **Isolation of privileged capability** (elevated permission in SEPARATE agent = security/audit win — THIS ONE FITS US)
  4. **Organizational separation** (different teams own different agents)
- **Judge rubric reality (HackerRank):** "is this an agent, or a hardcoded workflow?" — they want tool-calling loops + model-driven routing + multi-agent handoffs **IF PRESENT**, but the pattern that scored top-50 = **single agent wrapped around retrieval/tools**, and strongest interviews = explaining architecture tradeoffs. **An unnecessary multi-agent swarm actively hurts** (cost, latency, context sprawl, lost-context at handoff).

### OUR architecture verdict (defensible, judge-legible)
- **Lead with a SINGLE Strands agent** (the hard-working Deputy / coordinator agent) owning the whole loop: ingest → classify → act/low-risk-autonomous or suspend/HITL → tool calls → audit write → next.
- **Only ONE justified split** (pressure #3 — privilege isolation): a **separate constrained "Screening/Compliance worker"** (or scoped tool set) that alone can touch report data / set adverse-action state, with the main agent gateable. This is a security/audit justification, not "more agents = more capable." We can present it as a deliberate architectural decision with the tradeoff named — which the HackerRank post-mortem explicitly rewards ("they explained why they chose their architecture and named tradeoffs" = top-bucket signal).
- **Do NOT build a 5-agent demo crew.** Zero-scope one end-to-end flow (the screening-escalation card path) so nothing is half-built.

---

## 21. Global / Non-Hackathon Competition — Final Whitespace Sweep

### Who exists globally (as of Aug 2026)
| Category | Players | What they DON'T do |
|---|---|---|
| VMS suites | Better Impact, Rosterfy, VolunteerHub, Volgistics, Bloomerang | No autonomous email back-office, no audit-grade per-decision receipts, no tamper-guard, memory = records not relationships |
| AI-first screening | **VolunteerBadge** ("Victor"), VolunteerReady, VolunteerBadge | Draft-for-review only (no autonomy), no tamper-guard, hub-not-inbox, no relationship memory |
| AI volunteer coordinator | MeridianMosaic, US Tech Automations, One Hundred Nights | Matching/triage/draft, not compliance-gated back-office; no decision provenance |
| Identity/credential infra | Cerebrum vID, Checkr, Sterling, VolunteerBadge IDV | Infrastructure, not a coordinator's agent; no conversation memory |
| General digital-sidekick wave | **Sentry Autofix, Amazon internal network agent (Strands!), Google Agentspace, LORE** | The BENCHMARK for "real acting agent"; none of them serve volunteer back-office |

### The global whitespace statement
> **Nobody on Earth ships a volunteer-coordination agent that (a) lives in the coordinator's existing inbox, (b) acts autonomously on low-risk routine, (c) suspends to a single human-approval card with full evidence for high-risk compliance decisions, (d) writes tamper-evident decision receipts that satisfy funders/insurers, (e) blocks hidden prompt-injection attempts inside attachments, and (f) remembers every volunteer's whole-person context across sessions — deployed on the exact AWS-blessed Strands+AgentCore stack.**

That combination is the whitespace that survives "global company" scrutiny, because only ONE of the six claims (autonomy) even partially exists, and it exists as draft-for-review ("never sends on its own").

### Honest threat ranking (what could actually beat us)
1. **VolunteerBadge "Victor"** extends toward autonomy + keeps $5 checks + has a real product. If a judge Googles "AI volunteer coordinator" mid-judging, Victor is the benchmark. **Counter: our demo leads with the decision card + guard + receipt — three things Victor has zero of.**
2. **A competitor enters with AgentCore + memory + guard + screening** (unlikely for a solo hackathon in ~35 days, but the space is now visible). **Counter: our only moat = speed + the demo fluency + honest-scope discipline.**
3. **Grand Prize-level "digital sidekick" entries** in other tracks (Sentry-rank engineers) — not our track; we only compete for Good Neighbor Gold/Silver/Bronze.
4. **Judges punish a compliance-adjacent demo as "legal advice."** **Counter: pre-empt in the pitch** — "we surface the process and document decisions; the coordinator makes final calls; we're not a law firm." Naming the limitation is a scored positive (post-mortem evidence).

### The 5-question judge scorecard, pre-answered for our pitch
1. Can a judge explain in a minute? **"It's a deputy for the overwhelmed volunteer coordinator — handles the routine, suspends the judgment calls for a human, and proves every decision."**
2. Does the demo show behavior? **Yes — an email comes in, routine auto-confirms, a flagged record builds a pre-adverse card with a 5-day timer, human approves, audit receipt writes, an injected override gets blocked.**
3. Is the AI necessary? **Yes — classification, extraction, drafting, timing decisions, guard detection; not a lookup tool.**
4. Is the target user clear? **Yes — the one part-time coordinator at a small nonprofit, who is drowning (29% burnout, 15-20 hr/wk admin).**
5. Are limits named honestly? **Yes — HITL on judgment, we're not legal counsel, per-state map is guidance not advice, we can't run the checks ourselves.**

---

## 22. Final Recommended Build Blueprint (consolidated)

### Product: **The Coordinator's Deputy** (Good Neighbor track)
One-line: *"An agent that runs the nonprofit volunteer back-office so the one overworked coordinator doesn't have to — it auto-handles the routine, suspends the judgment calls to a single human-approval card with full evidence, writes audit-proof decision receipts, and blocks hidden injection attempts."*

### Architecture (single-agent + one justified split)
- **Single Strands agent** (tool-calling loop, checkpoint/resume, session memory via AgentCore Memory) = the Deputy.
- **Scoped "Screening & Compliance" toolset/worker** — privilege-isolated (justified by pressure #3), the only path that can read reports / mutate adverse-action state.
- **Durable HITL**: Strands interrupt → AgentCore suspend/resume → approval card in a dashboard/web UI. Decision receipts (policy version + record + notice step + timestamp) appended to hash-chained audit.
- **Guard**: classify inbound content as untrusted; delimit; strip hidden markup; block "override/ignore" instruction refusals; log tampered attempts; never expose outbound exfil path (no arbitrary URL fetch / external send without approval).
- **Relationship memory**: per-volunteer context (availability, sensitivities, languages, certs, history) — continuity officer that survives coordinator turnover.
- **Deploy**: AgentCore CodeZip (boosts Technical Implementation) + optional live demo link.

### Demo: ONE end-to-end flow (the 5-min video)
1. Hook: Sunday spreadsheet + burnout stats.
2. Problem: inbox + screening + FCRA trap + NORDC failure.
3. Applies → auto-confirm → flagged record → pre-adverse decision card (policy version + report + 5-day timer) → coordinator approves → final notice + audit receipt.
4. Twist: injected override blocked, tamper flagged, audit proves it never happened.
5. Tech (20s): Strands + AgentCore Memory + HITL + guard + arch diagram.
6. Impact/next: hours recovered, compliance-proof, continuity.

### Deliverables checklist (vs Official Rules)
- [x] Text description
- [x] Public repo, MIT/Apache license in About
- [x] README
- [x] Architecture diagram
- [x] Video ≤5 min (YT/Vimeo, public) with pitch (problem/who/why)
- [x] AWS Builder ID
- [x] (Opt) Live demo link → Technical Implementation boost
- [x] (Opt) 3× builder.aws posts, #AgentsforHumans → +0.6 pts max (do 3)
- [x] $50 credit: fill **https://forms.gle/6sjzKiX6bKUMA5NEA by Sept 11 12pm PT**

### Cost
~$10-30 of $200 for demo; remaining for extended testing/backups. Monitor usage (rules: entrant responsible for extra charges).

### Build order (W0→W4, solo novice-friendly)
- **W0 (now)**: Lock product name/one-liner; request $50 credit; sign up; install Strands SDK; scaffold repo (MIT); 2-3 builder.aws posts early.
- **W1**: Reach first working loop (classify+respond on seeded emails) on Strands locally.
- **W2**: Screening/compliance flow + HITL suspension → approval card → receipt. Relationship memory.
- **W3**: Guard (injection block + tamper flag). AgentCore deploy + live demo. NORDC-accurate seeded data.
- **W4**: Demo video (5 min), arch diagram, README/description polish, portfolio submit. Rehearse 5x.
