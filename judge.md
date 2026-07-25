# Bastion — Hackathon Judging Analysis

> CockroachDB × AWS Hackathon: Build with Agentic Memory
> Deadline: 19 Aug 2026 @ 2:30am GMT+5:30

---

## 1. Executive Summary

**Bastion** is a forensic system of record for autonomous AI agents, providing crash-proof memory with cryptographic integrity on CockroachDB. It is a production-grade, security-hardened platform with ~12,000 lines of Python backend, a Next.js 16 dashboard, 30 SQL migrations, 25 MCP tools, 25 A2A skills, and comprehensive security defenses.

**Overall Quality: 8.4/10**

**Top 3 Strengths:**
1. Cryptographic integrity (SHA-256 hash chains + HMAC + Merkle trees) — no competitor offers this
2. CockroachDB-native features deeply integrated (AS OF SYSTEM TIME, C-SPANN, CDC, REGIONAL BY ROW)
3. Dual-protocol server (MCP + A2A) with 25 tools each, full auth, and rate limiting

**Top 3 Weaknesses:**
1. API key leaked in HTML `data-api-key` attribute (security vulnerability)
2. No login page exists (broken auth flow)
3. Mock mode bypass in staging environments

---

## 2. Hackathon Requirements Checklist

### Mandatory Requirements

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Use CockroachDB as persistent memory layer | ✅ | `agent_memory` table, 17 columns, VECTOR(1024), JSONB metadata, TTL per memory type |
| At least 2 CockroachDB tools | ✅ | Uses ALL 4 tools (see below) |
| At least 1 AWS service | ✅ | Uses 4+ AWS services (see below) |
| Public open source repo | ✅ | MIT License, `LICENSE` file present |
| Functional demo app | ✅ | `bastion-self.vercel.app` |
| Video < 3 minutes | ⚠️ | Needs creation |
| README documentation | ✅ | Comprehensive with architecture diagrams |

### CockroachDB Tools Used

| Tool | How Used | Evidence |
|------|----------|----------|
| **Distributed Vector Indexing** | C-SPANN vector index on `embedding VECTOR(1024)`, cosine similarity via `<=>` operator | `schema/002_agent_memory.sql:20`, `memory.py:929` |
| **MCP Server** | 25 tools, 4 resources, 3 prompts for agent integration | `mcp_server.py` (2,347 lines) |
| **ccloud CLI** | Cluster provisioning, status, auto-scaling, query latency monitoring | `dba.py` (5 ccloud commands), `scripts/ccloud_*.py` |
| **Agent Skills Repo** | 8 canonical skills with dual-protocol (MCP + A2A) | `skills/manifest.json` |

### AWS Services Used

| Service | How Used | Evidence |
|---------|----------|----------|
| **Amazon Bedrock** | Titan V2 embeddings (1024-dim) with circuit breaker fallback | `memory.py:38-65`, `config.py:51` |
| **AWS Lambda** | CDC handler (hash chain verification, drift detection, self-healing) + webhook dispatcher | `lambda/cdc_handler.py`, `lambda/webhook_dispatcher.py` |
| **Amazon S3** | Memory archives with Glacier lifecycle | `archive.py` |
| **AWS KMS** | AES-256-GCM envelope encryption | `kms.py` (Local/AWS/GCP KMS) |

---

## 3. Judging Criteria — Strict Evaluation

### Criterion 1: Agentic Memory Design
> "Does CockroachDB play a meaningful, production-grade role as the agent's memory layer? Is it used for more than toy queries — state, embeddings, context, or transactional data at real scale?"

**Score: 9/10**

| Requirement | Evidence | Status |
|-------------|----------|--------|
| CockroachDB as persistent memory | `agent_memory` table with 17 columns, VECTOR(1024), JSONB metadata, TTL per memory type | ✅ Production-grade |
| State management | `agent_checkpoints` table for crash recovery, `a2a_tasks` for task lifecycle, session/procedural/episodic memory types | ✅ Real state |
| Embeddings | C-SPANN vector index on `embedding VECTOR(1024)`, cosine similarity via `<=>` operator, AWS Bedrock Titan V2 embeddings | ✅ Real embeddings |
| Context | `context_pack` tool packs memories into token budgets for LLM injection, `session_memory` separates ephemeral vs permanent | ✅ Real context |
| Transactional data | SERIALIZABLE isolation on every write, hash chain integrity, append-only audit log | ✅ Real transactions |
| Not toy queries | 30 SQL migrations, 20+ tables, 40+ indexes, RLS on 8 tables, native TTL, REGIONAL BY ROW | ✅ Not toy |

