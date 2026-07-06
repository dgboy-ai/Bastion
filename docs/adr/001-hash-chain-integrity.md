# ADR 001: Hash Chain Integrity for Agent Memory

## Status
Accepted

## Context
AI agents in production face memory poisoning attacks (OWASP ASI06: 93.8% attack success rate). When an agent's memory is corrupted — whether through prompt injection, adversarial input, or database errors — the agent makes decisions based on false information with no way to detect the corruption.

Traditional databases detect corruption via checksums at the storage layer, but this doesn't catch application-level corruption where the data is syntactically valid but semantically wrong.

## Decision
Every memory record stores a SHA-256 hash computed from its content, metadata, and the hash of the preceding record. This creates an immutable chain where:

1. **Tamper detection**: Any modification to a record breaks the chain
2. **Append-only**: New records can only link to the last valid hash
3. **Rollback verification**: AS OF SYSTEM TIME queries can verify chain integrity at any point

```python
cryptographic_hash = sha256(content + str(metadata) + str(previous_hash))
```

The genesis block (first memory) has `previous_hash = None`.

## Consequences

### Positive
- Any corruption is detected on the next memory operation
- Chain integrity can be verified at any historical point via time travel
- Provides cryptographic proof of memory lineage
- Simple implementation (one hash computation per store)

### Negative
- Adds ~0.05ms per store operation (SHA-256 computation)
- Chain verification requires sequential traversal (O(n) for full chain)
- Cannot prevent corruption, only detect it

### Mitigations
- Hash computation is async-friendly and adds negligible latency
- Chain verification is only needed on initialization or audit, not every query
- Detection + time travel enables rollback to last known good state
