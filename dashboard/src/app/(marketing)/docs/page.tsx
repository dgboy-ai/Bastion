"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";

/* ── Intersection Observer Hook ──────────────────────────────── */
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ── Fire Ember Particles ───────────────────────────────────── */
function FireEmbers() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);

    const embers = Array.from({ length: 80 }, () => ({
      x: Math.random() * w, y: h + Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -(Math.random() * 1.2 + 0.4),
      size: Math.random() * 2.5 + 0.8,
      life: Math.random(),
      decay: Math.random() * 0.006 + 0.002,
      color: Math.random() > 0.3 ? "#ff4500" : Math.random() > 0.5 ? "#ff8c00" : "#9c27b0",
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        e.x += e.vx + Math.sin(e.life * 4) * 0.2;
        e.y += e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -20) { e.x = Math.random() * w; e.y = h + Math.random() * 50; e.life = 1; }
        const alpha = e.life * 0.7;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = e.color === "#9c27b0" ? `rgba(156,39,176,${alpha * 0.06})` : `rgba(255,69,0,${alpha * 0.08})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = e.color === "#9c27b0" ? `rgba(206,147,216,${alpha})` : `rgba(255,200,100,${alpha})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ── Skeleton Loader ──────────────────────────────────────── */
function SkeletonLoader() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 800);
    return () => clearTimeout(timer);
  }, []);
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200, background: "#0a0a0a",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: "20px", padding: "48px",
      animation: "fadeOut 0.4s ease forwards 0.4s",
    }}>
      <div className="skeleton skeleton-title" style={{ width: "180px" }} />
      <div className="skeleton skeleton-text" style={{ width: "260px" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginTop: "32px", width: "100%", maxWidth: "800px" }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-card" style={{ height: "120px" }} />
        ))}
      </div>
    </div>
  );
}

/* ── Docs Data ──────────────────────────────────────────────── */
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

