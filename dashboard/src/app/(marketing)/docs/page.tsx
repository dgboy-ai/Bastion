"use client";

import Link from "next/link";

const docs = [
  { title: "Quick Start", desc: "Get Bastion running in 5 minutes with mock mode.", href: "#quickstart" },
  { title: "MCP Server", desc: "22 tools, 4 resources, 3 prompts. Full protocol implementation.", href: "#mcp" },
  { title: "Memory Architecture", desc: "How CockroachDB powers vector search, time-travel, and hash chains.", href: "#architecture" },
  { title: "A2A Protocol", desc: "Agent-to-agent coordination with Ed25519 signed cards.", href: "#a2a" },
  { title: "LTM Gateway", desc: "Memory reuse before expensive workflows.", href: "#ltm" },
  { title: "Dreaming", desc: "Sleep-time memory consolidation.", href: "#dreaming" },
  { title: "Multi-Signal Retrieval", desc: "BM25 + Vector + Entity + Temporal fusion.", href: "#retrieval" },
  { title: "Auto-Contradiction", desc: "Detect and resolve conflicting memories.", href: "#contradiction" },
  { title: "Security", desc: "OAuth 2.1, RLS, KMS, OWASP ASI06 guard.", href: "#security" },
  { title: "API Reference", desc: "All 22 MCP tools documented.", href: "#api" },
];

export default function DocsPage() {
  return (
    <div style={{ padding: "120px 48px", maxWidth: "1200px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#7d8187", fontSize: "13px", textDecoration: "none" }}>← Back to Home</Link>
      <h1 style={{ fontSize: "48px", fontWeight: 400, letterSpacing: "-1.2px", color: "#fff", marginTop: "24px", marginBottom: "48px" }}>
        Documentation
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
        {docs.map((d) => (
          <a key={d.title} href={d.href} style={{
            background: "#191919", border: "1px solid #212327", borderRadius: "8px",
            padding: "24px", textDecoration: "none", transition: "border-color 0.2s",
          }}>
            <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>{d.title}</h3>
            <p style={{ fontSize: "13px", color: "#7d8187" }}>{d.desc}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
