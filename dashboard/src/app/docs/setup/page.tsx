"use client";

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

export default function SetupPage() {
  return (
    <div style={{ maxWidth: "740px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.gold, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 700, marginBottom: "12px" }}>Deployment</div>
      <h1 style={{ fontSize: "clamp(32px,4vw,48px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", margin: "0 0 24px", lineHeight: 1.1 }}>
        Setup <span style={{ color: C.gold }}>Guide</span>
      </h1>

      <div style={{ fontSize: "16px", lineHeight: 1.8, color: C.body, fontFamily: "var(--font-inter)" }}>
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
              <span style={{ color: C.gold }}>✓</span> {p}
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Environment Variables</h2>
        <div style={{ background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", borderRadius: "8px", overflow: "hidden", margin: "16px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                <th style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px" }}>Variable</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px" }}>Default</th>
                <th style={{ padding: "10px 14px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px" }}>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["BASTION_CONN", "—", "CockroachDB connection string"],
                ["BASTION_MOCK", "true", "Enable mock mode (no DB)"],
                ["BASTION_API_KEY", "—", "API key for authentication"],
                ["BASTION_A2A_PRIVATE_KEY", "—", "Ed25519 key for agent signing"],
                ["HF_TOKEN", "—", "(Optional) HuggingFace token for embedding API"],
                ["BASTION_AWS_KMS_KEY_ARN", "—", "AWS KMS key ARN for encrypted memory"],
              ].map(([v, d, p], i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: C.cyan }}>{v}</td>
                  <td style={{ padding: "8px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: C.mute }}>{d}</td>
                  <td style={{ padding: "8px 14px", color: C.body }}>{p}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Start MCP Server</h2>
        <CodeBlock code={`# Mock mode\npython -m bastion.mcp_server --mock\n\n# With CockroachDB\nexport BASTION_CONN="postgresql://user:pass@host:26257/bastion?sslmode=verify-full"\npython -m bastion.mcp_server --transport http --port 9997`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Start A2A Server</h2>
        <CodeBlock code={`# Mock mode\npython -m bastion.a2a_server\n\n# With persistent identity\nexport BASTION_A2A_PRIVATE_KEY="base64-encoded-ed25519-key"\npython -m bastion.a2a_server`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Start Dashboard</h2>
        <CodeBlock code={`cd dashboard\nnpm install\nnpm run dev\n# Dashboard available at http://localhost:3000`} lang="bash" />

        <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", fontFamily: "var(--font-sg)", margin: "36px 0 12px" }}>Docker Deployment</h2>
        <CodeBlock code={`git clone https://github.com/dgboy-ai/Bastion\ncd Bastion\ndocker compose -f docker-compose.demo.yml up\n# Dashboard at http://localhost:3000`} lang="bash" />
      </div>
    </div>
  );
}
