# MCP + A2A Server Info

## Local Servers

### MCP Server
- **Port**: 8005
- **URL**: `http://localhost:8005/mcp`
- **Transport**: Streamable HTTP
- **Session**: Initialize returns `Mcp-Session-Id` header, pass in subsequent requests
- **Auth**: `Authorization: Bearer <BASTION_API_KEY>`
- **Tools**: 35 total
- **Agent ID**: `mcp-agent`

### A2A Server
- **Port**: 9998
- **URL**: `http://localhost:9998/`
- **Agent Card**: `http://localhost:9998/.well-known/agent-card.json`
- **Public Key**: `http://localhost:9998/.well-known/public-key.pem`
- **Skills**: 25 (listed in agent card)
- **Auth**: `Authorization: Bearer <BASTION_API_KEY>` + `a2a-version: 1.0`
- **JSON-RPC endpoint**: POST `/` with `method: "SendMessage"`
- **REST endpoint**: POST `/message:send`
- **Streaming**: POST `/message:sendStream` (SSE)

---

## MCP Tools (35)

| Tool | Description |
|------|-------------|
| `memory_store` | Store a memory with SHA-256 hash chain, C-SPANN vector index |
| `memory_store_batch` | Store multiple memories atomically (SERIALIZABLE) |
| `memory_store_encrypted` | Store encrypted via AWS KMS AES-256-GCM |
| `memory_search` | Vector similarity search |
| `memory_search_encrypted` | Search encrypted memories (transparent decrypt) |
| `multi_signal_search` | 4-signal fusion: vector + BM25 + entity + temporal |
| `memory_timetravel` | Query at past timestamp (AS OF SYSTEM TIME) |
| `memory_list` | List memories with pagination |
| `memory_health` | Health metrics (count, freshness, vector index) |
| `memory_pin` | Pin critical memories (priority 0-2) |
| `memory_get_pinned` | Retrieve pinned memories |
| `memory_correct` | Governance: correct memory content |
| `memory_apply_patch` | RFC 6902 JSON patch on metadata |
| `memory_audit` | Append-only hash-chained audit log |
| `memory_delete` | SERIALIZABLE delete with confirmation |
| `memory_heal` | CDC-triggered self-heal, reseal hash chain |
| `detect_contradictions` | Scan for contradictions against a memory |
| `scan_all_contradictions` | Full batch contradiction scan |
| `resolve_conflict` | Merge conflicting facts via LLM |
| `detect_observations` | Meta-pattern detection (themes, entities, clusters) |
| `dream` | Sleep-time consolidation (review, extract, promote, prune) |
| `dream_history` | Past consolidation sessions from audit trail |
| `forensic_report` | Full integrity: hash chain, guard stats, type distribution |
| `compliance_report` | EU AI Act Art.12 compliance |
| `context_pack` | Token-budgeted LLM context injection |
| `agent_schema` | Database introspection (28 tables) |
| `a2a_bridge` | Cross-protocol agent card + A2A forward |
| `list_agent_skills` | Available CRDB playbooks (34 skills) |
| `invoke_agent_skill` | Dry-run or execute a CRDB playbook skill |
| `ltm_store_analysis` | Cache analysis in long-term memory |
| `ltm_check_reuse` | Vector similarity check for cached analyses |
| `ltm_invalidate` | Mark cached analysis as stale |
| `managed_mcp_call` | Cloud Console MCP tool call |
| `managed_mcp_list_tools` | List cloud tools |
| `ccloud_exec` | Execute ccloud command |

---

## A2A Skills (25)

| ID | Description |
|----|-------------|
| `memory_store` | Store with hash chain + C-SPANN |
| `memory_search` | Semantic vector search |
| `memory_timetravel` | AS OF SYSTEM TIME queries |
| `memory_audit` | Hash-chain audit log |
| `memory_heal` | CDC-triggered self-heal |
| `memory_delete` | SERIALIZABLE delete |
| `memory_pin` | Pin safety-critical memories |
| `memory_get_pinned` | Get pinned memories |
| `memory_list` | List with pagination |
| `memory_correct` | Governance correction |
| `memory_health` | Health metrics |
| `memory_apply_patch` | JSON patch metadata |
| `resolve_conflict` | Merge conflicting facts |
| `ltm_check_reuse` | LTM cache reuse check |
| `ltm_store_analysis` | LTM cache store |
| `ltm_invalidate` | LTM cache invalidate |
| `detect_contradictions` | Contradiction scan |
| `scan_all_contradictions` | Batch contradiction scan |
| `dream` | Consolidation cycle |
| `dream_history` | Past consolidations |
| `detect_observations` | Meta-pattern detection |
| `multi_signal_search` | 4-signal fusion |
| `context_pack` | Token-budgeted context |
| `agent_schema` | DB schema introspection |
| `a2a_bridge` | Agent card + cross-protocol bridge |

---

## A2A Message Format

### JSON-RPC SendMessage
```json
POST /
Headers: Content-Type: application/json
         Authorization: Bearer <key>
         a2a-version: 1.0

{
  "jsonrpc": "2.0",
  "id": "req-123",
  "method": "SendMessage",
  "params": {
    "id": "task-abc",
    "sessionId": "sess-def",
    "message": {
      "role": "agent",
      "metadata": {
        "skill": "memory_store",
        "params": {"content": "...", "memory_type": "fact"}
      },
      "parts": [{"type": "text", "text": "store memory"}]
    }
  }
}
```

