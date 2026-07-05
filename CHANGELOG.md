# Changelog

All notable changes to Bastion are documented here.

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
