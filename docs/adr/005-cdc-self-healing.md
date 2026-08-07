# ADR 005: In-Process Self-Healing via Hash-Chain Verification

## Status
Accepted (supersedes original CDC-Lambda design)

## Context
Agent memory degrades over time through:
- Duplicate memories (same fact stored multiple times)
- Expired memories (TTL-based, never cleaned up)
- Anomalies (sudden fact changes, rapid forgetting, memory size spikes)
- Corruption (hash chain breaks)

Traditional cleanup runs on a schedule (cron), which means corruption can persist for hours before detection. For production agents, this is unacceptable.

## Decision
Self-healing runs **in-process** via `memory_heal` (MCP tool), triggered on demand and during dreaming:

1. Verifies the HMAC-SHA256 hash chain across all memory blocks (detects corruption/tampering)
2. Detects anomalies (fact turnover, size spikes, rapid forgetting)
3. Reseals broken hashes / triggers snapshot recovery if corruption is detected
4. Logs to the audit table (immutable trail)

Optionally, CockroachDB CDC changefeeds can stream writes to external sinks for downstream monitoring:

```sql
CREATE CHANGEFEED FOR TABLE agent_memory
INTO 's3://bucket/prefix'
WITH updated, resolved, on_error=pause;
```

## Consequences

### Positive
- Deterministic, instant verification (no external function cold start)
- No additional infrastructure (no Lambda + IAM deployment)
- Automatic reseal on corruption
- Immutable audit trail of all healing actions

### Negative
- Verification is on-demand rather than continuous (mitigated by on-write `needs_verification` flags)
- Large chains take longer to scan (mitigated by batched verification)

### Mitigations
- On-write `needs_verification` flag marks rows for the next heal pass
- Healing is stateless (idempotent)
- S3 snapshots provide durable recovery points