### REST /message:send
```json
POST /message:send
Headers: Content-Type: application/json
         Authorization: Bearer <key>
         a2a-version: 1.0

{
  "id": "task-abc",
  "sessionId": "sess-def",
  "message": {
    "role": "agent",
    "metadata": {
      "skill": "memory_store",
      "params": {"content": "...", "memory_type": "fact"}
    },
    "parts": [{"type": "text", "text": "store memory"}]
  }
}
```

---

## Remote (Render) Servers

### MCP HTTP
- **URL**: `https://bastion-a2a.onrender.com/mcp`
- **Status**: 502 on POST (workaround: run locally)

### A2A Server
- **URL**: `https://bastion-a2a.onrender.com`
- **Health**: Running (agent card at `/.well-known/agent-card.json`)
- **Readyz**: `{"status":"not ready","detail":"database not connected"}` — missing `BASTION_CONN` env var
- **Agent Card**: 25 skills, Ed25519 signed, A2A v1.0, streaming
- **OpenAPI**: `https://bastion-a2a.onrender.com/openapi.json`

---

## MCP Communication Protocol

### Steps
1. POST `/mcp` with `method: "initialize"` → get `Mcp-Session-Id` from response header
2. POST `/mcp` with `Mcp-Session-Id` header + `method: "tools/call"` with `name` + `arguments`

### Headers
- `Content-Type: application/json`
- `Accept: application/json`
- `Authorization: Bearer <BASTION_API_KEY>`
- `Mcp-Session-Id: <session_id>` (from initialize response)

---

## E2E Test Results

### Comprehensive E2E (22 categories, 35 tools)
- **47 PASS, 0 FAIL**
- All features: basic ops, batch, search (3 modes), KMS encrypt, time travel, pinning, governance, contradictions, pattern detection, dream/consolidation, heal, forensic, compliance, context pack, schema, A2A bridge, agent skills, LTM gateway, delete, OWASP guard, cloud tools, integrity cycle

### Deep Cross-Protocol (A2A + MCP)
- **17 PASS, 0 FAIL**
- A2A JSON-RPC SendMessage + REST /message:send + SSE streaming
- Multi-agent conflict resolution
- OWASP memory poison via A2A
- A2A → MCP cross-verify
- Ed25519 key rotation
- Full forensic integrity

---

## DB Schema

### a2a_tasks
```sql
CREATE TABLE a2a_tasks (
    task_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL DEFAULT 'bastion-a2a',
    skill_id TEXT NOT NULL DEFAULT 'unknown',
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    artifacts JSONB DEFAULT '[]'::jsonb,
    callback_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    runtime_metadata JSONB,
    parent_task_id UUID,
    priority INTEGER DEFAULT 0,
    last_heartbeat TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT
);
```

### memories
- 28 tables total (auto-inspected via `agent_schema` tool)

---

---

## Groq AI Agent + Bastion Memory E2E

A real AI agent using Groq's Qwen 3.6-27B LLM with Bastion as persistent memory.

### Components
- **LLM**: `qwen/qwen3.6-27b` via Groq (`groq` SDK 0.37.1)
- **Memory**: Bastion MCP at `http://localhost:8005/mcp`
- **Script**: `demo/groq_agent.py`

### E2E Test Results

| Phase | Test | Status |
|-------|------|--------|
| 1 | Agent stores 4 memories (facts, instruction, procedural) | PASS |
| 2 | Semantic search via C-SPANN vector index | PASS (3 queries, relevant results) |
| 3 | Real AI conversation with Groq Qwen 3.6-27B | PASS (LLM replied about Bastion demo strategy) |
| 4 | LLM-initiated memory write (agent stores insight when asked) | PASS |
| 5 | AWS KMS AES-256-GCM encrypted memory | PASS |
| 6 | Forensic integrity report (hash chain INTACT) | PASS |

### Key Finding
The Groq agent successfully:
1. Stored memories via Bastion MCP tools with SHA-256 hash chain
2. Retrieved semantically relevant memories via C-SPANN vector index
3. Had a real conversation with Qwen 3.6-27B, then autonomously decided to store conversation insights
4. Stored encrypted secrets via AWS KMS (encrypted at rest, plaintext embedding for search)
5. Ran forensic integrity check confirming hash chain INTACT (16 memories, 47 audit entries, 8 guard checks)

---

## Quick Commands

```powershell
# Start MCP server
$env:BASTION_CONN="<conn>"; $env:BASTION_API_KEY="<key>"; python -m bastion.mcp_server --transport http --port 8005

# Start A2A server
$env:BASTION_CONN="<conn>"; $env:BASTION_API_KEY="<key>"; $env:BASTION_HMAC_SECRET="<secret>"; $env:PYTHONIOENCODING="utf-8"; python -m bastion.a2a_server --port 9998

# Test A2A health
curl http://localhost:9998/.well-known/agent-card.json
curl http://localhost:9998/.well-known/public-key.pem
```
