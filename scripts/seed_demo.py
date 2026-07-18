"""Seed comprehensive demo data for hackathon judges.

Run: docker compose -f docker-compose.demo.yml exec seed-data python /scripts/seed_demo.py

Creates:
- 3 demo agents (customer-support, code-reviewer, research-assistant)
- 50+ memories per agent with realistic content
- Knowledge graph with entities and relations
- Hash chain integrity across all memories (uses HMAC-SHA256)
"""

import hashlib
import hmac
import json
import os
import secrets
import sys
import uuid

import psycopg

CONN = os.environ.get("BASTION_CONN")

if not CONN:
    print("ERROR: BASTION_CONN not set")
    sys.exit(1)

conn = psycopg.connect(CONN)
cur = conn.cursor()

print("Clearing existing demo data...")
cur.execute("DELETE FROM agent_relations")
cur.execute("DELETE FROM agent_entities")
cur.execute("DELETE FROM agent_memory WHERE agent_id LIKE 'demo-%'")
conn.commit()

# HMAC secret for hash chain (matches crypto.py)
_HMAC_SECRET = os.environ.get("BASTION_HMAC_SECRET", "").encode()
if not _HMAC_SECRET:
    # Try to load from disk (matches crypto.py persistence)
    secret_file = os.path.expanduser("~/.bastion/hmac.key")
    try:
        if os.path.exists(secret_file):
            with open(secret_file, "rb") as f:
                _HMAC_SECRET = f.read()
    except Exception:
        pass
if not _HMAC_SECRET:
    _HMAC_SECRET = secrets.token_bytes(32)
    print("WARNING: Using random HMAC secret — hash chains will not match production")

# Mock 1024-dim embedding
def mock_embedding(text):
    digest = hashlib.sha256(text.encode()).digest()
    raw = []
    for _ in range(32):
        for byte in digest:
            raw.append(float(byte) / 127.5 - 1.0)
    norm = sum(v * v for v in raw) ** 0.5 or 1.0
    return [v / norm for v in raw]

def hash_chain(content, prev_hash):
    """Compute HMAC-SHA256 hash (matches bastion.crypto.compute_hash)."""
    meta_str = ""
    payload = content + meta_str + (prev_hash or "")
    return hmac.new(_HMAC_SECRET, payload.encode(), hashlib.sha256).hexdigest()

