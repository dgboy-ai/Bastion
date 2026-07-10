"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

const docs = [
  { icon: "⚡", title: "Quick Start", desc: "Get Bastion running in 5 minutes with mock mode.", color: "#00e5ff" },
  { icon: "🔧", title: "MCP Server", desc: "22 tools, 4 resources, 3 prompts. Full protocol implementation.", color: "#7c3aed" },
  { icon: "🗄️", title: "Memory Architecture", desc: "How CockroachDB powers vector search, time-travel, and hash chains.", color: "#00ff88" },
  { icon: "🤝", title: "A2A Protocol", desc: "Agent-to-agent coordination with Ed25519 signed cards.", color: "#a78bfa" },
  { icon: "🔄", title: "LTM Gateway", desc: "Memory reuse before expensive workflows.", color: "#00e5ff" },
  { icon: "💤", title: "Dreaming", desc: "Sleep-time memory consolidation.", color: "#c084fc" },
  { icon: "🔍", title: "Multi-Signal Retrieval", desc: "BM25 + Vector + Entity + Temporal fusion.", color: "#f472b6" },
  { icon: "⚡", title: "Auto-Contradiction", desc: "Detect and resolve conflicting memories.", color: "#ff7a17" },
  { icon: "🛡️", title: "Security", desc: "OAuth 2.1, RLS, KMS, OWASP ASI06 guard.", color: "#00ff88" },
  { icon: "📡", title: "API Reference", desc: "All 22 MCP tools documented.", color: "#00e5ff" },
];

export default function DocsPage() {
  const { ref, visible } = useInView(0.05);
  return (
    <div ref={ref} style={{ padding: "120px 48px", maxWidth: "1200px", margin: "0 auto" }}>
      <Link href="/" style={{ color: "#6b7280", fontSize: "13px", textDecoration: "none" }} className="hover-underline">
        ← Back to Home
      </Link>
      <div style={{
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginTop: "24px", marginBottom: "16px",
        }}>Documentation</div>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, letterSpacing: "-1.5px", color: "#fff", marginBottom: "64px" }}>
          Learn Bastion<span style={{ color: "#00e5ff" }}>.</span>
        </h1>
      </div>

      <div className="stagger-children" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px",
      }}>
        {docs.map((d, i) => (
          <a key={d.title} href="#" className="card-interactive" style={{
            background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px",
            padding: "28px", textDecoration: "none", display: "flex", gap: "16px", alignItems: "flex-start",
          }}>
            <div style={{
              width: "40px", height: "40px", borderRadius: "10px", flexShrink: 0,
              background: `${d.color}11`, border: `1px solid ${d.color}22`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
            }}>{d.icon}</div>
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#fff", marginBottom: "6px" }}>{d.title}</h3>
              <p style={{ fontSize: "13px", lineHeight: "1.6", color: "#6b7280" }}>{d.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
