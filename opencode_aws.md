# TeacherGuard — Complete Project Plan
**Hackathon: Agents for Humans | Track: Good Neighbor | Deadline: Sept 15, 2026**
**34 days to build | Strands Agents SDK + AWS Bedrock**

---

## Executive Summary

**The Story:** Saturday night. 9:47 PM. Mrs. Rodriguez is watching TV with her family. Her phone buzzes. 12 parent messages between 7pm and 10pm. She responds to all of them. It takes 2 hours. She's tired. She wants to quit.

**TeacherGuard** is an autonomous AI agent that sits between parents and teachers — reads incoming messages, classifies urgency, auto-responds to routine questions, and only escalates real decisions. Teachers never see the noise. They save 5.9 hours a week.

**One-sentence:** "An autonomous AI agent that handles routine parent messages — homework questions, absence reports — and only escalates real decisions, so teachers save 5.9 hours a week and don't burn out."

**Retelling sentence:** "12 parent messages at 9pm. TeacherGuard handled 11. Teacher only saw the one that mattered."

---

## Quick Reference: Tech Stack (August 2026)

| Layer | Choice | Why |
|---|---|---|
| **Agent Framework** | Strands Agents SDK + Agent SOPs | Required by hackathon. Agent SOPs for workflow docs. |
| **LLM** | Claude Sonnet (reasoning) + Nova Micro (classification) | Multi-model routing cuts cost 80%+ |
| **Memory** | Mem0 + Strands native integration | Parent history, teacher preferences, school context |
| **Messaging (Demo)** | **Telegram Bot API** | **Free. Unlimited messages. No API costs.** |
| **Messaging (Production)** | Twilio SMS + WhatsApp | Same credential, scalable |
| **Dashboard** | Reflex (event-driven, real-time) | Better than Streamlit for live agent monitoring |
| **Observability** | Arize Phoenix (OpenTelemetry) | Free, local, shows agent traces in demo |
| **Deployment** | AgentCore (production-ready) | Auto-scaling, session isolation, judging strengthener |
| **Scheduling** | AWS EventBridge (cron) | Triggers agent daily + pattern scans |
| **Data** | JSON (demo) + DynamoDB (production) | Single table design, free tier |
| **Reports** | python-docx + jinja2 | Weekly summary generation |

### Cost Breakdown

| Item | Demo Cost | Production Cost (per school) |
|---|---|---|
| **Telegram Bot API** | $0 (free forever) | $0 (free forever) |
| **Twilio SMS** | $0 (trial credit) | ~$16/month (2,000 SMS × $0.0079) |
| **Total** | **$0** | **~$16-40/month** |

---

## 1. THE PROBLEM

### The Story

Saturday night. 9:47 PM. Mrs. Rodriguez is watching TV with her family. Her phone buzzes.

> Parent: "Why did Alex get a 73 on his math test? He studied all week. Can you recheck it?"

She's already answered 14 parent messages today. She's tired. She wants to respond — but this is the third message this week from this parent. She responds anyway. It takes 20 minutes to write a careful, professional reply.

**This is not a made-up story.** These are real findings:

> "Parents want 24-hour access to teachers now. Lots of issues caused by online social media and bullying happen at home, but the fallout is felt in school." — DCU Teacher Occupational Wellbeing Survey 2025

> "Almost half (49%) of teachers who report experiencing burnout cite unrealistic parental expectations as a contributing factor." — DCU CREATE 2025

> "42% of teachers globally cite 'addressing parents' concerns' as a significant stressor." — OECD TALIS 2024 (280,000 educators, 55 education systems)

> "19% of teachers say the amount of parent contact expected of them is 'unmanageable'." — Teacher Tapp / Tes 2026

> "46% of teachers don't anticipate remaining in the profession long term." — DCU CREATE 2026

> "Teachers who use AI weekly save an average of 5.9 hours a week." — Gallup / Walton Family Foundation 2025

**The problem isn't that parents care too much.** The problem is that teachers have no buffer. Every message — routine or urgent — hits their phone at the same time, in the same channel, with the same urgency.

