# Bastion — System Design Gap Analysis

**Generated:** 2026-07-23
**Scope:** Full codebase end-to-end analysis (63 source modules, 28 schema migrations, Docker/Terraform/Lambda/CI)
**Total findings:** 185+ issues across critical severity levels

---

## Executive Summary

Bastion is a forensic memory system for AI agents built on CockroachDB + AWS. The architecture is ambitious — hash chains, time-travel queries, OWASP guard, CRDT memory, knowledge graphs, A2A protocol. However, the end-to-end analysis reveals **10 critical**, **67 high**, **65+ medium**, and **33+ low** severity gaps spanning data isolation, compliance, encryption, infrastructure, test coverage, and operational safety.

The most dangerous patterns are:
1. **Inconsistent security enforcement**: RLS is defined in schema but not applied consistently, the OWASP guard is bypassed via `_skip_guard=True` in 6 code paths, and secrets have dangerous defaults.
2. **Critical modules lack test coverage**: `pool.py` (360 lines), `spend_manager.py` (374 lines), `crypto.py` (112 lines), and `a2a_signing.py` (161 lines) have no dedicated tests or stub-only tests.
3. **Broken thread-safety**: `auth_provider.py:675` creates a Lock as a local variable, making token refresh completely unsafe under concurrency.

---

## CRITICAL (8 issues)

### C1. health.py:90 — RLS Context Not Set in Anomaly Detection
**File:** `src/bastion/health.py` **Line:** ~90
**Impact:** `detect_anomalies_real` acquires a connection but does NOT call `_set_rls_context(conn)`. The anomaly detection query sees ALL agents' memories, not just the target agent's. Any agent can trigger anomaly detection that leaks cross-agent memory data.
**Fix:** Add `self._set_rls_context(conn)` after acquiring the connection.

### C2. compliance.py:216 — GDPR "Deletion" is Soft-Delete, Not Physical
**File:** `src/bastion/compliance.py` **Line:** ~216
**Impact:** `generate_unlearning_receipt` uses SQL `UPDATE` to set content to `'[DELETED per GDPR Art 17]'`. The original content is still in the database and recoverable from MVCC history and backups. True GDPR Art 17 requires physical deletion.
**Fix:** Use `DELETE FROM agent_memory WHERE memory_id = %s` instead of UPDATE. Also purge from any backup/snapshot systems.

### C3. kms.py:568 — Key Rotation Makes Old Data Undecryptable
**File:** `src/bastion/kms.py` **Line:** ~568
**Impact:** `rotate_key` generates a new DEK and updates the DB, but does NOT re-encrypt existing memories with the old DEK. The old key is lost. All memories encrypted with the old key become permanently undecryptable.
**Fix:** Before rotating, iterate all memories encrypted with the old DEK, decrypt with old DEK, encrypt with new DEK. Add a re-encryption background job.

### C4. agent_memory Table Has No RLS Policy
**File:** `schema/002_agent_memory.sql`
**Impact:** The most sensitive table in the system (memory content + embeddings + crypto hashes) has NO row-level security. Any authenticated agent can query another agent's memories via vector similarity search.
**Fix:** Add `ALTER TABLE agent_memory ENABLE ROW LEVEL SECURITY` + policy with both `USING` and `WITH CHECK` clauses.

### C5. agent_keys Table Has No RLS Policy
**File:** `schema/026_agent_keys.sql`
**Impact:** The encryption key table (encrypted DEKs, KMS key IDs) has no RLS. Cross-agent read could expose encryption material, enabling decryption of another agent's memories.
**Fix:** Add RLS with `USING` and `WITH CHECK` clauses.

### C6. FK Cascade on agent_relations.source_memory_id Guarantees Orphaned Rows
**File:** `schema/006_agent_relations.sql` **Line:** ~10
**Impact:** `source_memory_id UUID REFERENCES agent_memory(memory_id)` with no ON DELETE CASCADE. Migration 018 enables native TTL on `agent_memory`, which auto-deletes rows. This **guarantees** orphaned FK references — a data corruption path that will activate in production.
**Fix:** Add `ON DELETE SET NULL` to the FK, or remove the FK constraint entirely and enforce referential integrity in application code.