/* ── Navbar ──────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: scrolled ? "12px 48px" : "20px 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(10,5,16,0.95)" : "transparent",
      backdropFilter: scrolled ? "blur(24px) saturate(1.5)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,69,0,0.12)" : "1px solid transparent",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "38px", height: "38px", borderRadius: "8px",
          background: "linear-gradient(135deg, #ff4500, #9c27b0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 24px rgba(255,69,0,0.5)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="2.5" fill="#fff" />
          </svg>
        </div>
        <span style={{ fontWeight: 900, fontSize: "18px", letterSpacing: "4px", color: "#fff", textTransform: "uppercase" }}>
          BASTION
        </span>
      </Link>
      <div style={{ display: "flex", gap: "36px", alignItems: "center" }}>
        {[
          { href: "/", label: "Home" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/docs", label: "Docs" },
          { href: "/contact", label: "Contact" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="nav-link" style={{
            color: l.href === "/docs" ? "#ff6b35" : "#9a8e7f",
            fontSize: "14px", textDecoration: "none", fontWeight: 500,
          }}>
            {l.label}
          </Link>
        ))}
        <Link href="/dashboard" className="btn-lava" style={{
          padding: "12px 28px", borderRadius: "4px",
          background: "linear-gradient(135deg, #ff4500, #ff8c00)",
          color: "#fff", fontSize: "14px", fontWeight: 700, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1px",
          boxShadow: "0 0 20px rgba(255,69,0,0.4)",
        }}>
          Launch
        </Link>
      </div>
    </nav>
  );
}

/* ── Page ──────────────────────────────────────────────────── */
export default function DocsPage() {
  const { ref, visible } = useInView(0.05);
  return (
    <>
      <SkeletonLoader />
      <FireEmbers />
      <Navbar />

      <div ref={ref} style={{ padding: "160px 48px 120px", maxWidth: "1200px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        <Link href="/" style={{ color: "#6b7280", fontSize: "13px", textDecoration: "none" }} className="hover-underline">
          ← Back to Home
        </Link>
        <div style={{
          opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
          transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280",
            marginTop: "24px", marginBottom: "16px",
          }}>Documentation</div>
          <h1 style={{
            fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, letterSpacing: "-2px",
            color: "#fff", marginBottom: "16px",
          }}>
            Learn Bastion<span style={{ color: "#00e5ff" }}>.</span>
          </h1>
          <p style={{ fontSize: "17px", color: "#9ca3af", marginBottom: "72px", maxWidth: "560px" }}>
            Everything you need to integrate, deploy, and scale with Bastion's memory infrastructure.
          </p>
        </div>

        <div className="stagger-children" style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px",
        }}>
          {docs.map((d, i) => (
            <a key={d.title} href="#" className="glow-card" style={{
              background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", padding: "32px", textDecoration: "none",
              display: "flex", gap: "18px", alignItems: "flex-start",
            }}>
              <div className="icon-glow" style={{
                width: "44px", height: "44px", borderRadius: "12px", flexShrink: 0,
                background: `${d.color}11`, border: `1px solid ${d.color}22`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "20px", transition: "all 0.3s ease",
              }}>{d.icon}</div>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>{d.title}</h3>
                <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#9ca3af" }}>{d.desc}</p>
              </div>
            </a>
          ))}
        </div>

        {/* Quick Start Section */}
        <div style={{ marginTop: "120px" }}>
          <div style={{ marginBottom: "48px" }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginBottom: "16px",
            }}>Quick Start</div>
            <h2 style={{
              fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-1.5px",
              color: "#fff", marginBottom: "16px",
            }}>
              Up and running in<span style={{ color: "#00ff88" }}> 5 minutes.</span>
            </h2>
            <p style={{ fontSize: "16px", color: "#9ca3af", maxWidth: "600px" }}>
              Follow these steps to get Bastion running with your agent framework.
            </p>
          </div>

          {/* Code Block */}
          <div style={{
            background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px", overflow: "hidden", marginBottom: "32px",
          }}>
            <div style={{
              padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", gap: "8px" }}>
                <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#ff5f57" }} />
                <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#febc2e" }} />
                <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: "#28c840" }} />
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#6b7280" }}>terminal</span>
            </div>
            <pre style={{
              padding: "24px", margin: 0, fontFamily: "'JetBrains Mono', monospace",
              fontSize: "14px", lineHeight: "1.8", color: "#c8ccd4", overflow: "auto",
            }}>
{`# Install Bastion
npm install @bastion/memory

# Initialize with mock mode (no database required)
npx bastion init --mock

# Or connect to CockroachDB
npx bastion init --conn "postgresql://user:pass@host:26257/bastion"`}
            </pre>
          </div>

          {/* Steps */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
            {[
              { num: "1", title: "Install", desc: "npm install @bastion/memory", color: "#00e5ff" },
              { num: "2", title: "Configure", desc: "Set BASTION_CONN in .env.local", color: "#7c3aed" },
              { num: "3", title: "Deploy", desc: "Run npx bastion serve", color: "#00ff88" },
            ].map((step, i) => (
              <div key={i} className="glow-card" style={{
                background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px", padding: "28px", textAlign: "center",
              }}>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "50%",
                  background: `${step.color}15`, border: `1px solid ${step.color}30`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px", fontSize: "18px", fontWeight: 700, color: step.color,
                }}>{step.num}</div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>{step.title}</h3>
                <p style={{ fontSize: "13px", color: "#9ca3af", fontFamily: "'JetBrains Mono', monospace" }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* API Reference Section */}
        <div style={{ marginTop: "120px" }}>
          <div style={{ marginBottom: "48px" }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginBottom: "16px",
            }}>API Reference</div>
            <h2 style={{
              fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-1.5px",
              color: "#fff", marginBottom: "16px",
            }}>
              All 22 MCP<span style={{ color: "#7c3aed" }}> tools.</span>
            </h2>
            <p style={{ fontSize: "16px", color: "#9ca3af", maxWidth: "600px" }}>
              Complete API reference for every tool, resource, and prompt in the Bastion MCP server.
            </p>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px",
          }}>
            {[
              { name: "memory_store", desc: "Store a new memory with vector embedding", method: "POST" },
              { name: "memory_recall", desc: "Multi-signal retrieval with BM25 + Vector", method: "POST" },
              { name: "memory_travel", desc: "Time-travel query to any past state", method: "POST" },
              { name: "memory_verify", desc: "Cryptographic integrity verification", method: "POST" },
              { name: "entity_create", desc: "Create a new entity node", method: "POST" },
              { name: "entity_link", desc: "Link entities with typed relations", method: "POST" },
              { name: "graph_query", desc: "Traverse the knowledge graph", method: "POST" },
              { name: "audit_log", desc: "Query the immutable audit trail", method: "GET" },
            ].map((api, i) => (
              <div key={i} style={{
                background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "12px", padding: "20px",
                display: "flex", alignItems: "center", gap: "16px",
              }}>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
                  padding: "4px 8px", borderRadius: "4px",
                  background: api.method === "POST" ? "rgba(0,229,255,0.1)" : "rgba(0,255,136,0.1)",
                  color: api.method === "POST" ? "#00e5ff" : "#00ff88",
                  fontWeight: 600,
                }}>{api.method}</span>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", color: "#fff", fontWeight: 600, marginBottom: "4px" }}>{api.name}</div>
                  <div style={{ fontSize: "12px", color: "#6b7280" }}>{api.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Architecture Section */}
        <div style={{ marginTop: "120px" }}>
          <div style={{ marginBottom: "48px" }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginBottom: "16px",
            }}>Architecture</div>
            <h2 style={{
              fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 500, letterSpacing: "-1.5px",
              color: "#fff", marginBottom: "16px",
            }}>
              Built for<span style={{ color: "#ff7a17" }}> scale.</span>
            </h2>
            <p style={{ fontSize: "16px", color: "#9ca3af", maxWidth: "600px" }}>
              Understanding how Bastion's memory infrastructure works under the hood.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
            {[
              { title: "CockroachDB MVCC", desc: "Multi-version concurrency control enables time-travel queries and conflict-free replication across regions.", color: "#00e5ff" },
              { title: "C-SPANN Index", desc: "Consensus vector index for sub-millisecond similarity search across billions of dimensions.", color: "#7c3aed" },
              { title: "SHA-256 Hash Chains", desc: "Every memory is cryptographically linked to its predecessor, creating an immutable audit trail.", color: "#00ff88" },
              { title: "Merkle Tree Verification", desc: "Batch verification of memory integrity without checking every individual hash.", color: "#ff7a17" },
            ].map((arch, i) => (
              <div key={i} className="glow-card" style={{
                background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px", padding: "32px",
              }}>
                <div style={{ width: "40px", height: "3px", background: arch.color, marginBottom: "20px", borderRadius: "2px" }} />
                <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>{arch.title}</h3>
                <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#9ca3af" }}>{arch.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: "120px", paddingTop: "48px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: "14px", color: "#6b7280" }}>
            Need help? <Link href="/contact" style={{ color: "#00e5ff", textDecoration: "none" }}>Contact support</Link>
          </div>
          <div style={{ display: "flex", gap: "24px" }}>
            <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer" style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none" }}>GitHub</a>
            <Link href="/dashboard" style={{ fontSize: "14px", color: "#6b7280", textDecoration: "none" }}>Dashboard</Link>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { background: #0a0510; }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(255,69,0,0.3); } 50% { box-shadow: 0 0 40px rgba(255,69,0,0.6); } }
        @keyframes skeletonShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg, #0c1018 25%, #1a1f2e 50%, #0c1018 75%); background-size: 200% 100%; animation: skeletonShimmer 1.5s ease-in-out infinite; border-radius: 8px; }
        .skeleton-text { height: 14px; border-radius: 4px; }
        .skeleton-title { height: 28px; border-radius: 6px; }
        .skeleton-card { border-radius: 8px; border: 1px solid rgba(255,69,0,0.12); }
        @keyframes sectionFadeIn { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .stagger-children > * { opacity: 0; animation: sectionFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .stagger-children > *:nth-child(1) { animation-delay: 0ms; }
        .stagger-children > *:nth-child(2) { animation-delay: 60ms; }
        .stagger-children > *:nth-child(3) { animation-delay: 120ms; }
        .stagger-children > *:nth-child(4) { animation-delay: 180ms; }
        .stagger-children > *:nth-child(5) { animation-delay: 240ms; }
        .stagger-children > *:nth-child(6) { animation-delay: 300ms; }
        .stagger-children > *:nth-child(7) { animation-delay: 360ms; }
        .stagger-children > *:nth-child(8) { animation-delay: 420ms; }
        .stagger-children > *:nth-child(9) { animation-delay: 480ms; }
        .stagger-children > *:nth-child(10) { animation-delay: 540ms; }
        .glow-card { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; }
        .glow-card::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, rgba(255,69,0,0.25), rgba(156,39,176,0.20), rgba(79,195,247,0.15)); opacity: 0; transition: opacity 0.4s ease; z-index: -1; filter: blur(10px); }
        .glow-card:hover::before { opacity: 1; }
        .glow-card:hover { transform: translateY(-6px); border-color: rgba(255,69,0,0.3) !important; box-shadow: 0 20px 60px rgba(255,69,0,0.15); }
        .glow-card:hover h3 { color: #ff6b35 !important; }
        .icon-glow:hover { background: rgba(255,69,0,0.12) !important; border-color: rgba(255,69,0,0.25) !important; box-shadow: 0 0 20px rgba(255,69,0,0.3); transform: scale(1.05); }
        .btn-lava { position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
        .btn-lava::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transform: translateX(-100%); transition: transform 0.5s ease; }
        .btn-lava:hover::before { transform: translateX(100%); }
        .btn-lava:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(255,69,0,0.5), 0 0 80px rgba(255,69,0,0.2); }
        .btn-lava:active { transform: scale(0.97); }
        .nav-link { position: relative; transition: color 0.2s ease; }
        .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 2px; background: #ff4500; transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 8px rgba(255,69,0,0.6); }
        .nav-link:hover { color: #ff6b35 !important; }
        .nav-link:hover::after { width: 100%; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
      `}</style>
    </>
  );
}
