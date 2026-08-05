"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { FeatureCard } from "@/components/docs/FeatureCard";
import { NextPrev } from "@/components/docs/NextPrev";

export default function ArchitecturePage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="System Design"
        title={<>Database <span style={{ color: D.gold }}>Architecture</span></>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          At the core of Bastion is <strong style={{ color: "#fff" }}>CockroachDB</strong> — a distributed SQL database with SERIALIZABLE isolation, AS OF SYSTEM TIME queries, and C-SPANN vector indexing.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Memory Ingestion Pipeline</h2>

        <div style={{
          background: "rgba(10,5,12,.7)",
          border: `1px solid ${D.borderGold}`,
          borderRadius: "10px",
          padding: "28px",
          margin: "20px 0",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "center", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
            {[
              { t: "Agent sends memory", c: D.cyan, bg: "rgba(0,229,255,.06)" },
              { t: "↓ OWASP ASI06 Guard (7-stage scan)", c: D.lava, bg: "transparent" },
              { t: "↓ 1024-dim embedding (HuggingFace → MiniLM → hash)", c: D.gold, bg: "rgba(255,200,0,.06)" },
              { t: "↓ SHA-256 Hash Chain (link to previous block)", c: D.magma, bg: "transparent" },
              { t: "↓ CockroachDB SERIALIZABLE commit", c: D.cyan, bg: "rgba(0,229,255,.06)" },
            ].map((s, i) => (
              <div key={i} style={{ padding: "10px 20px", border: `1px solid ${s.c}40`, borderRadius: "6px", background: s.bg, width: "100%", maxWidth: "400px", textAlign: "center", color: s.c }}>{s.t}</div>
            ))}
          </div>
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Schema</h2>
        <p style={{ marginBottom: "12px" }}>Bastion uses 3 core tables:</p>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "agent_memory", d: "Main memory store with vector embeddings, hash chain, metadata, importance scores", c: D.gold },
            { t: "agent_audit", d: "Append-only audit log with SHA-256 hash chain entries", c: D.cyan },
            { t: "a2a_tasks", d: "A2A task persistence with CDC changefeed for push notifications", c: D.magma },
          ].map((t, i) => (
            <div key={i} style={{ padding: "14px 16px", background: D.card, border: `1px solid ${D.border}`, borderRadius: "8px" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: t.c }}>{t.t}</div>
              <div style={{ fontSize: "13px", color: D.mute, marginTop: "4px" }}>{t.d}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Key CockroachDB Features Used</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "20px 0" }}>
          {[
            { t: "SERIALIZABLE Isolation", d: "Prevents write-write conflicts between concurrent agents. Default isolation level." },
            { t: "AS OF SYSTEM TIME", d: "Point-in-time queries for memory state at any timestamp. Zero-copy reads via MVCC." },
            { t: "C-SPANN Vector Index", d: "Distributed vector similarity search for memory embeddings." },
            { t: "PostgreSQL Wire Protocol", d: "Drop-in compatibility with psycopg2, pg drivers, and ORMs." },
            { t: "CDC Changefeeds", d: "Change data capture for real-time event streaming and push notifications." },
          ].map((f, i) => (
            <FeatureCard key={i} title={f.t} description={f.d} color={D.gold} />
          ))}
        </div>

        {/* Cross-links */}
        <div style={{ marginTop: "32px", padding: "20px", background: "rgba(255,170,0,.06)", border: `1px solid ${D.borderGold}`, borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "var(--font-sg)" }}>Related</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/docs/memory-architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Memory System (3-Tier Architecture)</Link>
            <Link href="/docs/cockroachdb" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ CockroachDB Features & Queries</Link>
            <Link href="/docs/security" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Security Architecture</Link>
          </div>
        </div>
      </div>

      <NextPrev pathname="/docs/architecture" />
    </div>
  );
}