### The Numbers
| Stat | Source |
|---|---|
| 86-91% of teachers report burnout | DCU CREATE 2025-2026 |
| 49-59% cite unrealistic parental expectations | DCU CREATE 2025-2026 |
| 42% of teachers globally cite parent communication as stressor | TALIS 2024 |
| 42-46% don't plan to stay in profession | DCU CREATE 2025-2026 |
| 1.8-2 hours/week on parent communication (and rising) | TALIS 2024, Kuksha 2025 |
| 19% say parent contact is "unmanageable" | Teacher Tapp 2026 |
| Teachers who use AI save 5.9 hours/week | Gallup 2025 |

### Who This Is For
Teachers (K-12, all subjects, all countries). They have: a phone full of parent messages, no buffer, and 46% are planning to leave the profession.

### What If Mrs. Rodriguez Had an Agent?

Saturday, 9:47 PM. Parent texts: "What's the homework tonight?" Agent responds instantly. Teacher never sees it.

Parent texts: "Alex will be absent tomorrow." Agent logs it. Teacher receives summary.

Parent texts: "Why did Alex get a 73?" Agent escalates to teacher with context. Teacher sees: "ESCALATED: Parent concerned about grade. Frustrated. Requests recheck."

**Mrs. Rodriguez never opened her phone. She never responded to a single message. She spent Saturday night with her family.**

---

## 2. COMPETITIVE LANDSCAPE

### What Exists
| Tool | What It Does | Limitation |
|---|---|---|
| **Remind** | SMS/app notifications | No intelligence, no agent |
| **ClassDojo** | Behavior tracking + messaging | No automation, no reasoning |
| **MagicSchool** | AI message composer | Teacher still reads every message |
| **ParentAgent™** | Parent email organizer | Parent-facing, not teacher-facing |
| **Norton Family Assistant** | Parent AI agent | Parent-facing, not teacher-facing |
| **Setian AI** | School admin AI | Admin-facing, not teacher-facing |

### The Critical Gap: "Notification" vs "Agent"

> "Existing tools help teachers SEND messages. TeacherGuard helps teachers NOT SEE messages. That's the difference between a notification tool and an agent."

- Existing tools: `IF message THEN notify teacher` — no judgment
- TeacherGuard: *"This is a routine homework question. Auto-respond. This is a grade concern with frustrated sentiment. Escalate with context."*

### The Pricing Gap Is the Market Entry
- Remind: Free tier shrinking, SMS behind paywall
- ClassDojo: Free, but no automation
- MagicSchool: Free tier, but teacher still reads everything
- **The gap: no affordable autonomous agent exists**

---

## 3. ARCHITECTURE: 4-Agent Strands Swarm

### Agent Overview
| Agent | Role |
|---|---|
| **Classifier** | Reads incoming messages, classifies urgency + topic + sentiment |
| **Responder** | Generates responses to routine messages, uses teacher's voice |
| **Escalator** | Prepares escalation summaries for real issues, adds context |
| **Learner** | Tracks patterns, detects burnout, improves over time |

