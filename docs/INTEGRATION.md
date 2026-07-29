# Bastion Integration Guide

Wrap any agent framework with Bastion's CockroachDB-native memory in under 60 seconds.

---

## Quick Start

### Python SDK
```python
from bastion import BastionMemory

# Initialize memory connection
mem = BastionMemory(agent_id="my-agent", connection_string="postgresql://...")

# Store memory (automatically runs OWASP checks, computes hash chains and metadata)
record = mem.store("fact", "User prefers Python", {"source": "chat"})

# Search with 4-signal fusion (Vector, BM25, Entity, Recency)
results = mem.search("Python preferences", k=5)

# Time-travel query using CockroachDB MVCC
past = mem.get_at_time("2026-07-29T12:00:00Z")

# Verify hash chain integrity
audit = mem.forensic_report()
```

### TypeScript SDK
```typescript
import { BastionMemory } from "bastion-memory";

const mem = new BastionMemory("my-agent", { connectionString: "postgresql://..." });

// Store and search with 1:1 API parity
const record = await mem.store("fact", "User prefers Python.");
const results = await mem.search("Python preferences", { k: 5 });
```

---

## Framework Adapters

### LangChain
```python
from langchain.memory import ConversationBufferMemory
from bastion import BastionMemory

class BastionChatMessageHistory(ConversationBufferMemory):
    def __init__(self, agent_id: str, connection_string: str):
        self.bastion = BastionMemory(agent_id, connection_string)

    def save_context(self, inputs, outputs):
        self.bastion.store("chat", outputs["response"], {
            "input": inputs["input"],
            "agent": self.bastion.agent_id,
        })
```

### CrewAI
```python
from crewai.memory import BaseMemory
from bastion import BastionMemory

class BastionShortTermMemory(BaseMemory):
    def __init__(self, agent_id: str, connection_string: str):
        self.bastion = BastionMemory(agent_id, connection_string)

    def add(self, content: str, metadata: dict):
        self.bastion.store("crewai_memory", content, metadata)

    def search(self, query: str, k: int = 5):
        return self.bastion.search(query, k=k)
```

### LlamaIndex
```python
from llama_index.core.vector_stores import VectorStore
from bastion import BastionMemory

class BastionVectorStore(VectorStore):
    stores_text = True

    def __init__(self, agent_id: str, connection_string: str):
        self.bastion = BastionMemory(agent_id, connection_string)

    def add(self, nodes):
        for node in nodes:
            self.bastion.store("llama_index", node.text, node.metadata)

    def query(self, query, **kwargs):
        results = self.bastion.search(query, k=kwargs.get("similarity_top_k", 2))
        return [NodeWithScore(node=TextNode(text=r.content), score=1.0) for r in results]
```

---

## MCP Server (35 Tools)

```python
from bastion.mcp_server import create_server

# Creates a FastMCP server with 35 tools, 3 resources, 3 prompts
mcp = create_server()
```

### Available Tools (35)
- **Core Memory**: `memory_store`, `memory_search`, `memory_store_encrypted`, `memory_search_encrypted`, `memory_store_batch`, `memory_timetravel`, `memory_audit`, `memory_heal`, `memory_delete`
- **Pinning**: `memory_pin`, `memory_get_pinned`
- **Governance & Lifecycle**: `memory_list`, `memory_correct`, `memory_health`, `forensic_report`, `memory_apply_patch`, `compliance_report`
- **Consensus**: `resolve_conflict`
- **LTM Gateway**: `ltm_check_reuse`, `ltm_store_analysis`, `ltm_invalidate`
- **Dreaming**: `dream`, `dream_history`
- **Cognitive**: `detect_contradictions`, `scan_all_contradictions`, `detect_observations`
- **Retrieval**: `multi_signal_search`, `context_pack`
- **Infrastructure**: `agent_schema`, `a2a_bridge`, `managed_mcp_list_tools`, `managed_mcp_call`, `invoke_agent_skill`, `list_agent_skills`, `ccloud_exec`

---

## A2A Server (Agent-to-Agent - 25 Skills)

```python
from bastion.a2a_server import create_a2a_server

# Creates an A2A v1.0 server with Ed25519 signing
server = create_a2a_server(agent_id="my-agent")
```

### A2A Features
- **Signed Agent Cards** — Ed25519 cryptographic identity
- **JSON-RPC 2.0 / REST Dual Mode** — SendMessage, GetTask, CancelTask
- **Push notifications** — CDC-triggered webhook dispatch
- **Rate limiting** — 600 req/min/IP
- **Prometheus metrics** — Exposed via `/metrics`