# ══════════════════════════════════════════════════════════════════════════════
# Agent 1: Customer Support
# ══════════════════════════════════════════════════════════════════════════════
print("Seeding customer-support agent...")
agent1 = "demo-customer-support"
prev_hash = None
memories_1 = [
    ("fact", "Customer #1042 (Sarah Chen) prefers email communication over phone. Response time SLA: 4 hours."),
    ("fact", "Customer #1042 reported intermittent 504 errors on the /api/dashboard endpoint since July 10."),
    ("preference", "Customer #1042 is on the Enterprise plan ($2,400/mo). Escalate任何 billing issues to account manager."),
    ("instruction", "When customer reports 504 errors, first check CockroachDB connection pool metrics before escalating."),
    ("fact", "Customer #1042's team uses Python SDK v2.3.1 with asyncpg connection pooling (min=2, max=10)."),
    ("learned", "504 errors on /api/dashboard correlate with connection pool exhaustion during peak hours (9-11 AM EST)."),
    ("fact", "Customer #1042 integration uses 3 CockroachDB regions: us-east-1, eu-west-1, ap-southeast-1."),
    ("preference", "Customer #1042 requires SOC 2 compliance reports quarterly. Next report due August 15, 2026."),
    ("instruction", "Always include connection pool stats in 504 error investigation reports for Enterprise customers."),
    ("fact", "Customer #1042's last support ticket (#SR-8842) was resolved in 2.3 hours — above their 4-hour SLA."),
    ("learned", "Customer #1042's 504 errors increased 300% after their last deployment on July 8. Correlation with new middleware."),
    ("fact", "Customer #1042 has 15 team members with CockroachDB access. Admin: Sarah Chen, DevOps: Mike Park."),
    ("preference", "Customer #1042 prefers technical responses with SQL queries and metrics, not generic troubleshooting steps."),
    ("fact", "Customer #1042's CockroachDB cluster: 9 nodes, 3 regions, 48 vCPUs, 192GB RAM, $8,400/mo."),
    ("instruction", "For Enterprise customers, always CC the account manager on resolution emails."),
    ("learned", "Customer #1042's response time improved 40% after switching from REST to gRPC for internal services."),
    ("fact", "Customer #1042 experienced a data lag incident on June 15 — resolved by increasing max_range_bytes."),
    ("preference", "Customer #1042 wants weekly status reports on their CockroachDB cluster health."),
    ("fact", "Customer #1042's application uses SERIALIZABLE isolation for all financial transactions."),
    ("instruction", "Never suggest downgrading from SERIALIZABLE to READ COMMITTED for financial workloads."),
    ("learned", "Customer #1042's peak traffic: 12,000 QPS. Average: 3,200 QPS. Writes: 40% of total."),
    ("fact", "Customer #1042 is evaluating CockroachDB's new vector index for their AI features."),
    ("preference", "Customer #1042's timezone is EST. Schedule calls between 10 AM - 4 PM EST."),
    ("fact", "Customer #1042's application has 99.97% uptime in the last 30 days."),
    ("instruction", "When discussing performance, always reference their P99 latency target of <50ms."),
    ("learned", "Customer #1042's most common query pattern: SELECT with 3 JOINs on user_id, order_id, product_id."),
    ("fact", "Customer #1042's backup strategy: incremental every hour, full daily, cross-region replication."),
    ("preference", "Customer #1042 prefers Slack for urgent issues, email for non-urgent."),
    ("fact", "Customer #1042's team completed CockroachDB certification training in May 2026."),
    ("instruction", "For schema change requests, always run EXPLAIN ANALYZE first and share the query plan."),
    ("learned", "Customer #1042's most frequent support category: connection pool tuning (35% of tickets)."),
    ("fact", "Customer #1042 is planning to migrate their analytics workload to a dedicated CockroachDB cluster."),
    ("preference", "Customer #1042 wants advance notice of any CockroachDB maintenance windows."),
    ("fact", "Customer #1042's application uses JSONB columns for flexible metadata storage."),
    ("instruction", "When debugging slow queries, always check for full table scans and missing indexes."),
    ("learned", "Customer #1042's connection pool exhaustion is caused by long-running transactions holding connections."),
    ("fact", "Customer #1042 has a custom dashboard showing real-time CockroachDB metrics (Grafana + Prometheus)."),
    ("preference", "Customer #1042 prefers async communication. Response within 24 hours is acceptable for non-urgent."),
    ("fact", "Customer #1042's last scale-up was from 6 to 9 nodes on June 20, 2026."),
    ("instruction", "Always verify the customer's CockroachDB version before suggesting feature-specific solutions."),
    ("learned", "Customer #1042's 504 errors are 80% resolved by increasing sql.defaults.statement_timeout."),
    ("fact", "Customer #1042 uses CockroachDB's geo-partitioned leaseholders for low-latency reads."),
    ("preference", "Customer #1042 wants all support interactions logged in their CRM (Salesforce)."),
    ("fact", "Customer #1042's application processes 2.5M transactions/day across 3 regions."),
    ("instruction", "For cross-region issues, always check network latency between regions first."),
    ("learned", "Customer #1042's write latency increased 15ms after adding the ap-southeast-1 region."),
    ("fact", "Customer #1042 is a reference customer — their case study is published on cockroachlabs.com."),
    ("preference", "Customer #1042 expects priority support (4-hour SLA vs standard 24-hour)."),
    ("fact", "Customer #1042's team has 3 CockroachDB-certified engineers."),
    ("instruction", "When sharing best practices, reference their existing architecture to make recommendations actionable."),
    ("learned", "Customer #1042's happiest metric: 99.97% uptime. Their pain point: connection pool management."),
]

