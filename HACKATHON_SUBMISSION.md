# 🏆 CockroachDB × AWS Hackathon Submission Plan

## Deadline: August 19, 2026 (39 days)

## What You Already Have

### ✅ CockroachDB Tools Used (4 of 4 - Max Score)
1. **MCP Server** — 25 tools, 4 resources, 3 prompts
2. **Distributed Vector Indexing** — C-SPANN (94% smaller than pgvector)
3. **ccloud CLI** — Integrated for cluster provisioning
4. **Agent Skills Repo** — 8 skills in manifest.json

### ✅ AWS Services Used (7 services)
1. **Amazon Bedrock** — Titan V2 embeddings (1024-dim)
2. **AWS Lambda** — CDC handler, webhook dispatcher
3. **Amazon S3** — Memory archives with Glacier lifecycle
4. **AWS KMS** — AES-256-GCM encryption
5. **Amazon SNS** — Alert topic
6. **Amazon SQS** — Retry queue
7. **Amazon EventBridge** — Keep-alive

### ✅ Production-Grade Features
- 1,041 passing tests
- SHA-256 hash chains
- Time-travel queries (AS OF SYSTEM TIME)
- 6 global regions
- OWASP ASI06 security guard
- OAuth 2.1 + PKCE
- Row-Level Security
- LTM Gateway (token savings)
- Sleep-time dreaming

## What You Need to Do

### Week 1: Polish & Deploy
- [ ] Deploy dashboard to Vercel (public URL)
- [ ] Deploy API to Render or Railway
- [ ] Update README with live demo links
- [ ] Add architecture diagram

### Week 2: Video & Documentation
- [ ] Record 3-minute video demo
- [ ] Write submission narrative
- [ ] Create Judge's Tour page

### Week 3: Submit & Promote
- [ ] Submit to Devpost
- [ ] Post on Twitter/X
- [ ] Engage with judges on Discord

## Judging Criteria Alignment

| Criteria | Bastion Score | Evidence |
|----------|---------------|----------|
| Agentic Memory Design | ⭐⭐⭐⭐⭐ | IS agentic memory. 25 MCP tools, C-SPANN, time-travel |
| Technical Implementation | ⭐⭐⭐⭐⭐ | 1,041 tests, production code, dual SDKs |
| Real-World Impact | ⭐⭐⭐⭐⭐ | Solves amnesia, poisoning, crashes for all AI agents |
| Production Readiness | ⭐⭐⭐⭐⭐ | OWASP, OAuth, RLS, KMS, 6 regions |
| Creativity | ⭐⭐⭐⭐⭐ | Hash chains, dreaming, LTM Gateway (unique features) |

## 3-Minute Video Script

### 0:00-0:30 — The Problem
"AI agents forget. They crash. They get poisoned. Traditional databases can't handle autonomous agents that spawn, write constantly, and need memory that persists across regions and failures."

### 0:30-1:00 — The Solution
"Bastion is the system of record for autonomous AI. Built on CockroachDB, it provides persistent, self-healing memory with cryptographic integrity, time-travel queries, and multi-region distribution."

### 1:00-1:30 — Live Demo
Show:
1. Agent storing a memory (memory_store)
2. Agent searching with 4-signal fusion (multi_signal_search)
3. Time-travel query (memory_timetravel)
4. Dashboard showing real-time metrics

### 1:30-2:00 — Technical Architecture
Show:
1. CockroachDB with C-SPANN vector index
2. AWS Bedrock embeddings
3. Hash chain verification
4. 6 global regions

### 2:00-2:30 — Unique Features
Show:
1. LTM Gateway (token savings)
2. Sleep-time dreaming
3. OWASP ASI06 guard
4. Auto-contradiction detection

### 2:30-3:00 — Call to Action
"Bastion is open source, MIT licensed, and free forever. Deploy on CockroachDB Serverless today. 1,041 tests. 25 MCP tools. 6 regions. The fortress of memory."

## Submission Checklist

- [ ] Public GitHub repo (✅ already done)
- [ ] Live demo URL (deploy dashboard)
- [ ] 3-minute video (YouTube/Vimeo)
- [ ] README with CockroachDB tools used
- [ ] README with AWS services used
- [ ] Architecture diagram
- [ ] Devpost submission form

## Budget: $0
- Vercel: Free tier
- Render: Free tier
- CockroachDB Serverless: Free tier
- AWS: Free tier (Bedrock, Lambda, S3)

## Timeline

| Week | Task | Status |
|------|------|--------|
| Week 1 (Jul 10-16) | Deploy to Vercel + Render | ⬜ |
| Week 2 (Jul 17-23) | Record video + Write docs | ⬜ |
| Week 3 (Jul 24-30) | Submit + Promote | ⬜ |
| Week 4 (Jul 31-Aug 7) | Engage judges + iterate | ⬜ |
| Week 5 (Aug 8-19) | Final push + submit | ⬜ |