### C7. HMAC Secret Defaults to Known Value, Bypasses All Integrity Checks
**File:** `docker-compose.yml:91`, `lambda/cdc_handler.py:72-78`
**Impact:** `BASTION_HMAC_SECRET` defaults to `change-me-in-production`. In `cdc_handler.py`, when the secret is not set, HMAC verification falls back to `b""`, meaning hash chain verification is completely bypassed — all hashes match, tampering is undetectable.
**Fix:** Fail loudly if `BASTION_HMAC_SECRET` is not set. Remove the empty-string fallback.

### C8. RLS Policies Missing WITH CHECK Clause — Agents Can Write Other Agents' Rows
**File:** `schema/017_critical_fixes.sql` **Lines:** ~40-56
**Impact:** All 4 RLS policies use only `USING` (read/delete gating). Without `WITH CHECK`, agents can INSERT/UPDATE rows belonging to other agents. The `true` parameter in `current_setting('app.current_agent_id', true)` returns NULL silently when not configured, disabling all RLS.
**Fix:** Add `WITH CHECK` clauses to all policies. Ensure `app.current_agent_id` is always set in production contexts.

---

## HIGH (46 issues)

### Source Code

| ID | File:Line | Issue |
|----|-----------|-------|
| H1 | `memory.py:146` | `_validate_k` allows arbitrarily large k values — OOM risk |
| H2 | `errors.py` (cross-cutting) | Custom error hierarchy defined but almost entirely unused; modules raise raw ValueError/RuntimeError |
| H3 | `pool.py:88` | No connect timeout on psycopg connections — can hang indefinitely |
| H4 | `circuit_breaker.py:107` | Semaphore release in `_on_success` may release wrong permit across threads |
| H5 | `auth_provider.py:170` | Client secrets stored in plain memory, not hashed/encrypted |
| H6 | `auth_provider.py:361` | `get_client` creates raw connections that leak on exception |
| H7 | `auth_provider.py:59` | `_pkce_verifiers` dict grows unbounded — memory exhaustion attack |
| H8 | `mcp_server.py:66` | Global singletons (pool, rate limiter) don't work across multiple workers |
| H9 | `telemetry.py:91` | `TracedBastionMemory` doesn't expose ~15 API methods (close, delete, list, pin, graph, messaging) |
| H10 | `webhooks.py:165` | SSRF: `urllib.request.urlopen` follows redirects — bypasses URL validation |
| H11 | `push_dispatcher.py:72` | `httpx.Client` shared across threads — not thread-safe |
| H12 | `analytics.py:40` | `full_report()` loads ALL memories into memory — OOM for large agents |
| H13 | `analytics.py:296` | `_check_hash_chain` loads ALL memories, O(n log n) sort — OOM risk |
| H14 | `firewall.py:103` | `check_hash_chain_integrity` loads ALL memories — OOM risk |
| H15 | `compliance.py:270` | `list_all()` called after deletion — expensive, can fail on large datasets |
| H16 | `archive.py:45` | S3 uploads without `ServerSideEncryption` — data at rest unencrypted |
| H17 | `ltm_gateway.py:200` | Similarity computed from importance_score, not actual vector similarity — semantically wrong |
| H18 | `contradiction.py:381` | `scan_all` does O(n^2) pairwise comparison — unbounded |
| H19 | `session_memory.py:224` | `_promote_entry` uses `_skip_guard=True` — bypasses security for all promoted memories |
| H20 | `dreaming.py:323` | `_promote_to_semantic` uses `_skip_guard=True` — bypasses security |
| H21 | `capture_hooks.py:301` | `_store_event` uses `_skip_guard=True` — captured events bypass security |
| H22 | `cli.py:69` | `import_jsonl` uses `_skip_guard=True` — imported content bypasses security |
| H23 | `a2a_tasks.py:54` | `store_task` doesn't set RLS context — may fail or insert with wrong agent context |
| H24 | `bridge_mem0.py:247` | `delete_all` executes without RLS context — violates isolation |
| H25 | `guard.py:530` | `scan_tool_manifest` doesn't check for overly broad permissions or suspicious input schemas |
| H26 | `memory.py:866` | `_search_real` uses fragile `_released` flag for connection lifecycle |
| H27 | `config.py:68` | `api_key` defaults to empty string — auth effectively disabled |

