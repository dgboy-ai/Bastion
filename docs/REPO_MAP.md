# Repository Directory Map

This document maps Bastion's file structure and the roles of all system modules located inside the `src/bastion/` codebase directory.

---

## 📂 Source Code Structure (`src/bastion/`)

The core module files are structured as follows:

```
src/bastion/
├── adapters/          — Integration layers (CrewAI, LangChain, LlamaIndex)
├── a2a_server.py      — Google-standard Agent-to-Agent protocol server
├── a2a_signing.py     — Ed25519 signature checks and Agent Card signing
├── audit.py           — SHA-256 hash chains & Merkle path validations
├── circuit_breaker.py — LLM transaction rate loop-detection breakers
├── compliance.py      — GDPR hard delete execution & signed receipts
├── config.py          — Pydantic-settings config parsing with masked secrets
├── crdt_memory.py     — Shapiro CRDT database write coordination
├── drift.py           — Semantic drift tracking on Titan V2 vector spaces
├── errors.py          — Custom exceptions (e.g. SecurityBlockException)
├── firewall.py        — PII regex firewalls & sanitization checks
├── groq_callback.py   — Groq connection client manager singleton
├── guard.py           — MemoryGuard controller (Regex + Groq safety checks)
├── kms.py             — AWS KMS & LocalKMS envelope encryption client
├── limiter.py         — Distributed concurrency lock slots manager
├── mcp_server.py      — FastMCP tool, resource, and prompt controller
├── memory.py          — Core BastionMemory database operations controller
├── merkle.py          — Cryptographic Merkle Tree recalculation layer
├── mock.py            — In-memory mock database operations fallback
├── pool.py            — Thread-safe psycopg2 and asyncpg pools
├── rls.py             — Row-Level Security contexts & connection resets
├── saga.py            — JSONB-backed Saga transaction state coordinators
└── telemetry.py       — OpenTelemetry context trace propagations
```

---

## 📂 Tests Structure (`tests/`)

Tests correspond directly to codebase files to verify execution paths:

*   [`tests/test_memory.py`](file:///c:/projects/bastion/tests/test_memory.py) — Validates database operations, vector searches, and temporal travel.
*   [`tests/test_limiter.py`](file:///c:/projects/bastion/tests/test_limiter.py) — Validates distributed slot concurrency locks.
*   [`tests/test_kms.py`](file:///c:/projects/bastion/tests/test_kms.py) — Validates local/AWS KMS encryption wrapper logic.
*   [`tests/test_guard.py`](file:///c:/projects/bastion/tests/test_guard.py) — Validates regex filters and Groq LLM guardrails.
*   [`tests/test_compliance.py`](file:///c:/projects/bastion/tests/test_compliance.py) — Validates Merkle audit chain checks and GDPR receipt validation.
*   [`tests/test_rls.py`](file:///c:/projects/bastion/tests/test_rls.py) — Validates autocommit limits and connection reset scopes.
*   [`tests/test_saga.py`](file:///c:/projects/bastion/tests/test_saga.py) — Validates crash-safe saga transaction loops.