prev_hash = None
for mtype, content in memories_1:
    mid = str(uuid.uuid4())
    emb = mock_embedding(content)
    ch = hash_chain(content, prev_hash)
    cur.execute(
        """INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding,
           cryptographic_hash, previous_hash, importance_score)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (mid, agent1, mtype, content, json.dumps(emb), ch, prev_hash, 8.0),
    )
    prev_hash = ch

# ══════════════════════════════════════════════════════════════════════════════
# Agent 2: Code Reviewer
# ══════════════════════════════════════════════════════════════════════════════
print("Seeding code-reviewer agent...")
agent2 = "demo-code-reviewer"
prev_hash = None
memories_2 = [
    ("fact", "PR #4521: Modified connection pool config. Changed max_connections from 50 to 100."),
    ("learned", "Increasing max_connections without adjusting memory can cause OOM. Always check available RAM first."),
    ("fact", "PR #4522: Added retry logic for CockroachDB serialization errors."),
    ("instruction", "Retry logic should use exponential backoff with jitter. Max 3 retries, base delay 100ms."),
    ("fact", "PR #4523: Added vector index on agent_memory table for semantic search."),
    ("learned", "CockroachDB C-SPANN vector index requires prefix column for multi-tenant isolation."),
    ("fact", "PR #4524: Fixed SQL injection in list_columns() by adding table name validation."),
    ("instruction", "Always validate SQL identifiers using isidentifier() before interpolation."),
    ("learned", "PR #4524 was a critical security fix. SQL injection in DDL can drop tables."),
    ("fact", "PR #4525: Added circuit breaker pattern for Bedrock API calls."),
    ("instruction", "Circuit breaker threshold: 5 failures. Recovery timeout: 30s. Success threshold: 2."),
    ("fact", "PR #4526: Implemented AS OF SYSTEM TIME queries for time-travel memory retrieval."),
    ("learned", "AS OF SYSTEM TIME requires follower reads or strong reads. Use follower for latency, strong for consistency."),
    ("fact", "PR #4527: Added PII detection and redaction in memory store pipeline."),
    ("instruction", "PII scan must run BEFORE hash computation to ensure the hash covers redacted content."),
    ("learned", "PII patterns: SSN (\\d{3}-\\d{2}-\\d{4}), email, credit card. Redact in-place, log the type."),
    ("fact", "PR #4528: Added OWASP ASI06 prompt injection guard with 9 regex patterns."),
    ("instruction", "Guard must check content BEFORE storage. Block CRITICAL findings, warn on HIGH."),
    ("fact", "PR #4529: Implemented CRDT conflict resolution for multi-agent memory merges."),
    ("learned", "LWW (Last-Writer-Wins) is simple but loses data. Use semantic merge for high-value memories."),
    ("fact", "PR #4530: Added sleep-time dreaming consolidation for idle memory optimization."),
    ("instruction", "Dreaming runs during idle periods. Consolidate duplicates, promote high-value episodic to semantic."),
    ("fact", "PR #4531: Implemented LTM Gateway for caching expensive analysis results."),
    ("learned", "LTM Gateway saves tokens by reusing cached analyses above 80% similarity threshold."),
    ("fact", "PR #4532: Added A2A protocol support for agent-to-agent communication."),
    ("instruction", "A2A Agent Cards must be signed with Ed25519. Verify signatures in strict mode."),
    ("fact", "PR #4533: Implemented knowledge graph extraction from memory content."),
    ("learned", "Triple extraction: (subject, relation, object). Use Groq for LLM-based verification."),
    ("fact", "PR #4534: Added row-level security for multi-tenant memory isolation."),
    ("instruction", "RLS must be enforced at the connection level, not application level."),
    ("fact", "PR #4535: Implemented behavioral drift detection for agent memory patterns."),
    ("learned", "Drift score > 0.3 triggers DRIFTING status. > 0.6 triggers CRITICAL."),
    ("fact", "PR #4536: Added compliance reporting with IETF AAT records."),
    ("instruction", "Compliance reports must include: timestamp, action, actor, data affected, justification."),
    ("fact", "PR #4537: Implemented hash chain integrity verification with Merkle tree proofs."),
    ("learned", "Merkle proofs enable O(log n) verification instead of O(n) full chain scan."),
    ("fact", "PR #4538: Added contradiction detection for conflicting memories."),
    ("instruction", "Contradictions detected via semantic similarity > 0.9 AND content divergence."),
    ("learned", "Resolution: keep the newer memory, archive the older one with 'contradicted_by' link."),
    ("fact", "PR #4539: Implemented context budget manager for token-limited LLM contexts."),
    ("instruction", "Pack memories by priority: pinned > recent > important > semantic."),
    ("fact", "PR #4540: Added procedural memory for workflow patterns and decision trees."),
    ("learned", "Procedural memory stores HOW to do things, not WHAT happened."),
    ("fact", "PR #4541: Implemented thought chain for multi-step reasoning traces."),
    ("instruction", "Thought chains must be immutable once created. Append-only."),
    ("fact", "PR #4542: Added cognitive rules engine for learning from agent failures."),
    ("learned", "Rules extracted from failure patterns. Weight increases on success, decreases on bypass."),
    ("fact", "PR #4543: Implemented observation detector for recurring patterns in memory access."),
    ("instruction", "Observations surface when the same query pattern repeats 3+ times."),
    ("fact", "PR #4544: Added tag extraction for automatic memory categorization."),
    ("learned", "Tags extracted via regex + LLM. Top 5 tags per memory."),
    ("fact", "PR #4545: Implemented session memory with context compaction."),
    ("instruction", "Session memories are ephemeral. Compact when context window > 80% full."),
    ("fact", "PR #4546: Added recall router for multi-strategy memory retrieval."),
    ("learned", "Router selects strategy based on query type: vector for semantic, BM25 for keyword, graph for relational."),
    ("fact", "PR #4547: Implemented telemetry with OpenTelemetry integration."),
    ("instruction", "All memory operations must emit spans with agent_id, operation, latency."),
    ("fact", "PR #4548: Added capture hooks for memory lifecycle events."),
    ("learned", "Hooks: on_store, on_search, on_delete, on_consolidate. Use for CDC integration."),
    ("fact", "PR #4549: Implemented saga pattern for multi-step memory operations."),
    ("instruction", "Sagas must support compensation. If step 3 fails, undo steps 1 and 2."),
    ("fact", "PR #4550: Added locality-aware routing for multi-region memory placement."),
    ("learned", "Route reads to nearest region. Route writes to leader region."),
    ("fact", "PR #4551: Implemented trust scoring for memory reliability assessment."),
    ("instruction", "Trust score factors: age, access count, source provenance, hash chain integrity."),
    ("fact", "PR #4552: Added memory health monitoring with decay curves."),
    ("learned", "Healthy memory: decay rate < 0.1/day. Unhealthy: decay rate > 0.5/day."),
    ("fact", "PR #4553: Implemented benchmark suite for memory performance testing."),
    ("instruction", "Benchmarks must run against mock AND real CockroachDB. Report both."),
    ("fact", "PR #4554: Added LangChain adapter for memory integration."),
    ("learned", "LangChain adapter wraps BastionMemory as ChatMessageHistory."),
    ("fact", "PR #4555: Implemented LlamaIndex adapter for RAG pipelines."),
    ("instruction", "LlamaIndex adapter exposes memories as VectorStoreNode."),
    ("fact", "PR #4556: Added CrewAI adapter for multi-agent memory sharing."),
    ("learned", "CrewAI adapter uses shared namespace for agent collaboration."),
]

for mtype, content in memories_2:
    mid = str(uuid.uuid4())
    emb = mock_embedding(content)
    ch = hash_chain(content, prev_hash)
    cur.execute(
        """INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding,
           cryptographic_hash, previous_hash, importance_score)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (mid, agent2, mtype, content, json.dumps(emb), ch, prev_hash, 8.5),
    )
    prev_hash = ch

