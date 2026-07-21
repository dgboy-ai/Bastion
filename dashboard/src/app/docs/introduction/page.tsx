"use client";

import Link from "next/link";

const C = { gold: "#ffc800", lava: "#ff2a00", magma: "#ff9c00", cyan: "#00e5ff", body: "#e8e2ec", mute: "#8a8290" };

export default function IntroductionPage() {
  return (
    <div style={{ maxWidth: "740px" }}>
      {/* Eyebrow */}
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.gold, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 700, marginBottom: "12px" }}>Fortress-Grade Memory</div>

      {/* Title */}
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", margin: "0 0 24px", lineHeight: 1.1 }}>
        What is <span style={{ color: C.gold }}>Bastion</span>?
      </h1>

      {/* Body */}
      <div style={{ fontSize: "16px", lineHeight: 1.8, color: C.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion is a <strong style={{ color: "#fff" }}>persistent, self-healing memory framework</strong> built for autonomous AI agents. It solves the fundamental problem that AI agents forget: every memory is cryptographically sealed, stored in CockroachDB, and queryable across time.
        </p>

        <p style={{ marginBottom: "20px" }}>
          Unlike traditional vector databases that store unstructured metadata, Bastion treats agent memory as a <strong style={{ color: "#fff" }}>structured, tamper-evident ledger</strong>. Every memory block links to the previous via SHA-256 hash chains — creating an immutable audit trail that satisfies EU AI Act Article 12 compliance requirements.
        </p>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,170,0,.2)" }}>How It Started</h2>

        <p style={{ marginBottom: "20px" }}>
          AI agents in production face a silent crisis: <strong style={{ color: "#fff" }}>memory corruption</strong>. Prompts containing malicious overrides or PII leaks get ingested, leading to behavioral drift. Agents forget critical context between sessions. There&apos;s no audit trail when something goes wrong.
        </p>
        <p style={{ marginBottom: "20px" }}>
          Bastion was built to fix this. We combined CockroachDB&apos;s distributed SQL with AWS Bedrock embeddings to create a memory layer that is simultaneously <strong style={{ color: "#fff" }}>durable, queryable, and cryptographically verifiable</strong>.
        </p>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,170,0,.2)" }}>The Impact</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", margin: "20px 0" }}>
          {[
            { n: "965+", l: "Memories stored in live CockroachDB", c: C.gold },
            { n: "25", l: "MCP tools for AI agent integration", c: C.cyan },
            { n: "7", l: "OWASP ASI06 guard stages", c: C.lava },
            { n: "6", l: "Consolidation pipeline stages", c: C.magma },
          ].map((s, i) => (
            <div key={i} style={{ padding: "16px", background: "rgba(255,170,0,.04)", border: "1px solid rgba(255,170,0,.15)", borderRadius: "8px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: s.c, fontFamily: "var(--font-sg)" }}>{s.n}</div>
              <div style={{ fontSize: "13px", color: C.mute, marginTop: "4px" }}>{s.l}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: "1px solid rgba(255,170,0,.2)" }}>Core Capabilities</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "SHA-256 Hash Chain", d: "Every memory block cryptographically links to the previous. Tampering breaks the chain — detected instantly.", c: C.cyan },
            { t: "AS OF SYSTEM TIME", d: "Query exactly what your agent knew at any point in time. Native CockroachDB MVCC.", c: C.gold },
            { t: "OWASP ASI06 Guard", d: "Multi-stage guard blocks prompt injection, PII, and credential leakage before DB write.", c: C.lava },
            { t: "Sleep-Time Consolidation", d: "Background daemon deduplicates, merges contradictions, prunes low-value memories.", c: C.magma },
            { t: "25 MCP Tools", d: "Claude, Cursor, VS Code — any MCP client can interact with persistent memory.", c: C.cyan },
            { t: "A2A Signed Cards", d: "Ed25519 cryptographic identity for agent-to-agent memory transfer.", c: C.gold },
          ].map((f, i) => (
            <div key={i} style={{ display: "flex", gap: "14px", padding: "14px 16px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "8px" }}>
              <div style={{ width: "4px", borderRadius: "2px", background: f.c, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.t}</div>
                <div style={{ fontSize: "13px", color: C.mute, marginTop: "2px" }}>{f.d}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: "40px", padding: "24px", background: "rgba(255,170,0,.06)", border: "1px solid rgba(255,170,0,.2)", borderRadius: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>Ready to get started?</div>
            <div style={{ fontSize: "13px", color: C.mute }}>Follow the Quick Start guide to run Bastion in 5 minutes.</div>
          </div>
          <Link href="/docs/quickstart" style={{ padding: "10px 24px", borderRadius: "6px", background: `linear-gradient(135deg,${C.lava},${C.magma})`, color: "#fff", fontSize: "13px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px" }}>
            Quick Start →
          </Link>
        </div>
      </div>
    </div>
  );
}
