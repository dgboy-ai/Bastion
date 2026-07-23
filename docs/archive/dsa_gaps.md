# Bastion — Data Structures, Algorithms & Performance Analysis (DSA Audit)

> **Scope**: Performance efficiency, time/space complexity, algorithmic bottlenecks, data structure selection, and scalability limits across all 61 source modules in `src/bastion/`.
> **Goal**: Identify and document all DSA-level anti-patterns, inefficient complexities, memory leaks, and scaling bottlenecks to achieve enterprise production readiness.

---

## EXECUTIVE SUMMARY & DSA HEALTH OVERVIEW

Bastion includes sophisticated algorithmic structures (Lamport Vector Clocks, Merkle Trees, CRDT Replicated Data Types, graph BFS, multi-signal fusion, and LRU caches). However, several critical paths exhibit **algorithmic scaling bottlenecks**—ranging from $O(N^2)$ memory-bound operations to unindexed $O(N)$ full table scans, unbounded memory leaks, and CPU-intensive redundant calculations.

---

## 1. ALGORITHMIC & COMPLEXITY BOTTLENECKS (CRITICAL & HIGH)

### DSA-1: $O(N)$ Full Table Scan & Memory Ingestion in Multi-Signal Search
- **Location**: [retrieval.py](file:///c:/projects/bastion/src/bastion/retrieval.py#L187-L194)
- **Current Algorithm**:
  ```python
  candidates = self._memory.list_all(namespace_scope="own", memory_type=memory_type)
  candidates = candidates[:SEARCH_RESULT_LIMIT]
  ```
- **Analysis**:
  `MultiSignalRetriever.search()` fetches **all** memory records for an agent into Python memory via `list_all()` before slicing them to `SEARCH_RESULT_LIMIT` (500) and performing Python-side BM25 scoring and entity matching.
- **Time Complexity**: $O(N)$ DB fetch + $O(N \cdot L)$ string tokenization, where $N$ is total memories and $L$ is max text length.
- **Space Complexity**: $O(N)$ memory allocation in the Python process.
- **Production Impact**: Severe latency and RAM spikes as $N > 10,000$. Fails horizontally when scaling agent memory.
- **Remediation**:
  Push BM25 keyword matching and full-text filtering down to CockroachDB using native GIN/inverted indexes or SQL `pg_trgm` / full-text search operators (`TO_TSVECTOR` / `TO_TSQUERY`), limiting SQL retrieval to top-K candidates directly at the database layer.

---

### DSA-2: Unbounded $O(N^2)$ Pairwise Conflict Check in CRDT Conflict Resolution
- **Location**: [crdt_memory.py](file:///c:/projects/bastion/src/bastion/crdt_memory.py#L180-L187)
- **Current Algorithm**:
  ```python
  concurrent_pairs = [
      (i, j) for i in range(len(clocks)) for j in range(i + 1, len(clocks))
      if clocks[i].is_concurrent_with(clocks[j])
  ]
  ```
- **Analysis**:
  When resolving candidate memories for a key, `CRDTMemory.resolve_conflicts()` performs nested iterations across all $N$ candidate clocks. For each pair $(i, j)$, `is_concurrent_with()` checks vector clock inclusion.
- **Time Complexity**: $O(N^2 \cdot K)$, where $N$ is candidate count and $K$ is vector clock dimension (number of participating agents).
- **Space Complexity**: $O(N^2)$ tuple allocations in Python heap.
- **Production Impact**: CPU exhaustion and thread blocking during high-concurrency writes across multiple agents.
- **Remediation**:
  Use a topological sort or single-pass dominance tracking ($O(N \cdot K)$) to identify maximal vector clock candidates without building all $N(N-1)/2$ pairs.

---

### DSA-3: Unbounded Memory Leak ($O(N)$ Growth) in Push Notification Dispatcher
- **Location**: [push_dispatcher.py](file:///c:/projects/bastion/src/bastion/push_dispatcher.py#L70)
- **Current Algorithm**:
  ```python
  self._delivered: set[str] = set()
  ```
- **Analysis**:
  `PushNotificationDispatcher` adds task IDs to `self._delivered` upon completion to prevent duplicate webhook delivery. However, `cleanup_delivered()` is never invoked automatically by the background thread or lifecycle handlers.
- **Time Complexity**: $O(1)$ lookup, but $O(N)$ space growth over time.
- **Space Complexity**: $O(N)$ unbounded memory leak.
- **Production Impact**: Long-running production processes handling millions of async tasks will eventually crash with `MemoryError` (OOM).
- **Remediation**:
  Replace `set[str]` with a size-bounded LRU cache or TTL-expiring map (e.g., `collections.OrderedDict` or `cachetools.TTLCache`) capped at $10,000$ entries.

---

### DSA-4: $O(V + E)$ Unbounded BFS Graph Traversal without Visited Depth Guard
- **Location**: [knowledge_graph.py](file:///c:/projects/bastion/src/bastion/knowledge_graph.py#L130-L161)
- **Current Algorithm**:
  ```python
  while queue:
      eid, depth = queue.pop(0)
  ```
- **Analysis**:
  1. `queue.pop(0)` on a standard Python `list` takes $O(Q)$ time per pop, turning BFS queue operations into $O(Q^2)$ total work where $Q$ is queue size.
  2. The SQL query inside the loop issues a database roundtrip `SELECT ... WHERE r.source_entity_id = %s` for **every node** dequeued.
- **Time Complexity**: $O(V \cdot T_{\text{db}} + V^2)$ where $V$ is visited vertices and $T_{\text{db}}$ is DB network latency.
- **Space Complexity**: $O(V + E)$ in memory.
- **Production Impact**: N+1 DB query amplification during multi-hop graph queries. Traversal of a 3-hop dense sub-graph makes hundreds of blocking SQL calls.
- **Remediation**:
  1. Replace `list` with `collections.deque` for $O(1)$ `popleft()`.
  2. Replace iterative N+1 BFS queries with a single Recursive Common Table Expression (CTE) SQL query executing directly inside CockroachDB:
     ```sql
     WITH RECURSIVE graph_cte AS (...)
     ```

---

### DSA-5: Full $O(N \log N)$ Merkle Tree Reconstruction on Single Block Append
- **Location**: [merkle.py](file:///c:/projects/bastion/src/bastion/merkle.py#L248-L254)
- **Current Algorithm**:
  ```python
  def _get_tree(self) -> MerkleTree:
      if self._cached_tree is None or self._cached_tree._original_count != len(self._leaf_hashes):
          self._cached_tree = MerkleTree.from_prehashed(self._leaf_hashes)
      return self._cached_tree
  ```
- **Analysis**:
  `AppendMerkleTree` invalidates `_cached_tree` on every `append()`. When `root` or `proof()` is queried, `from_prehashed()` rebuilds all tree levels from scratch by allocating arrays and computing hashes across $N$ leaves.
- **Time Complexity**: $O(N)$ hash operations per tree query after an append, rather than $O(\log N)$ incremental tree update.
- **Space Complexity**: $O(N)$ allocations for level representation lists.
- **Production Impact**: High CPU usage during audit reporting or verification under rapid write workloads.
- **Remediation**:
  Implement true incremental Merkle tree root maintenance (keeping only $O(\log N)$ right-edge subtrees), updating the root in $O(\log N)$ time on append.

---

### DSA-6: Linear $O(N)$ Unindexed Scan in ORSet Read Operations
- **Location**: [crdt_memory.py](file:///c:/projects/bastion/src/bastion/crdt_memory.py#L525-L558)
- **Current Algorithm**:
  `ORSet.get()` issues a search query for `_key` returning up to 200 records, then iterates sequentially through `adds` and `removes` lists in Python to evaluate causal dominance.
- **Time Complexity**: $O(N \cdot K)$ where $N$ is set operations count and $K$ is vector clock evaluation cost.
- **Space Complexity**: $O(N)$ memory allocations for dictionaries of records.
- **Production Impact**: Degraded response times when reading large distributed sets.
- **Remediation**:
  Index CRDT state entries in CockroachDB by `(_crdt_key, _crdt_elem)` and filter tombstoned/dominated entries at write time using CRDT state compaction.

---

## 2. DATA STRUCTURE & ALGORITHMIC SCORECARD

| Component | Data Structure Used | Time Complexity | Space Complexity | Bottleneck Rating |
|---|---|---|---|---|
| **C-SPAN Vector Search** | L2-normalized 1024-dim Float Arrays | $O(N \cdot D)$ (Mock) / $O(\log N)$ (CRDB) | $O(N \cdot D)$ | 🟡 Medium (Mock mode linear) |
| **Multi-Signal Retrieval** | Python List + In-Memory BM25 | $O(N \cdot L)$ | $O(N)$ | 🔴 Critical ($O(N)$ DB fetch) |
| **Merkle Inclusion Proofs** | Level-based Array Binary Tree | $O(N)$ Rebuild / $O(\log N)$ Proof | $O(N)$ | 🟠 High (Rebuild cost) |
| **CRDT Vector Clocks** | Hash Map `dict[str, int]` | $O(K)$ merge / $O(N^2 \cdot K)$ conflict | $O(K)$ | 🔴 Critical ($O(N^2)$ comparison) |
| **Knowledge Graph BFS** | Python `list` + Iterative SQL | $O(V \cdot T_{\text{db}} + V^2)$ | $O(V + E)$ | 🔴 Critical (N+1 SQL Queries) |
| **Brute-Force Cache** | LRU Map (`dict` + Timestamp) | $O(1)$ amortized / $O(M \log M)$ eviction | $O(M)$ | 🟡 Medium (Sorting on eviction) |
| **Push Notification Queue** | `set[str]` (Delivered Task IDs) | $O(1)$ insertion / lookup | $O(N)$ | 🔴 Critical (Unbounded leak) |
| **Context Budget Manager** | Priority Greedy Packing | $O(N \log N)$ sort | $O(N)$ | 🟢 Optimal |
| **Connection Pool** | `collections.deque` | $O(1)$ acquire / release | $O(\text{max\_size})$ | 🟢 Optimal |

---

## 3. ADVANCED ALGORITHMIC RECOMMENDED REFACTORINGS (P0 - P3)

### Priority P0: Fix Memory Leak in Push Notifications (`push_dispatcher.py`)
Replace unbounded `set` with bounded `TTLCache`:
```python
from cachetools import TTLCache
self._delivered = TTLCache(maxsize=10000, ttl=3600)
```

### Priority P0: Optimize Knowledge Graph BFS Traversal (`knowledge_graph.py`)
Replace $O(N)$ Python queue pop and iterative DB queries with a single CockroachDB Recursive CTE:
```sql
WITH RECURSIVE bfs AS (
    SELECT source_entity_id, target_entity_id, relation_type, 1 AS depth
    FROM agent_relations WHERE source_entity_id = $1
    UNION ALL
    SELECT r.source_entity_id, r.target_entity_id, r.relation_type, b.depth + 1
    FROM agent_relations r
    JOIN bfs b ON r.source_entity_id = b.target_entity_id
    WHERE b.depth < $2
)
SELECT * FROM bfs;
```

### Priority P1: Reduce Multi-Signal Search Complexity (`retrieval.py`)
Push token matching down to database queries:
- Add a GIN index on `agent_memory (content)` using `gin_trgm_ops`.
- Use SQL full-text search `WHERE content % $1 ORDER BY SIMILARITY(content, $1) DESC LIMIT $2`.

### Priority P1: Optimize CRDT Conflict Comparison (`crdt_memory.py`)
Eliminate $O(N^2)$ candidate pairs by computing Pareto-optimal frontier of vector clocks in $O(N \cdot K)$ time.

---

## 4. VERIFIED OPTIMAL DSA IMPLEMENTATIONS

- **`ConnectionPool` (`pool.py`)**: Uses `collections.deque` for $O(1)$ pool acquire/release operations and background thread-safe reaping.
- **`ContextBudgetManager` (`context_budget.py`)**: Implements optimal greedy knapsack packing ($O(N \log N)$) for token constraint fitting.
- **`AESGCM` Envelope Encryption (`kms.py`)**: $O(1)$ key lookup using thread-safe per-tenant DEK cache (`_TENANT_DEK_CACHE`).
- **`MerkleTree.verify` (`merkle.py`)**: Correct $O(\log N)$ cryptographic inclusion verification with domain separation (RFC 6962).
