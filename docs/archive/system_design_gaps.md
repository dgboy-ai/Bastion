# Bastion System Design Gaps — Deep Analysis

**Date:** July 23, 2026
**Scope:** Full codebase end-to-end review — backend (Python), frontend (Next.js), infrastructure (Docker/Terraform), schema (SQL)
**Method:** File-by-file deep read of 63 backend modules, 28 SQL schemas, dashboard routes, config, and deployment manifests

---

## 1. ARCHITECTURAL GAPS — Fundamental Design Flaws

### 1.1 God Object: `BastionMemory` (memory.py — 1847 lines)
**Severity: CRITICAL**
`BastionMemory` is a monolithic god object that owns connection pool management, embedding generation, RLS context, search, store, delete, audit, graph operations, messaging, CRDT, time-travel, anomaly detection, cluster provisioning, contradiction detection, and 30+ other responsibilities. Every MCP/A2A tool creates or reuses this single class. Changes to any subsystem risk regressions across the entire system.

**Impact:** Impossible to test subsystems in isolation. Any change to pool behavior risks search correctness. The class has 15+ internal self-references (`self._guard`, `self._retry_engine`, `self._bedrock_cb`, `self._a2a_store`, `self._broker`, `self._kg`) that create circular dependency chains.

**Recommendation:** Extract into domain services: `MemoryStore`, `MemorySearch`, `MemoryGuard`, `EmbeddingService`, `AuditService`. Each owns its own pool reference.

### 1.2 Connection Pool is Not Thread-Safe for Its Own Stats
**Severity: HIGH**
`ConnectionPool._total_created` is incremented in `acquire()` under `self._lock`, but `_reap_idle_connections()` decrements it also under `self._lock`. However, the reaper runs in a background daemon thread. If `close_all()` is called while the reaper is mid-reap, the `_pool.popleft()` can race with the reaper's `self._pool.popleft()`, since both acquire the lock independently. The `close_all()` stops the reaper event but doesn't join the thread — the reaper may have already popped a connection before the stop event is set.

**Impact:** Connections can be double-closed or leaked on shutdown. Stats counters become inaccurate under concurrent load.

### 1.3 No Graceful Shutdown Orchestration
**Severity: HIGH**
When `BastionMemory.close()` is called, it calls `pool.close_all()` which stops the reaper but doesn't join the thread, doesn't drain in-flight requests, doesn't close the Merkle hash chain, doesn't flush the SpendManager cache, and doesn't close the RequestLimiter's pool. Each subsystem manages its own lifecycle independently. There's no `shutdown()` cascade.

**Impact:** In-flight requests during shutdown get `BastionPoolExhaustedError` or stale data. Audit trail entries may be lost. Budget counters may be inconsistent.

### 1.4 Embedding Generation Happens Before Connection Acquisition — But Blocks
**Severity: MEDIUM**
In `_store_real()` (line 765), `_embed(content)` is called BEFORE `pool.acquire()`. This is correct for pool efficiency (network call outside connection scope). However, `_embed()` calls Bedrock which can take 1-5 seconds. During this time, no connection is held, but the caller's thread is blocked. Under 20 concurrent stores, this creates 20 blocked threads each holding no connection but preventing completion.

**Impact:** Thread pool exhaustion under load. The circuit breaker on Bedrock only fires after the call starts — there's no pre-flight circuit check.

### 1.5 Mock Mode Creates Parallel Universe That Drifts
**Severity: HIGH**
Mock mode (`_mock.mock_*` functions) is a completely separate code path from real mode. Every method in `BastionMemory` has an `if self._mock: return mock_fn()` branch. Mock data structures (in-memory lists/dicts in `mock.py`) don't share any code with the real CockroachDB path. Features added to the real path are silently absent from mock. Features tested in mock may not work in production.

**Impact:** CI tests pass in mock mode but fail in production. The 205 dashboard API routes that fall back to mock data on any DB error (security_gaps H28) present fabricated data as `success: true`.

