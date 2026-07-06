# ADR 003: AS OF SYSTEM TIME for Memory Reconstruction

## Status
Accepted

## Context
Agents need to answer questions like:
- "What did I know about this user yesterday?"
- "How has my understanding of this project evolved?"
- "What was my memory state before the corruption event?"

Traditional databases require explicit versioning (snapshots, audit tables) to answer these questions. CockroachDB's multi-version concurrency control (MVCC) stores every version of every row automatically.

## Decision
Leverage CockroachDB's `AS OF SYSTEM TIME` for temporal queries:

```sql
SELECT * FROM agent_memory
AS OF SYSTEM TIME '2026-07-03 14:47:00'
WHERE agent_id = 'my-agent';
```

The SDK exposes this as:
```python
memory.get_at_time(timestamp='2026-07-03T14:47:00Z')
memory.diff(timestamp_a='2026-07-03T14:47:00Z', timestamp_b='2026-07-04T10:00:00Z')
```

## Consequences

### Positive
- Zero-cost versioning (MVCC is built into CockroachDB)
- Can reconstruct agent state at any past millisecond
- Enables "memory diff" between two timestamps
- Supports rollback to pre-corruption state
- No explicit version management code needed

### Negative
- Requires CockroachDB (not available in standard PostgreSQL)
- Historical queries may be slower than current-state queries
- MVCC storage overhead increases over time

### Mitigations
- Historical queries are infrequent (audit, debugging, rollback)
- CockroachDB manages MVCC garbage collection automatically
- The feature is a core differentiator that justifies the CockroachDB dependency
