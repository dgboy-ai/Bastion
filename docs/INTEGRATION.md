# Bastion Integration Guide

Wrap any agent framework with Bastion's CRDB-native memory in under 60 seconds.

## SDK API

```python
from bastion import BastionMemory

with BastionMemory(agent_id="my-agent", connection_string=CONN_STR) as mem:
    # CRUD
    mem.store("fact", "User prefers Python", {"source": "chat"})
    results = mem.search("Python", k=5, threshold=0.8)
    past = mem.get_at_time(timestamp="2026-07-05T12:00:00Z")
    audit = mem.audit()
    mem.heal()

    # Semantic Caching
    response, meta = mem.query_with_cache("What is Python?", llm_callback)
    if meta["cache"] == "hit":
        print("Zero-cost cache hit!")

    # Coordination
    merged = mem.resolve_conflict("A", "B")
    info = mem.provision_cluster("bastion-demo", region="us-east1")
```

Mock mode (no cluster needed):

```python
memory = BastionMemory(agent_id="dev-agent", mock=True)
```

## LangChain

```python
from langchain.memory import ConversationBufferMemory
from bastion import BastionMemory

class BastionChatMessageHistory(ConversationBufferMemory):
    def __init__(self, agent_id: str, connection_string: str):
        self.bastion = BastionMemory(agent_id, connection_string)

    def save_context(self, inputs, outputs):
        self.bastion.store("chat", outputs["response"], {
            "input": inputs["input"], "agent": self.bastion.agent_id,
        })
```

## CrewAI

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

## LlamaIndex

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

## MCP (Model Context Protocol)

```python
from mcp.server import Server

server = Server("bastion-memory")
memory = BastionMemory(agent_id="mcp-agent", connection_string=CONN_STR)

@server.tool()
def memory_search(query: str, k: int = 5) -> list[dict]:
    return [r.to_dict() for r in memory.search(query, k=k)]

@server.tool()
def memory_store(content: str, memory_type: str = "fact") -> dict:
    return memory.store(memory_type, content).to_dict()

@server.tool()
def memory_timetravel(timestamp: str, agent_id: str | None = None) -> list[dict]:
    return [r.to_dict() for r in memory.get_at_time(timestamp=timestamp, agent_id=agent_id)]

@server.tool()
def memory_audit(agent_id: str | None = None) -> list[dict]:
    return [e.to_dict() for e in memory.audit(agent_id=agent_id)]

@server.tool()
def memory_heal(agent_id: str | None = None) -> dict:
    return memory.heal(agent_id=agent_id)
```

## Semantic Caching Pattern

```python
from openai import OpenAI
from bastion import BastionMemory

memory = BastionMemory(agent_id="chat-agent", connection_string=CONN_STR)
client = OpenAI()

def llm(query: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4o", messages=[{"role": "user", "content": query}],
    )
    return response.choices[0].message.content

while True:
    query = input("> ")
    answer, meta = memory.query_with_cache(query, llm)
    badge = "CACHE" if meta["cache"] == "hit" else "MISS"
    print(f"[{badge}] {answer}")
```

## CLI Quick Start

```bash
export BASTION_CONN="postgresql://user@host:26257/defaultdb?sslmode=verify-full"

# Store a fact
python -c "from bastion import BastionMemory; m=BastionMemory('agent', '$BASTION_CONN'); m.store('fact', 'Hello')"

# Search
python -c "from bastion import BastionMemory; m=BastionMemory('agent', '$BASTION_CONN'); print(m.search('hello'))"

# Time travel
python -c "from bastion import BastionMemory; m=BastionMemory('agent', '$BASTION_CONN'); print(m.get_at_time(timestamp='2026-07-05T12:00:00Z'))"
```
