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

/* ── Particle Network ──────────────────────────────────────── */
function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.5 + 0.3,
      o: Math.random() * 0.2 + 0.05,
      z: Math.random(),
      pulse: Math.random() * Math.PI * 2,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = 0.08 * (1 - dist / 150);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += 0.012;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        const alpha = p.o * (0.5 + p.z * 0.5);
        const size = p.r * (1 + Math.sin(p.pulse) * 0.1);

        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha * 0.1})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={canvasRef}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
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
      padding: scrolled ? "14px 48px" : "22px 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(10,10,10,0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(24px) saturate(1.4)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "14px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "10px",
          background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 24px rgba(0,229,255,0.35)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="2.5" fill="#fff" />
          </svg>
        </div>
        <span style={{ fontWeight: 800, fontSize: "18px", letterSpacing: "3px", color: "#fff", textTransform: "uppercase" }}>
          BASTION
        </span>
      </Link>
      <div style={{ display: "flex", gap: "40px", alignItems: "center" }}>
        {[
          { href: "/", label: "Home" },
          { href: "/dashboard", label: "Dashboard" },
          { href: "/docs", label: "Docs" },
          { href: "/contact", label: "Contact" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="hover-underline" style={{
            color: l.href === "/docs" ? "#fff" : "#9ca3af",
            fontSize: "14px", textDecoration: "none", fontWeight: 500,
          }}>
            {l.label}
          </Link>
        ))}
        <Link href="/dashboard" className="glow-btn" style={{
          padding: "12px 32px", borderRadius: "9999px",
          border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
          color: "#fff", fontSize: "14px", fontWeight: 500, textDecoration: "none",
        }}>
          Launch Dashboard
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
      <ParticleNetwork />
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
      </div>

      <style>{`
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; pointer-events: none; }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(0,229,255,0.15); }
          50% { box-shadow: 0 0 40px rgba(0,229,255,0.3); }
        }
        @keyframes skeletonShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .skeleton {
          background: linear-gradient(90deg, #0c1018 25%, #1a1f2e 50%, #0c1018 75%);
          background-size: 200% 100%;
          animation: skeletonShimmer 1.5s ease-in-out infinite;
          border-radius: 8px;
        }
        .skeleton-text { height: 14px; border-radius: 4px; }
        .skeleton-title { height: 28px; border-radius: 6px; }
        .skeleton-card { border-radius: 16px; border: 1px solid rgba(255,255,255,0.06); }
        @keyframes sectionFadeIn {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }
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
        .glow-card::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, rgba(0,229,255,0.15), rgba(124,58,237,0.15)); opacity: 0; transition: opacity 0.4s ease; z-index: -1; filter: blur(8px); }
        .glow-card:hover::before { opacity: 1; }
        .glow-card:hover { transform: translateY(-4px); border-color: rgba(0,229,255,0.2); }
        .glow-card:hover h3 { color: #00e5ff; }
        .icon-glow:hover { background: rgba(0,229,255,0.08) !important; border-color: rgba(0,229,255,0.2) !important; box-shadow: 0 0 20px rgba(0,229,255,0.2); transform: scale(1.05); }
        .glow-btn { position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .glow-btn::after { content: ''; position: absolute; inset: -2px; border-radius: inherit; background: linear-gradient(135deg, #00e5ff, #7c3aed); opacity: 0; filter: blur(12px); transition: opacity 0.3s ease; z-index: -1; }
        .glow-btn:hover::after { opacity: 0.4; }
        .glow-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,229,255,0.25); }
        .hover-underline { position: relative; transition: color 0.2s ease; }
        .hover-underline::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 1px; background: #00e5ff; transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .hover-underline:hover::after { width: 100%; }
        @media (max-width: 768px) { .nav-links { display: none !important; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }
      `}</style>
    </>
  );
}