### Swarm Diagram
```
┌──────────────────────────────────────────────────────────────┐
│                   TeacherGuard Swarm                          │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  Classifier  │───→│  Responder   │───→│  Escalator   │   │
│  │              │    │              │    │              │   │
│  │  Tools:      │    │  Tools:      │    │  Tools:      │   │
│  │  - classify_ │    │  - generate_ │    │  - prepare_  │   │
│  │    urgency   │    │    response  │    │    summary   │   │
│  │  - classify_ │    │  - match_    │    │  - add_      │   │
│  │    topic     │    │    teacher_  │    │    context   │   │
│  │  - classify_ │    │    voice     │    │  - detect_   │   │
│  │    sentiment │    │  - send_     │    │    burnout   │   │
│  │              │    │    response  │    │    patterns  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                    │                   │           │
│         ▼                    ▼                   ▼           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Reasoning Layer (LLM)                    │   │
│  │                                                      │   │
│  │  1. "Homework question at 9pm. Topic: schedule.      │   │
│  │      Urgency: low. Auto-respond."                    │   │
│  │  2. "Grade concern with frustrated sentiment.        │   │
│  │      Escalate to teacher with context."              │   │
│  │  3. "Parent X sent 8 messages this week.             │   │
│  │      Burnout risk detected. Flag for teacher."       │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                    │                   │           │
│         ▼                    ▼                   ▼           │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │   Learner    │←───│  Dashboard   │←──────────────────────┘
│  │              │    │  (Reflex)    │                       │
│  │  Tools:      │    │              │                       │
│  │  - track_    │    │  - live_     │                       │
│  │    patterns  │    │    agent_    │                       │
│  │  - detect_   │    │    activity  │                       │
│  │    burnout   │    │  - parent_   │                       │
│  │  - improve_  │    │    message_  │                       │
│  │    over_     │    │    log       │                       │
│  │    time      │    │  - teacher_  │                       │
│  │              │    │    summary   │                       │
│  └──────────────┘    └──────────────┘                       │
│                                                              │
│  Memory: Strands MemoryManager (parent history,             │
│          teacher preferences, school context)                │
│  Shared Context: roster, message history, patterns          │
│  Max Handoffs: 10 | Timeout: 600s                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. THE FOUR "THIS IS NOT A SCRIPT" BEHAVIORS

### Behavior 1: Urgency Classification
**Script:** `if message: notify teacher()`
**Agent:**
```
Message: "What's the homework tonight?"
→ Topic: schedule. Urgency: low. Sentiment: neutral.
→ Auto-respond with homework info.
→ Teacher never sees this message.
```
The agent reasons about urgency, not just delivery.

### Behavior 2: Sentiment-Aware Escalation
**Script:** `if grade_concern: notify teacher()`
**Agent:**
```
Message: "Why did Alex get a 73? He studied all week."
→ Topic: grades. Urgency: high. Sentiment: frustrated.
→ Escalate to teacher with context: "Parent concerned about grade. Frustrated. Requests recheck."
→ Suggest response: "Acknowledge concern, offer to discuss during office hours."
```
The agent reasons about emotion, not just content.

### Behavior 3: Burnout Detection
**Script:** `if messages > threshold: alert()`
**Agent:**
```
Weekly scan:
→ Parent X: 8 messages this week (5 about grades)
→ Response time trending down: 2hrs → 4hrs → 8hrs
→ Agent recommendation: "Parent X may need a scheduled call. Flag for teacher."
```
The agent detects patterns AND suggests interventions.

### Behavior 4: Teacher Voice Matching
**Script:** `send_response(message)`
**Agent:**
```
Generating response to "What's the homework tonight?"
→ Teacher style: warm, concise, uses student's first name
→ Response: "Hi! Tonight's homework is Chapter 7, problems 1-15. Alex has until Friday to submit. Let me know if you need anything else!"
→ Matches teacher's voice, not generic bot language.
```
The agent learns and mimics the teacher's communication style.

---

## 5. MEMORY LAYER (Strands MemoryManager)

TeacherGuard remembers across sessions:
- *"Parent X always asks about grades. Respond to their concerns first."*
- *"Parent Y prefers email, not SMS. Use email for non-urgent updates."*
- *"Mrs. Rodriguez's response style is warm and concise. Match that tone."*
- *"Alex's parent has sent 8 messages this week. Burnout risk detected."*

This creates a **parent-teacher relationship memory** that gets smarter over time. Responses become genuinely personalized, not generic.

---

## 6. MOCK DATA SOURCES

### parents.json — Parent profiles
```json
{
  "parents": [
    {
      "id": "p001",
      "name": "Maria Garcia",
      "phone": "+1-555-0101",
      "email": "maria@email.com",
      "student": "Alex Garcia",
      "student_id": "s001",
      "preferred_channel": "sms",
      "message_frequency": "high",
      "common_topics": ["grades", "homework", "schedule"],
      "sentiment_history": ["frustrated", "neutral", "neutral"],
      "avg_response_time_minutes": 30,
      "notes": "Very involved parent. Often messages about grades."
    },
    {
      "id": "p002",
      "name": "James Thompson",
      "phone": "+1-555-0102",
      "email": "james@email.com",
      "student": "Emma Thompson",
      "student_id": "s002",
      "preferred_channel": "email",
      "message_frequency": "low",
      "common_topics": ["schedule", "absence"],
      "sentiment_history": ["neutral", "neutral"],
      "avg_response_time_minutes": 60,
      "notes": "Occasional messages. Usually about schedule."
    }
  ]
}
```

### messages.json — Incoming messages
```json
{
  "messages": [
    {
      "id": "m001",
      "parent_id": "p001",
      "timestamp": "2026-10-18T21:47:00",
      "content": "What's the homework tonight?",
      "topic": "schedule",
      "urgency": "low",
      "sentiment": "neutral",
      "auto_responded": true,
      "response": "Hi! Tonight's homework is Chapter 7, problems 1-15. Alex has until Friday to submit.",
      "teacher_saw": false
    },
    {
      "id": "m002",
      "parent_id": "p001",
      "timestamp": "2026-10-18T21:52:00",
      "content": "Why did Alex get a 73 on his math test? He studied all week. Can you recheck it?",
      "topic": "grades",
      "urgency": "high",
      "sentiment": "frustrated",
      "auto_responded": false,
      "escalated": true,
      "escalation_summary": "Parent concerned about Alex's math grade (73). Frustrated. Requests recheck.",
      "teacher_saw": true
    }
  ]
}
```

### teachers.json — Teacher profiles
```json
{
  "teachers": [
    {
      "id": "t001",
      "name": "Mrs. Rodriguez",
      "email": "rodriguez@springfield.edu",
      "subject": "3rd Grade",
      "students": ["s001", "s002", "s003"],
      "response_style": "warm, concise",
      "communication_hours_per_week": 2.5,
      "burnout_risk": "medium",
      "notes": "3rd grade teacher, 28 students. Receives 12+ parent messages daily."
    }
  ]
}
```

---

## 7. DEMO FLOW (5 minutes)

### 0:00-0:30 — Problem Setup (voiceover + screen)
"Meet Mrs. Rodriguez. She teaches 3rd grade at Springfield Elementary. 28 students. Last night, she received 12 parent messages between 7pm and 10pm. She responded to all of them. It took 2 hours."

### 0:30-1:30 — Agent Classifies (screen recording)
```
TeacherGuard Agent starting...
→ Scanning incoming messages...
→ Message from Maria Garcia (9:47 PM): "What's the homework tonight?"
   → Topic: schedule. Urgency: low. Sentiment: neutral.
   → Auto-responding with homework info.
   → Teacher never sees this message.
