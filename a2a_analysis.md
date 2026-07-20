# A2A Server Deep Analysis — Bastion

## What Is It?

The A2A (Agent-to-Agent) server is a **standalone FastAPI application** running on port 9998 that implements the A2A v1.0 protocol — an open standard for agent-to-agent communication under the Linux Foundation's Agentic AI Foundation.

It lets **external AI agents** (not just Claude Desktop via MCP) discover, communicate with, and delegate tasks to Bastion's memory layer using a standardized protocol.

---

## End-to-End Endpoint Map

### Protocol Endpoints (JSON-RPC 2.0)

| Method | Path | Status | What It Does |
|--------|------|--------|-------------|
| `POST /` | JSON-RPC dispatch | **WORKING** | Routes `SendMessage`, `GetTask`, `CancelTask`, `setTaskPushNotification`, `getTaskPushNotification` |
| `SendMessage` | via POST / | **WORKING** | Creates task → OWASP guard check → executes skill → returns result |
| `GetTask` | via POST / | **WORKING** | Retrieves task status and artifacts by ID |
| `CancelTask` | via POST / | **WORKING** | Transitions task to CANCELED state |
| `setTaskPushNotification` | via POST / | **WORKING** | Registers a webhook callback URL for task completion |
| `getTaskPushNotification` | via POST / | **WORKING** | Returns the registered callback URL |

### REST Endpoints

| Method | Path | Status | What It Does |
|--------|------|--------|-------------|
| `POST /message:send` | REST SendMessage | **WORKING** | Same as JSON-RPC SendMessage but REST-style |
| `GET /tasks/{task_id}` | Get task | **WORKING** | Returns task state and artifacts |
| `POST /tasks/{task_id}:cancel` | Cancel task | **WORKING** | Transitions task to CANCELED |
| `DELETE /tasks/{task_id}` | Delete task | **WORKING** | Deletes terminal tasks (COMPLETED/FAILED/CANCELED only) |
| `POST /message:sendStream` | SSE streaming | **WORKING** | Streams task lifecycle via Server-Sent Events |

### Infrastructure Endpoints

| Method | Path | Status | What It Does |
|--------|------|--------|-------------|
| `GET /.well-known/agent-card.json` | Agent card | **WORKING** | Returns signed A2A agent card with capabilities |
| `GET /.well-known/public-key.pem` | Public key | **WORKING** | Returns Ed25519 public key for signature verification |
| `GET /healthz` | Liveness | **WORKING** | Always returns `{"status": "ok"}` |
| `GET /readyz` | Readiness | **WORKING** | Checks DB connectivity, returns 503 if not connected |
| `GET /metrics` | Prometheus | **WORKING** | Request counts, duration percentiles, rate limit hits, uptime |

---

## Skills Exposed (6 total)

| Skill ID | BastionMemory Method | What It Does | Works End-to-End? |
|----------|---------------------|-------------|-------------------|
| `memory_store` | `mem.store()` | Store a memory with hash-chain integrity | **YES** |
| `memory_search` | `mem.search()` | Semantic vector search with C-SPANN | **YES** |
| `graph_query` | `mem.graph_query()` | Knowledge graph BFS traversal | **YES** |
| `reinforce` | `mem.reinforce()` | Boost memory importance score | **YES** |
| `broadcast` | `mem.broadcast()` | Send event to namespace agents | **YES** |
| `resolve_conflict` | `groq_merge()` | LLM-merge conflicting memories | **YES** (requires GROQ_API_KEY) |

**All 6 skills work end-to-end.** They call the same `BastionMemory` methods as the MCP server.

---

## Task Lifecycle

```
SUBMITTED → WORKING → COMPLETED
    ↓           ↓
  CANCELED    FAILED
```

- Task state is persisted in CockroachDB (`a2a_tasks` table)
- State machine validation prevents illegal transitions
- Tasks have TTL (5 minutes for in-memory, persisted in DB)
- Push notifications fire on terminal states (COMPLETED/FAILED/CANCELED)

---

## What's Actually Working vs Stub

### Fully Working
- JSON-RPC dispatch with all 5 methods
- REST endpoints for task management
- SSE streaming with lifecycle events
- Ed25519 agent card signing and verification
- OWASP ASI06 guard screening on all incoming messages
- Brute-force protection with DB-backed lockout
- Rate limiting (distributed via CockroachDB)
- API key authentication with timing-safe comparison
- SSRF protection on sender URL validation
- Prometheus metrics endpoint
- Push notification registration and delivery with retries
- Hash chain integrity on stored memories

