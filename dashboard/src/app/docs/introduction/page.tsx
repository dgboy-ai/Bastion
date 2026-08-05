"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { FeatureCard } from "@/components/docs/FeatureCard";
import { NextPrev } from "@/components/docs/NextPrev";

export default function IntroductionPage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="Fortress-Grade Memory"
        title={<>What is <span style={{ color: D.gold }}>Bastion</span>?</>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Bastion is a <strong style={{ color: "#fff" }}>persistent, self-healing memory framework</strong> built for autonomous AI agents. It solves the fundamental problem that AI agents forget: every memory is cryptographically sealed, stored in CockroachDB, and queryable across time.
        </p>

        <p style={{ marginBottom: "20px" }}>
          Unlike traditional vector databases that store unstructured metadata, Bastion treats agent memory as a <strong style={{ color: "#fff" }}>structured, tamper-evident ledger</strong>. Every memory block links to the previous via SHA-256 hash chains — creating an immutable audit trail that satisfies EU AI Act Article 12 compliance requirements.
        </p>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>How It Started</h2>

        <p style={{ marginBottom: "20px" }}>
          AI agents in production face a silent crisis: <strong style={{ color: "#fff" }}>memory corruption</strong>. Prompts containing malicious overrides or PII leaks get ingested, leading to behavioral drift. Agents forget critical context between sessions. There&apos;s no audit trail when something goes wrong.
        </p>
        <p style={{ marginBottom: "20px" }}>
          Bastion was built to fix this. We combined CockroachDB&apos;s distributed SQL with a resilient 1024-dim embedding pipeline (HuggingFace → local MiniLM → hash fallback) to create a memory layer that is simultaneously <strong style={{ color: "#fff" }}>durable, queryable, and cryptographically verifiable</strong>.
        </p>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>The Impact</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", margin: "20px 0" }} className="intro-stats">
          {[
            { n: "965+", l: "Memories stored in live CockroachDB", c: D.gold },
            { n: "35", l: "MCP tools for AI agent integration", c: D.cyan },
            { n: "7", l: "OWASP ASI06 guard stages", c: D.lava },
            { n: "6", l: "Consolidation pipeline stages", c: D.magma },
          ].map((s, i) => (
            <div key={i} style={{ padding: "16px", background: "rgba(255,170,0,.04)", border: `1px solid ${D.borderGold}`, borderRadius: "8px" }}>
              <div style={{ fontSize: "28px", fontWeight: 900, color: s.c, fontFamily: "var(--font-sg)" }}>{s.n}</div>
              <div style={{ fontSize: "13px", color: D.mute, marginTop: "4px" }}>{s.l}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Core Capabilities</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
          {[
            { t: "SHA-256 Hash Chain", d: "Every memory block cryptographically links to the previous. Tampering breaks the chain — detected instantly.", c: D.cyan },
            { t: "AS OF SYSTEM TIME", d: "Query exactly what your agent knew at any point in time. Native CockroachDB MVCC.", c: D.gold },
            { t: "OWASP ASI06 Guard", d: "Multi-stage guard blocks prompt injection, PII, and credential leakage before DB write.", c: D.lava },
            { t: "Sleep-Time Consolidation", d: "Background daemon deduplicates, merges contradictions, prunes low-value memories.", c: D.magma },
            { t: "35 MCP Tools", d: "Claude, Cursor, VS Code — any MCP client can interact with persistent memory.", c: D.cyan },
            { t: "A2A Signed Cards", d: "Ed25519 cryptographic identity for agent-to-agent memory transfer.", c: D.gold },
          ].map((f, i) => (
            <FeatureCard key={i} title={f.t} description={f.d} color={f.c} />
          ))}
        </div>

        <h2 style={{ fontSize: "24px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "40px 0 16px", paddingBottom: "12px", borderBottom: `1px solid ${D.borderGold}` }}>Documentation</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", margin: "20px 0" }}>
          {[
            { href: "/docs/quickstart", title: "Quick Start", desc: "Get running in 5 minutes", icon: "⚡" },
            { href: "/docs/architecture", title: "Architecture", desc: "System design & pipeline", icon: "🏗️" },
            { href: "/docs/memory-architecture", title: "Memory System", desc: "3-tier: STM / LTM / Forensic", icon: "🧠" },
            { href: "/docs/security", title: "Security", desc: "OWASP ASI06 & cryptographic integrity", icon: "🛡️" },
            { href: "/docs/cockroachdb", title: "CockroachDB", desc: "Database features & queries", icon: "🦎" },
            { href: "/docs/configuration", title: "Configuration", desc: "All env vars & settings", icon: "⚙️" },
          ].map((l) => (
            <Link key={l.href} href={l.href} style={{
              display: "flex",
              gap: "14px",
              padding: "16px",
              background: D.card,
              border: `1px solid ${D.border}`,
              borderRadius: "8px",
              textDecoration: "none",
              transition: "all .2s",
            }}
            className="doc-link"
            >
              <span style={{ fontSize: "20px" }}>{l.icon}</span>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: D.gold, fontFamily: "var(--font-sg)" }}>{l.title}</div>
                <div style={{ fontSize: "12px", color: D.mute, marginTop: "2px" }}>{l.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          marginTop: "40px",
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
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>Ready to get started?</div>
            <div style={{ fontSize: "13px", color: D.mute }}>Follow the Quick Start guide to run Bastion in 5 minutes.</div>
          </div>
          <Link href="/docs/quickstart" style={{
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
            Quick Start →
          </Link>
        </div>
      </div>

      <NextPrev pathname="/docs/introduction" />
      <style>{`.doc-link:hover { border-color: ${D.gold}40 !important; background: rgba(255,200,0,.04) !important; } .intro-stats { grid-template-columns: 1fr 1fr; } @media(max-width:560px){ .intro-stats { grid-template-columns: 1fr; } }`}</style>
    </div>
  );
}
