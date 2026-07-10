# Bastion — Remaining Gaps Analysis (July 10, 2026)

Comprehensive 38-point codebase audit across `gaps.md`, `gaps_memo.md`, `gaps_mimo.md`.

**Context:** Prior rounds fixed 50+ gaps (SQL injection, race conditions, CORS, KMS fallback, Docker config, Telemetry, bare excepts, test assertions, etc.). This is what's left.

---

## 🔴 High Impact (affects demo credibility)

| # | Gap | File(s) | Description |
|---|-----|---------|-------------|
| **119/S3** | **PII scan NOT wired into store pipeline** | `guard.py:515-528`, `memory.py:283-311` | `pii_scan()` exists but is only called for audit-log `content_preview` — never on actual stored content. Emails, phones, SSNs flow unchecked into DB. GDPR claim unverifiable. |
| **C2** | **NavBar missing /health and /compliance links** | `NavBar.tsx:10-14` | Two pages exist but are unreachable from navigation. Judges can't find them. |
| **L1/M1** | **14 modules bypass structured logging** | see below | Use `logging.getLogger()` instead of `get_logger()`, losing JSON formatting and secret redaction. |

### Modules using `logging.getLogger()` instead of `get_logger()`:

- `a2a_server.py`
- `a2a_signing.py`
- `agent.py`
- `drift.py`
- `firewall.py`
- `groq_callback.py`
- `limiter.py`
- `mcp_server.py`
- `pool.py`
- `retry.py`
- `rls.py`
- `rules.py`
- `saga.py`
- `trust.py`

---

## 🟠 Medium Impact (quality / debuggability)

| # | Gap | File(s) | Description |
|---|-----|---------|-------------|
| **#87** | **Loading state stuck forever on fetch error** | `CacheCostWidget.tsx:39` | `.catch(console.error)` — `loading` never flips, user sees perpetual "Loading cache stats..." |
| **#72** | **Silent catch blocks** | `CdcPipelineViz.tsx:73`, `MemoryGuardPanel.tsx:48` | Fetch errors caught but not logged, no user feedback. |
| **#70** | **3s polling causes full-page re-render** | `page.tsx:120` | All 15 state setters fire every 3 seconds. SVG/D3 re-initialize. No memo on 14/17 components. |
| **#29** | **bridge_mem0 direct mock state access** | `bridge_mem0.py:201-214` | Mock path accesses `_agent_data` / `_lock` directly from `bastion.mock` instead of going through `BastionMemory.list_all()`. |
| **#51** | **list_all without lock in concurrent test** | `test_asi06_integration.py:322-370` | `list_all()` called during concurrent store test without acquiring mock lock — race condition. |
| **#06** | **MCP auth disabled when API keys empty** | `mcp_server.py:74-84` | Warning logged, but server runs with zero auth. Anyone with the endpoint can call all MCP tools. |
| **#49** | **time.sleep in test_limiter** | `test_limiter.py:113-117` | `_t.sleep(0.025)` in polling loop — flaky on slow CI. |

---

## 🟡 Low Impact (nice-to-have polish)

| # | Gap | File(s) | Description |
|---|-----|---------|-------------|
| **#71** | **No React.memo on 14/17 components** | various | Only `CostComparison`, `KpiCardGrid`, `NavBar` use memo. Rest re-render on every poll tick. |
| **#76** | **"use client" on every page** | all 5 pages | Defeats RSC optimization. Expected for interactive dashboards but could shift data-fetching to server. |
| **#77** | **No dynamic imports on sub-pages** | graph, health, compliance, logs | Only main page uses `dynamic()`. Other pages load everything eagerly. |
| **#73** | **SVG keyboard incomplete** | `page.tsx:289-305` | Circles focusable + tooltip on focus, but no `onKeyDown` for keyboard activation. |
| **#53** | **Brittle SQL string assertions** | `test_saga.py:154-158` | `any("INSERT INTO saga_states" in ... )` — fragile to whitespace/formatting changes. |
| **#56** | **MagicMock mismatch** | `test_saga.py:47-54` | Mixing `MagicMock()` with selective `_mock` attribute — test smell. |
| **#30** | **bridge_mem0 falsy filter** | `bridge_mem0.py:148-156` | `if not agent_id:` treats `""` as missing — functionally works but semantically wrong. |
| **#90** | Hardcoded initial values | `page.tsx:40` | ✅ Already fixed in prior round (15/6/3 → 0/0/0) |
| **#57** | Consolidator zero assertions | `test_consolidator.py` | ✅ Already fixed in prior round |

---

## Already Verified Fixed (prior rounds)

