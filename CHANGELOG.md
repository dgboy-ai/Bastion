# Changelog

All notable changes to Bastion are documented here.

## [0.3.0] — 2026-07-06

### Production-Grade Hardening — A2A v1.0, CRDT Semantics, Zero Silent Failures

This session focused on closing every gap between hackathon prototype and Google production grade: A2A compliance, CRDT correctness, thread safety, resource safety, frontend resilience, and silent-failure elimination. All gates green (278 tests, ruff clean, mypy clean, TypeScript clean).

#### Added — A2A v1.0 Protocol Server

- **`a2a_server.py` rewritten**: Uses official `a2a-sdk ~v1.1.0` types and helpers
- **Protobuf-based AgentCard** served at `/.well-known/agent-card.json`
- **JSON-RPC endpoints**: `SendMessage`, `GetTask`, `CancelTask` (all gRPC-style method names per spec)
- **REST endpoints**: `/message:send`, `/tasks/{id}`, `/tasks/{id}:cancel`
- **`A2A-Version: 1.0` header** required on all requests
- **Rate limiter** with per-IP buckets (configurable via env)
- **Prometheus `/metrics`** endpoint
- **Structured JSON logging** with correlation IDs, configurable via `LOG_JSON` env var

#### Fixed — All Critical/High Backend Bugs (7 + 10 review findings)

- **`search("*")` anti-pattern eliminated**: All 13 call sites in `analytics.py`, `agent.py`, `bridge_mem0.py`, `adapters/langchain.py` replaced with `list_all()`
- **`_MEMORY_FIELDS` + `_ENTITY_FIELDS` as single source of truth**: `from_row` uses `zip(fields, row, strict=True)` instead of hardcoded tuple indices
- **`_bedrock_client` thread-safe**: Double-checked locking with `threading.Lock`
- **Connection reuse for time-travel queries**: `_tt_conn` lazily created and shared between `_get_at_time_real` and `_graph_at_time_real`
- **`close()` uses `try/finally`**: Guarantees `_tt_conn` is closed even if `_conn.close()` raises
- **`detect_anomalies_real` logs instead of bare `pass`**: `logger.exception(...)` replaces silent error swallow
- **INSERT RETURNING rows use named column access**: `row._mapping` with fallback instead of fragile `row[0]`/`row[1]`
- **`hash(fact_a + fact_b)` replaced**: Uses `int(hashlib.sha256(...).hexdigest(), 16)` for deterministic lock names across restarts
- **19 `assert conn is not None` → `RuntimeError`**: All assertions replaced with explicit typed exceptions
- **`_audit_real`, `_heal_real`, `_get_last_hash`**: Added `logger.exception()` to eliminate silent failures
- **`a2a_server.py /message:send`**: Added `logger.exception()` for request body parsing errors
- **CORS fixed**: `allow_credentials=False` when `allow_origins=["*"]` (per CORS spec); origin parsing now strips whitespace

#### Fixed — CRDT Semantics

- **PNCounter `merge()` + proper clock accumulation**: `_p_clock`/`_n_clock` use element-wise max instead of overwrite; `value()` dedup key uses `json.dumps(vc_raw, sort_keys=True)` instead of fragile `str(tag)`
- **ORMap vector clock dominance**: Replaced LWW-by-timestamp with causal comparison; concurrent writes fall back to timestamp
- **ORSet add-wins semantics fixed**: `break` → `continue` in element resolution loop — was ignoring subsequent add records after first match

#### Fixed — All 6 Frontend Critical Bugs

- **React Error Boundary component**: Created and wired at root layout + `<KnowledgeGraph>` with fallback UI and retry button
- **Global error handler**: `window.onerror` + `unhandledrejection` listeners via `<GlobalErrorHandler />`
- **SSL `rejectUnauthorized: false` gated by `NODE_ENV`**: Dev-only permissive SSL, production uses `ssl: true` with full certificate validation
- **TypeScript errors fixed**: `err: unknown` → proper `instanceof Error` checks in graph and logs pages
- **CspannHud infinite loop**: Removed `readings.length` from dependency array
- **Stats anomaly count always 0**: Wired up `alerts` field from duplicate-content query to `anomalyCount`

#### Added — `list_all()` Method