### Schema

| ID | File:Line | Issue |
|----|-----------|-------|
| H28 | `001:10` | `status` has no CHECK constraint — any string accepted |
| H29 | `001:9` | `token_cost` has no CHECK >= 0 — negative costs corrupt billing |
| H30 | `001:4` | `step_number` has no CHECK >= 0 |
| H31 | `004:1-10` | No UNIQUE on `(resource)` — concurrent lock acquisition defeats coordination |
| H32 | `006:4-5` | FKs lack ON DELETE CASCADE — orphaned rows on entity deletion |
| H33 | `014:16 + 017:28` | Index name collision `idx_thought_parent` — partial index never created |
| H34 | `013:10-13` | Region locality pins all rows to us-east-1 with no migration logic |
| H35 | `017:5-6` | `CREATE UNIQUE INDEX` fails on existing duplicate `(agent_id, name)` |
| H36 | `017:40,45,50,55` | `CREATE POLICY` not idempotent — re-run fails |
| H37 | `022:3-4` | Depends on `oauth_access_tokens`/`oauth_refresh_tokens` tables not in schema set |
| H38 | All 28 | No rollback mechanism for any migration |

### Infrastructure

| ID | File:Line | Issue |
|----|-----------|-------|
| H39 | `terraform/main.tf:86` | IAM policy `logs:*` on `Resource: "*"` — overly permissive |
| H40 | `terraform/main.tf:91` | KMS policy on `Resource: "*"` — allows encrypt/decrypt any key |
| H41 | `terraform/main.tf:107` | SNS `sns:Publish` on `Resource: "*"` |
| H42 | `terraform/main.tf:171` | Lambda not in VPC despite VPC being defined |
| H43 | `terraform/main.tf:171` | Lambda secrets in plaintext env vars |
| H44 | `terraform/main.tf:222` | CloudWatch alarm has no `alarm_actions` — does nothing |
| H45 | `terraform/main.tf` | No `aws_s3_bucket_public_access_block` |
| H46 | `terraform/main.tf` | No remote state backend — local state with no encryption |
| H47 | `lambda/deploy_direct.py:40` | Wrong file paths (`cdc_handler/handler.py` vs `cdc_handler.py`) — crashes |
| H48 | `lambda/deploy_direct.py:49` | Missing `subprocess` import — `NameError` at runtime |
| H49 | `lambda/deploy_direct.py:112` | Missing env vars (`BASTION_HMAC_SECRET`, `BASTION_S3_BUCKET`) |
| H50 | `lambda/webhook_dispatcher.py:139` | SSRF: no URL validation on `callback_url` |
| H51 | `lambda/webhook_dispatcher.py:84` | No retry on SQS send failure — webhooks silently lost |
| H52 | `lambda/template.yaml:29-30` | Secrets in plaintext Lambda env vars |
| H53 | `scripts/ttl_cleanup.py:35` | SQL injection via `%` string formatting |

---

## MEDIUM (50+ issues)

### Source Code