**Deductions (-1):** The README claims "22+ memories stored" as the real-world metric — this is very low scale. The vector index comment says "Requires CockroachDB v25.2+ with vector indexing (Preview)" — judges may question if this is actually running on a production cluster or a local Docker setup.

### Criterion 2: Technical Implementation
> "Is the integration with CockroachDB tools (distributed vector index, MCP Server, ccloud CLI) quality software engineering? Does the agent use the tools correctly and safely?"

**Score: 8/10**

#### Tool 1: Distributed Vector Indexing
| Check | Evidence | Status |
|-------|----------|--------|
| Vector column exists | `embedding VECTOR(1024)` in `002_agent_memory.sql` | ✅ |
| Vector index created | `CREATE VECTOR INDEX IF NOT EXISTS idx_memory_embedding ON agent_memory (agent_id, embedding)` | ✅ |
| Cosine similarity query | `(1.0 - (embedding <=> %s::vector))` in `memory.py:929` | ✅ |
| Embedding generation | Bedrock Titan V2 with circuit breaker fallback to hash-based | ✅ |
| Graceful degradation | Falls back to keyword search on vector failure (`memory.py:963`) | ✅ |

#### Tool 2: MCP Server
| Check | Evidence | Status |
|-------|----------|--------|
| 25 tools registered | Confirmed in `mcp_server.py` with `@mcp.tool` decorators | ✅ |
| Tool annotations | `ToolAnnotations(readOnlyHint, destructiveHint, idempotentHint, openWorldHint)` | ✅ |
| Auth | OAuth 2.1 + PKCE + API key | ✅ |
| Rate limiting | CockroachDB-backed distributed limiter | ✅ |
| Security scan | `mcp_scanner.py` scans tool descriptions for malicious patterns | ✅ |

#### Tool 3: ccloud CLI
| Check | Evidence | Status |
|-------|----------|--------|
| Cluster provisioning | `memory.provision_cluster()` calls `ccloud cluster create` | ✅ |
| Cluster status | `AutonomousDBA.get_cluster_status()` calls `ccloud cluster describe` | ✅ |
| Auto-scaling | `AutonomousDBA.scale_up_cluster()` calls `ccloud cluster update` | ✅ |
| Query latency monitoring | Queries `crdb_internal.node_statement_statistics` | ✅ |
| Schema evolution | `SchemaEvolution` class for online DDL | ✅ |

#### Tool 4: Agent Skills Repo
| Check | Evidence | Status |
|-------|----------|--------|
| Skills manifest | `skills/manifest.json` with 8 skills | ✅ |
| Dual protocol | `"protocols": ["mcp", "a2a"]` | ✅ |
| Input/output schemas | Each skill has `input_schema` and `output_schema` | ✅ |

**Deductions (-2):**
- The `ccloud` CLI calls use `subprocess.run()` — a judge could flag this as "calling a CLI" rather than "using the tool correctly." The `ccloud` integration is real but thin (5 commands).
- The skills manifest has 8 skills, but the MCP server has 25 tools. The manifest is a subset, not the full set. This is fine but could be clearer.
- Some tool descriptions in the MCP server are copy-pasted (e.g., `memory_store` description appears in multiple places).

### Criterion 3: Real-World Impact
> "How big of an impact could the project have on real users or workflows? Is the use case meaningful, not just technically impressive?"

**Score: 9/10**

**Use case:** Agent memory poisoning is a real, documented threat (OWASP Top 10 for LLM Applications 2025, Cisco MemoryTrap). Bastion provides:
- **Detect** — OWASP ASI06 guard blocks poisoned memories in <100ms
- **Investigate** — Time-travel to see what the agent knew at any moment
- **Recover** — Hash chains prove integrity, restore verified state
- **Audit** — Every operation logged with cryptographic proof

**Evidence of real-world applicability:**
- OWASP ASI06 compliance (not just a label — 9 injection patterns + Unicode normalization + LLM classifier)
- GDPR Article 17 verifiable unlearning receipts
- EU AI Act Article 12 compliance mode
- Multi-agent coordination via CRDTs
- LTM Gateway saves ~2,965 tokens per cached analysis

