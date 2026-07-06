# ADR 004: SERIALIZABLE Isolation for Multi-Agent Coordination

## Status
Accepted

## Context
When multiple agents share a memory store, they can write contradictory facts:
- Agent A: "User prefers Python"
- Agent B: "User prefers Rust"

Without proper isolation, both facts coexist, and the agent makes inconsistent decisions. Traditional approaches use application-level locks or last-write-wins, both of which lose data.

## Decision
Use CockroachDB's SERIALIZABLE isolation level with automatic retry logic:

```python
try:
    with conn.transaction(isolation="serializable"):
        # Check for existing contradictory memory
        existing = search(query=new_fact)
        if contradicts(existing, new_fact):
            merged = llm_merge(existing, new_fact)
            store(merged)
        else:
            store(new_fact)
except SerializationFailure:
    # Retry with fresh read
    return resolve_conflict(fact_a, fact_b, context)
```

The SDK catches `40001` serialization errors and merges contradictory facts via LLM before atomic re-commit.

## Consequences

### Positive
- Strongest isolation level (no anomalies possible)
- Automatic conflict detection (database-level, not application-level)
- LLM merge produces human-readable resolutions
- Atomic re-commit ensures no partial updates

### Negative
- Serialization errors require retry logic (complexity)
- Under high contention, retry storms can occur
- LLM merge adds latency to conflict resolution

### Mitigations
- Circuit breaker pattern prevents cascade failures
- Conflict resolution is async (doesn't block normal operations)
- Retry count is bounded (max 3 attempts)
