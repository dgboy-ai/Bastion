# Bastion A2A Server — Agent-to-Agent Protocol

> Full A2A v1.0 implementation with Ed25519 cryptographic identity, task lifecycle management, and production-grade security.

---

## Overview

Bastion implements a complete **A2A (Agent-to-Agent) v1.0 protocol server** that enables agents to discover, communicate, and coordinate with each other cryptographically.

**Key Features:**
- ✅ A2A v1.0 Signed Agent Cards (Ed25519)
- ✅ JSON-RPC 2.0 task lifecycle
- ✅ Prometheus metrics
- ✅ Rate limiting (600 req/min)
- ✅ API key authentication
- ✅ OpenTelemetry trace propagation
- ✅ Push notification registration
- ✅ CORS support

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENT A                                  │
│              (Sender Agent)                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ 1. Fetch Agent Card
                       │    GET /.well-known/agent-card.json
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENT B                                  │
│              (Bastion A2A Server)                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. Verify Ed25519 Signature                        │   │
│  │  2. Check Rate Limit (600 req/min)                  │   │
│  │  3. Validate A2A Version                            │   │
│  │  4. Execute Task                                    │   │
│  │  5. Return Result                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Skills:                                            │   │
│  │  - memory_store    (SHA-256 hash chain)             │   │
│  │  - memory_search   (C-SPANN vector search)          │   │
│  │  - graph_query     (Knowledge graph traversal)      │   │
│  │  - reinforce       (Boost memory importance)        │   │
│  │  - broadcast       (Namespace message passing)      │   │
│  │  - resolve_conflict (CRDT merge strategies)         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Storage: CockroachDB                                │   │
│  │  - a2a_tasks (Task persistence)                      │   │
│  │  - agent_memory (C-SPANN vectors)                    │   │
│  │  - agent_audit (Hash chain)                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/agent-card.json` | GET | Signed Agent Card |
| `/.well-known/public-key.pem` | GET | Public key (PEM) |
| `/message:send` | POST | Send message (REST) |
| `/tasks/{task_id}` | GET | Get task status |
| `/tasks/{task_id}:cancel` | POST | Cancel task |
| `/healthz` | GET | Health check |
| `/readyz` | GET | Readiness check |
| `/metrics` | GET | Prometheus metrics |

---

## Agent Card

```json
{
  "name": "Bastion Memory Agent",
  "description": "A2A-compliant memory agent with hash-chain integrity, C-SPANN vector indexing, knowledge graph, and time travel.",
  "version": "1.0.0",
  "a2a_version": "1.0",
  "url": "https://bastion-self.vercel.app",
  "documentationUrl": "https://github.com/dgboy-ai/Bastion",
  "capabilities": {
    "streaming": false,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "skills": [
    {"id": "memory_store", "name": "Store Agent Memory"},
    {"id": "memory_search", "name": "Search Agent Memories"},
    {"id": "graph_query", "name": "Knowledge Graph Query"},
    {"id": "reinforce", "name": "Reinforce Memory"},
    {"id": "broadcast", "name": "Broadcast to Namespace"}
  ],
  "defaultInputModes": ["text"],
  "defaultOutputModes": ["text"],
  "provider": {
    "organization": "Bastion",
    "url": "https://github.com/dgboy-ai/Bastion"
  },
  "signature": {
    "algorithm": "Ed25519",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----..."
  }
}
```

---

## Security Features

### 1. Ed25519 Signature Verification

Every incoming `SendMessage` request can include:
- `X-Sender-URL`: Sender's agent card URL
- `X-Sender-Signature`: Base64-encoded Ed25519 signature

**Verification Flow:**
1. Fetch sender's agent card from `X-Sender-URL`
2. Verify agent card signature
3. Extract public key
4. Verify request signature against body
5. Cache public key for 24 hours

### 2. Rate Limiting

- **Window:** 60 seconds
- **Limit:** 600 requests per IP
- **Response:** 429 Too Many Requests
- **Cleanup:** Automatic eviction of stale buckets

### 3. Authentication

```bash
# Set API key
export BASTION_API_KEY="your-secret-key"

# All requests must include:
Authorization: Bearer your-secret-key
```

### 4. Request Validation

- **Max request size:** 1MB
- **Request timeout:** 60 seconds
- **A2A version:** Must be "1.0"

---

## Task Lifecycle

```
SUBMITTED → WORKING → COMPLETED
    │          │
    │          └──→ FAILED
    │
    └──→ CANCELED
```

### Task States

| State | Description |
|-------|-------------|
| `SUBMITTED` | Task received, waiting to start |
| `WORKING` | Task in progress |
| `INPUT_REQUIRED` | Task needs additional input |
| `COMPLETED` | Task finished successfully |
| `FAILED` | Task failed |
| `CANCELED` | Task was canceled |

### Task Management

- **Task TTL:** 300 seconds (5 minutes)
- **Max tasks:** 10,000
- **Orphan TTL:** 1800 seconds (30 minutes)
- **Storage:** CockroachDB (persistent) or in-memory (mock)

---

## Skills Available

### 1. memory_store
Store a memory with SHA-256 hash chain integrity.

```json
{
  "skill": "memory_store",
  "input": {
    "memory_type": "fact",
    "content": "User prefers dark mode",
    "metadata": {"domain": "UI"}
  }
}
```

### 2. memory_search
Semantic vector search with C-SPANN indexing.

```json
{
  "skill": "memory_search",
  "input": {
    "query": "user preferences",
    "k": 5,
    "threshold": 0.8
  }
}
```

### 3. graph_query
Knowledge graph traversal with multi-hop BFS.

```json
{
  "skill": "graph_query",
  "input": {
    "start_entity": "Bastion",
    "hops": 2
  }
}
```

### 4. reinforce
Boost memory importance score.

```json
{
  "skill": "reinforce",
  "input": {
    "memory_id": "mem-123"
  }
}
```

### 5. broadcast
Send message to all agents in namespace.

```json
{
  "skill": "broadcast",
  "input": {
    "namespace": "project-alice",
    "message": "task_complete"
  }
}
```

### 6. resolve_conflict
Resolve conflicting memories with CRDT merge.

```json
{
  "skill": "resolve_conflict",
  "input": {
    "memory_id_a": "mem-123",
    "memory_id_b": "mem-456",
    "strategy": "semantic"
  }
}
```

---

## Usage

### Start A2A Server

```bash
# Mock mode (no database)
python -m bastion.a2a_server

# With CockroachDB
export BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
python -m bastion.a2a_server

# With persistent identity
export BASTION_A2A_PRIVATE_KEY="base64-encoded-ed25519-private-key"
python -m bastion.a2a_server
```

### Send Message (REST)

```bash
curl -X POST http://localhost:9998/message:send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "skill": "memory_store",
    "input": {
      "memory_type": "fact",
      "content": "User prefers dark mode"
    }
  }'