| # | Gap | Status |
|---|------|--------|
| #02/#03 | SQL injection in dba.py | ✅ `_validate_table_name()` + `_validate_default_value()` |
| #04/#13 | Memory f-string SQL | ✅ Allowlist `_ALLOWED_AGENT_FILTERS` |
| H1 | 4 bare excepts (a2a_signing, guard, limiter, pool) | ✅ Added `logger.warning()` |
| #08 | MCP race singleton | ✅ Double-checked locking |
| #09 | KMS silent fallback | ✅ `logger.error()` on fallback |
| #10 | Encapsulation (compliance) | ✅ Added `sign_data()` method |
| #11 | CORS permissive | ✅ Locked to localhost |
| #12 | Empty API key silent | ✅ `logger.warning()` |
| #14 | Sync LLM callback in async | ✅ `anyio.to_thread.run_sync()` |
| #24 | async chat() zero await | ✅ Wrapped with `anyio.to_thread.run_sync()` |
| #25 | Thread-unsafe conversation history | ✅ Added `threading.Lock()` |
| #26 | RuleCategory missing RELIABILITY | ✅ Added to enum |
| #27 | Hash chain race | ✅ Append inside lock scope |
| #28 | LWW scalar clock sum | ✅ Uses proper VectorClock dominance |
| #31 | Duplicated Merkle | ✅ Reuses `MerkleTree.from_hashes()` |
| #32 | CRDT duplicated code | ✅ Shared `_resolve_candidates` |
| #47 | No real DB integration tests | ✅ 9 tests in `test_integration_memory.py` |
| #48 | test_drift _stddev expected 0.1 | ✅ Intentional safety floor (documented) |
| #50 | env clear in conftest | ✅ No env manipulation in conftest.py |
| #54 | LLM false confidence | ✅ Tests verify fallback correctly |
| #55 | Fake connection mock | ✅ Standard unit test pattern |
| #57/#61/#62/#64 | Weak test assertions | ✅ Added real assertions |
| #66 | D3 restart on every render | ✅ `useRef` callback |
| #67 | Blanket no-explicit-any | ✅ Verified with actual eslint config |
| #68 | No fetch timeout | ✅ 10s AbortController |
| #74 | Modal no keyboard | ✅ Added Escape, aria, focus trap |
| #75 | (err as Error).message crash | ✅ `instanceof` guard |
| #78 | Empty next.config | ✅ Security headers present |
| #79 | No retry button | ✅ Added to all pages |
| #80 | GlobalErrorHandler silent | ✅ Shows visible red banner |
| #81 | SafeQueryResult double cast | ✅ `mockResult()` factory |
| #90 | Hardcoded initial values | ✅ 15/6/3 → 0/0/0 |
| #94 | Docker runs as root | ✅ `USER node` |
| #95/#96 | Docker resource limits + restart | ✅ Configured in compose |
| #107 | Hardcoded API key | ✅ Placeholder `'change-me-local-dev-only'` |
| #116 | Silent mock fallback in prod | ✅ Throws when `BASTION_MOCK=false` + no conn |
| #117 | Lambda print() instead of logging | ✅ Uses `logger.info/warning` |
| #120 | Self-check Groq client per call | ✅ Cached with `_groq_client` guard |
| C1 | No tests for new features | ✅ `test_new_features.py` (285 lines) |

---

## Aligned Work Plan

### Step 1 — Wire PII scan into store pipeline (🔴)
- In `memory.py:store()` / `_store_real`, call `pii_scan()` on content before writing to DB
- Return redacted content or reject with error

### Step 2 — NavBar missing links (🔴)
- Add `/health` and `/compliance` to `NavBar.tsx` links array
- 3 lines, 15 minutes

### Step 3 — Convert 14 modules to get_logger() (🔴)
- Replace `import logging; logger = logging.getLogger(__name__)` with `from bastion.log_setup import get_logger; logger = get_logger(__name__)`
- 14 files, ~1 hour

### Step 4 — Fix stuck loading state + silent catches (🟠)
- `CacheCostWidget.tsx:39` — add `finally { setLoading(false); }`
- `CdcPipelineViz.tsx:73` — add `console.error()`
- `MemoryGuardPanel.tsx:48` — add `console.error()`

### Step 5 — Verify all tests pass
- `pytest -x -q` (Python)
- `npx vitest run` (JS/TS)
- `npm run lint` + `npx next build`

---

## Test Results Baseline

| Suite | Passed | Skipped | Failed |
|-------|--------|---------|--------|
| Python (non-heavy) | 840 | 17 | 0 |
| JS/TS (vitest) | 58 | 19 | 0 |
| ESLint | 0 errors | — | — |
| `next build` | Compiles clean | — | — |