- **`BastionMemory.list_all()`**: Public method returning all non-expired memories with namespace scope and type filtering
- **`mock_list_all()`**: In-memory mock with same semantics
- **`_list_all_real()`**: SQL query using `_MEMORY_COLS` with proper expiry and agent-id filtering
- **`TracedBastionMemory.list_all()`**: OpenTelemetry-traced proxy
- **6 comprehensive tests**: basic listing, type filter, expiry exclusion, empty agent, shared scope, own-scope isolation

#### Added — TracedBastionMemory Proxy Methods

- **9 missing proxy methods**: `list_all`, `reinforce`, `store_with_graph`, `graph_query`, `graph_at_time`, `graph_stats`, `broadcast`, `poll_messages`, `get_memory`
- **`namespace_scope` param** added to `search()` proxy

#### Fixed — Mock Consistency

- **`expires_at` type handling**: `mock_search_memory`, `mock_list_all`, `mock_poll_messages` now handle both `str` and `datetime` types (matching `mock_heal` pattern)

#### Test Results

| Suite | Tests | Status |
|---|---|---|
| Python SDK | 278 | All pass |
| TypeScript SDK | 32 | All pass |
| **Total** | **310** | **All pass** |

---

## [0.2.0] — 2026-07-06

### Hackathon Gap Fixes & MCP Protocol Rewrite

This session focused on closing critical gaps identified in the hackathon readiness analysis and rewriting the MCP server to use the real MCP protocol.

#### Fixed — Critical Gaps

- **Vector dimension mismatch**: Aligned schema, TECHNICAL_SPEC, seed script, and dashboard from `VECTOR(1536)` to `VECTOR(1024)` to match Bedrock Titan V2 output dimension
- **C-SPANN index activated**: Uncommented and fixed `CREATE INVERTED INDEX ... USING INVERTED (embedding) WITH (dim=1024)` in schema
- **CDC changefeed activated**: Added `CREATE CHANGEFEED` for both `agent_checkpoints` and `agent_memory` tables
- **Lambda CDC handler implemented**: Created `lambda/cdc_handler.py` with hash chain verification, anomaly detection, circuit breaker, snapshot/rollback, and S3 archival
- **README TypeScript test count fixed**: Updated from 14 to 32

#### Added — MCP Protocol Server

- **Rewrote `src/bastion/mcp_server.py`**: Uses real `mcp` Python library (v1.28.1) with proper JSON-RPC 2.0 protocol, capability negotiation, and stdio transport
- **6 MCP tools**: `memory_search`, `memory_store`, `memory_timetravel`, `memory_audit`, `memory_heal`, `resolve_conflict`
- **Each tool has proper `inputSchema`** with typed parameters and detailed descriptions
- **stdio transport**: Works with Claude Code, Cursor, and VS Code
- **17 new MCP server tests**: All passing

#### Added — Lambda CDC Handler

- `lambda/cdc_handler.py` — Full CDC event processor with:
  - Hash chain integrity verification (SHA-256 chain validation)
  - Anomaly detection (fact turnover, size spikes, rapid writes)
  - Circuit breaker pattern (configurable threshold + window)
  - S3 snapshot creation for rollback
  - Rollback from snapshot capability
  - Health check endpoint
- `lambda/template.yaml` — AWS SAM deployment template
- `lambda/test_cdc_handler.py` — 12 tests for CDC handler logic
- `lambda/requirements.txt` — psycopg + boto3 dependencies

#### Added — Dashboard Visualizations

- `dashboard/src/components/HashChainVisualizer.tsx` — Visual chain of memory blocks with SHA-256 links, integrity status, block detail on click
- `dashboard/src/components/CspannHud.tsx` — Live gauge showing C-SPANN query latency, P99, cache hit rate, sparkline
- `dashboard/src/components/SqlExplainer.tsx` — Click any memory to see the raw CockroachDB SQL query, syntax highlighting, copy-to-clipboard
- `dashboard/src/components/CdcPipelineViz.tsx` — Animated particles flowing through pipeline stages, live stats, event log

#### Added — Infrastructure

- `docker-compose.yml` — One-command local dev: CockroachDB + schema init + seed data + dashboard
- `dashboard/Dockerfile` — Multi-stage Next.js build for production
- `scripts/benchmark.py` — 6-test benchmark suite scoring 100/100 (single-hop retrieval, multi-hop graph, temporal reasoning, hash chain, semantic caching, memory decay)
- `WINNING_STRATEGY.md` — Comprehensive hackathon winning strategy with 44-day execution plan