---

## 2. SECURITY GAPS — Beyond What Previous Audits Found

### 2.1 HMAC Key Generation Creates TOCTOU Race
**Severity: HIGH**
`crypto.py:_get_hmac_secret()` (line 28-82): Two threads calling `_get_hmac_secret()` simultaneously can both see `_hmac_secret is None`, both enter the `with _hmac_lock` block sequentially, but the second thread will read the key from `~/.bastion/hmac.key` that the first thread just wrote. However, if the first thread's `os.replace(tmp, _SECRET_FILE)` hasn't completed when the second thread reads, the second thread reads a partial file. The lock protects the in-memory variable but NOT the file I/O.

**Impact:** Race condition during first startup can produce a truncated HMAC key, breaking ALL hash chains silently.

### 2.2 `store_with_graph()` Bypasses MemoryGuard for Knowledge Graph Operations
**Severity: CRITICAL**
`memory.py:639-663`: `store_with_graph()` calls `self._guard.check(content)` but then calls `self._kg.store_with_graph()` which writes to `agent_entities` and `agent_relations` WITHOUT any guard check. An attacker can craft content that passes the guard's regex patterns but contains injection payloads in entity names that execute when graph queries return them to the LLM.

**Impact:** Indirect prompt injection via knowledge graph entities. The guard only screens the memory content, not the derived entities/relations.

### 2.3 `pin()` and `store_with_graph()` Call `_store_real` Directly — Guard Architecture Flaw
**Severity: HIGH**
`memory.py:398-421` (pin) and `memory.py:639-663` (store_with_graph) both call `self._store_real()` directly. The `store()` method wraps `_store_real()` with guard checks, PII scanning, and contradiction detection. But `pin()` and `store_with_graph()` each implement their own partial guard logic. If `pin()` passes guard but `_store_real()` is later modified to assume guard was called, the invariant breaks.

**Impact:** Guard bypass by internal callers. The `_skip_guard` parameter (line 333) exists specifically to allow bypass — this is a footgun for any future code path.

### 2.4 CRDT Vector Clocks Read From Untrusted Metadata
**Severity: HIGH**
`crdt_memory.py:_extract_clock()` reads `metadata["_vector_clock"]` from the stored record's own metadata. An attacker can store `{"_vector_clock": {"attacker": 999999}}` in any memory's metadata. When CRDT conflict resolution runs, the attacker's clock dominates all other clocks, causing their version to win all LWW conflicts.

**Impact:** Complete takeover of conflict resolution. Any poisoned memory can override legitimate memories in concurrent-write scenarios.

### 2.5 Merkle `from_hashes()` Uses Different Domain Separator — Proof Forgery
**Severity: CRITICAL**
`merkle.py:97-114`: `from_hashes()` calls `_hash_prehashed()` (0x02 prefix) for leaves, while `__init__()` calls `_hash()` (0x00 prefix). A proof generated from a tree built via `__init__()` will FAIL verification against a tree built via `from_hashes()` with the same data, because the leaf hashes differ. This means proofs from different construction paths are incompatible.

**Impact:** Merkle proofs cannot be verified across code paths. An auditor using `from_hashes()` to build a verification tree gets different roots than the original `__init__()` tree.

### 2.6 `verify_chain()` Uses `==` Not `hmac.compare_digest`
**Severity: HIGH**
`merkle.py:234`: `return hmac.compare_digest(current, trusted)` — this is actually FIXED in the current code. But `proof_json()` at line 236-245 returns `self.blocks[index]` as the "leaf" — these are already domain-separated hashes from `_hash()`. A client receiving this proof would need to know the domain separation to verify. There's no documentation or API contract specifying this.

**Impact:** Clients who try to verify proofs using raw content (not pre-hashed) will get false negatives.

