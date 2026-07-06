# ADR 002: C-SPANN Vector Indexing Over pgvector

## Status
Accepted

## Context
Agent memory requires semantic search over embeddings. The two options for PostgreSQL-compatible vector search are:

1. **pgvector**: Single-node inverted index, widely adopted
2. **C-SPANN**: CockroachDB's native distributed vector index

Key differences:
- pgvector requires reindexing after bulk inserts; C-SPANN indexes in real-time
- pgvector stores full-precision vectors; C-SPANN compresses to ~6% of original size
- pgvector runs on a single node; C-SPANN distributes across the cluster
- C-SPANN is CockroachDB-native, meaning vector data lives alongside transactional data with full ACID guarantees

## Decision
Use C-SPANN exclusively for vector indexing. The schema:

```sql
CREATE INVERTED INDEX idx_memory_embedding
  ON agent_memory USING INVERTED (embedding) WITH (dim=1024);
```

Embeddings are generated via Amazon Bedrock Titan V2 (1024-dim) and stored directly in the `agent_memory` table alongside transactional fields.

## Consequences

### Positive
- 94% smaller index than pgvector (compression)
- Real-time inserts without reindexing
- Distributed across CockroachDB nodes (no single-node bottleneck)
- Vector data is ACID-compliant with transactional data (no consistency gaps)
- Single query for both structured filters and vector similarity

### Negative
- CockroachDB-specific (not portable to other PostgreSQL databases)
- C-SPANN is newer than pgvector (less community documentation)
- Requires CockroachDB Cloud or self-hosted cluster

### Mitigations
- The hackathon is sponsored by CockroachDB (using their native feature is an advantage)
- MCP Server integration makes the vector index accessible from any tool
- Documentation covers C-SPANN usage patterns
