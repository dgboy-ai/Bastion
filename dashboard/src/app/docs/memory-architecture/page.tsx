"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { FeatureCard } from "@/components/docs/FeatureCard";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { NextPrev } from "@/components/docs/NextPrev";

export default function MemoryArchitecturePage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="Core Concepts"
        title={<>The <span style={{ color: D.gold }}>Three-Tier</span> Memory System</>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion implements a <strong style={{ color: "#fff" }}>three-tier memory architecture</strong> inspired by cognitive science: working memory (STM), long-term memory (LTM), and forensic memory. Each tier serves a distinct purpose — fast retrieval, durable knowledge, and tamper-evident audit.
        </p>

        {/* ── Architecture Diagram ──────────────────────────── */}
        <div style={{
          background: "rgba(10,5,12,.7)",
          border: `1px solid ${D.borderGold}`,
          borderRadius: "12px",
          padding: "32px",
          margin: "28px 0",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: D.mute, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "20px", textAlign: "center" }}>Memory Architecture Overview</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }} className="mem-grid">
            {/* Tier 1 */}
            <div style={{ padding: "20px 16px", background: "rgba(0,229,255,.04)", border: `1px solid ${D.cyan}30`, borderRadius: "10px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: D.cyan, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px" }}>Tier 1</div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: D.cyan, fontFamily: "var(--font-sg)", marginBottom: "6px" }}>Working Memory</div>
              <div style={{ fontSize: "12px", color: D.mute, lineHeight: 1.5 }}>In-memory LRU cache<br/>{"< 1ms"} retrieval</div>
            </div>
            {/* Tier 2 */}
            <div style={{ padding: "20px 16px", background: "rgba(255,200,0,.04)", border: `1px solid ${D.gold}30`, borderRadius: "10px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: D.gold, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px" }}>Tier 2</div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: D.gold, fontFamily: "var(--font-sg)", marginBottom: "6px" }}>Long-Term Memory</div>
              <div style={{ fontSize: "12px", color: D.mute, lineHeight: 1.5 }}>CockroachDB C-SPANN<br/>15-30ms vector search</div>
            </div>
            {/* Tier 3 */}
            <div style={{ padding: "20px 16px", background: "rgba(255,42,0,.04)", border: `1px solid ${D.lava}30`, borderRadius: "10px", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "9px", color: D.lava, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px" }}>Tier 3</div>
              <div style={{ fontSize: "18px", fontWeight: 900, color: D.lava, fontFamily: "var(--font-sg)", marginBottom: "6px" }}>Forensic Memory</div>
              <div style={{ fontSize: "12px", color: D.mute, lineHeight: 1.5 }}>SHA-256 hash chain<br/>Audit log + compliance</div>
            </div>
          </div>
        </div>

        {/* ── Tier 1: STM ──────────────────────────────────── */}
        <h2 id="tier1" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "44px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>
          <span style={{ color: D.cyan }}>Tier 1</span> — Short-Term Memory (Working Cache)
        </h2>
        <p style={{ marginBottom: "16px" }}>
          The fastest tier. An in-memory LRU cache that holds recently and frequently accessed memories for sub-millisecond retrieval. When a memory is accessed 3+ times, it&apos;s automatically promoted from CockroachDB into the cache.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "20px 0" }} className="mem-detail-grid">
          <div style={{ padding: "16px", background: "rgba(0,229,255,.04)", border: `1px solid ${D.cyan}20`, borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: D.cyan, fontFamily: "var(--font-sg)", marginBottom: "4px" }}>L1 Cache</div>
            <div style={{ fontSize: "13px", color: D.mute, lineHeight: 1.5 }}>In-memory dictionary keyed by <code style={{ fontSize: "11px", color: D.gold }}>memory_id</code>. Evicts LRU when full (capacity: 1000). <strong style={{ color: "#fff" }}>{"< 1ms"} retrieval.</strong></div>
          </div>
          <div style={{ padding: "16px", background: "rgba(0,229,255,.04)", border: `1px solid ${D.cyan}20`, borderRadius: "8px" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: D.cyan, fontFamily: "var(--font-sg)", marginBottom: "4px" }}>L2 Storage</div>
            <div style={{ fontSize: "13px", color: D.mute, lineHeight: 1.5 }}>CockroachDB C-SPANN vector index. Persistent, distributed, ACID. <strong style={{ color: "#fff" }}>15-30ms retrieval.</strong></div>
          </div>
        </div>

        <p style={{ marginBottom: "16px" }}>
          The <code style={{ fontSize: "13px", color: D.gold }}>MemoryRouter</code> sits between the application and storage, transparently routing searches across both tiers:
        </p>

        <CodeBlock code={`from bastion.cache_router import MemoryRouter

router = MemoryRouter(
    memory=bastion_memory,
    cache_size=1000,           # L1 capacity
    promotion_threshold=3,     # accesses before L1 promotion
    demotion_interval_seconds=300,  # cold-check interval
)

# Search merges L1 + L2 results
results = router.search("deploy pipeline", k=5)

# Stats show cache hit rate
stats = router.get_stats()
# → {"cache_size": 42, "hit_rate_percent": 78.5, ...}`} lang="python" />

        {/* ── Tier 2: LTM ──────────────────────────────────── */}
        <h2 id="tier2" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "44px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>
          <span style={{ color: D.gold }}>Tier 2</span> — Long-Term Memory (Persistent Store)
        </h2>
        <p style={{ marginBottom: "16px" }}>
          The durable backbone. Every memory is stored in CockroachDB with <strong style={{ color: "#fff" }}>SERIALIZABLE isolation</strong>, a <strong style={{ color: "#fff" }}>SHA-256 hash chain</strong>, and <strong style={{ color: "#fff" }}>1024-dim vector embeddings</strong> for semantic search.
        </p>

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Memory Types</h3>
        <p style={{ marginBottom: "12px" }}>
          Inspired by cognitive science, Bastion classifies memories into three types:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "16px 0" }}>
          {[
            { t: "Episodic", d: "\"What happened\" — events, experiences, conversations. Timestamped records of interactions and observations.", c: D.cyan, icon: "📅" },
            { t: "Semantic", d: "\"What is true\" — facts, knowledge, rules. Durable knowledge extracted from episodic memories via consolidation.", c: D.gold, icon: "💡" },
            { t: "Procedural", d: "\"How to do things\" — workflows, decision patterns, learned procedures. Auto-detected from recurring task sequences.", c: D.magma, icon: "⚙️" },
          ].map((m) => (
            <FeatureCard key={m.t} title={m.t} description={m.d} color={m.c} icon={m.icon} />
          ))}
        </div>

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>The LTM Gateway</h3>
        <p style={{ marginBottom: "12px" }}>
          The <code style={{ fontSize: "13px", color: D.gold }}>LTMMemoryGateway</code> is the &quot;money shot&quot; — before running an expensive workflow, it checks if a similar analysis already exists in long-term memory. If a match above the 80% similarity threshold exists, it returns the cached result instantly.
        </p>
        <CodeBlock code={`from bastion.ltm_gateway import LTMMemoryGateway

gateway = LTMMemoryGateway(memory_engine, reuse_threshold=0.80)

# Check before expensive workflow
result = gateway.check_reuse("analyze Q2 revenue trends")
if result:
    print(f"Found {result.similarity:.1%} match — reusing cached analysis")
    # Skip the full pipeline, return cached insight
else:
    analysis = run_expensive_workflow(...)
    gateway.store_analysis("analyze Q2 revenue trends", analysis)`} lang="python" />

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Multi-Agent Merge (CRDT)</h3>
        <p style={{ marginBottom: "12px" }}>
          When multiple agents share a memory store, conflicts are resolved using CRDTs (Conflict-free Replicated Data Types) with three merge strategies:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "16px 0" }}>
          {[
            { t: "Last-Write-Wins", d: "Highest vector clock wins. Fastest, no LLM needed. Best for: numeric counters, timestamps." },
            { t: "Element-Union (Add-Wins)", d: "Merges sets by union. If one agent adds and another keeps, the add wins. Best for: tag lists, collections." },
            { t: "Semantic Merge", d: "LLM-powered merge that understands meaning. Resolves factual contradictions intelligently. Best for: preferences, knowledge." },
          ].map((s) => (
            <FeatureCard key={s.t} title={s.t} description={s.d} color={D.magma} />
          ))}
        </div>

        {/* ── Tier 3: Forensic ──────────────────────────────── */}
        <h2 id="tier3" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "44px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>
          <span style={{ color: D.lava }}>Tier 3</span> — Forensic Memory (Audit & Compliance)
        </h2>
        <p style={{ marginBottom: "16px" }}>
          The tamper-evident layer. Every memory write appends to an <strong style={{ color: "#fff" }}>immutable audit log</strong> with SHA-256 hash chaining. If any record is modified, the chain breaks — detected instantly by the forensic report.
        </p>

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Hash Chain Integrity</h3>
        <CodeBlock code={`# Each memory block stores:
cryptographic_hash = SHA-256(content + previous_hash)
previous_hash      = SHA-256 of the last block

# Forensic verification (run via MCP tool):
SELECT memory_id, cryptographic_hash
FROM agent_audit
WHERE action = 'memory_store'
ORDER BY recorded_at ASC;

# If any record is modified:
#   Hash chain breaks → detected by forensic_report`} lang="sql" />

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>Forensic Report</h3>
        <p style={{ marginBottom: "12px" }}>
          The <code style={{ fontSize: "13px", color: D.gold }}>forensic_report</code> MCP tool queries live CockroachDB data to verify chain integrity, count audit entries, and check memory distribution — no mocks, real cluster queries:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "16px 0" }} className="mem-detail-grid">
          {[
            { t: "Hash Chain Status", d: "INTACT or BROKEN — verifies every hash links to its predecessor" },
            { t: "Memory Distribution", d: "Breakdown by type: episodic, semantic, procedural" },
            { t: "Audit Log Entries", d: "Total append-only records in the audit trail" },
            { t: "Guard Statistics", d: "Total checks, blocked count, block percentage" },
            { t: "Pin / Access Stats", d: "Pinned memories, avg access count, avg importance" },
            { t: "Poison Detection", d: "Count of memories flagged by OWASP ASI06 guard" },
          ].map((f) => (
            <div key={f.t} style={{ padding: "12px", background: "rgba(255,42,0,.04)", border: `1px solid ${D.lava}20`, borderRadius: "6px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
              <div style={{ fontSize: "12px", color: D.mute, marginTop: "2px" }}>{f.d}</div>
            </div>
          ))}
        </div>

        <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)", margin: "28px 0 12px" }}>AS OF SYSTEM TIME</h3>
        <p style={{ marginBottom: "12px" }}>
          CockroachDB&apos;s MVCC enables point-in-time queries — see exactly what your agent knew at any timestamp without maintaining separate snapshots:
        </p>
        <CodeBlock code={`-- What did the agent know on Jan 15, 2026 at noon?
SELECT content, importance_score, created_at
FROM agent_memory
AS OF SYSTEM TIME '2026-01-15T12:00:00Z'
WHERE agent_id = 'my-agent'
ORDER BY importance_score DESC
LIMIT 10;`} lang="sql" />

        {/* ── Consolidation (Dreaming) ──────────────────────── */}
        <h2 id="consolidation" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "44px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>
          Sleep-Time Consolidation (Dreaming)
        </h2>
        <p style={{ marginBottom: "16px" }}>
          When agents are idle, background processes review recent episodic memories and consolidate learnings into durable knowledge — inspired by how the human brain consolidates memories during sleep.
        </p>

        <div style={{
          background: "rgba(10,5,12,.7)",
          border: `1px solid ${D.borderGold}`,
          borderRadius: "10px",
          padding: "24px",
          margin: "20px 0",
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: D.mute, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "16px" }}>Consolidation Pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
            {[
              { t: "1. Review recent episodic memories", c: D.cyan, bg: "rgba(0,229,255,.04)" },
              { t: "2. Extract patterns, lessons, recurring themes", c: D.gold, bg: "rgba(255,200,0,.04)" },
              { t: "3. Consolidate duplicates and near-matches", c: D.magma, bg: "transparent" },
              { t: "4. Promote high-value episodic → semantic", c: D.gold, bg: "rgba(255,200,0,.04)" },
              { t: "5. Prune low-value, expired, redundant memories", c: D.lava, bg: "transparent" },
              { t: "6. Log all actions in audit trail", c: D.cyan, bg: "rgba(0,229,255,.04)" },
            ].map((s, i) => (
              <div key={i} style={{
                padding: "10px 18px",
                border: `1px solid ${s.c}30`,
                borderRadius: "6px",
                background: s.bg,
                color: s.c,
                textAlign: "center",
              }}>{s.t}</div>
            ))}
          </div>
        </div>

        <p style={{ marginBottom: "12px" }}>
          Consolidation is triggered by:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "16px 0" }}>
          {[
            "CockroachDB CDC changefeed (memory write threshold)",
            "Lambda scheduled event (every N minutes)",
            "Manual trigger via the dream() MCP tool",
          ].map((t, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "14px" }}>
              <span style={{ color: D.gold }}>✓</span> {t}
            </div>
          ))}
        </div>

        <CodeBlock code={`# Trigger consolidation manually
from bastion.dreaming import MemoryDreamer

dreamer = MemoryDreamer(memory_engine)
journal = dreamer.dream(agent_id="my-agent")

print(f"Consolidated {journal.memories_consolidated} memories")
print(f"Promoted {journal.memories_promoted} episodic → semantic")
print(f"Pruned {journal.memories_pruned} low-value memories")
print(f"Duration: {journal.duration_ms:.0f}ms"`} lang="python" />

        {/* ── Contradiction Detection ──────────────────────── */}
        <h2 id="contradictions" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "44px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>
          Contradiction Detection
        </h2>
        <p style={{ marginBottom: "16px" }}>
          When a new memory is stored, Bastion scans existing memories for contradictions across three dimensions:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "16px 0" }}>
          {[
            { t: "Negation", d: "\"User prefers English\" vs \"User does NOT prefer English\" — direct factual opposition.", c: D.lava },
            { t: "Temporal", d: "\"Server is in us-east-1\" vs \"Server moved to eu-west-1\" — same entity, different time.", c: D.gold },
            { t: "Semantic", d: "\"Budget is $50k\" vs \"Budget is $100k\" — similar content, different claims.", c: D.cyan },
          ].map((c) => (
            <FeatureCard key={c.t} title={c.t} description={c.d} color={c.c} />
          ))}
        </div>

        {/* ── Drift Detection ──────────────────────────────── */}
        <h2 id="drift" style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "44px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>
          Drift Detection
        </h2>
        <p style={{ marginBottom: "16px" }}>
          The <code style={{ fontSize: "13px", color: D.gold }}>MemoryDrift</code> module monitors behavioral drift across five dimensions — detecting when an agent&apos;s behavior changes unexpectedly over time:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", margin: "16px 0" }} className="mem-detail-grid">
          {[
            { t: "Semantic Similarity", d: "Are new memories semantically different from the baseline?" },
            { t: "Importance Distribution", d: "Is the agent storing more/less important memories?" },
            { t: "Trust Level", d: "Are trust scores shifting over time?" },
            { t: "Access Patterns", d: "Are memories being accessed more/less frequently?" },
            { t: "Content Length", d: "Are memory descriptions getting longer/shorter?" },
          ].map((f) => (
            <div key={f.t} style={{ padding: "12px", background: D.card, border: `1px solid ${D.border}`, borderRadius: "6px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
              <div style={{ fontSize: "12px", color: D.mute, marginTop: "2px" }}>{f.d}</div>
            </div>
          ))}
        </div>

        {/* ── CTA ──────────────────────────────────────────── */}
        <div style={{
          marginTop: "48px",
          padding: "24px",
          background: "rgba(255,170,0,.06)",
          border: `1px solid ${D.borderGold}`,
          borderRadius: "10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
        }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>See the schema in action</div>
            <div style={{ fontSize: "13px", color: D.mute }}>Explore the CockroachDB tables and query examples.</div>
          </div>
          <Link href="/docs/cockroachdb" style={{
            padding: "10px 24px",
            borderRadius: "6px",
            background: `linear-gradient(135deg,${D.lava},${D.magma})`,
            color: "#fff",
            fontSize: "13px",
            fontWeight: 800,
            textDecoration: "none",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}>
            CockroachDB Features →
          </Link>
        </div>
      </div>

      <NextPrev pathname="/docs/memory-architecture" />
    </div>
  );
}