**Deductions (-1):** The demo is in mock mode. The README says "22+ memories stored" on a real cluster. Judges want to see a real agent doing real work, not a toy demo. The video requirement is critical — if the video shows mock mode, it hurts.

### Criterion 4: Production Readiness
> "Is the design secure, observable, and scalable? Has the team thought about resilience, access control, and what happens when things go wrong?"

**Score: 7/10**

#### Security
| Check | Evidence | Status |
|-------|----------|--------|
| Injection protection | 9 regex patterns + LLM classifier + Unicode normalization (Cyrillic homoglyphs, fullwidth, zero-width) | ✅ Strong |
| PII detection | Email, phone, SSN, credit card, IP — redacted before storage | ✅ |
| Row-Level Security | 8 tables with RLS policies, `SET LOCAL app.current_agent_id` | ✅ |
| Encryption | AES-256-GCM envelope (Local/AWS/GCP KMS) | ✅ |
| Timing-safe auth | `crypto.timingSafeEqual` on all comparisons | ✅ |
| API key in HTML | `data-api-key={process.env.BASTION_API_KEY}` in `layout.tsx:42` | ❌ **CRITICAL** |
| No login page | Middleware redirects to `/login` but page doesn't exist | ❌ **HIGH** |
| Mock mode bypass | Staging environments pass through unauthenticated | ❌ **HIGH** |

#### Observability
| Check | Evidence | Status |
|-------|----------|--------|
| Audit log | Append-only `agent_audit` table with hash chain | ✅ |
| OpenTelemetry | `telemetry.py` wraps all operations with tracing spans | ✅ |
| Prometheus metrics | MCP server exports request counts, durations, rate limit hits | ✅ |
| Drift detection | 6-dimension behavioral monitoring | ✅ |
| Webhook alerts | Slack/Discord/generic webhooks for anomalies | ✅ |
| Health checks | `memory_health` tool, dashboard health page | ✅ |

#### Resilience
| Check | Evidence | Status |
|-------|----------|--------|
| Circuit breaker | Bedrock: 5 failures → open → 30s recovery | ✅ |
| Retry engine | Exponential backoff on serialization errors (40001) | ✅ |
| Connection pool | Health checks, idle reaping, `RESET ALL` on release | ✅ |
| Hash fallback | When Bedrock is down, hash-based embeddings keep working | ✅ |
| CDC self-healing | Lambda handler verifies hash chain, detects corruption, rolls back | ✅ |
| Graceful degradation | Vector search falls back to keyword search | ✅ |

#### Scalability
| Check | Evidence | Status |
|-------|----------|--------|
| Connection pooling | Min 5, max 20 connections with idle reaping | ✅ |
| Distributed rate limiting | CockroachDB `SELECT FOR UPDATE` slots | ✅ |
| Multi-region | REGIONAL BY ROW on agent_memory | ✅ |
| TTL | Native CockroachDB TTL on 3 tables | ✅ |
| Per-agent budgets | Daily spend tracking with hard/soft limits | ✅ |

**Deductions (-3):**
1. **API key in HTML** — This is a security vulnerability that a judge will catch. The key is visible in View Source.
2. **No login page** — The auth flow is broken. Middleware redirects to `/login` but the page doesn't exist.
3. **Mock mode bypass** — Staging/preview environments are unprotected.
4. **In-memory rate limiter on dashboard** — `_rateBuckets` is a `Map` in serverless, so rate limiting is per-invocation, not per-IP.
5. **GlobalErrorHandler is a no-op** — `return null` in the root layout.

### Criterion 5: Creativity & Originality
> "Is this a genuinely new idea or a novel application of the technology? Does it demonstrate insight into what makes agentic systems different from traditional apps?"

**Score: 9/10**