| File | Count | Key Issues |
|------|-------|------------|
| `guard.py` | 4 | False positives from broad regex, TOCTOU on stats, slow base64 scanning, LLM singleton never recovers from transient failure |
| `pool.py` | 2 | Busy-wait acquire loop, health check gap for recently-released connections |
| `rls.py` | 2 | Fragile SQL splitting on `\n`, autocommit modification leaks across callers |
| `config.py` | 1 | Settings singleton never invalidated on env var change |
| `retry.py` | 1 | `time.sleep` blocks thread in async context |
| `circuit_breaker.py` | 1 | TOCTOU between state check and function call |
| `memory.py` | 3 | Skip-guard logs raw content, contradiction detection swallows exceptions, fragile release flag |
| `trust.py` | 1 | Inconsistent scoring for missing vs broken hash chains |
| `groq_callback.py` | 1 | Silently returns mock on any exception |
| `session_memory.py` | 1 | Race condition in size check/trim |
| `crdt_memory.py` | 1 | Mutates original MemoryRecord in-place |
| `limiter.py` | 1 | Orphaned slots not reclaimed |
| `knowledge_graph.py` | 1 | Silent skip of duplicate entities may leave orphaned relations |
| `mock.py` | 1 | Global mutable state shared across instances |
| `firewall.py` | 1 | `_blocked_agents` grows unbounded, never expires |
| `push_dispatcher.py` | 1 | O(n) list pop(0) |
| `mcp_server.py` | 1 | Unvalidated base64 cursor decoding |
| `router.py` | 1 | `max()` on potentially empty dict |
| `kms.py` | 1 | DEK cache never evicted |
| `dba.py` | 1 | String interpolation for SQL LIMIT |

### Schema

| Category | Count | Key Issues |
|----------|-------|------------|
| Missing CHECK constraints | 15+ | Status columns, confidence bounds, non-negative counters, stddev >= 0 |
| Missing indexes | 8 | status columns, workflow_id, skill_id, thought_type |
| Naming inconsistencies | 5 | STRING vs TEXT, VARCHAR vs STRING, timestamp column names |
| Non-idempotent migrations | 5 | TTL SET, SET LOCALITY, CREATE POLICY |
| Missing unique constraints | 3 | agent_checkpoints, agent_coordination, agent_drift_scores |
| Data type inconsistencies | 3 | FLOAT vs DECIMAL for bounded metrics |
| Over-indexing | 1 | agent_memory has 7 indexes — write amplification |
| Hot-row contention | 1 | agent_budgets counters under high concurrency |

### Infrastructure

| File | Count | Key Issues |
|------|-------|------------|
| `docker-compose.yml` | 3 | Missing health checks, schema errors swallowed, unpinned pip deps |
| `docker-compose.demo.yml` | 3 | Insecure mode without production guard, hardcoded API key, no MCP auth |
| `Dockerfile.*` | 4 | Hardcoded healthcheck ports, triple-fallback deps, no OCI labels |
| `.github/workflows/ci.yml` | 4 | npm audit continues on error, no SAST, no Python vuln scan, no coverage in CI |
| `.github/workflows/deploy.yml` | 3 | npm audit continues, no environment gates, third-party action not SHA-pinned |
| `.github/workflows/lambda-deploy.yml` | 4 | Long-lived AWS keys, no changeset review, no post-deploy validation, missing permissions |
| `lambda/cdc_handler.py` | 5 | Circuit breaker unreliable in Lambda, no DLQ, no tracing, no structured logging, verbose errors |
| `lambda/webhook_dispatcher.py` | 3 | No HMAC signing, no idempotency key, no URL validation |
| `lambda/template.yaml` | 4 | No DLQ, no reserved concurrency, timeout inconsistency, no environment conditions |
| `scripts/` | 3 | Naive SQL parsing, no graceful shutdown, no argument validation |

---

## LOW (30+ issues)

| Category | Count | Key Issues |
|----------|-------|------------|
| Code smells | 8 | Mutable defaults, undocumented settings, string interpolation patterns, private attribute access |
| Missing minor constraints | 10 | access_count >= 0, similarity_score NOT NULL, compaction counters |
| Cosmetic inconsistencies | 5 | Timestamp naming, PK naming, STRING vs TEXT |
| Missing best practices | 7 | No OCI labels, floating image tags, unused imports, dead code |
| Documentation gaps | 3 | Undocumented env vars, misleading deploy instructions |

---

## TEST COVERAGE GAPS (22 issues)

### Critical Modules With No or Stub-Only Tests

