"use client";

import Link from "next/link";
import { D } from "@/components/docs/theme";
import { PageHeader } from "@/components/docs/PageHeader";
import { CodeBlock } from "@/components/docs/CodeBlock";
import { NextPrev } from "@/components/docs/NextPrev";

export default function QuickStartPage() {
  return (
    <div style={{ maxWidth: "780px" }}>
      <PageHeader
        eyebrow="Getting Started"
        title={<>Quick Start <span style={{ color: D.gold }}>Guide</span></>}
      />

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: D.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Get Bastion running locally in <strong style={{ color: "#fff" }}>less than 5 minutes</strong>. You can start in <strong style={{ color: D.gold }}>mock mode</strong> (no database required) or connect to a real CockroachDB cluster.
        </p>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>1. Install</h2>
        <p style={{ marginBottom: "12px" }}>Install the Bastion memory library:</p>
        <CodeBlock code="pip install bastion-memory" lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>2. Mock Mode (No Database)</h2>
        <p style={{ marginBottom: "12px" }}>Test immediately with in-memory storage:</p>
        <CodeBlock code={`python -c "from bastion import BastionMemory; mem = BastionMemory('test', mock=True); mem.store('fact', 'Hello Bastion'); results = mem.search('Hello'); print(f'Found {len(results)} memories')"`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>3. Real CockroachDB</h2>
        <p style={{ marginBottom: "12px" }}>Connect to a CockroachDB cluster:</p>
        <CodeBlock code={`export BASTION_CONN="postgresql://user:pass@host:26257/bastion_db?sslmode=verify-full"\npython -m bastion.mcp_server --transport http --port 9997`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>4. MCP Client Setup</h2>
        <p style={{ marginBottom: "12px" }}>Connect from Claude Desktop, Cursor, or VS Code:</p>
        <CodeBlock code={`{\n  "mcpServers": {\n    "bastion": {\n      "command": "python",\n      "args": ["-m", "bastion.mcp_server", "--mock"],\n      "env": { "BASTION_MOCK": "true" }\n    }\n  }\n}`} lang="json" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>5. Dashboard</h2>
        <p style={{ marginBottom: "12px" }}>Launch the live dashboard to see memories, graphs, and audit trails:</p>
        <CodeBlock code={`cd dashboard\nnpm install\nnpm run dev`} lang="bash" />

        <div style={{ marginTop: "32px", padding: "20px", background: "rgba(255,170,0,.06)", border: `1px solid ${D.borderGold}`, borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "var(--font-sg)" }}>Next Steps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/docs/architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Database Architecture</Link>
            <Link href="/docs/memory-architecture" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Memory System (3-Tier)</Link>
            <Link href="/docs/security" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Security (OWASP ASI06)</Link>
            <Link href="/docs/configuration" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Configuration Reference</Link>
            <Link href="/playground" style={{ color: D.gold, fontSize: "13px", textDecoration: "none" }}>→ Enter Live Demo</Link>
          </div>
        </div>
      </div>

      <NextPrev pathname="/docs/quickstart" />
    </div>
  );
}