### 2.7 `recovery_timeout=0` Causes Circuit Breaker Infinite Oscillation
**Severity: MEDIUM**
`circuit_breaker.py:41`: `self.recovery_timeout = max(1, recovery_timeout)` — this was fixed. But the `__init__` default is `recovery_timeout: int = 30` which is fine. The issue is that `_on_state_change` callbacks are NOT protected against the caller passing `recovery_timeout=0` via direct attribute assignment: `breaker.recovery_timeout = 0`.

**Impact:** Bypassing the constructor allows infinite OPEN→HALF_OPEN→OPEN oscillation.

### 2.8 Circuit Breaker `_on_state_change` Callback Crash Masks Error
**Severity: MEDIUM**
`circuit_breaker.py:118-121, 143-146`: Both `_on_success` and `_on_failure` wrap callbacks in try/except but the exception is only logged. If the callback raises, the state transition HAS already happened (line 111 sets `self._state = CircuitState.CLOSED` before the callback). The callback failure doesn't roll back the state. This is correct behavior but the logging is at `exception` level which may flood logs.

### 2.9 Retry Engine Holds Connection for Entire Backoff
**Severity: HIGH**
`retry.py:42-95`: `execute()` takes a `conn` parameter and holds it for the entire retry loop. With `max_retries=5` and `max_delay_ms=2000`, the worst case is 5 × 2s = 10 seconds holding a connection. But `max_total_time_seconds` defaults to 30s (not 50min as previously noted — the config defaults changed). Still, 30s is 30x the normal 1s query time.

**Impact:** Under high contention, one slow serialization retry can hold a connection for 30s, starving other callers. The pool has max_size=20, so 20 concurrent serialization retries could exhaust the pool.

### 2.10 No Query Timeout Enforcement at Connection Level
**Severity: MEDIUM**
`pool.py:91-94`: `SET statement_timeout = '30s'` is set on connection creation, but `RESET ALL` in `release()` clears ALL session settings including statement_timeout. So if a connection is reused, the statement_timeout is NOT restored until the next `_create_connection()`. Connections pulled from the pool after release have NO statement timeout.

**Impact:** Stale connections from the pool can run unbounded queries. A slow query on a reused connection has no timeout protection.

---

## 3. DATA INTEGRITY GAPS

### 3.1 Hash Chain is Single-Threaded Per Agent
**Severity: HIGH**
`memory.py:780-786`: The hash chain reads `SELECT cryptographic_hash ... ORDER BY created_at DESC LIMIT 1` inside a SERIALIZABLE transaction. Under concurrent writes from the same agent, the retry engine retries on serialization errors. But the hash chain is inherently sequential — each new hash depends on the previous one. This means concurrent writes to the same agent are serialized by the DB anyway, making the SERIALIZABLE isolation redundant but expensive.

**Impact:** Performance bottleneck for high-throughput single-agent scenarios. 20 concurrent stores to the same agent = 20 serialization retries.

### 3.2 `expires_at` is NOT in the Hash Chain
**Severity: MEDIUM**
`memory.py:789`: `compute_hash(content, meta, prev_hash)` — the hash includes content, metadata, and previous_hash. But `expires_at` is computed separately (line 771) and is NOT included in the hash. An attacker with DB write access can change `expires_at` to extend or shorten memory lifetime without breaking the hash chain.

**Impact:** TTL manipulation without detection. Memories can be made to never expire or expire immediately.

### 3.3 `importance_score` is Hardcoded to 5.0
**Severity: LOW**
`memory.py:796`: Every new memory gets `importance_score=5.0`. The `reinforce()` method adjusts it, but initial importance is always the same. The context budget manager uses importance for prioritization, but all memories start equal.

**Impact:** Context budget packing treats all memories equally initially, requiring N reinforcement calls to differentiate.