**Novel aspects:**
1. **SHA-256 hash chains for agent memory** — No competitor (Mem0, Zep, Cognee, Letta) does this. Every memory is cryptographically linked to its predecessor.
2. **AS OF SYSTEM TIME time-travel** — Query memory state at any past moment. This is CockroachDB-specific and genuinely novel for agent memory.
3. **OWASP ASI06 guard** — Blocks prompt injection before it reaches memory. 9 patterns + Unicode normalization + LLM classifier.
4. **CDC-triggered self-healing** — Lambda receives changefeed events, verifies hash chain, detects corruption, rolls back automatically.
5. **LTM Gateway** — Before running expensive workflows, check if a similar analysis already exists. Saves ~2,965 tokens per reuse.
6. **Forensic narrative** — "Detect, investigate, recover, audit" — this is a story no other memory system tells.
7. **Dual protocol** — MCP + A2A with 25 tools each, cross-protocol bridge.
8. **CRDT conflict resolution** — VectorClock, LWWRegister, ORSet, PNCounter, RGA for multi-agent coordination.

**Deductions (-1):** The idea is genuinely novel, but the demo needs to show it working with a real agent. If the video shows mock mode, the "real-world" claim weakens.

---

## 4. Final Scores

| Criterion | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Agentic Memory Design | High | 9/10 | 9.0 |
| Technical Implementation | High | 8/10 | 8.0 |
| Real-World Impact | High | 9/10 | 9.0 |
| Production Readiness | High | 7/10 | 7.0 |
| Creativity & Originality | High | 9/10 | 9.0 |
| **Overall** | | | **8.4/10** |

---

## 5. What's Blocking Top 3

| Priority | Gap | Impact on Score | Fix Time |
|----------|-----|-----------------|----------|
| **CRITICAL** | API key in HTML DOM | Production Readiness -2 | 10 min |
| **CRITICAL** | No `/login` page | Production Readiness -1 | 20 min |
| **HIGH** | Mock mode bypass in staging | Production Readiness -0.5 | 5 min |
| **HIGH** | In-memory rate limiter ineffective in serverless | Production Readiness -0.5 | 15 min |
| **MEDIUM** | GlobalErrorHandler is no-op | Production Readiness -0.5 | 5 min |
| **MEDIUM** | Demo shows 22 memories, not real scale | Impact -1 | Video work |

**Fix the 2 CRITICAL + 2 HIGH items and you're at 9.0+ overall. That's top 3 territory.**

---

## 6. Competitive Assessment

| Feature | Bastion | Mem0 | Zep | Cognee | Letta |
|---------|---------|------|-----|--------|-------|
| SHA-256 Hash Chains | Yes | No | No | No | No |
| Time-Travel (AS OF SYSTEM TIME) | Yes | No | No | No | No |
| SERIALIZABLE Isolation | Yes | No | No | No | No |
| OWASP ASI06 Guard | Yes | No | No | No | No |
| C-SPANN Vector Index | Yes | No | No | No | No |
| Dual Protocol (MCP + A2A) | Yes | No | No | No | No |
| CRDT Conflict Resolution | Yes | No | No | No | No |
| Autonomous DBA | Yes | No | No | No | No |
| LTM Gateway (cost savings) | Yes | No | No | No | No |
| EU AI Act Compliance | Yes | No | No | No | No |

**Bastion's differentiator:** The forensic narrative — detect, investigate, recover, audit — with cryptographic proof. No competitor offers this combination.

---

## 7. Verified Gaps (from Code Analysis)

### CRITICAL Gaps

#### 1. API Key Leaked in HTML DOM
**File:** `dashboard/src/app/layout.tsx:42`
```tsx
<html lang="en" data-api-key={process.env.BASTION_API_KEY || ''}>
```
The `BASTION_API_KEY` is rendered into the HTML source. Any user can View Source and extract it. The client-side `fetchWithTimeout` reads it from `document.documentElement.getAttribute("data-api-key")`. This means the API key is visible in browser DevTools, network tab, and page source.

**Impact:** Anyone visiting the dashboard can steal the API key and make authenticated API calls.

**Fix:** Move API key injection to a server-side API route proxy, or use HTTP-only cookies. Never expose secrets in HTML attributes.

#### 2. No Login Page Exists
**Search:** `glob("**/login/**")` returns nothing. The middleware redirects to `/login?redirect=...` on auth failure, but there is no `/login` page. Users hitting a protected route without auth get redirected to a non-existent page (404).

**Impact:** Broken auth flow — new users cannot log in.

#### 3. Mock Mode Bypass in Production-like Environments
**File:** `dashboard/middleware.ts:54-59`
```ts
const isMock = process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1"
  || (!process.env.BASTION_MOCK && !process.env.BASTION_CONN && !process.env.BASTION_DB_URL);
if (isMock) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }
}
```
If `NODE_ENV` is not explicitly `"production"` (e.g., staging, preview deployments), unauthenticated access is granted. Vercel preview deployments default to `NODE_ENV=development`.

