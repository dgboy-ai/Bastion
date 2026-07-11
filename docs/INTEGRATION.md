# Bastion Integration Guide

Wrap any agent framework with Bastion's CockroachDB-native memory in under 60 seconds.

---

## Quick Start

### Python SDK
```python
from bastion import BastionMemory

# Mock mode (no database required)
mem = BastionMemory(agent_id="my-agent", mock=True)

# Store memory
record = mem.store("fact", "User prefers Python", {"source": "chat"})

# Search with 4-signal fusion
results = mem.search("Python preferences", k=5)

# Time-travel query
past = mem.timetravel("5 minutes ago")

# Verify hash chain integrity
audit = mem.audit()
```

### TypeScript SDK
```typescript
import { BastionMemory } from "bastion-memory";

const mem = new BastionMemory("my-agent", { mock: true });

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

## MCP Server (25 Tools)

```python
from bastion.mcp_server import create_server

# Creates a FastMCP server with 25 tools, 4 resources, 3 prompts
mcp = create_server(mock=True)

# Run via stdio (for Claude Desktop, Cursor, etc.):
#   python -m bastion.mcp_server --transport stdio

# Run via HTTP (for remote agents):
#   python -m bastion.mcp_server --transport http --port 9997
```

### Available Tools (25)

| Category | Tools |
|----------|-------|
| **Core** | `memory_store`, `memory_search`, `memory_timetravel`, `memory_audit`, `memory_heal`, `memory_delete`, `resolve_conflict` |
| **Pinning** | `memory_pin`, `memory_get_pinned` |
| **Governance** | `memory_list`, `memory_correct`, `memory_health`, `memory_apply_patch` |
| **LTM Gateway** | `ltm_check_reuse`, `ltm_store_analysis`, `ltm_invalidate` |
| **Dreaming** | `dream`, `dream_history` |
| **Contradictions** | `detect_contradictions`, `scan_all_contradictions` |
| **Observations** | `detect_observations` |
| **Retrieval** | `multi_signal_search`, `context_pack` |
| **Schema** | `agent_schema` |
| **A2A** | `a2a_bridge` |

### Available Resources (4)

| Resource | Purpose |
|----------|---------|
| `bastion://schema` | Database schema definition |
| `bastion://config` | Current configuration |
| `bastion://stats` | Usage statistics |
| `bastion://memory/{id}` | Individual memory record |

### Available Prompts (3)

| Prompt | Purpose |
|--------|---------|
| `analyze_memory` | Analyze a memory record |
| `conflict_analysis` | Analyze conflicting memories |
| `audit_review` | Review audit trail |

---

## A2A Server (Agent-to-Agent)

```python
from bastion.a2a_server import create_a2a_server

# Creates an A2A v1.0 server with Ed25519 signing
server = create_a2a_server(agent_id="my-agent", mock=True)

# Run via HTTP:
#   python -m bastion.a2a_server --port 9998
```

### A2A Features
- **Signed Agent Cards** — Ed25519 cryptographic identity
- **JSON-RPC 2.0** — SendMessage, GetTask, CancelTask
- **REST endpoints** — /message:send, /tasks/{id}
- **Push notifications** — CDC-triggered webhook dispatch
- **Rate limiting** — 600 req/min/IP

---

## Semantic Caching Pattern

```python
from openai import OpenAI
from bastion import BastionMemory

memory = BastionMemory(agent_id="chat-agent", mock=True)
client = OpenAI()

def llm(query: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": query}],
    )
    return response.choices[0].message.content

while True:
    query = input("> ")
    answer, meta = memory.query_with_cache(query, llm)
    badge = "CACHE" if meta["cache"] == "hit" else "MISS"
    print(f"[{badge}] {answer}")
```

---

## LTM Gateway (Token Savings)

```python
from bastion import BastionMemory

memory = BastionMemory(agent_id="my-agent", mock=True)

# Check if similar analysis exists
result = memory.ltm_check_reuse(
    analysis_type="research",
    content="Analyze market trends for Q3 2026"
)

if result.reuse_available:
    print(f"Cache hit! Save {result.tokens_saved} tokens")
    cached_result = result.cached_analysis
else:
    # Run expensive workflow
    analysis = run_expensive_analysis()
    # Store for future reuse
    memory.ltm_store_analysis(
        analysis_type="research",
        content="Analyze market trends for Q3 2026",
        result=analysis
    )
```

---

## Sleep-Time Dreaming

```python
from bastion import BastionMemory

memory = BastionMemory(agent_id="my-agent", mock=True)

# Run dreaming cycle (consolidate memories)
journal = memory.dream(
    lookback_hours=24,
    min_importance_for_promotion=6.0,
    merge_similarity_threshold=0.85
)

print(f"Reviewed: {journal.memories_reviewed}")
print(f"Consolidated: {journal.memories_consolidated}")
print(f"Promoted: {journal.memories_promoted}")
print(f"Pruned: {journal.memories_pruned}")
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASTION_CONN` | — | CockroachDB connection string |
| `BASTION_MOCK` | `true` | Enable mock mode |
| `BASTION_LLM_GUARD` | `false` | Enable Groq semantic guard |
| `GROQ_API_KEY` | — | Required for LLM guard |
| `BASTION_A2A_STRICT` | `false` | Enforce Ed25519 signatures |
| `BASTION_AWS_REGION` | `us-east-1` | AWS region for Bedrock/KMS |
| `BASTION_MCP_API_KEYS` | — | Comma-separated Bearer keys |

---

## CLI Quick Start

```bash
# Install
pip install bastion-memory

# Mock mode (no database)
python -c "from bastion import BastionMemory; mem = BastionMemory('test', mock=True); print('Working!')"

# With CockroachDB
export BASTION_CONN="postgresql://user@host:26257/defaultdb?sslmode=verify-full"
python -c "from bastion import BastionMemory; mem = BastionMemory('agent', '$BASTION_CONN'); mem.store('fact', 'Hello')"

# Start MCP server
python -m bastion.mcp_server

# Start A2A server
python -m bastion.a2a_server
```