| ID | Module | Lines | Test Status | Issue |
|----|--------|-------|-------------|-------|
| T1 | `pool.py` | 360 | No dedicated test file | Connection pool: exhaustion, reaper thread, health check failure, double-release, async pool, `BastionPoolExhaustedError` — all untested |
| T2 | `spend_manager.py` | 374 | 2 mock-only tests | Budget enforcement, suspension, hard limits, daily reset, concurrent access — all untested |
| T3 | `crypto.py` | 112 | No dedicated test | HMAC secret persistence, env var path, length-prefix collision prevention, disk failure — untested |
| T4 | `a2a_signing.py` | 161 | No dedicated test | Key generation, rotation, PEM parsing, corrupted signatures, wrong algorithm — untested |
| T5 | `models.py` | 247 | No dedicated test | `EntityRecord`, `RelationRecord`, `CoordinationLock`, `MessageRecord`, `ClusterInfo`, `CheckpointState` — zero coverage |

### Critical Untested Paths

| ID | Path | Module | Issue |
|----|------|--------|-------|
| T6 | `ConnectionPool.acquire()` timeout | `pool.py:164` | `BastionPoolExhaustedError` path never triggered |
| T7 | HMAC secret too short | `crypto.py:46` | `ValueError` for `len < 16` never tested |
| T8 | `verify_card_signed()` corrupted PEM | `a2a_signing.py:144` | Error path never tested |
| T9 | SSRF IPv6 loopback | `push_dispatcher.py:32` | Only `127.0.0.1` tested; `::1`, `0.0.0.0`, `169.254.x.x`, DNS rebinding — untested |
| T10 | `MemoryGuard._normalize_unicode()` | `guard.py:31` | Zero-width char bypass prevention — untested |
| T11 | `SpendManager` concurrent increment | `spend_manager.py:327` | Race on daily counter — untested |
| T12 | `BASTION_A2A_STRICT` mode | `a2a_server.py` | Strict mode rejecting unsigned cards — conftest disables it; no test |

### Missing Test Categories

| ID | Category | Status | Gap |
|----|----------|--------|-----|
| T13 | Performance benchmarks | Missing | No latency/throughput tests for search, store, guard checks, or Merkle proofs |
| T14 | SSRF protection depth | Partial | Only `http://` and `127.0.0.1` tested; IPv6, DNS rebinding, cloud metadata — missing |
| T15 | Migration execution | Partial | `test_migrate.py` tests discovery only; actual migration, rollback, checksum — untested |
| T16 | Knowledge graph CRUD | Partial | Only `extract_triples()` tested; entity/relation CRUD, graph traversal — untested (452 lines) |
| T17 | Connection pool resilience | Missing | Connection drop recovery, idle expiration, max pool size enforcement — untested |
| T18 | Adapter tests quality | Shallow | 3 tests each for langchain/crewai/llamaindex; happy paths only, no error handling |

### Test Infrastructure Gaps

| ID | Issue | Severity |
|----|-------|----------|
| T19 | No shared `FakeEngine` fixture — 8+ independent implementations across test files | MEDIUM |
| T20 | No timeout configuration — tests can hang on real DB connections | MEDIUM |
| T21 | No parallel test isolation — no `tmp_path` fixtures or test-specific DB schemas | MEDIUM |
| T22 | Only 13 parametrized test functions across entire suite (low for 650K+ lines of test code) | LOW |

---

## DEEP-DIVE ADDITIONAL FINDINGS (15 issues)

These were discovered by reading the actual source code line-by-line and verifying/deepening the first-pass findings.

### CRITICAL

| ID | File:Line | Issue |
|----|-----------|-------|
| D1 | `auth_provider.py:675` | **Broken thread-safety**: `_token_lock = threading.Lock()` is created as a LOCAL variable inside `exchange_refresh_token()`. Every invocation creates a new lock, making the locking completely ineffective. Two concurrent refresh requests using the same old token will both succeed — a token replay vulnerability. |
| D2 | `compliance.py:170 vs 216` | **Documentation lie**: The class docstring claims "Performs physical SQL DELETE (not tombstone)" but line 216 uses `UPDATE ... SET content = '[DELETED per GDPR Art 17]'`. The code does soft-delete, contradicting the documentation AND GDPR Art 17 requirements. |

### HIGH