**Impact:** Staging/preview environments are unprotected.

### HIGH Gaps

#### 4. Rate Limiter In-Memory State Not Shared Across Instances
**File:** `dashboard/src/lib/api-auth.ts:7`
```ts
const _rateBuckets = new Map<string, number[]>();
```
The rate limiter is a plain in-memory `Map`. On Vercel (serverless), each function invocation gets its own instance. The 120 req/min limit is effectively per-invocation, not per-IP.

**Impact:** Rate limiting is ineffective in serverless deployments.

#### 5. PKCE Verifier Stored in Plaintext Dict
**File:** `src/bastion/auth_provider.py:63`
```python
_pkce_verifiers: dict[str, str] = {}
```
PKCE code verifiers are stored in a plain Python dict. If the server process is compromised, all pending authorization codes and their verifiers are exposed. Also, this dict is not shared across worker processes.

**Fix:** Store in CockroachDB (the `oauth_pkce_verifiers` table already exists in migration 021) or encrypt at rest.

#### 6. `GlobalErrorHandler` Is a No-Op
**File:** `dashboard/src/components/GlobalErrorHandler.tsx`
```tsx
export default function GlobalErrorHandler() {
  return null;
}
```
This component is rendered in the root layout but does nothing. Unhandled React errors propagate silently.

**Impact:** Frontend errors are invisible to users and developers.

#### 7. No CSRF Protection on API POST Routes
**File:** `dashboard/src/lib/api-auth.ts`
The `requireAuth` function only checks API key and rate limit. POST routes (`/api/demo/poison`, `/api/demo/heal`, `/api/demo/chat`) have no CSRF token validation. They rely on `SameSite` cookies, but the API key is passed via `Authorization` header, not cookies.