# ══════════════════════════════════════════════════════════════════════════════
# Agent 3: Research Assistant
# ══════════════════════════════════════════════════════════════════════════════
print("Seeding research-assistant agent...")
agent3 = "demo-research-assistant"
prev_hash = None
memories_3 = [
    # === EPISODIC MEMORIES (what happened) ===
    ("episodic", "July 10, 2026: Customer #1042 reported 504 errors on /api/dashboard. Investigated connection pool exhaustion. Resolved by increasing max_connections from 50 to 100."),
    ("episodic", "July 12, 2026: Code review for PR #4525 — added circuit breaker for Bedrock API. Caught missing retry logic before merge. 3 iterations needed."),
    ("episodic", "July 14, 2026: Deployed Bastion v0.6.0 to production. 22 memories stored, hash chain verified. All 10/10 features confirmed working."),
    # === SEMANTIC MEMORIES (what is true) ===
    ("semantic", "CockroachDB v25.2 introduces C-SPANN vector indexing with 94% compression vs pgvector."),
    ("semantic", "SERIALIZABLE isolation is mandatory for agentic workloads. READ COMMITTED causes cascading errors when agents compound bad data."),
    ("semantic", "Row-level TTL in CockroachDB automatically expires rows without application-level cleanup code."),
    # === PROCEDURAL MEMORIES (how to do things) ===
    ("procedural", "When debugging 504 errors: 1) Check connection pool metrics 2) Verify statement_timeout 3) Run EXPLAIN ANALYZE 4) Check for full table scans 5) Escalate if >4 hours."),
    ("procedural", "PII scan workflow: Detect email/phone/SSN/CC → Redact in-place → Log detection type → Compute hash on redacted content → Store with PII flag in metadata."),
    ("procedural", "Memory consolidation (dreaming) process: Fetch recent memories → Find duplicates via Jaccard similarity → Merge duplicates → Promote high-value episodic to semantic → Prune expired."),
    # === SECURITY MEMORIES (threat intelligence) ===
    ("security", "OWASP ASI06: Memory poisoning is the #3 risk for agentic systems. Mitigation: SHA-256 hash chains + content validation + trust scoring."),
    ("security", "Prompt injection patterns blocked: 'ignore previous instructions', 'admin override', 'system prompt', 'you are now', 'disregard all'. 9 regex patterns + LLM classifier."),
    ("security", "Secret detection patterns: AWS keys (AKIA...), GitHub tokens (ghp_...), private keys (-----BEGIN), generic API keys. All blocked before storage."),
    # === FACT MEMORIES (standard knowledge) ===
    ("fact", "CockroachDB v25.2 introduces C-SPANN vector indexing with 94% compression vs pgvector."),
    ("learned", "C-SPANN uses prefix columns for multi-tenant isolation. Ideal for SaaS agent memory."),
    ("fact", "AS OF SYSTEM TIME enables point-in-time queries without manual snapshots."),
    ("instruction", "Use follower reads for latency-sensitive queries, strong reads for consistency-critical."),
    ("fact", "CockroachDB SERIALIZABLE isolation prevents write skew anomalies in concurrent agent operations."),
    ("learned", "Most databases default to READ COMMITTED. SERIALIZABLE is essential for agent memory integrity."),
    ("fact", "CockroachDB's multi-region capabilities: automatic data placement, leaseholder preferences, zone constraints."),
    ("instruction", "For global agent memory: place leaseholders close to the majority of reads."),
    ("fact", "Mem0 uses memory compression to reduce token usage by 40-60%."),
    ("learned", "Memory compression trades detail for efficiency. Good for chat, bad for compliance."),
    ("fact", "Zep's context graphs achieve sub-200ms retrieval regardless of graph size."),
    ("instruction", "Graph retrieval is O(log n). Vector retrieval is O(n). Combine both for best results."),
    ("fact", "Cognee has 27.7K GitHub stars and is part of Berkeley Xcelerator."),
    ("learned", "Cognee's strength: graph + vector hybrid. Weakness: no cryptographic integrity."),
    ("fact", "Letta (formerly MemGPT) pioneered sleep-time compute for agent memory consolidation."),
    ("instruction", "Sleep-time computing runs during idle periods. Consolidate, prune, promote."),
    ("fact", "OWASP ASI06 defines the top 10 security risks for agentic applications."),
    ("learned", "Memory poisoning is the #3 risk. Mitigation: hash chains + content validation."),
    ("fact", "Agent-to-Agent (A2A) protocol enables inter-agent communication with signed agent cards."),
    ("instruction", "A2A cards must be signed with Ed25519. Verify in strict mode."),
    ("fact", "CRDTs (Conflict-free Replicated Data Types) enable eventual consistency without coordination."),
    ("learned", "LWW-Register for single values, OR-Set for collections, VectorClock for causality."),
    ("fact", "Knowledge graph extraction converts unstructured memory into structured triples."),
    ("instruction", "Triple format: (subject, relation, object). Use LLM for extraction, graph DB for storage."),
    ("fact", "Behavioral drift detection monitors changes in agent memory access patterns."),
    ("learned", "Drift score > 0.3 indicates behavioral change. > 0.6 indicates potential anomaly."),
    ("fact", "Context budget management prevents token overflow in LLM contexts."),
    ("instruction", "Pack by priority: pinned > recent > important > semantic similarity."),
    ("fact", "Merkle hash chains provide O(log n) proof of memory integrity."),
    ("learned", "Full chain verification is O(n). Merkle proofs enable efficient partial verification."),
    ("fact", "CockroachDB changefeeds enable real-time CDC for memory writes."),
    ("instruction", "Use changefeeds for: self-healing, anomaly detection, cross-region sync."),
    ("fact", "Row-level security (RLS) enables multi-tenant memory isolation at the database level."),
    ("learned", "RLS is enforced at connection level. Use session variables to set tenant context."),
    ("fact", "Procedural memory stores HOW to do things, not WHAT happened."),
    ("instruction", "Use for: workflows, decision trees, playbooks, runbooks."),
    ("fact", "Thought chains capture multi-step reasoning traces for explainability."),
    ("learned", "Thought chains are immutable. Append-only. Useful for debugging and compliance."),
    ("fact", "Cognitive rules engine learns from agent failures and extracts preventable patterns."),
    ("instruction", "Rules have: trigger (when), action (what), weight (confidence). Update on success/failure."),
    ("fact", "Contradiction detection identifies conflicting memories via semantic similarity."),
    ("learned", "Resolution: keep newer, archive older with 'contradicted_by' link."),
    ("fact", "Observation detector surfaces recurring patterns in memory access."),
    ("instruction", "Observations require 3+ occurrences. Surface as insights, not alerts."),
    ("fact", "Tag extraction automatically categorizes memories for retrieval."),
    ("learned", "Tags: top 5 per memory. Extracted via regex + LLM. Stored in metadata."),
    ("fact", "Session memory is ephemeral. Compact when context window > 80% full."),
    ("instruction", "Compact: summarize old messages, keep recent ones verbatim."),
    ("fact", "Recall router selects retrieval strategy based on query type."),
    ("learned", "Vector for semantic, BM25 for keyword, graph for relational. Combine for best results."),
    ("fact", "OpenTelemetry integration enables distributed tracing across memory operations."),
    ("instruction", "All operations must emit spans with: agent_id, operation, latency, success."),
    ("fact", "Capture hooks enable event-driven integration with CDC and webhooks."),
    ("learned", "Hooks: on_store, on_search, on_delete, on_consolidate."),
    ("fact", "Saga pattern enables multi-step memory operations with compensation."),
    ("instruction", "If step 3 fails, undo steps 1 and 2. Idempotency required."),
    ("fact", "Locality-aware routing places reads close to users, writes to leaders."),
    ("learned", "Global agent memory requires: read replicas in each region, writes to leader."),
    ("fact", "Trust scoring assesses memory reliability based on multiple factors."),
    ("instruction", "Factors: age, access count, source provenance, hash chain integrity."),
    ("fact", "Memory health monitoring tracks decay curves and freshness."),
    ("learned", "Healthy: decay < 0.1/day. Unhealthy: decay > 0.5/day. Prune unhealthy memories."),
    ("fact", "Benchmark suite tests memory performance against mock and real CockroachDB."),
    ("instruction", "Always report both mock and real benchmarks. Mock shows ceiling, real shows reality."),
]

