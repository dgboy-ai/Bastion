# Bastion Daily Use Guide for CockroachDB Engineers

## How You'd Use Bastion Tomorrow

### Morning: Check Agent Memory Health

```python
from bastion import BastionMemory

mem = BastionMemory("production-agent")

# Check memory health
health = mem.memory_health()
print(f"Total memories: {health['total']}")
print(f"Pinned: {health['pinned']}")
print(f"Recent (7d): {health['recent_7d']}")
print(f"Avg access count: {health['avg_access']:.1f}")
```

### Midday: Debug Agent Decision

```python
# What did the agent know at 3 PM yesterday?
past_memories = mem.timetravel("yesterday 3 PM")

# Why did it make that decision?
for m in past_memories:
    print(f"[{m.memory_type}] {m.content}")
    print(f"  Hash: {m.cryptographic_hash[:16]}...")
    print(f"  Created: {m.created_at}")
```

### Afternoon: Optimize Token Costs

```python
from bastion import LTMMemoryGateway

gateway = LTMMemoryGateway(mem)

# Check if we can reuse a cached analysis
result = gateway.check_reuse("analyze Q2 revenue trends")
if result:
    print(f"Found {result.similarity:.1%} match!")
    print(f"Reusing cached analysis")
    print(f"Tokens saved: {result.tokens_saved}")
else:
    # Run expensive analysis, then cache it
    analysis = run_expensive_analysis()
    gateway.store_analysis("analyze Q2 revenue trends", analysis)
```

### Evening: Review Audit Trail

```python
# Get full audit trail
audit = mem.audit()

for entry in audit:
    print(f"{entry.timestamp} | {entry.action} | {entry.workflow_id}")
    print(f"  Details: {entry.details}")
```

---

## Common Workflows

### 1. Store Customer Context

```python
# After a support call
mem.store(
    "fact",
    "Customer #1042 prefers email over phone. Response time SLA: 4 hours.",
    metadata={"customer_id": "1042", "channel": "support"}
)
```

### 2. Search for Relevant Context

```python
# Before responding to a ticket
results = mem.search("customer #1042 504 errors", k=5)
for r in results:
    print(f"[{r.memory_type}] {r.content}")
```

### 3. Detect Contradictions

```python
from bastion import ContradictionDetector

detector = ContradictionDetector(mem)
scan = detector.scan()
if scan.contradictions:
    print(f"Found {len(scan.contradictions)} contradictions")
    for c in scan.contradictions:
        print(f"  {c.memory_a.content[:50]} vs {c.memory_b.content[:50]}")
```

### 4. Run Sleep-Time Dreaming

```python
from bastion import MemoryDreamer

dreamer = MemoryDreamer(mem)
journal = dreamer.dream()

print(f"Reviewed: {journal.memories_reviewed}")
print(f"Consolidated: {journal.memories_consolidated}")
print(f"Promoted: {journal.memories_promoted}")
print(f"Pruned: {journal.memories_pruned}")
```

---

## Integration Patterns

### With Claude Code

Add to your `CLAUDE.md`:
```markdown
@import bastion-memory

When working with customer data, search memory first:
- Search for customer context before responding
- Store key decisions after completing tasks
- Use time-travel to debug past decisions
```

### With Cursor

Add to your `settings.json`:
```json
{
  "mcpServers": {
    "bastion": {
      "command": "python",
      "args": ["-m", "bastion.mcp_server"],
      "env": {
        "BASTION_CONN": "postgresql://..."
      }
    }
  }
}
```

### With LangGraph

```python
from bastion import BastionMemory
from langgraph.graph import StateGraph

mem = BastionMemory("langgraph-agent")

def research_node(state):
    # Search memory for relevant context
    context = mem.search(state["query"], k=5)
    state["context"] = context
    return state

def store_node(state):
    # Store findings
    mem.store("fact", state["finding"], metadata={"task": state["task_id"]})
    return state

# Build graph
graph = StateGraph(AgentState)
graph.add_node("research", research_node)
graph.add_node("store", store_node)
```

---

## Debugging Tips

### "My agent forgot something"
```python
# Check if memory exists
memories = mem.list_all(agent_id="my-agent")
print(f"Total memories: {len(memories)}")

# Search for specific content
results = mem.search("what I'm looking for", k=10)
```

### "My agent made a wrong decision"
```python
# Time-travel to when the decision was made
past = mem.timetravel("2026-07-13 14:30:00")
for m in past:
    print(f"[{m.memory_type}] {m.content}")
```

### "My memory is corrupted"
```python
# Verify hash chain integrity
audit = mem.audit()
broken = [a for a in audit if not a.get("chain_valid")]
if broken:
    print(f"Found {len(broken)} broken links")
    # Self-heal
    result = mem.heal()
    print(f"Repaired {result['repaired']} memories")
```

### "I'm spending too many tokens"
```python
# Check LTM Gateway cache hits
from bastion import LTMMemoryGateway
gateway = LTMMemoryGateway(mem)
stats = gateway.stats()
print(f"Cache hits: {stats['hits']}")
print(f"Cache misses: {stats['misses']}")
print(f"Tokens saved: {stats['tokens_saved']}")
```

---

## Quick Reference

| Task | Command |
|------|---------|
| Store memory | `mem.store("fact", "content")` |
| Search memories | `mem.search("query", k=5)` |
| Time travel | `mem.timetravel("yesterday 3 PM")` |
| Verify integrity | `mem.audit()` |
| Self-heal | `mem.heal()` |
| Check health | `mem.memory_health()` |
| Dream consolidation | `MemoryDreamer(mem).dream()` |
| Detect contradictions | `ContradictionDetector(mem).scan()` |
| Cache reuse | `LTMMemoryGateway(mem).check_reuse("query")` |
