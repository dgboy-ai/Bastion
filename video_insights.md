# Video Insights: Agentic Memory Systems (Piyush Garg / InsForge)

## Summary of Video Concepts

| Concept | Video's Approach | Bastion Status |
|---------|-----------------|----------------|
| Short-term / sliding window | Session buffer, oldest dropped | ✅ `SessionMemory` (200-entry window, TTL 1h, auto-promotion) |
| Long-term memory | LLM extracts facts → DB | ✅ `agent_memory` table, 21 memory types, embeddings |
| Factual memory (overridable K-V) | "Name is X, Age is Y" stored as pairs | ⚠️ Stored as `fact` type text, NO dedicated `set_fact(key,val)` tool |
| Episodic memory (non-overridable) | "Deployed server on Feb 14" | ✅ `episodic` type, 24h TTL |
| Semantic memory | Vector-based knowledge store | ✅ C-SPANN vector index, multi-signal search |
| Graph memory (Neo4j-style) | Relational links between memories | ⚠️ CockroachDB graph (entities + relations), NOT exposed as MCP tools |
| Conversation→facts pipeline | LLM reads chat, extracts structured facts | ❌ Missing — no auto-extract-and-store tool |
| Agent-native infra | Agent manages its own DB via CLI | ✅ `agent_schema`, `ccloud_exec`, `managed_mcp_call` |

## Gaps vs. Video's Architecture (Actionable)

### 1. ❌ Factual Memory as Key-Value Store
Video shows: `set("name", "Piyush")`, `get("name")` as overridable pairs.
Bastion: Stores facts as text content with `fact` type. No dedicated key-value access.

**Fix**: Add `fact_set(key, value, agent_id)` and `fact_get(key, agent_id)` MCP tools.
- `fact_set` stores with metadata.key = key, overwrites on same key
- `fact_get` retrieves latest by key
- Leverages existing `memory_store` + `memory_search` under the hood

### 2. ❌ Graph Tools Not Exposed as MCP
Video shows graph traversal linking memories (Neo4j-style).
Bastion: `graph_query`, `graph_at_time`, `graph_stats` exist on `BastionMemory` but ZERO MCP tools.

**Fix**: Expose as 3 MCP tools:
- `graph_query(start_entity, hops)` — BFS traversal over entity graph
- `graph_stats()` — entity/relation counts, orphans
- `store_with_graph(content)` — store + auto-extract triples

### 3. ❌ No Conversation→Facts Extraction Pipeline
Video shows: LLM reads conversation → extracts structured facts → auto-stores.
Bastion: No such pipeline.

**Fix**: Add `extract_facts(text)` MCP tool that:
- Sends text to LLM (Groq)
- Gets structured facts back as JSON
- Stores each fact as `fact` memory via batch
- Optionally links to source via provenance

### 4. ❌ No Episodic Date-Range Query
Video shows: "What did I do on Feb 14?" as a natural episodic query.
Bastion: `memory_search` works but no dedicated time-window episodic tool.

**Fix**: Add `memory_episodic_since(timestamp)` tool that queries by `created_at >= X AND memory_type='episodic'`.

### 5. ⚠️ No Explicit "Core Memory" vs "Archival Memory"
Video doesn't explicitly show this, but all 2026 platforms (Letta, Mem0) distinguish:
- Core memory (always in context, 2-4KB)
- Archival memory (vector store, searched on demand)

Bastion: Has `pinned` memories and `context_pack` but no automatic core/archival split.

**Fix**: Implement `core_memory_get()` and `archival_memory_search()` tools that split based on pin_priority + recency.

## Implementation Priority

| # | Item | Impact | Effort | Code |
|---|------|--------|--------|------|
| 1 | Expose graph tools as MCP | High (new capability) | 1h | `mcp_server.py` + `knowledge_graph.py` |
| 2 | Add fact_set/fact_get tools | High (video's #1 demo) | 1h | New `fact_memory.py` or inline |
| 3 | Add extract_facts tool | Medium (LLM dependency) | 2h | New `extraction.py` + Groq call |
| 4 | Add episodic_since tool | Medium (nice UX) | 30min | Single query in `mcp_server.py` |
| 5 | Core/archival memory split | Low (architectural shift) | 3h | Refactor memory.py tier logic |
