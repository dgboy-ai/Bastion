"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { NextPrev } from "@/components/docs/NextPrev";

export default function SetupPage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="Deployment"
        title={<>Setup <span style={{ color: D.gold }}>Guide</span></>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Complete setup guide for deploying Bastion in production with <strong style={{ color: "#fff" }}>CockroachDB</strong>, <strong style={{ color: "#fff" }}>MCP/A2A servers</strong>, and a resilient embedding chain.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Prerequisites</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "16px 0" }}>
          {[
            "Python 3.11+",
            "CockroachDB cluster (Serverless or Dedicated)",
            "(Optional) HF_TOKEN for HuggingFace embedding API",
            "Node.js 18+ (for dashboard)",
          ].map((p, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", alignItems: "center", fontSize: "14px" }}>
              <span style={{ color: D.gold }}>✓</span> {p}
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Environment Variables</h2>
        <p style={{ marginBottom: "12px" }}>See the <Link href="/docs/configuration" style={{ color: D.gold, textDecoration: "none" }}>Configuration Reference</Link> for the full list of environment variables.</p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Start MCP Server</h2>
        <CodeBlock code={`# Mock mode
python -m bastion.mcp_server --mock

# With CockroachDB
export BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"
python -m bastion.mcp_server --transport http --port 9997`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Start A2A Server</h2>
        <CodeBlock code={`# Mock mode
python -m bastion.a2a_server

# With persistent identity
export BASTION_A2A_PRIVATE_KEY="base64-encoded-ed25519-key"
python -m bastion.a2a_server`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Start Dashboard</h2>
        <CodeBlock code={`cd dashboard
npm install
npm run dev
# Dashboard available at http://localhost:3000`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Docker Deployment</h2>
        <CodeBlock code={`git clone https://github.com/dgboy-ai/Bastion
cd Bastion
docker compose -f docker-compose.demo.yml up
# Dashboard at http://localhost:3000`} lang="bash" />

        {/* Cross-links */}
        <div style={{ marginTop: "32px", padding: "20px", background: "rgba(255,170,0,.06)", border: `1px solid ${D.borderGold}`, borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "var(--font-sg)" }}>Related</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/docs/configuration" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Configuration Reference (all env vars)</Link>
            <Link href="/docs/quickstart" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Quick Start (5-minute setup)</Link>
            <Link href="/docs/security" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Security Architecture</Link>
          </div>
        </div>
      </div>

      <NextPrev pathname="/docs/setup" />
    </div>
  );
}