**Impact:** Cross-site request forgery possible if API key is leaked (see gap #1).

### MEDIUM Gaps

#### 8. `_SAFE_ERROR_MSG` in A2A Server Swallows All Details
**File:** `src/bastion/a2a_server.py:42`
```python
_SAFE_ERROR_MSG = "Internal server error (see server logs for details)"
```
All internal errors return the same generic message. While this prevents information leakage, it makes debugging impossible without server log access.

#### 9. Rate Limiter Sliding Window Has O(n) Cleanup
**File:** `dashboard/src/lib/api-auth.ts:57`
```ts
timestamps = timestamps.filter((t) => t > cutoff);
```
Every request triggers a full array scan. Under high traffic with many IPs, this becomes a performance bottleneck.

#### 10. MCP Scanner Uses MD5 for Cache Key
**File:** `src/bastion/mcp_scanner.py:38`
```python
cache_key = hashlib.md5(description.encode("utf-8")).hexdigest()
```
MD5 is used for caching (not security), but it's a poor practice that could flag in security audits. Use SHA-256 for consistency with the rest of the codebase.

#### 11. No Input Length Validation on MCP Tools
**File:** `src/bastion/mcp_server.py:50-52`
```python
MAX_K = 100
MAX_STORE_BYTES = 100_000
_MAX_CONTENT_LENGTH = 100_000
```
Constants are defined but it's unclear if they're enforced on every tool. The `memory_store` tool has a content length check, but other tools like `memory_search` don't validate query length.

#### 12. No Health Check Endpoint on A2A Server
**File:** `src/bastion/a2a_server.py`
The A2A server has `healthz` and `readyz` endpoints, but the health check doesn't verify database connectivity — it just returns `{"status": "ok"}`.

#### 13. Webhook Notifier Has No Retry on Failure
**File:** `src/bastion/webhooks.py`
The `WebhookNotifier` sends webhooks in a background thread pool, but failed webhooks are logged and dropped. No retry queue or dead-letter mechanism.

#### 14. Mock Mode Returns Unlimited Budget
**File:** `src/bastion/spend_manager.py:79`
```python
if self._mock:
    return {"allowed": True, "remaining": 999999, "limit": 999999, ...}
```
Mock mode bypasses all budget checks. Tests that run in mock mode won't catch budget enforcement bugs.

### LOW Gaps

#### 15. No `robots.txt` or `sitemap.xml`
The dashboard has no `robots.txt` or `sitemap.xml`, which could lead to search engine indexing of dashboard pages.

#### 16. CSS Architecture Could Be Consolidated
The dashboard uses 5 separate CSS files (`variables.css`, `reset.css`, `layout.css`, `components.css`, `animations.css`) imported into `globals.css`. While modular, this creates potential specificity conflicts and makes theme customization harder.

#### 17. No Dark/Light Mode Toggle
The dashboard is hardcoded to a dark theme (`background: #0a0508`). There's no user preference or system preference detection.

#### 18. TypeScript Strict Mode Gaps
Some API routes use `any` types for database query results. The `lib/db.ts` `safeQuery` function returns `any[]`, losing type safety.

#### 19. Missing `playground` Route in Protected Routes
**File:** `dashboard/middleware.ts:5`
The `/playground` route is not in `PROTECTED_ROUTES`, so it's accessible without auth. This may be intentional for demo purposes, but it's worth verifying.

---

## 8. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  AGENT CLIENTS                                       │
│  Claude Desktop, Cursor, LangGraph, Custom Agents    │
│  (MCP Protocol — 25 tools, 4 resources, 3 prompts)  │
└──────────────────────┬──────────────────────────────┘
                       │ JSON-RPC 2.0
┌──────────────────────▼──────────────────────────────┐
│  BASTION MCP SERVER (2,347 lines)                    │
│  ├─ OWASP ASI06 MemoryGuard                         │
│  ├─ SHA-256 Hash Chain Engine                       │
│  ├─ OAuth 2.1 (PKCE) + RBAC                        │
│  ├─ Circuit Breaker + Retry Engine                  │
│  └─ Rate Limiting (CockroachDB-backed)             │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  BASTION A2A SERVER (2,094 lines)                    │
│  ├─ A2A v1.0 JSON-RPC 2.0                          │
│  ├─ Ed25519 Agent Card Signing                      │
│  ├─ 25 Skills + 3 Internal                          │
│  └─ Push Notification Dispatcher                    │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  COCKROACHDB (v24.3)                                │
│  ├─ agent_memory (C-SPANN VECTOR(1024))             │
│  ├─ agent_audit (append-only, hash-chained)         │
│  ├─ agent_checkpoints (crash recovery)              │
│  ├─ agent_entities/relations (knowledge graph)      │
│  ├─ a2a_tasks (task state machine)                  │
│  ├─ oauth_* tables (token management)               │
│  ├─ RLS on 8 tables                                 │
│  ├─ Native TTL on 3 tables                          │
│  └─ REGIONAL BY ROW locality                        │
└──────────────────────┬──────────────────────────────┘
                       │ CDC Changefeed
          ┌────────────┴────────────┐
┌─────────▼──────────┐ ┌───────────▼─────────┐
│  Lambda CDC Handler│ │ Lambda Webhook       │
│  Hash verification │ │ Push notifications   │
│  Drift detection   │ │ Retry + dedup        │
│  Self-healing      │ │ Callback POST        │
└────────────────────┘ └─────────────────────┘
          │                      │
┌─────────▼──────────┐ ┌────────▼────────────┐
│  AWS Bedrock       │ │ AWS KMS              │
│  Titan V2 1024-dim │ │ AES-256-GCM          │
│  Circuit breaker   │ │ Envelope encryption  │
└────────────────────┘ └─────────────────────┘
```

---

## 9. Data Flow

```
1. Agent calls MCP tool (e.g., memory_store)
2. OWASP ASI06 Guard scans for injection/PII/secrets
3. SHA-256 hash links new memory to previous (chain integrity)
4. C-SPANN vector index updated with 1024-dim embedding
5. CockroachDB stores with SERIALIZABLE isolation
6. CDC changefeed streams to Lambda for monitoring
7. Lambda verifies hash chain, detects drift, self-heals
8. Audit trail logs every operation (append-only)
9. Time-travel queries use AS OF SYSTEM TIME (MVCC)
```

---

## 10. Three-Layer Memory Architecture

| Layer | What It Is | CockroachDB Feature | TTL |
|-------|-----------|---------------------|-----|
| **Short-Term** | Conversational history, session state | Row-level TTL, JSONB | 24 hours |
| **Long-Term** | Persistent knowledge, semantic recall | C-SPANN vector index | Never |
| **Forensic** | Cryptographic proof of integrity | Hash chains, AS OF SYSTEM TIME | Never |

---

## 11. CockroachDB Schema (30 Migrations)

| Migration | Tables Created/Modified | CockroachDB Feature |
|-----------|------------------------|---------------------|
| 001-006 | `agent_checkpoints`, `agent_memory`, `agent_audit`, `agent_coordination`, `agent_entities`, `agent_relations` | C-SPANN vector index, UUID PKs |
| 007-009 | Adds `importance_score`, `trust_level`, `source_provenance` | Schema evolution |
| 010-012 | `agent_drift_*`, `cache_stats`, `a2a_tasks` | TTL indexes |
| 013 | `agent_region_mapping` + `REGIONAL BY ROW` | Multi-region locality |
| 014-016 | `thought_graph`, `agent_limiter`, memory pinning columns | Distributed coordination |
| 017 | Critical fixes: UNIQUE constraints, RLS on 4 tables | Data integrity |
| 018-019 | Native TTL on `agent_memory`, `agent_messages`, `cache_stats` | CockroachDB TTL |
| 020-024 | Auth brute force, OAuth revocation, RBAC, A2A rate limits, agent budgets | Security tables |
| 025-030 | Compaction log, KMS keys, CDC push notifications, provenance indexes, FK cascades | Infrastructure |

**Total: ~20 tables, ~40+ indexes, ~8 RLS policies, ~8 CHECK constraints, 3 native TTL configs, 1 vector index**

---

## 12. MCP Server — 25 Tools

| # | Tool | Read-Only | Destructive | Purpose |
|---|------|-----------|-------------|---------|
| 1 | `memory_search` | Yes | No | C-SPANN vector similarity search |
| 2 | `memory_store` | No | No | Store with SHA-256 hash chain |
| 3 | `memory_timetravel` | Yes | No | AS OF SYSTEM TIME queries |
| 4 | `memory_audit` | Yes | No | Append-only audit log |
| 5 | `memory_heal` | No | Yes | CDC-triggered self-healing |
| 6 | `memory_delete` | No | Yes | Delete with confirmation |
| 7 | `memory_pin` | No | No | Pin safety-critical memories |
| 8 | `memory_get_pinned` | Yes | No | Retrieve pinned memories |
| 9 | `memory_list` | Yes | No | List with filtering/pagination |
| 10 | `memory_correct` | No | No | Governance content correction |
| 11 | `memory_health` | Yes | No | Health metrics |
| 12 | `memory_apply_patch` | No | No | RFC 6902 JSON Patch |
| 13 | `resolve_conflict` | No | No | Multi-agent conflict resolution |
| 14 | `ltm_check_reuse` | Yes | No | LTM Gateway reuse check |
| 15 | `ltm_store_analysis` | No | No | Store analysis for reuse |
| 16 | `ltm_invalidate` | No | No | Mark stale analyses |
| 17 | `detect_contradictions` | No | No | Scan for contradictions |
| 18 | `scan_all_contradictions` | Yes | No | Batch contradiction scan |
| 19 | `dream` | No | Yes | Sleep-time consolidation |
| 20 | `dream_history` | Yes | No | Dream session history |
| 21 | `detect_observations` | Yes | No | Meta-pattern detection |
| 22 | `multi_signal_search` | Yes | No | 4-signal fusion search |
| 23 | `context_pack` | Yes | No | Token budget packing |
| 24 | `agent_schema` | Yes | No | Schema introspection |
| 25 | `a2a_bridge` | Yes | No | Cross-protocol bridge |

**Plus 4 resources** (`bastion://schema`, `config`, `stats`, `memory/{id}`) **and 3 prompts** (`analyze_memory`, `conflict_analysis`, `audit_review`).

---

## 13. A2A Server — 25 Skills + 3 Internal

All 25 MCP tools are mirrored as A2A skills with Ed25519-signed Agent Cards. Additionally, 3 internal skills exist:
- `graph_query` — Multi-hop BFS knowledge graph traversal
- `reinforce` — Memory importance reinforcement (writer role)
- `broadcast` — Inter-agent event broadcasting (writer role)

---

## 14. Frontend Dashboard (Next.js 16)

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.2.10 (App Router) |
| React | 19.2.7 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 + modular CSS |
| Visualization | D3.js (knowledge graph, trust ring, drift chart) |
| Embeddings | `@xenova/transformers` (all-MiniLM-L6-v2) |
| Testing | Vitest + Playwright E2E |
| Deployment | Vercel + Docker |

### Pages (11 routes)

| Route | Purpose |
|-------|---------|
| `/` | Landing page with canvas animations |
| `/dashboard` | Bento grid: KPIs, trust gauge, live feed, heatmap |
| `/playground` | 3-step interactive demo |
| `/graph` | D3 knowledge graph + time-travel slider |
| `/logs` | Memory registry with hash display |
| `/health` | Memory health KPIs |
| `/flight-recorder` | Forensic audit ledger |
| `/compliance` | EU AI Act Article 12 report |
| `/docs/*` | Documentation (6 pages) |
| `/contact` | Contact page |

### API Routes (21 endpoints)

All endpoints follow the pattern: auth check → CockroachDB query (or mock fallback) → `{ success, data }` envelope.

Key endpoints: `/api/stats`, `/api/memories`, `/api/graph`, `/api/audit`, `/api/drift`, `/api/trust`, `/api/compliance`, `/api/asi06`, `/api/events` (SSE), `/api/demo/poison`, `/api/demo/heal`, `/api/demo/chat`.

---

## 15. Test Coverage

**87 test files** covering:

| Category | Test Files | Coverage |
|----------|-----------|----------|
| Core Memory | `test_mock_memory.py`, `test_memory_decay.py`, `test_integration_memory.py` | Store/Search/Time-travel/Audit |
| MCP | `test_mcp_server.py`, `test_mcp_tools_e2e.py`, `test_mcp_scanner.py`, `test_mcp_integration.py` | All 25 tools |
| A2A | `test_a2a_server.py`, `test_a2a_skills_e2e.py`, `test_a2a_tasks.py`, `test_a2a_trust.py` | Protocol + skills |
| Security | `test_guard.py`, `test_firewall.py`, `test_auth_provider.py`, `test_auth_integration.py`, `test_scope_escalation.py`, `test_security_hardening.py` | Auth + injection |
| Infrastructure | `test_circuit_breaker.py`, `test_retry.py`, `test_limiter.py`, `test_rls.py`, `test_migrate.py` | Resilience patterns |
| Features | `test_contradiction.py`, `test_dreaming.py`, `test_knowledge_graph.py`, `test_crdt_memory.py`, `test_saga.py` | Advanced features |
| Stress | `test_stress_concurrent.py`, `test_concurrency.py`, `test_chaos.py` | Reliability |
| E2E | `test_api_e2e.py`, `test_crdb_integration.py`, `tests/test_api_integration.py` | Full stack |

**Claimed: 1,159 tests passing**

---

## 16. Deployment

| Target | Config | Status |
|--------|--------|--------|
| Docker Compose | `docker-compose.yml` + `docker-compose.demo.yml` | CockroachDB + MCP + Dashboard |
| Vercel | `dashboard/vercel.json` | Next.js dashboard |
| Render | `render.yaml` | MCP + A2A servers |
| AWS | `terraform/` + `lambda/` | Lambda CDC + webhooks |

---

## 17. Recommended Improvements (Prioritized)

| Priority | Issue | Fix | Time |
|----------|-------|-----|------|
| **CRITICAL** | API key in HTML attribute | Move to HTTP-only cookie or server-side only | 10 min |
| **CRITICAL** | No login page | Create `/login` page with HMAC token generation | 20 min |
| **HIGH** | Mock mode bypass in staging | Add explicit feature flag, not implicit env detection | 5 min |
| **HIGH** | In-memory rate limiter | Move to CockroachDB-backed limiter for serverless | 15 min |
| **HIGH** | GlobalErrorHandler is no-op | Implement real error handling with error reporting | 5 min |
| **MEDIUM** | PKCE verifier in plaintext dict | Encrypt at rest or use CockroachDB storage | 15 min |
| **MEDIUM** | No CSRF tokens on mutations | Add SameSite=Strict + CSRF token | 10 min |
| **MEDIUM** | Demo shows 22 memories | Seed more data, show real agent interaction in video | Video work |
| **LOW** | MCP Scanner uses MD5 | Switch to SHA-256 for consistency | 2 min |
| **LOW** | No robots.txt | Add robots.txt blocking dashboard pages | 2 min |
