"use client";

import Link from "next/link";
import { useState } from "react";

const C = { gold: "#ffc800", lava: "#ff2a00", magma: "#ff9c00", cyan: "#00e5ff", body: "#e8e2ec", mute: "#8a8290" };

function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div style={{ background: "#0a0608", border: "1px solid rgba(255,170,0,.12)", borderRadius: "8px", overflow: "hidden", margin: "16px 0", boxShadow: "0 4px 16px rgba(0,0,0,.4)" }}>
      <div style={{ padding: "8px 14px", background: "rgba(255,255,255,.03)", borderBottom: "1px solid rgba(255,255,255,.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "5px" }}>
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#28c840" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.mute }}>{lang}</span>
          <button onClick={handleCopy} style={{ background: "transparent", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "10px", color: copied ? "#4f8" : C.mute, letterSpacing: "1px" }}>
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      </div>
      <pre style={{ padding: "14px 16px", margin: 0, fontSize: "12.5px", color: "#d0c8d4", fontFamily: "var(--font-mono)", lineHeight: 1.6, overflowX: "auto" }}><code>{code}</code></pre>
    </div>
  );
}

export default function QuickStartPage() {
  return (
    <div style={{ maxWidth: "740px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.gold, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 700, marginBottom: "12px" }}>Getting Started</div>
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", margin: "0 0 24px", lineHeight: 1.1 }}>
        Quick Start <span style={{ color: C.gold }}>Guide</span>
      </h1>

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: C.body, fontFamily: "var(--font-inter)" }}>
        <p style={{ marginBottom: "20px" }}>
          Get Bastion running locally in <strong style={{ color: "#fff" }}>less than 5 minutes</strong>. You can start in <strong style={{ color: C.gold }}>mock mode</strong> (no database required) or connect to a real CockroachDB cluster.
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

        <div style={{ marginTop: "32px", padding: "20px", background: "rgba(255,170,0,.06)", border: "1px solid rgba(255,170,0,.2)", borderRadius: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>Next Steps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <Link href="/docs/architecture" style={{ color: C.gold, fontSize: "13px", textDecoration: "none" }}>→ Database Architecture</Link>
            <Link href="/docs/security" style={{ color: C.gold, fontSize: "13px", textDecoration: "none" }}>→ Security (OWASP ASI06)</Link>
            <Link href="/docs/cockroachdb" style={{ color: C.gold, fontSize: "13px", textDecoration: "none" }}>→ CockroachDB Features</Link>
            <Link href="/dashboard" style={{ color: C.gold, fontSize: "13px", textDecoration: "none" }}>→ Live Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