#### Modified — Schema

- `schema/001_agent_checkpoints.sql` — Added active CDC changefeed
- `schema/002_agent_memory.sql` — Fixed VECTOR(1024), added C-SPANN index, added CDC changefeed

#### Modified — SDK

- `sdk/typescript/package.json` — Added `@aws-sdk/client-bedrock-runtime` as optional dependency

#### Modified — Documentation

- `README.md` — Fixed TypeScript test count (14 → 32)
- `TECHNICAL_SPEC.md` — Updated vector dimensions to 1024
- `SUBMISSION_CHECKLIST.md` — Marked all completed items as DONE
- `scripts/seed_graph.py` — Updated mock embeddings from 1536 to 1024 dimensions

#### Test Results

| Suite | Tests | Status |
|---|---|---|
| Python SDK | 82 | All pass |
| TypeScript SDK | 32 | All pass |
| Lambda CDC Handler | 12 | All pass |
| **Total** | **126** | **All pass** |

---

## [0.1.0] — 2026-07-05

### Initial Release — Core Platform

#### Added — Core SDK

- `BastionMemory` class with full CRUD for all memory types
- Hash-chained memory (SHA-256 cryptographic integrity)
- Cognitive memory decay with importance-weighted retention
- Semantic caching (C-SPANN similarity before LLM calls)
- Multi-agent conflict resolution (SERIALIZABLE isolation)
- ccloud auto-provisioning (`provision_cluster()`)
- Mock mode (`BASTION_MOCK=true`) for offline development
- Bedrock Titan V2 embeddings with hash-based fallback

#### Added — Knowledge Graph

- Temporal knowledge graph on pure SQL (no Neo4j)
- Entity and relation extraction from natural language
- Multi-hop BFS graph traversal
- Temporal graph snapshots (`AS OF SYSTEM TIME`)
- Graph statistics (entities, relations, orphans)

#### Added — Data Model

- 7 SQL schemas: `agent_checkpoints`, `agent_memory`, `agent_audit`, `agent_coordination`, `agent_entities`, `agent_relations`, `memory_decay`
- `agent_checkpoints` with idempotency keys and CDC target
- `agent_audit` with append-only hash chain
- `agent_coordination` with SERIALIZABLE locks

#### Added — TypeScript SDK

- `bastion-memory` npm package with 1:1 Python API parity
- Same `store()`, `search()`, `get_at_time()`, `audit()`, `heal()`, `resolve_conflict()`, `provision_cluster()` API
- Real `pg` driver support for production use
- Mock mode for offline development

#### Added — Ecosystem Adapters

- `BastionChatMessageHistory` — LangChain adapter
- `BastionShortTermMemory` — CrewAI adapter
- `BastionVectorStore` — LlamaIndex adapter

#### Added — Telemetry

- `TracedBastionMemory` — OpenTelemetry wrapper for all SDK operations
- Spans for embed, search, store, heal, resolve_conflict, query_with_cache

#### Added — Dashboard

- Next.js 16 + shadcn/ui mission control
- Overview page with KPIs, decay curve, audit log, memory growth
- Knowledge Graph page with D3.js force-directed visualization
- Logs page with search and filtering
- Real-time stats API (`/api/stats`)

#### Added — Testing

- 72 Python tests (SDK core, MCP, hash chain, knowledge graph, memory decay, telemetry, adapters)
- 32 TypeScript tests (mirror of Python SDK)
- GitHub Actions CI pipeline (Python 3.11-3.13 + TypeScript)
- Ruff linting

#### Added — Documentation

- `BASTION.md` — Executive summary
- `TECHNICAL_SPEC.md` — Architecture, schema, build plan
- `DEMO_SCRIPT.md` — Word-for-word demo beats
- `DESIGN.md` — xAI-inspired dashboard design system
- `README.md` — Quick start, architecture, features
- `SUBMISSION_CHECKLIST.md` — Devpost submission checklist
- `DOMINATION_PLAN.md` — Competitive analysis and feature roadmap

---

## Version History

| Version | Date | Description |
|---|---|---|
| 0.2.0 | 2026-07-06 | MCP protocol rewrite, Lambda CDC, dashboard visualizations, Docker Compose |
| 0.1.0 | 2026-07-05 | Initial release — core SDK, knowledge graph, TypeScript SDK, dashboard |
