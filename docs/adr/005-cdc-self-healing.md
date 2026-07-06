# ADR 005: CDC Changefeed for Self-Healing Memory

## Status
Accepted

## Context
Agent memory degrades over time through:
- Duplicate memories (same fact stored multiple times)
- Expired memories (TTL-based, never cleaned up)
- Anomalies (sudden fact changes, rapid forgetting, memory size spikes)
- Corruption (hash chain breaks)

Traditional cleanup runs on a schedule (cron), which means corruption can persist for hours before detection. For production agents, this is unacceptable.

## Decision
Use CockroachDB CDC changefeeds to stream every memory write to AWS Lambda for real-time processing:

```sql
CREATE CHANGEFEED FOR TABLE agent_memory
INTO 's3://bucket/prefix'
WITH updated, resolved, on_error=pause;
```

The Lambda handler:
1. Verifies hash chain integrity (detects corruption)
2. Detects anomalies (fact turnover, size spikes, rapid forgetting)
3. Triggers self-healing (snapshot + rollback if corruption detected)
4. Logs to audit table (immutable trail)

## Consequences

### Positive
- Real-time detection (milliseconds, not hours)
- No polling overhead (event-driven)
- Automatic rollback on corruption
- Immutable audit trail of all healing actions

### Negative
- CDC adds infrastructure complexity (Lambda + S3 + IAM)
- Lambda has 30-second timeout (healing must be fast)
- CDC lag can be non-zero under high load

### Mitigations
- Circuit breaker prevents Lambda invocation storms
- Healing logic is stateless (idempotent)
- S3 snapshots provide durable recovery points