### 3.4 Saga Rollback Deletes Memory But Doesn't Rebuild Hash Chain
**Severity: HIGH**
`saga.py:258-266`: Rollback does `DELETE FROM agent_memory WHERE memory_id = %s`. This breaks the hash chain for all subsequent records (the deleted record's `cryptographic_hash` was the `previous_hash` of the next record). The chain becomes unverifiable from the deletion point forward.

**Impact:** After any saga rollback, the hash chain is permanently broken. All subsequent trust scores drop to 0.0.

### 3.5 GDPR Tombstone Preserves Original Data
**Severity: MEDIUM**
`compliance.py` (MEMORY.md notes): GDPR "tombstone" is `UPDATE content='[DELETED per GDPR Art 17]'`. This preserves the original `memory_id`, `agent_id`, `metadata`, and `cryptographic_hash`. WAL, backups, and replicas still have the original content. True erasure requires cryptographic erasure (delete DEK).

**Impact:** GDPR compliance is cosmetic, not real. Data can be recovered from backups.

### 3.6 `knowledge_graph.py` NLP Triple Extraction is Pure Regex
**Severity: MEDIUM**
`knowledge_graph.py:17-74`: 50+ regex patterns for triple extraction. These are simple subject-verb-object patterns that miss complex sentences, produce false positives on non-entity words ("the", "a"), and can't handle negation, conditionals, or multi-clause sentences. The confidence is always 1.0 for any match.

**Impact:** Knowledge graph gets polluted with low-quality triples. False entities and relations degrade graph query results.

---

## 4. AVAILABILITY & RELIABILITY GAPS

### 4.1 No Connection Pool Warm-Up
**Severity: MEDIUM**
`ConnectionPool.__init__()` creates no connections at startup. The first `acquire()` call creates connections one at a time. With `min_size=5`, the first 5 requests each trigger a connection creation (TLS handshake + auth to CockroachDB = 200-500ms each).

**Impact:** Cold start latency spike. First 5 requests are 5-10x slower than subsequent requests.

### 4.2 `RequestLimiter` Creates Its Own Pool
**Severity: MEDIUM**
`limiter.py:75-80`: `RequestLimiter.__init__()` creates a separate `ConnectionPool(min_size=1, max_size=2)` for its own use. This is a separate pool from the main `BastionMemory` pool. If the main pool is exhausted, the limiter still works (it has its own connections). But if the DB is down, BOTH pools fail independently, and the limiter's pool failure is not correlated with the main pool's circuit breaker.

**Impact:** Two independent failure domains for what should be one resource. No unified health view.

### 4.3 `SpendManager` Also Creates Its Own Pool
**Severity: MEDIUM**
`spend_manager.py:46-56`: Same pattern as the limiter. A third independent connection pool. Under DB failure, three pools fail independently, three circuit breakers fire independently, three reconnection attempts happen independently.

**Impact:** Connection storm on DB recovery. Three pools each try to reconnect simultaneously.

### 4.4 No Idempotency for Store Operations
**Severity: MEDIUM**
`memory.py:_store_real()` generates a new `memory_id` via `RETURNING memory_id` for every INSERT. If the same content is stored twice (e.g., retry after network timeout), two separate memories are created with different IDs but identical content. There's no idempotency key mechanism for store operations.

**Impact:** Duplicate memories accumulate. Search returns duplicates. The contradiction detector catches some but not all.

### 4.5 Merkle Tree Rebuilds Entirely on Every `add()`
**Severity: MEDIUM**
`merkle.py:198`: `self._trusted_root = MerkleTree(self.blocks).root` — every call to `add()` rebuilds the ENTIRE Merkle tree from all blocks. With 10,000 blocks, this is O(N) hash operations per add. The `_finalize_segment()` at line 251 also rebuilds.

**Impact:** Merkle tree becomes a performance bottleneck as the chain grows. 10K blocks = ~10K hashes per add. 100K blocks = 100K hashes per add.

### 4.6 No CDC Changefeed Implementation
**Severity: HIGH**
Multiple modules reference "CDC changefeed" (firewall.py, dreaming.py, push_dispatcher.py, schema 027), but there's NO actual CockroachDB CDC consumer implemented. The `firewall.py:CognitiveFirewall` is a synchronous in-process guard, not a CDC consumer. The `push_dispatcher.py` polls in-memory state, not CDC events. The dreaming trigger is manual, not CDC-driven.

**Impact:** The core value proposition of "CDC-triggered self-healing" is not implemented. All "CDC" references are aspirational.

### 4.7 No Multi-Region Actual Deployment
**Severity: MEDIUM**
`locality.py` defines 6 regions and `REGIONAL BY ROW` routing, but the CockroachDB cluster is single-region (`ap-south-1`). The `crdb_region` column is set by the application, but CRDB ignores it for geo-partitioning when the cluster is single-region. The "6 Global Regions" claim in marketing materials is false.

**Impact:** All data stays in one region. GDPR data residency requirements cannot be met. The locality module is dead code.

---

## 5. OBSERVABILITY GAPS

### 5.1 No Distributed Tracing
**Severity: HIGH**
OpenTelemetry is imported in `retry.py` but no other module. There's no trace context propagation from MCP server → memory → pool → DB. The A2A server has no tracing at all. When a request fails, there's no way to trace which component caused the failure.

**Impact:** Production debugging requires reading scattered log files. No latency breakdown by component.

### 5.2 Metrics Are In-Memory Only
**Severity: MEDIUM**
`mcp_server.py:75-78`: Metrics are stored in Python dicts (`_metrics_requests_total`, `_metrics_durations`). When the process restarts, all metrics are lost. There's no Prometheus push gateway, no StatsD, no external metrics store. The `/metrics` endpoint serves in-memory counters only.

**Impact:** Can't track long-term trends. Process restart = metrics reset.

### 5.3 No Structured Logging in Core Modules
**Severity: MEDIUM**
`memory.py`, `guard.py`, `pool.py` use `logging.getLogger()` with string formatting. `retry.py` and some A2A paths use `structlog`. The two logging approaches produce incompatible log formats. Log aggregation tools can't parse both.

**Impact:** Inconsistent log format makes automated analysis impossible.

### 5.4 No Health Check Cascading
**Severity: MEDIUM**
`health.py:memory_health_real()` checks memory count and freshness. But it doesn't check: pool health, circuit breaker states, Bedrock connectivity, CRDB latency, or pending sagas. Each subsystem has its own health endpoint (`/healthz`, `/readyz`, `/metrics`) but they're independent.

**Impact:** A system can report "healthy" while the embedding service is down, the pool is exhausted, and sagas are orphaned.

---

## 6. API DESIGN GAPS

### 6.1 MCP Server Tool Count Explosion
**Severity: MEDIUM**
The MCP server exposes 25+ tools. The A2A server exposes the same 25+ as "skills". Each tool is a separate code path in `mcp_server.py` (2279 lines) and `a2a_server.py` (2052 lines). The tool manifest in `mcp_scanner.py` validates tool names but not parameter schemas.

**Impact:** Tool proliferation makes the API surface hard to secure, test, and document. Each tool is a potential attack vector.

### 6.2 No API Versioning
**Severity: MEDIUM**
No `v1/`, `v2/` prefix on any endpoint. Breaking changes to tool schemas (e.g., changing `memory_type` from required to optional) would break all existing clients. The `VERSION` constant is `"0.10.0"` but isn't used in API routing.

**Impact:** Client updates must be synchronized with server updates. No graceful deprecation.

### 6.3 Dashboard API Routes Have No Request Validation
**Severity: MEDIUM**
Dashboard API routes (e.g., `/api/stats`, `/api/trust`) accept requests without validating query parameters. The `trust` route at `dashboard/src/app/api/trust/route.ts` takes a `memory_id` query param and passes it directly to SQL. While parameterized queries prevent SQL injection, there's no validation that the memory_id is a valid UUID format.

**Impact:** Malformed requests cause database errors that are caught and returned as 500s with error messages.

### 6.4 No Pagination for List Endpoints
**Severity: MEDIUM**
`list_memories()` defaults to `limit=50, offset=0`. `list_all()` has no limit parameter. `audit()` returns all entries. `graph_query()` returns all results up to `hops`. Under high memory counts, these can return millions of rows.

**Impact:** Memory exhaustion on the server side. Network transfer of huge payloads.

---

## 7. CONCURRENCY & RACE CONDITION GAPS

### 7.1 Pool Double-Release Detection is O(n) Per Release
**Severity: MEDIUM**
`pool.py:180-183`: `if conn in [c for c, _ in self._pool]` — this scans the entire pool deque on every release. With max_size=20, this is 20 comparisons per release. Under high concurrency (1000 releases/sec), this lock contention becomes significant.

**Impact:** Pool becomes a bottleneck under high throughput. The O(n) scan defeats the purpose of a deque.

### 7.2 `_total_created` Counter Can Go Negative
**Severity: HIGH**
`pool.py:141`: `self._total_created -= 1` in the health-check failure path. But `_total_created` is also decremented in `_reap_idle_connections()` (line 81). If both paths fire simultaneously (reaper reaps an idle connection while acquire() fails a health check on the same connection), `_total_created` is decremented twice for one connection.

**Impact:** `_total_created` goes negative, making `_total_created < max_size` permanently true, allowing unlimited connection creation.

### 7.3 SpendManager Cache is Not Thread-Safe
**Severity: MEDIUM**
`spend_manager.py:85-90`: `_cache_lock` protects the cache dict, but `record` is read OUTSIDE the lock (line 98). If another thread updates the cache between lines 90 and 98, `record` is stale. The `check_and_increment` method reads the cache, then reads from DB, then writes to cache — this is a classic TOCTOU pattern.

**Impact:** Budget limits can be temporarily exceeded under concurrent requests from the same agent.

### 7.4 A2A Idempotency Store Grows Unbounded
**Severity: MEDIUM**
`a2a_server.py` `_check_idempotency()` stores results in an in-memory dict that never expires. Under sustained load with unique idempotency keys, this dict grows until OOM.

**Impact:** Memory DoS. Process crashes from memory exhaustion.

---

## 8. DEPLOYMENT & OPERATIONAL GAPS

### 8.1 No Docker Health Check for MCP Server
**Severity: MEDIUM**
`Dockerfile.mcp` has no `HEALTHCHECK` instruction. The MCP server exposes `/healthz` but Docker doesn't know to call it. If the MCP server hangs (e.g., pool exhaustion), Docker keeps routing traffic to it.

**Impact:** Unhealthy containers continue receiving traffic. No automatic restart.

### 8.2 `render.yaml` Has No Environment Variable Validation
**Severity: MEDIUM**
`render.yaml` defines services but doesn't validate that required env vars (`BASTION_CONN`, `BASTION_API_KEY`, `BASTION_HMAC_SECRET`) are set. Missing vars cause runtime failures, not deployment failures.

**Impact:** Deploy succeeds but service fails on first request. Silent failure.

### 8.3 No Database Migration Versioning
**Severity: HIGH**
`schema/` has 28 SQL files numbered 001-028 but no migration runner. `run_remaining_migrations.py` exists but there's no tracking of which migrations have been applied. Running all 28 files every deploy wastes time on `CREATE TABLE IF NOT EXISTS` and `CREATE POLICY IF NOT EXISTS`.

**Impact:** Deploy time grows linearly with migration count. No rollback capability.

### 8.4 Terraform State Not Mentioned
**Severity: LOW**
`terraform/` directory exists but there's no documentation on state management, no S3 backend configuration, and no workspace separation. Terraform state in local files is fragile.

### 8.5 No Log Rotation
**Severity: MEDIUM**
`Dockerfile.mcp` and `docker-compose.yml` don't configure log rotation. Under high traffic, log files grow unbounded. The `mcp_stdout.log` and `mcp_stderr.log` in the project root suggest logs are written to files without rotation.

**Impact:** Disk exhaustion on long-running instances.

---

## 9. TESTING GAPS

### 9.1 All Tests Run in Mock Mode
**Severity: HIGH**
The test suite uses `BASTION_MOCK=true` for all tests. The `_verify_all.py` script exists for real E2E verification but isn't part of CI. Mock mode uses in-memory lists instead of CockroachDB, hash-based embeddings instead of Bedrock, and local semaphores instead of distributed rate limiting.

**Impact:** Tests validate mock behavior, not production behavior. Race conditions, serialization errors, and pool exhaustion can't be reproduced in mock.

### 9.2 No Load Testing
**Severity: MEDIUM**
No load testing scripts or benchmarks exist in the repo. The `benchmark.py` module exists but benchmarks embedding speed, not end-to-end throughput. No k6, Locust, or similar load testing.

**Impact:** Unknown capacity limits. First production traffic spike reveals bottlenecks.

### 9.3 No Chaos Testing
**Severity: MEDIUM**
No chaos engineering (kill database connections, inject latency, corrupt data). The circuit breaker and retry engine exist but are never tested under failure conditions.

**Impact:** Recovery mechanisms are untested. Production failures may cascade instead of being contained.

---

## 10. PROTOCOL COMPLIANCE GAPS

### 10.1 A2A v1.0 Compliance is Partial
**Severity: MEDIUM**
The A2A server implements the basic task lifecycle (SUBMITTED→WORKING→COMPLETED) and agent cards. But it doesn't implement: streaming responses (SSE), long-running operations with polling, multi-turn conversations (INPUT_REQUIRED is defined but the handler doesn't implement the re-entry flow), or proper error codes beyond generic JSON-RPC errors.