| ID | File:Line | Issue |
|----|-----------|-------|
| D3 | `health.py:24 vs 93` | **Inconsistent RLS within same file**: `memory_health_real` (line 24) correctly calls `mem._set_rls_context(conn)`, but `detect_anomalies_real` (line 93) does NOT. Same file, different behavior — indicates copy-paste error. |
| D4 | `webhooks.py:174` | **SSRF via redirect**: `urllib.request.urlopen(req, timeout=10)` follows redirects by default. An attacker could craft a webhook URL that redirects to `http://169.254.169.254/latest/meta-data/` (AWS metadata endpoint) after passing the initial URL validation. The `urlopen` default behavior follows up to 10 redirects. |
| D5 | `mcp_scanner.py:37` | **Cache ineffective across restarts**: `cache_key = str(hash(description))` uses Python's built-in `hash()` which is randomized per process via `PYTHONHASHSEED` (default since Python 3.3). The scan cache is useless across process restarts. |
| D6 | `kms.py:568` (corrected) | **Key rotation partial gap**: The `rotate_key` method DOES preserve the old DEK in `previous_encrypted_dek` (line 598-604), so old memories remain decryptable with the old DEK. However, there is NO re-encryption step — old memories permanently use the old DEK. If the MASTER KMS key (not just the DEK) is rotated, all `previous_encrypted_dek` entries encrypted with the old master key become undecryptable. |
| D7 | `ltm_gateway.py:200` | **Similarity metric is semantically wrong**: `similarity = min(1.0, max(0.0, best.importance_score / 10.0))` uses importance_score as a proxy for query-result similarity. A high-importance but semantically irrelevant memory will score high, causing false cache hits and incorrect reuse. The comment on line 198 says "we use importance_score as a proxy for confidence in the cached result" — but this conflates importance with relevance. |
| D8 | `session_memory.py:224` + `dreaming.py:323` + `capture_hooks.py:301` + `cli.py:69` | **Systemic _skip_guard=True pattern**: Four code paths bypass the OWASP security guard. Combined with `bridge_mem0.py:247` and `memory.py:364`, that's 6 total bypasses. No audit trail distinguishes guard-bypassed stores from normal stores. |
| D9 | `telemetry.py:91-222` | **TracedBastionMemory API surface gap**: The wrapper only exposes `store()`, `search()`, `get_memory()`, `get_at_time()`, `get_pool()`, `close()`. Missing 15+ methods: `delete_memory()`, `correct_memory()`, `list_memories()`, `apply_patch()`, `pin()`, `unpin()`, `get_pinned()`, `list_recent()`, `list_pinned()`, `list_by_importance()`, `keyword_search()`, `count_by_agent()`, and all graph/messaging methods. Any code using `TracedBastionMemory` silently loses access to these operations. |
| D10 | `archive.py:45` | **S3 uploads without encryption**: `put_object()` does not specify `ServerSideEncryption` parameter. Archives containing agent memory content are stored unencrypted at rest, violating the encryption-at-rest requirement stated in the README. |
| D11 | `a2a_tasks.py:54` | **Missing RLS context on task store**: `store_task()` acquires a connection but never calls `_set_rls_context()`. If RLS is enabled, the INSERT may fail or insert with wrong agent context, violating multi-tenant isolation. |

### MEDIUM

| ID | File:Line | Issue |
|----|-----------|-------|
| D12 | `context_budget.py:25-28` | **Token estimation heuristic**: `_estimate_tokens` uses `len(text.split()) * 1.3`. For code (no spaces between tokens), JSON (dense syntax), or CJK text (no word boundaries), this estimate can be off by 2-5x, causing context window overflow or underutilization. |
| D13 | `crdt_memory.py:414` | **In-place mutation**: `_resolve_semantic` mutates `candidates[0].content = merged` which modifies the original `MemoryRecord` in-place. If the record is referenced elsewhere (e.g., in a search result cache), the mutation propagates unexpectedly. |
| D14 | `firewall.py:42-43` | **Permanent agent blocking**: `_blocked_agents` is a set that grows unboundedly. Once an agent is blocked, there is no cooldown, no appeal mechanism, and no cleanup. A single false-positive critical violation permanently blocks an agent. |
| D15 | `router.py:144` | **ValueError on empty scores**: `max(scores, key=scores.get)` will raise `ValueError` if `scores` is empty dict. While the caller checks for empty query, the scores dict could still be empty if no patterns match. |