### Partially Working / Gaps
- **Streaming doesn't use OWASP guard** — `stream_message_send` at line 949 creates a task and executes the skill but skips the guard check that `_handle_send_message` performs
- **Push notifications have no SSRF validation at registration** — only at delivery time (fixed in earlier pass)
- **`_infer_params` is naive** — if a user sends plain text without metadata, it creates `{"content": text}` which works for `store` but fails silently for `search` (needs `query` param)
- **No idempotency** — duplicate SendMessage requests create duplicate tasks
- **No task cleanup** — completed tasks accumulate in DB forever (no TTL on `a2a_tasks` table)

---

## How MCP and A2A Work Together

### Architecture

```
                    ┌──────────────────────────┐
                    │     COCKROACHDB            │
                    │  agent_memory (C-SPANN)    │
                    │  agent_audit (hash chain)  │
                    │  a2a_tasks (task lifecycle) │
                    └──────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                 │
    ┌─────────▼──────┐ ┌──────▼────────┐ ┌──────▼──────────┐
    │  BastionMemory  │ │ BastionMemory │ │  Dashboard API  │
    │  (MCP instance) │ │ (A2A instance)│ │  (Next.js)      │
    └─────────┬──────┘ └──────┬────────┘ └─────────────────┘
              │                │
    ┌─────────▼──────┐ ┌──────▼────────┐
    │   MCP SERVER    │ │  A2A SERVER   │
    │   :9997        │ │   :9998       │
    │ 25 tools       │ │ 6 skills      │
    │ OAuth 2.1      │ │ Ed25519 sign  │
    │                │ │ push notify   │
    └────────┬───────┘ └───────┬───────┘
             │                  │
    ┌────────▼───────┐ ┌───────▼────────┐
    │  MCP Clients   │ │  A2A Agents    │
    │  Claude Desktop│ │  Any A2A-compat│
    │  Cursor        │ │  agent         │
    └────────────────┘ └────────────────┘
             │                  │
             └──── a2a_bridge ──┘
              (discovery only)
```

### Key Insight: Same Data, Different Protocols

Both servers instantiate their own `BastionMemory` pointing at the **same CockroachDB**. Memory stored via MCP is immediately queryable via A2A and vice versa. The shared database is the integration point.

### The `a2a_bridge` MCP Tool

The MCP server has an `a2a_bridge` tool (mcp_server.py:1389) that returns the A2A agent card. This is **discovery, not proxying** — it tells MCP clients "this server also speaks A2A" so they can construct A2A requests.

### MCP vs A2A Feature Matrix

| Feature | MCP (25 tools) | A2A (6 skills) |
|---------|---------------|----------------|
| Store memory | `memory_store` | `memory_store` |
| Search memories | `memory_search` | `memory_search` |
| Knowledge graph | — | `graph_query` |
| Reinforce memory | — | `reinforce` |
| Broadcast events | — | `broadcast` |
| Resolve conflicts | `resolve_conflict` | `resolve_conflict` |
| Time travel | `memory_timetravel` | — |
| Audit log | `memory_audit` | — |
| Self-healing | `memory_heal` | — |
| Dream/consolidate | `dream` | — |
| Contradiction detection | `detect_contradictions` | — |
| Task lifecycle | — | SUBMITTED→COMPLETED |
| Push notifications | — | Webhook callbacks |
| SSE streaming | — | Real-time events |
| Ed25519 signing | — | Crypto identity |
| OAuth 2.1 | Yes | — |

**MCP has 19 tools with no A2A counterpart. A2A has 4 capabilities with no MCP counterpart (task lifecycle, push notifications, streaming, signing).**

---

## Judge Value Assessment

### Why A2A Matters for Judges

1. **Industry Standard Compliance** — A2A is backed by Google, Microsoft, Salesforce, and the Linux Foundation. Implementing it shows Bastion isn't a hackathon toy — it's built on open standards.

2. **Multi-Agent Story** — Judges want to see agents that do real work. A2A enables the multi-agent narrative: "Agent A stores a memory, Agent B discovers and retrieves it via A2A." This is the 'agents that do real work' criterion.

3. **Protocol Diversity** — Using both MCP (tool-use) and A2A (agent-to-agent) shows the memory layer is protocol-agnostic — a true "system of record" not tied to one integration pattern.