**Impact:** Interoperability with other A2A implementations is limited.

### 10.2 MCP Protocol Version Not Declared
**Severity: LOW**
The MCP server uses `FastMCP` but doesn't declare which MCP protocol version it supports. The `mcp` library version in `pyproject.toml` determines compatibility, but there's no explicit version negotiation.

### 10.3 OAuth 2.1 Implementation is Incomplete
**Severity: MEDIUM**
`auth_provider.py` implements the OAuth flow but: token refresh isn't implemented, scope validation is basic (just string matching), the authorization server metadata endpoint (`/.well-known/oauth-authorization-server`) returns hardcoded values, and client registration is pre-configured via env vars (no dynamic registration).

**Impact:** OAuth is functional for demo but not production-ready. No token refresh = users must re-authenticate frequently.

---

## Summary: Priority Rankings

### Must Fix (Hackathon-Winning Impact)
1. **God Object decomposition** — #1.1
2. **Guard bypass on pin/store_with_graph** — #2.2, #2.3
3. **CRDT vector clock forgery** — #2.4
4. **Merkle from_hashes domain separation** — #2.5
5. **Sagas break hash chain on rollback** — #3.4
6. **No actual CDC implementation** — #4.6
7. **Mock/production drift** — #1.5

### Should Fix (Production Readiness)
8. **Connection pool _total_created negative** — #7.2
9. **Retry engine holds connection** — #2.9
10. **No statement timeout on reused connections** — #2.10
11. **Pool double-release O(n)** — #7.1
12. **SpendManager TOCTOU** — #7.3
13. **No distributed tracing** — #5.1
14. **No graceful shutdown** — #1.3
15. **A2A idempotency unbounded** — #7.4

### Nice to Fix (Polish)
16. **Importance score hardcoded** — #3.3
17. **NLP triple extraction quality** — #3.6
18. **Merkle tree O(N) rebuild** — #4.5
19. **No API versioning** — #6.2
20. **No load/chaos testing** — #9.2, #9.3