for mtype, content in memories_3:
    mid = str(uuid.uuid4())
    emb = mock_embedding(content)
    ch = hash_chain(content, prev_hash)
    cur.execute(
        """INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding,
           cryptographic_hash, previous_hash, importance_score)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
        (mid, agent3, mtype, content, json.dumps(emb), ch, prev_hash, 8.0),
    )
    prev_hash = ch

# ══════════════════════════════════════════════════════════════════════════════
# Knowledge Graph Entities
# ══════════════════════════════════════════════════════════════════════════════
print("Seeding knowledge graph...")
entities = [
    (str(uuid.uuid4()), agent1, "person", "Sarah Chen", '{"role": "Customer Admin", "company": "Customer #1042"}'),
    (str(uuid.uuid4()), agent1, "person", "Mike Park", '{"role": "DevOps Engineer", "company": "Customer #1042"}'),
    (str(uuid.uuid4()), agent1, "system", "CockroachDB Cluster", '{"nodes": 9, "regions": 3, "cost": "$8,400/mo"}'),
    (str(uuid.uuid4()), agent1, "issue", "504 Errors", '{"frequency": "intermittent", "endpoint": "/api/dashboard"}'),
    (str(uuid.uuid4()), agent2, "pull_request", "PR #4524", '{"type": "security_fix", "severity": "critical"}'),
    (str(uuid.uuid4()), agent2, "pull_request", "PR #4526", '{"type": "feature", "description": "time-travel queries"}'),
    (str(uuid.uuid4()), agent2, "pattern", "SQL Injection", '{"owasp": "A03:2021", "severity": "critical"}'),
    (str(uuid.uuid4()), agent3, "technology", "C-SPANN", '{"type": "vector_index", "compression": "94%"}'),
    (str(uuid.uuid4()), agent3, "technology", "AS OF SYSTEM TIME", '{"type": "time_travel", "feature": "MVCC"}'),
    (str(uuid.uuid4()), agent3, "competitor", "Mem0", '{"stars": "90K+", "strength": "ease_of_use"}'),
    (str(uuid.uuid4()), agent3, "competitor", "Zep", '{"strength": "context_graphs", "retrieval": "<200ms"}'),
    (str(uuid.uuid4()), agent3, "competitor", "Cognee", '{"stars": "27.7K", "strength": "graph_memory"}'),
]

for eid, aid, etype, name, attrs in entities:
    cur.execute(
        "INSERT INTO agent_entities (entity_id, agent_id, entity_type, name, attributes) VALUES (%s, %s, %s, %s, %s)",
        (eid, aid, etype, name, attrs),
    )

# Relations
relations = [
    (str(uuid.uuid4()), agent1, entities[0][0], entities[2][0], "administers", 0.95),
    (str(uuid.uuid4()), agent1, entities[1][0], entities[2][0], "operates", 0.90),
    (str(uuid.uuid4()), agent1, entities[2][0], entities[3][0], "exhibits", 0.85),
    (str(uuid.uuid4()), agent2, entities[5][0], entities[6][0], "fixes", 0.98),
    (str(uuid.uuid4()), agent3, entities[7][0], entities[8][0], "enables", 0.90),
    (str(uuid.uuid4()), agent3, entities[9][0], entities[10][0], "competes_with", 0.80),
    (str(uuid.uuid4()), agent3, entities[9][0], entities[11][0], "competes_with", 0.80),
]

for rid, aid, src, tgt, rtype, conf in relations:
    cur.execute(
        """INSERT INTO agent_relations (relation_id, agent_id, source_entity_id, target_entity_id,
           relation_type, confidence) VALUES (%s, %s, %s, %s, %s, %s)""",
        (rid, aid, src, tgt, rtype, conf),
    )

# ══════════════════════════════════════════════════════════════════════════════
# Audit Trail Entries
# ══════════════════════════════════════════════════════════════════════════════
print("Seeding audit trail...")
audit_actions = [
    ("memory_store", {"memory_type": "fact", "content_preview": "Customer #1042 prefers email"}),
    ("memory_store", {"memory_type": "fact", "content_preview": "504 errors on /api/dashboard"}),
    ("memory_store", {"memory_type": "preference", "content_preview": "Enterprise plan support"}),
    ("memory_store", {"memory_type": "instruction", "content_preview": "Check connection pool metrics"}),
    ("memory_store", {"memory_type": "learned", "content_preview": "504 errors correlate with peak hours"}),
    ("memory_search", {"query": "connection pool", "results_count": 5}),
    ("memory_store", {"memory_type": "fact", "content_preview": "CockroachDB v25.2 C-SPANN"}),
    ("memory_store", {"memory_type": "semantic", "content_preview": "SERIALIZABLE isolation"}),
    ("memory_store", {"memory_type": "security", "content_preview": "OWASP ASI06 memory poisoning"}),
    ("hash_verify", {"chain_length": 10, "status": "valid"}),
    ("memory_store", {"memory_type": "procedural", "content_preview": "Debugging 504 errors workflow"}),
    ("memory_store", {"memory_type": "episodic", "content_preview": "July 10: 504 errors reported"}),
    ("memory_store", {"memory_type": "fact", "content_preview": "REGIONAL BY ROW configuration"}),
    ("memory_store", {"memory_type": "preference", "content_preview": "Weekly status reports"}),
    ("guard_scan", {"findings": 0, "status": "passed"}),
]

for action, details in audit_actions:
    cur.execute(
        "INSERT INTO agent_audit (agent_id, workflow_id, action, details) VALUES (%s, %s, %s, %s)",
        (agent1, str(uuid.uuid4()), action, json.dumps(details)),
    )

conn.commit()
cur.close()
conn.close()

print(f"Demo data seeded successfully!")
print(f"  - Agent 1: {agent1} ({len(memories_1)} memories)")
print(f"  - Agent 2: {agent2} ({len(memories_2)} memories)")
print(f"  - Agent 3: {agent3} ({len(memories_3)} memories)")
print(f"  - Entities: {len(entities)}")
print(f"  - Relations: {len(relations)}")
