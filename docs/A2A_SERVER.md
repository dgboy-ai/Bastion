# Bastion A2A Server — Agent-to-Agent Protocol

> **Full A2A v1.0 implementation with Ed25519 cryptographic identity, task lifecycle management, and database-backed persistence.**

---

## Overview

Bastion implements a complete **A2A (Agent-to-Agent) v1.0 protocol server** that enables agents to discover, communicate, and coordinate with each other cryptographically.

**Key Features:**
- ✅ **25 A2A Skills** matching the core memory and governance API.
- ✅ **Ed25519 Cryptographic Signatures** on Agent Cards and messages.
- ✅ **JSON-RPC 2.0 / REST Dual API** (SendMessage, GetTask, CancelTask).
- ✅ **Prometheus telemetry** (`/metrics` endpoint).
- ✅ **Distributed rate limiting** (600 req/min/IP).
- ✅ **Database-backed task state** (`a2a_tasks` table on CockroachDB).

---

## Why A2A & Where It's Used

Bastion speaks **both halves of the emerging agent interoperability stack** — both standards now governed under the Linux Foundation:

| Protocol | Layer | Who consumes it |
| :--- | :--- | :--- |
| **MCP** (Model Context Protocol) | Agent → tools / data | Claude Code, Cline, GitHub Copilot, Cursor, Windsurf, opencode |
| **A2A** (Agent-to-Agent) | Agent ↔ agent delegation | Orchestrators & agent platforms (Bedrock Agents, Vertex AI, Copilot Studio) |

MCP is how developers reach Bastion's memory tools today. **A2A is how future agents delegate to each other** — an orchestrator treats Bastion as a peer agent with discoverable skills, not just a data source.

### Where the A2A server can be used

1. **Orchestrator delegation** — an agent platform such as **AWS Bedrock Agents**, **Google Vertex AI Agent Engine / ADK**, or **Microsoft Copilot Studio / Azure AI Foundry** delegates a `memory_store`, `memory_heal`, or `memory_verify` task to a Bastion agent over A2A. The result lands in CockroachDB as hash-chained, auditable memory.
2. **Cross-vendor memory federation** — a LangGraph agent hands off a memory operation to an ADK- or CrewAI-built agent that shares the same Bastion memory namespace, with no bespoke integration code.
3. **Multi-agent incident response** — a Security Analyst agent escalates; an Incident Responder agent (A2A) performs the time-travel heal over the task lifecycle, then reports back — exactly the flow demonstrated in the Bastion dashboard.
4. **Discovery & trust** — the cryptographically signed Agent Card (Ed25519) lets any A2A client verify *"this is the real Bastion memory agent"* before delegating work.

### Status

A2A **v1.0** (stable, Linux Foundation, 150+ supporting organizations). No mainstream IDE consumes A2A natively today — **MCP is the supported client surface**; A2A is positioned for the emerging agent-to-agent layer as orchestrators and agent marketplaces mature.

---

## The 25 A2A Skills

The A2A server (`src/bastion/a2a_server.py`) registers 25 machine-executable agent skills, exposing memory operations as discoverable interfaces:

1. `memory_store` — Store fact with SHA-256 HMAC hash chain.
2. `memory_search` — C-SPANN vector similarity search.
3. `memory_timetravel` — Query memory state at a past timestamp.
4. `memory_audit` — Verify hash chain integrity.
5. `memory_heal` — Run auto-recovery/heal routine.
6. `memory_delete` — Mark memory as deleted.
7. `memory_pin` — Pin safety-critical memory.
8. `memory_get_pinned` — Retrieve pinned memories.
9. `memory_list` — List memories in namespace.
10. `memory_correct` — Correct/overwrite stored fact.
11. `memory_health` — Get health/entropy metrics.
12. `memory_apply_patch` — Mutate metadata via JSON Patch.
13. `resolve_conflict` — Trigger SERIALIZABLE merge transaction.
14. `ltm_check_reuse` — Search C-SPANN cache for reusable analysis.
15. `ltm_store_analysis` — Cache expensive analysis.
16. `ltm_invalidate` — Invalidate stale analysis.
17. `detect_contradictions` — Identify conflicting facts.
18. `scan_all_contradictions` — Run full memory scan for contradictions.
19. `dream` — Trigger sleep-time semantic consolidation.
20. `dream_history` — Retrieve past dreaming consolidation logs.
21. `detect_observations` — Extract themes/entity clusters.
22. `multi_signal_search` — 4-signal fusion query.
23. `context_pack` — Pack context under token budgets.
24. `agent_schema` — Query database schemas.
25. `a2a_bridge` — Introspect A2A routing and public key.

---

## API Routes (12)

The A2A server mounts 12 routes to handle protocol orchestration, discovery, and administration:

| Method & Route | Purpose |
|----------------|---------|
| `GET /.well-known/agent-card.json` | Serves the cryptographically signed Agent Card |
| `GET /.well-known/public-key.pem` | Serves the agent's public key (PEM format) |
| `POST /` | Primary JSON-RPC 2.0 endpoint |
| `POST /message:send` | Send message (REST interface) |
| `POST /message:sendStream` | Stream task execution via Server-Sent Events (SSE) |
| `GET /tasks/{task_id}` | Get task status, runtime metadata, and output |
| `PUT /tasks/{task_id}` | Update task state |
| `DELETE /tasks/{task_id}` | Purge task history (terminal tasks only) |
| `POST /tasks/{task_id}:cancel` | Cancel an active task |
| `GET /healthz` | HTTP Health check |
| `GET /readyz` | HTTP Database connectivity probe |
| `GET /metrics` | Prometheus metrics exporter |

---

## Security: Ed25519 Signing

Bastion uses **Ed25519 curves** (via `cryptography`) to sign and verify agent identities.

### 1. Verification Flow
1. Receives message with `X-Sender-URL` and `X-Sender-Signature`.
2. Fetches the sender's signed Agent Card from `X-Sender-URL`.
3. Verifies the card's signature against the card provider's public key.
4. Caches the sender's public key (24-hour TTL).
5. Verifies the message signature against the request body.

### 2. Signing Credentials
Configure the private key via Base64 string:
```bash
export BASTION_A2A_PRIVATE_KEY="MC4CAQAwBQYDK2VwBCIEIP..."
```
If unset, the server dynamically generates an ephemeral key pair on startup (logged to stdout).
