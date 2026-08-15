# CockroachDB Tools Integration Guide

> **Required for hackathon submission:** *"Identify which CockroachDB tools you used and how — what did the agent actually do with them?"*

---

## 1. Managed MCP Server
Bastion bridges the official **CockroachDB Managed MCP Server** to expose live database operations to AI agents, with full audit trail logging.

### How We Use It
Our MCP server (`src/bastion/mcp_server.py`) implements **35 tools** to manage agent memories, orchestrate transactions, and interact with the database:

| Category | Tools | CockroachDB Feature Utilized |
|----------|-------|------------------------------|
| **Core Memory** | `memory_store`, `memory_search`, `memory_store_encrypted`, `memory_search_encrypted`, `memory_store_batch`, `memory_timetravel`, `memory_audit`, `memory_heal`, `memory_delete` | HMAC-SHA256 hash chain + re-verification, C-SPANN, MVCC `AS OF SYSTEM TIME` |
| **Pinning** | `memory_pin`, `memory_get_pinned` | Partial indexing on `is_pinned` |
| **Governance** | `memory_list`, `memory_correct`, `memory_health`, `forensic_report`, `memory_apply_patch`, `compliance_report` | SQL pagination, updates, EU AI Act compliance checks |
| **Consensus** | `resolve_conflict` | `SERIALIZABLE` isolation transactions |
| **LTM Gateway** | `ltm_check_reuse`, `ltm_store_analysis`, `ltm_invalidate` | Cached analysis retrieval |
| **Dreaming** | `dream`, `dream_history` | Episodic-to-semantic consolidation |
| **Cognitive** | `detect_contradictions`, `scan_all_contradictions`, `detect_observations` | Semantic contradiction and trend checks |
| **Retrieval** | `multi_signal_search`, `context_pack` | 4-signal fusion, context optimization |
| **Infrastructure** | `agent_schema`, `a2a_bridge`, `managed_mcp_list_tools`, `managed_mcp_call`, `invoke_agent_skill`, `list_agent_skills`, `ccloud_exec` | Introspection, A2A card generation, CLI wrappers |

---

## 2. Distributed Vector Indexing (C-SPANN)
We store high-dimensional embeddings natively inside CockroachDB using the `VECTOR` data type, combined with `C-SPANN` indexes.

### Table DDL
```sql
CREATE TABLE public.agent_memory (
    memory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id STRING NOT NULL,
    memory_type STRING NOT NULL,
    content STRING NOT NULL,
    embedding VECTOR(1024) NOT NULL,  -- HuggingFace BGE / local MiniLM (1024-dim)
    metadata JSONB NULL,
    previous_hash STRING NULL,
    cryptographic_hash STRING NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NULL,
    importance_score FLOAT8 DEFAULT 5.0,
    trust_level INT8 DEFAULT 2,
    is_pinned BOOL DEFAULT false,
    pin_priority INT8 DEFAULT 0
);

-- C-SPANN distributed vector index (live on the cluster, v26.2)
CREATE VECTOR INDEX idx_memory_embedding ON agent_memory (agent_id, embedding);
```

### Hybrid Query Pattern
We combine vector search with relational filters (tenant ID, expiry, importance) in a single SQL statement, accelerated by the C-SPANN index:
```sql
SELECT memory_id, content, importance_score,
       embedding <-> $1::vector(1024) AS distance
FROM agent_memory
WHERE agent_id = $2
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY distance ASC
LIMIT $3;
```

---

## 3. ccloud CLI (Agent-Ready)
Bastion provides administrative actions via a secure wrapper around CockroachDB's `ccloud` CLI tool.

### Integrated Wrapper (`src/bastion/dba.py`)
AI agents can call the `ccloud_exec` tool to manage the database cluster directly from the chat:
```python
def _run_ccloud(self, cmd: list[str]) -> str:
    # Runs the binary with -o json parameter formatting
    # Autoinjects BASTION_CCLOUD_API_KEY and service account RBAC
```
Supported functions:
- `ccloud cluster list`
- `ccloud cluster status`
- `ccloud audit log list`

---

## 4. CockroachDB Agent Skills Repo
We have integrated all **34 machine-executable skills** from the official `cockroachdb-skills` repository.

### Execution Model
The MCP server tool `invoke_agent_skill(skill_name, execute=True)` will:
1. Locate the playbook directory inside `.agents/skills/{skill_name}/`.
2. Parse the markdown instructions and extract the database tuning SQL.
3. Execute the SQL against the active database cluster.

Installed skills include:
- `reviewing-cluster-health`
- `triaging-live-sql-activity`
- `auditing-cloud-cluster-security`
- `configuring-audit-logging`
- `hardening-user-privileges`
- `profiling-statement-fingerprints`
- `profiling-transaction-fingerprints`
- `designing-application-transactions`
- `upgrading-cluster-version`
