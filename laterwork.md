# Later Work — Post-Hackathon Items

## ABSOLUTE_DOMINATION.md — Remaining Items (Audit: 2026-07-07)

### NOT STARTED — Must complete before submission

#### 1. Architecture Diagram (Excalidraw Quality)
- **Why:** Judges expect a visual architecture proof. No standalone diagram file exists.
- **Work Item:** Create `docs/architecture.svg` showing: Agent Fleet → A2A/MCP → Bastion SDK → CockroachDB (5 tables) → CDC → Lambda → S3. Include C-SPANN, CRDT, Hash Chain, RLS labels.
- **Effort:** 2 hours

#### 2. Autonomous Schema Evolution (`schema_evolution.py`)
- **Why:** Claim #21 in the submission text references this feature. File does not exist.
- **Work Item:** Create `src/bastion/schema_evolution.py` with `SemanticDataContract` class that validates column names/types and executes `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at runtime.
- **Effort:** 4 hours

### PARTIAL — Need finishing touches

#### 3. npm Publish TypeScript SDK
- **Status:** Built at `sdk/typescript/` (v0.1.0, dist/ ready), but never published to npm.
- **Work Item:** Run `npm publish` from `sdk/typescript/`. Requires npm account + access token.
- **Effort:** 30 minutes

#### 4. Durable Virtual Actor Paging
- **Status:** `BastionAgent` has checkpointing and consolidation, but no explicit memory windowing.
- **Work Item:** Add `page_size`, cursor, and memory windowing to `BastionAgent` for dehydrating/reactivating agent contexts.
- **Effort:** 1 day

### Submission Artifacts — Critical for judging

#### 5. Demo Video (3 minutes)
- **Status:** Script exists in `DEMO_SCRIPT.md`. Not recorded.
- **Work Item:** Record 1080p video showing: dashboard live → hash chain break detection → CRDT merge → time-travel query → close on metrics. Upload to YouTube.
- **Effort:** 6 hours

#### 6. Vercel Deployment Verified
- **Status:** Dashboard deployed, but not verified with real CRDB cluster + Bedrock.
- **Work Item:** Confirm live URL loads with real data from CRDB Cloud. Test all endpoints.
- **Effort:** 2 hours

---

## Hackathon Security & Threat Vector Roadmap

### 1. Context Compaction & Safety Pinning (OpenClaw Defense)
- **Problem:** AI agents drop safety instructions during context window compaction (e.g., Summer Yue Meta OpenClaw incident where "suggest, don't act" was truncated, leading to mass inbox deletion).
- **Work Item:** Build the database-backed `mem.pin(content, priority="CRITICAL")` engine. Ensure critical safety rows bypass sliding-window compaction and get re-injected at the prompt boundaries on every execution cycle.

### 2. Cryptographic Tenant Isolation (Zero-Trust Memory)
- **Problem:** Logical isolation (simple `WHERE tenant_id = X` clauses) is vulnerable to SQL injection or developer filters dropping. If a filter fails, cross-tenant memories bleed.
- **Work Item:** Implement Tenant-Specific Data Encryption Keys (DEKs) via AWS KMS. AES-256-GCM encrypt all memory contents per-agent so that even if logical query boundaries fail, data remains cryptographically isolated.

### 3. Multi-Language Prompt Injection (Mandarin/Arabic/Portuguese Guard)
- **Problem:** Attackers split prompt injection payloads across multiple languages to bypass English-only filters in production.
- **Work Item:** Integrate `langdetect` into the `guard.py` pipeline to detect translated instruction-override vectors without API call overhead.

### 4. C-SPANN Tenant Index Partitioning
- **Problem:** Searching a single global vector index scales poorly and leaks search metrics across namespaces.
- **Work Item:** Modify index definitions to `CREATE VECTOR INDEX ON agent_memory (agent_id, namespace, embedding)` to enforce hardware/logical locality and guarantee sub-10ms query speeds.

### 5. Webhook Rate Limiting & Circuit Breakers (Spend Defense)
- **Problem:** Rogue looping agents can call tools infinitely and trigger runaway API and server costs.
- **Work Item:** Build token-aware rate limiting (TPM/cost-per-minute thresholds) and add a loop detector circuit breaker to suspend agents executing identical queries.

---

## Phase 1 — Immediate Submission Prep

### 9. Submit to Claude Connector Directory

Submit the server to https://claude.com/docs/connectors/building/submission for listing. Requires:
- Server Card at `/.well-known/mcp-server.json` — ✅ done
- OAuth 2.1 — ✅ done
- Tool annotations — ✅ done
- Resources + Prompts — ✅ done
- Fill out the submission form with repo URL, description, and auth details

---

## Phase 3 — World-Class Differentiators

### 12. Video Demo

Record a walkthrough showing an agent using all 8 MCP tools:
1. `memory_store` — store memories
2. `memory_search` — search with C-SPANN vector similarity
3. `memory_timetravel` — query past state
4. `memory_audit` — inspect hash chain
5. `memory_heal` — self-heal expired records
6. `memory_delete` — remove with confirmation
7. `resolve_conflict` — merge conflicting facts
8. `a2a_bridge` — inter-agent card

Use Remotion (`skills/remotion`) for smooth transitions, zooming, and text overlays.

### 13. A2A Bridge — Real Agent Communication

Replace the static agent card with actual A2A protocol communication:
- Wire up `tasks/send` for inter-agent message passing
- Support streaming responses between agents
- Publish capabilities dynamically based on runtime state

### 14. Full OpenAPI + MCP Docs

Serve interactive documentation from the server:
- OpenAPI 3.1 spec at `/.well-known/openapi.json`
- MCP documentation page with tool/resource/prompt reference
- Auto-generated from FastMCP schema
