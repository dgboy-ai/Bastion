# Bastion MCP Server — Model Context Protocol

> **35 tools, 3 resources, 3 prompts, and CockroachDB-backed persistent memory.**

---

## Overview

Bastion implements a **production-grade MCP (Model Context Protocol) server** that exposes CockroachDB as a persistent memory layer for AI agents. Any MCP-compatible client (Claude Code, Cursor, VS Code) can connect and execute memory operations.

The server registers **35 MCP tools organized into nine capability groups**, allowing agent clients to expose only the specific operations required for a given memory workflow.

**Key Features:**
- ✅ **35 tools** covering memory, encryption, governance, reasoning, and database playbooks.
- ✅ **3 resources** (`bastion://schema`, `bastion://config`, `bastion://stats`).
- ✅ **3 prompts** (`analyze_memory`, `conflict_analysis`, `audit_review`).
- ✅ **SHA-256 HMAC hash chain** cryptographic integrity.
- ✅ **C-SPANN vector indexing** for fast semantic search natively inside CockroachDB.
- ✅ **AS OF SYSTEM TIME** time-travel MVCC query support.
- ✅ **SERIALIZABLE isolation** for concurrent transaction correctness.
- ✅ **OAuth 2.1 + PKCE** or API Key transport security.
- ✅ **Rate limiting** (20 concurrent, 200 queue depth).

---

## Typical MCP Workflow

```
[Claude Code / Client] 
   │
   │ 1. memory_store("User prefers python")
   ▼
[Bastion MCP Server]
   │
   │ 2. Scan via OWASP ASI06 Guard
   ├─────────────────────────────── Error? ➔ Abort & Log
   │ 3. Fetch previous hash
   ▼
[CockroachDB Cluster]
   │
   │ 4. SERIALIZABLE Insert & lock
   │ 5. Compute HMAC(content + prev_hash)
   │ 6. Commit row (hash chain sealed)
   ▼
[Hash-Chain Verification]
   │
   │ 7. Audit hash chain integrity (memory_heal / forensic_report)
   │ 8. Generate S3 snapshot on break
```

---

## 35 Tools Reference

### 1. Core Memory Operations (9 Tools)
- `memory_store` — Store memory with SHA-256 HMAC hash chain.
- `memory_search` — Cosine similarity vector search via C-SPANN.
- `memory_store_encrypted` — Store memory encrypted with KMS-managed DEK.
- `memory_search_encrypted` — Decrypt and search encrypted memories.
- `memory_store_batch` — Bulk upload multiple memory records.
- `memory_timetravel` — Query memory state at any past timestamp (`AS OF SYSTEM TIME`).
- `memory_audit` — Verify the SHA-256 HMAC hash chain integrity.
- `memory_heal` — Repair hash chain links and prune expired records.
- `memory_delete` — Delete memory securely with confirmation.

### 2. Memory Pinning (2 Tools)
- `memory_pin` — Pin safety-critical memory to prevent eviction/compaction.
- `memory_get_pinned` — Retrieve all pinned memories.

### 3. Governance & Lifecycle (6 Tools)
- `memory_list` — List memories with namespace filtering and pagination.
- `memory_correct` — Overwrite memory content with audit trail logging.
- `memory_health` — Retrieve health metrics (freshness, duplicates, drift).
- `forensic_report` — Generate a detailed forensic analysis of memory state.
- `memory_apply_patch` — Mutate metadata using RFC 6902 JSON Patch.
- `compliance_report` — Generate regulator-ready EU AI Act Article 12 reports.

### 4. Conflict & Consensus (1 Tool)
- `resolve_conflict` — Resolve contradictory memory entries using SERIALIZABLE transactions.

### 5. Long-Term Memory (LTM) Gateway (3 Tools)
- `ltm_check_reuse` — Check if a similar analysis already exists to save tokens.
- `ltm_store_analysis` — Store expensive reasoning results.
- `ltm_invalidate` — Mark stale cached analyses as invalid.

### 6. Dreaming & Consolidation (2 Tools)
- `dream` — Trigger sleep-time memory consolidation (inspired by cognitive architectures: merges duplicates, promotes episodic memories to semantic memory, and prunes low-value logs during agent downtime).
- `dream_history` — Retrieve past dreaming consolidation logs.

### 7. Cognitive Analysis (3 Tools)
- `detect_contradictions` — Auto-detect negations and contradictory facts.
- `scan_all_contradictions` — Scan entire memory space for contradictions.
- `detect_observations` — Extract recurring themes, trends, and entity clusters.

### 8. Retrieval Optimization (2 Tools)
- `multi_signal_search` — 4-signal fusion: Vector + Keyword + Entity + Recency.
- `context_pack` — Pack memories into token-budgeted LLM context windows.

### 9. Schema & Infrastructure (7 Tools)
- `agent_schema` — Self-introspect database table definitions.
- `a2a_bridge` — Generate Ed25519-signed Agent Cards for A2A routing.
- `managed_mcp_list_tools` — Discover tools on the CockroachDB Managed MCP Server.
- `managed_mcp_call` — Invoke tools on the Managed MCP Server.
- `invoke_agent_skill` — Execute CockroachDB Agent Skills playbook scripts.
- `list_agent_skills` — List installed playbooks in `.agents/skills/`.
- `ccloud_exec` — Execute cluster administrative operations via `ccloud` CLI.

---

## Resources & Prompts

### 3 Resources
- `bastion://schema` — Exposes the schema definitions (tables, constraints, indexes).
- `bastion://config` — Exposes server environmental settings (compliance mode, fallback settings).
- `bastion://stats` — Exposes active telemetry and execution profiles.

### 3 Prompts
*Prompt templates provide standardized reasoning workflows across MCP clients without hardcoding prompt logic inside applications.*
- `analyze_memory` — Prompt template instructing the client to evaluate memory patterns.
- `conflict_analysis` — Prompt template to merge contradictory claims.
- `audit_review` — Prompt template to audit the memory audit log for tampering.

---

## Security Model

Bastion's MCP server enforces strict security boundaries on the persistent memory footprint:
- **Authentication**: Streamable HTTP transport secured by API Keys or **OAuth 2.1 + PKCE** validation flows.
- **Envelope Encryption**: Memory contents encrypted on-disk using AES-256-GCM keys managed by **AWS KMS**.
- **Isolation**: Tenant separation via **Row-Level Security (RLS)** in CockroachDB.
- **Input Filtering**: OWASP ASI06 prompt injection guard and PII/Secret firewalls scan all inputs.
- **Cryptographic Provenance**: HMAC-SHA256 hash chains verify database content has not been tampered with.

---

## Client Integration Configs

### Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://user:pass@host:26257/defaultdb?sslmode=verify-full"
      }
    }
  }
}
```

### Cursor
Add a new MCP server in **Settings ➔ Models ➔ MCP**:
- **Name**: `bastion`
- **Type**: `stdio`
- **Command**: `python -m bastion.mcp_server`
- **Env**: `BASTION_CONN="..."`