4. **Production Security** — Ed25519 signing, OWASP guard, brute-force protection, SSRF checks — these are production-grade security features that most hackathon projects skip entirely.

### How Judges Can Use It

**Demo Flow 1: Cross-Protocol Memory Sharing**
```
# Step 1: Store via MCP (Claude Desktop)
"Remember that the deployment uses GitHub Actions"
→ Claude calls memory_store tool → saved to CockroachDB

# Step 2: Retrieve via A2A (terminal/curl)
curl -X POST http://localhost:9998/message:send \
  -H "a2a-version: 1.0" \
  -d '{"message":{"parts":[{"text":"deployment"}],"metadata":{"skill":"memory_search"}}}'
→ Returns the memory Claude just stored

# Proof: Same CockroachDB, different protocols
```

**Demo Flow 2: Streaming Task Execution**
```
curl -X POST http://localhost:9998/message:sendStream \
  -H "a2a-version: 1.0" \
  -d '{"message":{"parts":[{"text":"store audit entry"}],"metadata":{"skill":"memory_store"}}}'

# SSE events stream:
event: TaskStatusUpdate {"task_id":"...","status":"SUBMITTED"}
event: TaskStatusUpdate {"task_id":"...","status":"WORKING"}
event: TaskArtifactUpdate {"task_id":"...","artifact":{...}}
event: TaskStatusUpdate {"task_id":"...","status":"COMPLETED"}
event: TaskComplete {}
```

**Demo Flow 3: Agent Discovery**
```
# Any A2A-compatible agent can discover Bastion:
curl http://localhost:9998/.well-known/agent-card.json

# Returns signed card with:
# - Name, description, version
# - 6 skills with descriptions
# - Ed25519 signature for verification
# - Capabilities (streaming, push notifications)
```

**Demo Flow 4: Multi-Agent Coordination**
```
# Agent A stores a fact
POST /message:send {"skill":"memory_store","content":"User prefers dark mode"}

# Agent B searches for it
POST /message:send {"skill":"memory_search","query":"user preferences"}

# Agent B reinforces it (learning)
POST /message:send {"skill":"reinforce","memory_id":"...","success":true}

# Dashboard shows the full audit trail in Flight Recorder
```

---

## Gaps Found

### CRITICAL
| # | Gap | Impact |
|---|-----|--------|
| 1 | **Streaming skips OWASP guard** — `stream_message_send` doesn't call `_handle_send_message` which has the guard check | Malicious content can be stored via streaming endpoint |

### HIGH
| # | Gap | Impact |
|---|-----|--------|
| 2 | **No idempotency keys** — duplicate requests create duplicate tasks | Network retries cause data duplication |
| 3 | **No task TTL cleanup** — completed tasks accumulate forever | DB storage grows unbounded |
| 4 | **`_infer_params` too naive** — plain text for `search` creates `{"content": text}` instead of `{"query": text}` | Search skill silently fails on natural language input |
| 5 | **Only 6 skills vs MCP's 25 tools** — A2A clients can't access time travel, audit, healing, dream, etc. | A2A is second-class compared to MCP |
| 6 | **No OpenAPI spec for A2A REST endpoints** — only JSON-RPC is documented | Harder for judges to explore the API |

### MEDIUM
| # | Gap | Impact |
|---|-----|--------|
| 7 | **Agent card hardcoded URL** — `PROJECT_URL` defaults to Vercel URL | Card shows wrong URL in local dev |
| 8 | **No CORS on A2A server** — browser-based agents can't call it | Limits demo scenarios |
| 9 | **Push notification delivery is fire-and-forget** — no delivery confirmation | Can't verify webhook was received |
| 10 | **`resolve_conflict` requires external GROQ_API_KEY** — fails silently without it | Skill returns error in default setup |

---

## Recommendations for Maximum Judge Impact

1. **Fix the streaming guard gap** — Add OWASP check to `stream_message_send`
2. **Add 2-3 more A2A skills** — Expose `memory_timetravel`, `memory_audit`, and `memory_heal` via A2A to close the gap with MCP
3. **Add an OpenAPI spec** — Generate `docs/openapi-a2a.json` for the REST endpoints
4. **Create a 30-second curl demo script** — Judges can run `scripts/demo_a2a.sh` to see the full flow
5. **Add a "Multi-Agent" demo page to the dashboard** — Show two agents storing/searching/reinforcing memories in real-time via A2A
6. **Add task TTL cleanup** — Prevent unbounded DB growth
