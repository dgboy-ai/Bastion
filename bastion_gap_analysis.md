# Bastion Codebase Gap Analysis

> Analyzed: Backend (Python/CockroachDB), Dashboard (Next.js), APIs, auth, KMS, S3, Guard, AS OF SYSTEM TIME, C-SPANN, hash chains, knowledge graph, RLS, drift detection.

---

## 🔴 CRITICAL — Exploitable Today

### GAP-01 · `/api/soc` route has no authentication
**File:** [route.ts](file:///c:/projects/bastion/dashboard/src/app/api/soc/route.ts#L460)

`POST /api/soc` calls `safeQuery` to **write** to `agent_memory` and `agent_audit` for hard-coded agent IDs (`soc-analyst`, `soc-responder`) with zero `requireAuth()` check. The `middleware.ts` matcher only covers page routes (`/dashboard/*`, `/logs/*`, etc.) — API routes under `/api/soc` are not listed. Any unauthenticated actor on the internet can insert arbitrary memories and forge the audit trail for the SOC demo agents.

**Fix:** Add `requireAuth(request)` at the top of the `POST` handler, identical to how `/api/memories/route.ts` does it.

---

### GAP-02 · `x-bastion-conn` header allows arbitrary database pivoting in dev
**File:** [db.ts](file:///c:/projects/bastion/dashboard/src/lib/db.ts#L130-L166)

`getDynamicConnectionString()` reads the `x-bastion-conn` request header and opens a **new `Pool`** with `{ ssl: { rejectUnauthorized: false } }` to any connection string the caller provides. The guard is `process.env.NODE_ENV === "production"` — but if `NODE_ENV` is not properly set in a staging/preview deployment, any user with network access can point the dashboard at a different CockroachDB cluster, including their own, and pivot schema migrations via `ensureSchema()`.

**Fix:** The dynamic connection feature should also require a valid admin-level API key regardless of `NODE_ENV`, and should validate that the provided DSN matches a configured allowlist (e.g., a regex against known hostnames).

---

### GAP-03 · `signRateLimitCookie` signs the base64-encoded payload, not the raw bytes
**File:** [api-auth.ts](file:///c:/projects/bastion/dashboard/src/lib/api-auth.ts#L74-L79)

`getRateLimitCookie` verifies the HMAC over `Buffer.from(data)` (raw bytes), but `signRateLimitCookie` signs over `dataB64` (the base64 string). This asymmetry means **all existing rate-limit cookies will fail HMAC verification** — they effectively never count. The `effectiveCount` from cookies is always 0, making Layer 2 rate limiting dead code. An attacker can make unlimited requests even in production.

**Fix:** In `signRateLimitCookie`, sign over `Buffer.from(payload)` (raw bytes, not the base64 encoding) to match the verification path.

---

### GAP-04 · `isValidSessionCookie` falls back to accepting any `"x.y"` token when `BASTION_SESSION_SECRET` is unset
**File:** [api-auth.ts](file:///c:/projects/bastion/dashboard/src/lib/api-auth.ts#L96-L101)

```typescript
// No session secret configured — accept any well-formed token in dev mode
const parts = token.split(".");
return parts.length === 2;
```

The comment calls this "dev mode", but the check is purely `if (!secret)`. If `BASTION_SESSION_SECRET` is accidentally absent from a production environment (e.g., missed in a Vercel secret rotation), this silently downgrades security to "any two-part cookie wins". A bot can craft `aaa.bbb` and get full authenticated access.

**Fix:** Return `false` when the secret is missing rather than accepting a structurally valid token. Log a startup error if `BASTION_SESSION_SECRET` is absent in production.

---

### GAP-05 · AS OF SYSTEM TIME timestamp interpolated directly into SQL
**File:** [memory.py](file:///c:/projects/bastion/src/bastion/memory.py#L1533-L1537)

```python
safe_ts = adjusted_ts.replace("'", "''")
cur.execute(
    f"SELECT {_MEMORY_COLS} FROM agent_memory "
    f"AS OF SYSTEM TIME '{safe_ts}' "
    ...
)
```

The only sanitization is `replace("'", "''")`. `_parse_timestamp()` is supposed to validate the timestamp, but for unrecognized formats it just passes through (line 1604: `pass`). An attacker who controls the `timestamp` parameter (via the MCP `memory_timetravel` tool or the `/api/graph` route) and can submit a string that passes the ISO parse check but contains embedded SQL after a timezone specifier could achieve SQL injection. The correct approach is to use `SET TRANSACTION AS OF SYSTEM TIME %s::TIMESTAMPTZ` (parameterized) as done in `knowledge_graph.py:308`.

**Fix:** Replace the f-string interpolation with a parameterized query:
```python
cur.execute(
    f"SELECT {_MEMORY_COLS} FROM agent_memory AS OF SYSTEM TIME %s::TIMESTAMPTZ WHERE agent_id = %s ORDER BY created_at",
    (abs_timestamp, agent_id),
)
```

---

## 🟠 HIGH — Material Security/Correctness Risk

### GAP-06 · RLS is opt-in and not enforced on the pool used by the dashboard
**File:** [rls.py](file:///c:/projects/bastion/src/bastion/rls.py#L61), [memory.py](file:///c:/projects/bastion/src/bastion/memory.py#L268-L285)

`enable_rls()` must be explicitly called after creating a `BastionMemory` instance. It is **not** called by the dashboard's `db.ts` `Pool`. All dashboard API routes (`/api/memories`, `/api/soc`, etc.) operate on the `pg.Pool` directly, bypassing RLS entirely. An authenticated user who discovers that the API uses a shared DB role can query `agent_memory` rows belonging to other agents by adding `WHERE agent_id = 'other-agent'`.

**Fix:** Either (a) enforce a DB-level role per agent (each API request executes `SET app.current_agent_id = $agentId` immediately after acquiring a connection), or (b) add explicit `AND agent_id = $authenticatedAgentId` WHERE clauses to every query in every dashboard API route and validate the agent ID against the session token.

---

### GAP-07 · S3 export has no KMS encryption at rest
**File:** [s3.ts](file:///c:/projects/bastion/dashboard/src/lib/s3.ts#L30-L42)

`exportAgentMemory` calls `PutObjectCommand` with no `ServerSideEncryption` parameter. Given the Python backend implements `EncryptedMemoryWrapper` with per-tenant DEKs via `TenantKMS`, exporting memories in plaintext JSON to S3 creates a cold-storage data leak if the bucket ACL is misconfigured or an S3 access key is compromised. The exported memories may include PII-containing content that bypassed the PII redaction step (see GAP-12).

**Fix:** Add `ServerSideEncryption: "aws:kms"` and `SSEKMSKeyId: process.env.BASTION_KMS_KEY_ARN` to `PutObjectCommand`. Also set `BucketKeyEnabled: true` for cost efficiency.

---

### GAP-08 · Hash chain secret falls back to a hardcoded development secret in production
**File:** [route.ts (soc)](file:///c:/projects/bastion/dashboard/src/app/api/soc/route.ts#L28)

```typescript
const secret = process.env.BASTION_SESSION_SECRET || "bastion-demo-dev-secret";
```

The SOC route uses `BASTION_SESSION_SECRET` as the HMAC key for `computeChainHash`. If that variable is unset, all chain hashes use the same public fallback key. An attacker who knows this secret (it's in the source code) can pre-compute valid `cryptographic_hash` values and forge tamper-evident chain links.

**Fix:** Fail hard (`throw new Error(...)`) if `BASTION_SESSION_SECRET` is missing. Use a dedicated `BASTION_CHAIN_SECRET` to isolate the cryptographic key from the session auth key.

---

### GAP-09 · `_guard_bypass_token` is not validated — any truthy value passes
**File:** [memory.py](file:///c:/projects/bastion/src/bastion/memory.py#L439-L451)

When `_skip_guard=True` and the caller module is in `_GUARD_BYPASS_ALLOWLIST`, the code checks `if not _guard_bypass_token`. But `_guard_bypass_token` is typed as `Any` and accepted as any truthy value (string, int, dict). There is no token derivation or HMAC verification — any caller who knows the allowlisted module names could potentially pass `_skip_guard=True, _guard_bypass_token=1` and suppress MemoryGuard for arbitrary content.

**Fix:** Define a cryptographically signed `BypassToken` (e.g., HMAC-SHA256 of `module_name + timestamp` with a server secret) and verify it in `store()` rather than accepting any truthy value.

---

### GAP-10 · `_parse_timestamp` silently passes through invalid input
**File:** [memory.py](file:///c:/projects/bastion/src/bastion/memory.py#L1598-L1605)

```python
except ValueError as e:
    if "future" in str(e):
        raise
    # If it's not a valid ISO timestamp, let CockroachDB handle the error
    pass
return timestamp
```

An invalid timestamp string that is not an ISO format is returned unchanged and injected into the SQL f-string (GAP-05). The comment "let CockroachDB handle the error" is insufficient because the f-string interpolation happens before CockroachDB parses it, creating a window for injection.

---

### GAP-11 · `middleware.ts` does not protect `/api/*` routes
**File:** [middleware.ts](file:///c:/projects/bastion/dashboard/middleware.ts#L4), [middleware.ts matcher](file:///c:/projects/bastion/dashboard/middleware.ts#L72-L74)

The middleware matcher is:
```typescript
matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"]
```

No `/api/:path*` is listed. Authentication for API routes is left entirely to each individual route handler calling `requireAuth()`. GAP-01 (SOC route) is one symptom. Other API routes that may miss this check (e.g., `/api/dream`, `/api/demo/*`) are not uniformly protected.

**Fix:** Add `/api/:path*` to the middleware matcher. Add explicit allowlist exceptions for public routes (e.g., `/api/health`, `/api/status`).

---

### GAP-12 · PII scan happens after content validation but the redacted content is not re-hashed
**File:** [memory.py](file:///c:/projects/bastion/src/bastion/memory.py#L397-L404)

```python
redacted_content, pii_types = pii_scan(content)
if pii_types:
    content = redacted_content
```

The `cryptographic_hash` computed in `_store_real` (called immediately after `store()`) will be over the **redacted** content, not the original. This is correct behavior but creates an audit gap: the hash chain proves integrity of the redacted version, but there is no cryptographic record that PII was present in the original. An investigator cannot distinguish "content was always redacted" from "PII was removed before hashing."

**Fix:** Store a separate `pii_detected` boolean column and a `content_hash_original` HMAC (keyed with tenant KMS DEK) of the pre-redaction content to support forensic audit without storing raw PII.

---

## 🟡 MEDIUM — Architecture & Operational Gaps

### GAP-13 · No C-SPANN vector index exists — falling back to linear scan
**File:** [memory.py](file:///c:/projects/bastion/src/bastion/memory.py#L202)

The class docstring says "Provides semantic search via C-SPANN vector indexing" and the marketing copy everywhere references C-SPANN. However, no `CREATE INDEX ... USING cspann` or equivalent DDL was found in the codebase. The vector similarity search in `_search_real` uses `embedding <-> query_vec ORDER BY ... LIMIT k` which is a full sequential scan. At scale (>100k memories), this will cause major performance degradation.

**Fix:** Add a `CREATE INDEX ON agent_memory USING cspann (embedding vector_cosine_ops)` to the schema migrations. Verify the installed CockroachDB version supports C-SPANN (v23.2+).

---

### GAP-14 · `db.ts` migration runner ignores statement errors and stores empty checksum
**File:** [db.ts](file:///c:/projects/bastion/dashboard/src/lib/db.ts#L78-L92)

```typescript
} catch (err: unknown) {
    if (err instanceof Error && (err.message.includes("already exists") || err.message.includes("duplicate"))) {
        // Ignore expected idempotent duplicates
    } else {
        console.warn(`[DB Bootstrap] Statement warning in ${file}: ...`);
    }
}
// ...
[version, file, "", elapsed]  // checksum is always ""
```

Migration failures that are not "already exists" are only warned, not thrown. This means a migration can partially apply and be recorded as applied (ON CONFLICT DO NOTHING), making it impossible to re-run or detect the corruption. Additionally, storing `""` as the checksum defeats the purpose of the column entirely.

**Fix:** (a) Throw on non-idempotent SQL errors. (b) Compute SHA-256 of the migration file content and store it as `checksum`. (c) On startup, verify that already-applied migrations have not been modified (checksum mismatch = abort).

---

### GAP-15 · Drift detector does not persist baselines — recomputed on every `score_drift()` call
**File:** [drift.py](file:///c:/projects/bastion/src/bastion/drift.py#L194-L202)

```python
def score_drift(self, agent_id, baseline=None, ...):
    if baseline is None:
        baseline = self.establish_baseline(agent_id)  # Full SQL aggregates every call
```

When `baseline=None` (the common case), `establish_baseline` runs 4+ SQL queries for every drift check. In `watch()` mode (called every 300s), this means recurring full table scans. More critically, the baseline is computed from the **current** state, not from a historical snapshot, so a compromised agent that has poisoned its own memory history will cause the baseline to include the poison, masking the drift signal.

**Fix:** Store baseline snapshots in a `agent_drift_baselines` table at session start. Recompute only on demand or after N hours. Use `AS OF SYSTEM TIME` for baseline reads to anchor them to a verified-clean timestamp.

---

### GAP-16 · Knowledge graph AS OF SYSTEM TIME uses transaction-level not statement-level
**File:** [knowledge_graph.py](file:///c:/projects/bastion/src/bastion/knowledge_graph.py#L308)

```python
cur.execute("SET TRANSACTION AS OF SYSTEM TIME %s::TIMESTAMPTZ", (timestamp,))
```

`SET TRANSACTION AS OF SYSTEM TIME` applies to the **entire transaction**, which means any subsequent writes in that transaction will fail (CockroachDB rejects writes in historical transactions). This is fine if `graph_at_time` never writes — but if the connection is in autocommit=False and a caller accidentally calls a write after `graph_at_time` on the same connection, it will fail with a confusing error. The statement-level form (`SELECT ... AS OF SYSTEM TIME`) is safer.

**Fix:** Use the statement-level form: `SELECT ... FROM agent_entities AS OF SYSTEM TIME %s::TIMESTAMPTZ WHERE ...` in both entity and relation queries to avoid tainting the transaction.

---

### GAP-17 · `pool.py` acquire() releases consumer quota before connection is returned
**File:** [pool.py](file:///c:/projects/bastion/src/bastion/pool.py#L178-L187)

When a connection is acquired from the pool but fails the health check (lines 178-187), the code decrements `_consumer_counts` before calling `conn_to_check = None` and `continue`. This is correct. However, in the path where `_create_connection()` raises an exception (line 203-210), the code decrements `_consumer_counts` **and** rolls back `_total_created` but does **not** account for the case where another thread acquired the same consumer slot between the `_consumer_lock` check and the `_lock` check for `_total_created`. Under high concurrency, this TOCTOU gap can allow one extra connection above `max_per_consumer`.

**Fix:** Use a single lock or an atomic counter library. Alternatively, do the consumer check and `_total_created` reservation under the same lock.

---

### GAP-18 · `EncryptedMemoryWrapper` content length margin uses a fixed constant not actual overhead
**File:** From previous session analysis of `kms.py`

`_MAX_CONTENT_LENGTH` is reduced by ~2KB to leave room for AES-GCM + IV + tag overhead, but AES-GCM overhead is only 28 bytes (12 IV + 16 tag) plus base64 expansion (~33%). The 2KB margin is conservative but was derived heuristically. If the metadata JSON is large, the total encrypted envelope can still exceed the DB column limit.

**Fix:** Compute the actual maximum safe content length dynamically: `MAX_CONTENT = (DB_COLUMN_BYTES - METADATA_OVERHEAD) / 1.34` where 1.34 is the base64 expansion factor.

---

### GAP-19 · Hash chain comparison in SOC route compares truncated hashes
**File:** [route.ts (soc)](file:///c:/projects/bastion/dashboard/src/app/api/soc/route.ts#L95-L100)

```typescript
analystMemories[i].previousHash !== analystMemories[i + 1].hash
// where:
hash: String(r.cryptographic_hash || "").slice(0, 12) + "..."
previousHash: r.previous_hash ? String(r.previous_hash).slice(0, 12) + "..." : "GENESIS"
```

The display hashes are truncated to 12 characters for the UI, and then the **truncated** strings are compared for chain verification. Two different full hashes that share the same first 12 characters will pass verification. This is displayed to users as authoritative proof of integrity.

**Fix:** Perform hash chain verification on full untruncated hashes. Only truncate for display, never for comparison.

---

### GAP-20 · `BehavioralDriftDetector.watch()` only supports one agent per instance
**File:** [drift.py](file:///c:/projects/bastion/src/bastion/drift.py#L365-L380)

`watch()` stores a single `_watch_thread` and `_stop_event`. Calling `watch("agent_a")` then `watch("agent_b")` on the same detector instance will overwrite the thread reference, leaking the first thread. There is no way to stop individual agent watches selectively.

**Fix:** Use a `dict[str, threading.Thread]` and `dict[str, threading.Event]` keyed by `agent_id` to support multiple concurrent watchers per instance.

---

## 🔵 LOW — Architectural Debt & Hardening Opportunities

### GAP-21 · `BASTION_DISABLE_AUTH = "true"` permanently disables all auth
**File:** [api-auth.ts](file:///c:/projects/bastion/dashboard/src/lib/api-auth.ts#L251-L253)

```typescript
if (process.env.BASTION_DISABLE_AUTH === "true") {
    return null;  // Full bypass
}
```

This env var is documented for "public demo deployments" but disables both session cookie AND API key checks. If mistakenly set in a production deployment, it provides zero authentication. The same flag also bypasses middleware in `middleware.ts:62`.

**Fix:** Remove the blanket `BASTION_DISABLE_AUTH` bypass from API routes. For demo deployments, use a read-only API key with scoped permissions instead.

---

### GAP-22 · Connection pool reaper uses integer division for sleep interval
**File:** [pool.py](file:///c:/projects/bastion/src/bastion/pool.py#L74-L79)

```python
self._stop_reaper.wait(timeout=self.max_idle_seconds / 2)
```

For `max_idle_seconds=300`, the reaper wakes every 150 seconds. But the reaper only reaps connections with `idle > max_idle_seconds` — a connection idle for 299 seconds will survive two reaper runs before being collected. This is by design, but there's no cap: very large `max_idle_seconds` (e.g., 86400) means the reaper may hold dead connections for up to 48 hours.

**Fix:** Cap the reaper sleep at `min(max_idle_seconds / 2, 60)` seconds to ensure prompt cleanup.

---

### GAP-23 · S3 export key path uses `Date.now()` which is not monotonic under clock skew
**File:** [s3.ts](file:///c:/projects/bastion/dashboard/src/lib/s3.ts#L27)

```typescript
const key = `memory-exports/${agentId}/${Date.now()}.json`;
```

In serverless environments (Vercel), multiple concurrent invocations can produce the same millisecond timestamp, resulting in S3 key collisions and silent overwrites of previous exports.

**Fix:** Use `crypto.randomUUID()` as part of the key: `` `memory-exports/${agentId}/${Date.now()}-${randomUUID()}.json` ``

---

### GAP-24 · `guard.ts` (frontend) and `guard.py` (backend) pattern sets may diverge
**File:** [guard.ts](file:///c:/projects/bastion/dashboard/src/lib/guard.ts), [guard.py](file:///c:/projects/bastion/src/bastion/guard.py)

Both the Python backend and the TypeScript frontend implement OWASP ASI06 detection patterns. There is no automated test or CI check that verifies the two implementations agree on a shared test corpus. New patterns added to the Python guard may never be ported to TypeScript (or vice versa), creating a gap where the dashboard UI claims "safe" but the backend blocks, or vice versa.

**Fix:** Maintain a shared JSON file of test vectors (`{ input, expected_safe, expected_threats }`) that both test suites import. Add a CI step that diffs pattern counts between the two implementations.

---

### GAP-25 · `knowledge_graph.py` NLP triple extraction has no size limit on LLM self-check
**File:** From previous session analysis of `knowledge_graph.py`

The LLM self-check for triple extraction sends the full memory content to the LLM. For large content (up to `_MAX_CONTENT_LENGTH = 100_000` bytes), this can generate extremely large LLM requests, causing high latency, cost, and potential context window overflow.

**Fix:** Truncate content sent to the LLM self-check at 4096 tokens (~16KB) and log a warning when truncation occurs.

---

### GAP-26 · No CORS policy on dashboard API routes
All `/api/*` Next.js routes respond without CORS headers. If the dashboard is deployed on a public domain, cross-origin JavaScript (e.g., a phishing page) can make authenticated requests using the user's `bastion_auth_token` cookie via credentialed fetch — the SameSite=Strict cookie attribute mitigates this, but only for cross-site navigations, not for subdomain attacks.

**Fix:** Add an explicit `Access-Control-Allow-Origin` header restricted to the dashboard's own domain, and verify `SameSite=Strict` is set on all auth cookies (it currently is).

---

## Summary Table

| ID | Area | Severity | Status |
|---|---|---|---|
| GAP-01 | `/api/soc` no auth | 🔴 Critical | Open |
| GAP-02 | Arbitrary DB pivot via header | 🔴 Critical | Open |
| GAP-03 | Rate-limit cookie HMAC asymmetry | 🔴 Critical | Open |
| GAP-04 | Session cookie accepts anything without secret | 🔴 Critical | Open |
| GAP-05 | AS OF SYSTEM TIME SQL injection via f-string | 🔴 Critical | Open |
| GAP-06 | RLS bypassed by dashboard DB pool | 🟠 High | Open |
| GAP-07 | S3 exports unencrypted | 🟠 High | Open |
| GAP-08 | Chain hash secret falls back to hardcoded | 🟠 High | Open |
| GAP-09 | Guard bypass token not cryptographically verified | 🟠 High | Open |
| GAP-10 | Invalid timestamp silently passed to SQL | 🟠 High | Open |
| GAP-11 | Middleware does not cover `/api/*` | 🟠 High | Open |
| GAP-12 | PII redaction loses original evidence for audit | 🟠 High | Open |
| GAP-13 | C-SPANN index not actually created (linear scan) | 🟡 Medium | Open |
| GAP-14 | Migration runner swallows errors, stores empty checksum | 🟡 Medium | Open |
| GAP-15 | Drift baseline recomputed from current (possibly poisoned) state | 🟡 Medium | Open |
| GAP-16 | Knowledge graph time travel taints transaction | 🟡 Medium | Open |
| GAP-17 | Pool TOCTOU in consumer quota under high concurrency | 🟡 Medium | Open |
| GAP-18 | Encrypted content size margin computed heuristically | 🟡 Medium | Open |
| GAP-19 | Hash chain verification uses truncated display hashes | 🟡 Medium | Open |
| GAP-20 | Drift detector watch() leaks threads for multiple agents | 🟡 Medium | Open |
| GAP-21 | `BASTION_DISABLE_AUTH` provides a single env var full bypass | 🔵 Low | Open |
| GAP-22 | Pool reaper sleep uncapped for large idle timeouts | 🔵 Low | Open |
| GAP-23 | S3 export key can collide under serverless concurrency | 🔵 Low | Open |
| GAP-24 | Guard patterns can diverge between Python and TypeScript | 🔵 Low | Open |
| GAP-25 | LLM self-check for triples has no size limit | 🔵 Low | Open |
| GAP-26 | No CORS policy on API routes | 🔵 Low | Open |