---

## Cross-Cutting Architectural Gaps

### 1. Security Enforcement is Inconsistent
The OWASP guard is bypassed via `_skip_guard=True` in **6 code paths**:
- `session_memory.py:224` (session promotion)
- `dreaming.py:323` (semantic promotion)
- `capture_hooks.py:301` (event storage)
- `cli.py:69` (JSONL import)
- `memory.py:364` (when skip_guard=True)
- `bridge_mem0.py:247` (delete_all bypasses RLS)

**Recommendation:** Audit every `_skip_guard=True` call. Only system-initiated operations should bypass the guard, and they should have their own validation.

### 2. RLS is Partially Applied
RLS is defined in schema for only 4 of 23 tables. The most sensitive tables (`agent_memory`, `agent_keys`) lack RLS entirely. Code that should set RLS context (`health.py`, `a2a_tasks.py`, `bridge_mem0.py`) doesn't always do so.

**Recommendation:** Enable RLS on ALL agent-scoped tables. Create a `_set_rls_context` utility and call it at every connection acquisition point.

### 3. Error Handling is Inconsistent
A well-designed `BastionError` hierarchy exists in `errors.py` but is almost entirely unused. Modules raise raw `ValueError`, `RuntimeError`, `PermissionError`. This makes it impossible to catch and handle Bastion-specific errors cleanly.

**Recommendation:** Migrate all modules to use the typed error hierarchy. Add a catch-all handler in the MCP server that maps typed errors to appropriate MCP error responses.

### 4. Memory Safety at Scale
Multiple modules load ALL memories into Python memory for processing:
- `analytics.py:full_report()` — OOM for large agents
- `analytics.py:_check_hash_chain()` — O(n log n) sort in memory
- `firewall.py:check_hash_chain_integrity()` — OOM risk
- `contradiction.py:scan_all()` — O(n^2) pairwise comparison

**Recommendation:** Replace in-memory processing with SQL-based operations. Use cursor-based iteration for large result sets.

### 5. Migration Safety
All 28 migrations have no rollback mechanism. Migration 017 is not idempotent (CREATE POLICY will fail on re-run). Migration 013 pins all rows to a single region without migration logic. Migration 018's TTL on `agent_memory` will orphan FK references in `agent_relations`.

**Recommendation:** Add a `schema_migrations` tracking table. Make all migrations idempotent. Add rollback scripts for critical migrations.

### 6. Production Secrets Management
Secrets (`BASTION_HMAC_SECRET`, `BASTION_CONN`, `BASTION_API_KEY`) are passed as plaintext environment variables in Docker, Lambda, and Terraform. The HMAC secret defaults to a known value. The API key defaults to empty.

**Recommendation:** Use AWS Secrets Manager or SSM Parameter Store. Fail loudly if required secrets are not set. Never have production defaults.

---

## Priority Fix Roadmap

### Phase 1: Critical Security & Data Integrity (Week 1)
1. Add RLS to `agent_memory` and `agent_keys` tables
2. Fix FK cascade on `agent_relations.source_memory_id`
3. Add `WITH CHECK` to all RLS policies
4. Remove HMAC secret default, fail if unset
5. Fix health.py RLS context bypass (line 93 missing `_set_rls_context`)
6. Fix compliance.py GDPR deletion (UPDATE → DELETE)
7. **Fix auth_provider.py:675 thread-safety bug** (local Lock variable makes locking ineffective)

### Phase 2: High-Severity Infrastructure (Week 2)
1. Restrict IAM policies to specific resources
2. Move Lambda secrets to AWS Secrets Manager
3. Fix broken `deploy_direct.py`
4. Add `aws_s3_bucket_public_access_block`
5. Add remote Terraform state backend
6. Fix webhook SSRF vulnerability