```

### 1:30-2:30 — Agent Responds (screen recording)
```
→ Message from James Thompson (8:30 AM): "Emma will be absent tomorrow"
   → Topic: absence. Urgency: medium. Sentiment: neutral.
   → Logging absence, confirming with parent.
   → Teacher receives summary: "1 absence logged: Emma (doctor appointment)"
```

### 2:30-3:30 — Agent Escalates (screen recording)
```
→ Message from Maria Garcia (9:47 PM): "Why did Alex get a 73?"
   → Topic: grades. Urgency: high. Sentiment: frustrated.
   → Acknowledging, escalating to teacher with context.
   → Teacher: "ESCALATED: Parent concerned about Alex's grade. Frustrated. Requests recheck."
```

### 3:30-4:30 — Pattern Detection (screen recording)
```
TeacherGuard: Running weekly scan...
→ Maria Garcia: 8 messages this week (5 about grades)
→ Response time trending down: 2hrs → 4hrs → 8hrs
→ Agent: "Suggest scheduled call to address concerns."
```

### 4:30-5:00 — Impact Report + Closing (screen recording)
```
This week:
→ 47 routine messages auto-responded (saved teacher 4.2 hours)
→ 6 real issues escalated with context
→ 3 burnout risks detected
→ Teacher never saw 89% of messages
```

**Closing pitch:** "Mrs. Rodriguez didn't respond to a single parent message tonight. TeacherGuard handled the routine. She only saw the real decisions. 46% of teachers don't plan to stay in the profession. This agent gives them 5.9 hours back every week. For every school, every teacher, every parent — this is the buffer they need."

---

## 8. TECH STACK (Updated August 2026)

### Multi-Model Routing Strategy

```
Incoming message
     │
     ▼
Classifier (Nova Micro — fast, cheap)
     │
     ├── "Is this routine (homework, absence)?" → Nova Micro handles
     ├── "Is this urgent (grades, behavior)?" → Claude Sonnet handles
     └── "Is this a burnout pattern?" → Claude Sonnet analyzes