```

### Get Task Status

```bash
curl http://localhost:9998/tasks/task-123 \
  -H "Authorization: Bearer your-api-key"
```

### Cancel Task

```bash
curl -X POST http://localhost:9998/tasks/task-123:cancel \
  -H "Authorization: Bearer your-api-key"
```

---

## Push Notifications

Register for push notifications when a task completes:

```bash
curl -X POST http://localhost:9998/message:send \
  -H "Content-Type: application/json" \
  -d '{
    "skill": "memory_store",
    "input": {...},
    "callbackUrl": "https://your-webhook.com/notify"
  }'
```

When the task completes, Bastion sends a POST request to your callback URL.

---

## Metrics

Prometheus metrics available at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `a2a_requests_total` | Counter | Total requests by method, path, status |
| `a2a_request_duration_seconds` | Histogram | Request duration |
| `a2a_rate_limit_hits` | Counter | Rate limit violations |
| `a2a_tasks_total` | Counter | Tasks by status |

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASTION_CONN` | — | CockroachDB connection string |
| `BASTION_MOCK` | `true` | Enable mock mode |
| `BASTION_API_KEY` | — | API key for authentication |
| `BASTION_A2A_PRIVATE_KEY` | — | Ed25519 private key (base64) |
| `BASTION_A2A_STRICT` | `false` | Require signature verification |
| `CORS_ALLOW_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |

---

## Why A2A Matters for Memory

### Single Agent vs Multiple Agents

**Single Agent:**
```
Agent → Memory → CockroachDB → Survives
```
Memory survives. Good.

**Multiple Agents:**
```
Agent A → Write Memory → Conflict?
Agent B → Write Memory → Conflict?
Agent C → Read Memory → Which version?
```
Memory needs:
- **Conflict resolution** — Who wins when agents disagree?
- **Shared state** — How do agents see the same memory?
- **Persistent tasks** — What happens when an agent crashes mid-task?
- **Audit trail** — Who changed what, when, why?
- **Recovery** — How do we restore to a consistent state?

**That's why A2A + Persistent Memory is essential.**

### The Bastion Advantage

| Scenario | Without Bastion | With Bastion |
|----------|-----------------|--------------|
| Agent A writes, Agent B writes | Conflict, data loss | SERIALIZABLE isolation + CRDT merge |
| Agent crashes mid-task | Task lost | Persistent tasks in CockroachDB |
| Agent poisoned | Corrupted memory | Hash chain integrity |
| Audit required | No trail | Immutable audit log |
| Recovery needed | Manual restore | Time-travel queries |

**Bastion doesn't just store memory. It coordinates agents around shared, trustworthy memory.**

---

## How Bastion Solves OpenClaw Problems

| OpenClaw Problem | Bastion A2A Solution |
|------------------|---------------------|
| **Cascading Failures** | SERIALIZABLE isolation prevents cascade |
| **No Audit Trail** | Every A2A task logged with hash chain |
| **Agent Conflicts** | CRDT conflict resolution |
| **No Trust Verification** | Ed25519 signature verification |
| **Silent Failures** | Push notifications + metrics |

---

## Comparison with Other A2A Implementations

| Feature | Bastion | Google ADK | Others |
|---------|---------|------------|--------|
| A2A Version | 1.0 | 1.0 | Varies |
| Ed25519 Signing | ✅ | ✅ | ❌ |
| Task Persistence | ✅ CockroachDB | In-memory | ❌ |
| Rate Limiting | ✅ 600/min | ❌ | ❌ |
| Push Notifications | ✅ | ✅ | ❌ |
| Metrics | ✅ Prometheus | ❌ | ❌ |
| Mock Mode | ✅ | ❌ | ❌ |

---

*This document satisfies the hackathon requirement for A2A Protocol support.*