### Phase 3: Source Code Quality (Week 3)
1. Migrate to typed error hierarchy
2. Fix OOM-prone analytics modules
3. Audit all `_skip_guard=True` calls (6 code paths)
4. Add connect timeout to pool.py
5. Fix thread-safety issues (push_dispatcher, circuit_breaker, auth_provider token lock)
6. Fix webhook SSRF via redirect following
7. Fix TracedBastionMemory API surface gap (expose all 15+ missing methods)

### Phase 4: Schema Hardening (Week 4)
1. Add CHECK constraints for all status/bounds columns
2. Make all migrations idempotent
3. Add migration tracking table
4. Resolve index name collisions
5. Add missing unique constraints

### Phase 5: Test Coverage (Week 5)
1. Add dedicated tests for `pool.py` (connection pool exhaustion, reaper, health checks)
2. Add dedicated tests for `spend_manager.py` (budget enforcement, suspension, concurrent access)
3. Add dedicated tests for `crypto.py` (HMAC persistence, secret validation)
4. Add dedicated tests for `a2a_signing.py` (key rotation, PEM errors)
5. Add SSRF test coverage (IPv6, DNS rebinding, cloud metadata, redirect following)
6. Add `_normalize_unicode()` security test
7. Create shared `FakeEngine` fixture in conftest.py
8. Add performance benchmarks for search, store, and guard check latency
9. Add thread-safety test for auth_provider token refresh (concurrent refresh with same token)
10. Add test for webhook redirect SSRF (redirect to internal metadata endpoint)

---

## Test Coverage Gaps (9 issues)

### CRITICAL

| ID | Module | Issue |
|----|--------|-------|
| T1 | `spend_manager.py` (374 lines) | Only 2 mock-mode tests. All real paths untested: budget enforcement, suspension, hard limits, daily reset, concurrent increment race. |
| T2 | `pool.py` (360 lines) | No dedicated tests. Exhaustion error, idle reaper, health check failure, double-release, async pool — all untested. |

### HIGH

| ID | Module | Issue |
|----|--------|-------|
| T3 | `models.py` | No dedicated tests for 6 Pydantic models (EntityRecord, RelationRecord, CoordinationLock, MessageRecord, ClusterInfo, CheckpointState). |
| T4 | `a2a_signing.py` (161 lines) | No dedicated test file. Key generation, rotation, PEM parsing, corrupted PEM, wrong algorithm — all untested. |
| T5 | `crypto.py` (112 lines) | No dedicated test file. Secret persistence failure, env var path, length-prefix collision prevention — untested. |
| T6 | `guard.py` | `_normalize_unicode()` (zero-width char bypass prevention) is completely untested — security-critical defense. |
| T7 | `migrate.py` (437 lines) | Only discovery tests. Actual migration execution, rollback, checksum verification — untested. |
| T8 | `knowledge_graph.py` (452 lines) | Only `extract_triples()` tested (10 tests). 50+ NLP patterns, entity/relation CRUD, graph traversal — untested. |

### MEDIUM

| ID | Module | Issue |
|----|--------|-------|
| T9 | SSRF protection (`push_dispatcher.py`) | `_is_private_url()` only tested for `http://` and `127.0.0.1`. IPv6, DNS rebinding, cloud metadata endpoints — untested. |

### Test Infrastructure Gaps

| Area | Issue |
|------|-------|
| FakeEngine duplication | 8+ independent implementations across test files — should be a shared fixture |
| No test timeout | Tests can hang indefinitely on real DB connections |
| No parallel isolation | No `tmp_path` fixtures or test-specific DB schemas for integration tests |
| No coverage in CI | `pytest-cov` is a dev dependency but not used in CI commands |
| Low parametrization | Only 13 test functions use `@pytest.mark.parametrize` for 85 test files |

---

*This analysis covers 63 source modules, 28 schema migrations, Docker/Terraform/Lambda/CI infrastructure, test coverage gaps, and cross-cutting architectural concerns. 170+ total issues identified across critical severity levels.*