```

**Why it matters for the hackathon:** "TeacherGuard uses model routing — Nova Micro for simple classification, Claude Sonnet for complex reasoning. This keeps costs under $2/month per school." That's a technically credible, production-minded claim.

### Full Architecture Stack

```
┌─────────────────────────────────────────────────────────────┐
│              TeacherGuard Architecture                        │
│                                                              │
│  ORCHESTRATION                                               │
│  Strands Agents SDK + Agent SOPs (markdown specs)            │
│  AgentCore Runtime (AWS managed, auto-scaling)               │
│  EventBridge (cron trigger — daily pattern scans)            │
│                                                              │
│  AGENTS (Swarm Pattern)                                      │
│  Classifier → Responder → Escalator → Learner               │
│                                                              │
│  INTELLIGENCE                                                │
│  Claude Sonnet (reasoning, patterns, escalation)             │
│  Nova Micro (classification, simple responses)               │
│  Prompt Caching (90% cost reduction on system prompts)       │
│                                                              │
│  MEMORY                                                      │
│  Mem0 (parent history, teacher preferences, July 2026        │
│  official Strands integration)                               │
│  DynamoDB (message history, patterns, burnout signals)       │
│                                                              │
│  COMMUNICATION                                               │
│  Telegram (demo) / Twilio SMS+WhatsApp (production)          │
│  Teacher voice matching for personalized responses           │
│                                                              │
│  OBSERVABILITY                                               │
│  Arize Phoenix (local, OpenTelemetry traces)                 │
│  CloudWatch (via AgentCore)                                  │
│                                                              │
│  DASHBOARD                                                   │
│  Reflex (event-driven, real-time, Python-native)             │
│  Live agent activity, message log, teacher summaries         │
│                                                              │
│  DATA                                                        │
│  JSON files (demo) + DynamoDB (production)                   │
│  Single table design, pay-per-request                        │
│                                                              │
│  REPORTS                                                     │
│  python-docx + jinja2 (weekly summary generation)            │
└─────────────────────────────────────────────────────────────┘
```

---

## 9. FILE STRUCTURE

```
teacherguard/
├── README.md
├── LICENSE (MIT)
├── architecture_diagram.png
├── requirements.txt
├── agent_sops/
│   ├── classification.md     # Agent SOP: message classification
│   ├── response.md           # Agent SOP: routine response generation
│   ├── escalation.md         # Agent SOP: real issue escalation
│   └── pattern_detection.md  # Agent SOP: burnout pattern detection
├── agents/
│   ├── __init__.py
│   ├── swarm.py              # Main swarm orchestration (Strands)
│   ├── classifier.py         # Classifies urgency + topic + sentiment
│   ├── responder.py          # Generates routine responses
│   ├── escalator.py          # Prepares escalation summaries
│   └── learner.py            # Pattern detection + burnout risk
├── tools/
│   ├── __init__.py
│   ├── message_handler.py    # Message ingestion and routing
│   ├── response_generator.py # Response generation with teacher voice
│   ├── escalation_handler.py # Escalation summary preparation
│   ├── pattern_detector.py   # Burnout pattern detection
│   ├── memory.py             # Mem0 integration for parent history
│   └── report_generator.py   # Weekly summary generation (python-docx)
├── data/
│   ├── parents.json          # Parent profiles
│   ├── messages.json         # Incoming messages
│   └── teachers.json         # Teacher profiles
├── dashboard/
│   ├── app.py                # Reflex dashboard (event-driven, real-time)
│   └── components/
│       ├── agent_activity.py # Live agent activity log
│       ├── message_log.py    # Message classification and responses
│       ├── teacher_summary.py# Teacher-facing summary view
│       └── pattern_view.py   # Burnout pattern visualization
├── infra/
│   ├── eventbridge_rule.py   # AWS EventBridge cron trigger config
│   ├── agentcore_config.py   # AgentCore deployment config
│   └── dynamodb_table.py     # DynamoDB single-table design
├── demo/
│   ├── demo_data.py          # Generates realistic mock data
│   └── run_demo.py           # Full demo script
└── tests/
    ├── test_agents.py
    └── test_tools.py
