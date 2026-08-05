"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { FeatureCard } from "@/components/docs/FeatureCard";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { NextPrev } from "@/components/docs/NextPrev";

export default function CockroachDBPage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="Database Layer"
        title={<><span style={{ color: D.gold }}>CockroachDB</span> Features</>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion uses CockroachDB as its distributed SQL backbone. Every memory operation — store, search, audit, time-travel — runs against CockroachDB with <strong style={{ color: "#fff" }}>SERIALIZABLE isolation</strong>.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Why CockroachDB?</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "SERIALIZABLE Isolation", d: "CockroachDB uses SERIALIZABLE by default — the strictest isolation level. No phantom reads, no write-write conflicts between concurrent agents. This is critical when multiple agents write to the same memory store.", c: D.gold },
            { t: "AS OF SYSTEM TIME", d: "Point-in-time queries via MVCC. Query exactly what an agent knew at any timestamp without maintaining separate snapshots. Zero-copy reads.", c: D.cyan },
            { t: "C-SPANN Vector Index", d: "Distributed vector similarity search for memory embeddings. Sub-linear query time at scale. Used by memory_search and multi_signal_search.", c: D.magma },
            { t: "PostgreSQL Wire Protocol", d: "100% compatible with psycopg2, pg drivers, and ORMs. No vendor lock-in — switch to any Postgres-compatible database.", c: D.gold },
            { t: "CDC Changefeeds", d: "Change data capture for real-time event streaming. Powers the dashboard's live event feed and A2A push notifications.", c: D.cyan },
            { t: "Multi-Region Ready", d: "Schema uses REGIONAL BY ROW locality. Deploy to multiple regions with automatic failover when ready.", c: D.magma },
          ].map((f, i) => (
            <FeatureCard key={i} title={f.t} description={f.d} color={f.c} />
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Query Examples</h2>

        <CodeBlock code={`-- Time-travel query
SELECT * FROM agent_memory
AS OF SYSTEM TIME '2026-01-15T12:00:00Z'
WHERE agent_id = $1;

-- Vector similarity search
SELECT content, embedding cosine_distance(embedding, $1) AS dist
FROM agent_memory
ORDER BY dist ASC LIMIT 10;

-- Hash chain verification
SELECT memory_id, cryptographic_hash
FROM agent_audit
WHERE action = 'memory_store'
ORDER BY recorded_at DESC;`} lang="sql" />

        {/* Cross-links */}
        <div style={{ marginTop: "32px", padding: "20px", background: "rgba(255,170,0,.06)", border: `1px solid ${D.borderGold}`, borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "var(--font-sg)" }}>Related</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/docs/memory-architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Memory System (How data is structured)</Link>
            <Link href="/docs/architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Database Architecture</Link>
            <Link href="/docs/configuration" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Connection Pool Settings</Link>
          </div>
        </div>
      </div>

      <NextPrev pathname="/docs/cockroachdb" />
    </div>
  );
}