```

---

## 10. BUILD TIMELINE (34 days)

| Week | Days | Deliverable |
|---|---|---|
| **1** | 1-5 | Strands SDK + AgentCore setup, Mem0 integration, Agent SOPs, mock data generators, Classifier agent |
| **2** | 6-10 | Multi-model router (Nova Micro → Sonnet), Responder agent (teacher voice matching), message handler |
| **3** | 11-15 | Escalator agent (context preparation), Learner agent (burnout detection), memory layer |
| **4** | 16-20 | Swarm integration, streaming events, Arize Phoenix traces, Reflex dashboard |
| **5** | 21-25 | Full demo flow, EventBridge cron trigger, mock data for 50 messages, pattern detection demo |
| **6** | 26-30 | Demo video recording, README, architecture diagram, Agent SOPs documentation, polish |
| **7** | 31-34 | Buffer, testing, submission prep, builder.aws blog post |

---

## 11. JUDGING CRITERIA ALIGNMENT

| Criterion | How TeacherGuard Scores |
|---|---|
| **Technological Implementation** | 4-agent Strands Swarm with autonomous handoffs, shared memory (Mem0), streaming events. Multi-model routing (Nova Micro + Claude Sonnet). AgentCore deployment. Agent SOPs for workflow documentation. Arize Phoenix for observability. |
| **Design** | Complete product: Reflex dashboard + agent + notifications + weekly summaries. Real-time message classification view. Agent activity log with OpenTelemetry traces. Clear user flow from message receipt to resolution. |
| **Potential Impact** | 86-91% teacher burnout. 42-46% leaving profession. 1.8 hours/week on parent communication (rising). 5.9 hours/week saved by AI. Clear quantifiable ROI. |
| **Creativity & Originality** | First LLM-reasoning agent for teacher-parent communication. Multi-model routing, burnout detection, teacher voice matching, sentiment-aware escalation — no competitor does this. Agent SOPs for transparent workflow documentation. |
| **Presentation** | 30-second understanding: "Parent texts at 9pm. Agent responds instantly. Teacher never sees it." Works without explanation. Agent SOPs in README make architecture instantly clear. |

---

## 12. SUBMISSION CHECKLIST

- [ ] Text description (what it does, who it's for, how it works)
- [ ] PUBLIC GitHub repo URL
- [ ] All source code + setup instructions
- [ ] MIT license
- [ ] README
- [ ] Architecture diagram
- [ ] Demo video (max 5 min)
- [ ] AWS Builder ID
- [ ] Optional: live demo link
- [ ] Optional: builder.aws blog post (#AgentsforHumans)

---

## 13. RESEARCH SOURCES

1. DCU CREATE 2025 — Teacher Occupational Wellbeing Research (1,000+ teachers, Ireland)
2. DCU CREATE 2026 — Teacher Occupational Wellbeing Research (600+ teachers, Northern Ireland)
3. OECD TALIS 2024 — Teaching and Learning International Survey (280,000 educators, 55 systems)
4. Teacher Tapp / Tes 2026 — UK teacher survey (4,812 teachers)
5. Walton Family Foundation / Gallup 2026 — US teacher survey (2,069 teachers)
6. RAND 2025 — State of the American Teacher Survey
7. Kuksha Global Benchmark 2025 — 4,000 educators, 50 countries
8. BeeNet / OECD Analysis — Parent Communication Tax on Teacher Well-Being
9. Irish Times 2026 — "Unrealistic expectations from parents fuelling teacher burnout"
10. Irish Independent 2025 — "Teachers cite unrealistic expectations of pupils' parents as key burnout cause"
11. RTE 2025 — "High levels of stress and burnout among teachers"
12. NASUWT Teaching Union — UK teacher workload concerns
13. ParentSquare 2026 — State of School-Home Communication
14. Reddit r/TeachingUK — Teacher parent email discussions
15. MagicSchool, Education Copilot, StaffDraft — AI message composers
16. ParentAgent™, Norton Family Assistant — Parent-facing AI tools
17. Setian AI, School Sense AI — School admin AI platforms

---

## 14. 30-SECOND PITCH

> "Parents text teachers at 9pm about grades. Teachers burnout. 86% report burnout. 46% plan to leave. TeacherGuard is an AI agent that handles routine messages and only escalates real decisions. Teachers save 5.9 hours a week. For every school, every teacher, every parent."
