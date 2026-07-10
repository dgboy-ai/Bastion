"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

/* ── xAI-Inspired Design System ──────────────────────────────── */
const C = {
  canvas: "#0a0a0a",
  canvasSoft: "#1a1c20",
  card: "#191919",
  hairline: "#212327",
  ink: "#ffffff",
  body: "#dadbdf",
  mute: "#7d8187",
  sunset: "#ff7a17",
  dusk: "#7c3aed",
  breeze: "#a0c3ec",
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
  { href: "/contact", label: "Contact" },
];

/* ── Floating Particles (3D depth) ──────────────────────────── */
function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      o: Math.random() * 0.3 + 0.05,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${p.o})`;
        ctx.fill();
      }
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ── Navbar ──────────────────────────────────────────────────── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "space-between",
      background: scrolled ? "rgba(10,10,10,0.92)" : "transparent",
      backdropFilter: scrolled ? "blur(16px)" : "none",
      borderBottom: scrolled ? "1px solid #212327" : "1px solid transparent",
      transition: "all 0.3s ease",
    }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#00e5ff" strokeWidth="2" />
          <circle cx="12" cy="12" r="2.5" fill="#00e5ff" />
        </svg>
        <span style={{ fontWeight: 700, fontSize: "18px", letterSpacing: "2px", color: "#fff", textTransform: "uppercase" }}>Bastion</span>
      </Link>
      <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
        {navLinks.map((l) => (
          <Link key={l.href} href={l.href} style={{
            color: l.href === "/" ? "#fff" : "#7d8187",
            fontSize: "14px", textDecoration: "none", transition: "color 0.2s",
          }}>
            {l.label}
          </Link>
        ))}
        <Link href="/dashboard" style={{
          padding: "8px 24px", borderRadius: "9999px", border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff", fontSize: "14px", textDecoration: "none", transition: "all 0.2s",
        }}>
          Open Dashboard
        </Link>
      </div>
    </nav>
  );
}

/* ── Hero ────────────────────────────────────────────────────── */
function Hero() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 100); }, []);
  return (
    <section style={{
      minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center",
      alignItems: "center", textAlign: "center", padding: "120px 48px 80px", position: "relative", zIndex: 1,
    }}>
      <div style={{
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "3px", color: "#7d8187", marginBottom: "24px",
        }}>
          Agentic Memory Infrastructure
        </div>
        <h1 style={{
          fontSize: "clamp(48px, 8vw, 96px)", fontWeight: 400, lineHeight: "1",
          letterSpacing: "-2.4px", color: "#fff", marginBottom: "32px",
          maxWidth: "900px",
        }}>
          The system of record
          <br />
          <span style={{ color: "#00e5ff" }}>for autonomous AI</span>
        </h1>
        <p style={{
          fontSize: "18px", lineHeight: "1.7", color: "#dadbdf",
          maxWidth: "600px", margin: "0 auto 48px",
        }}>
          Persistent, self-healing memory that survives serverless crashes,
          scales across regions, and never lets your agents forget.
          Built on CockroachDB. Deployed on AWS.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
          <Link href="/dashboard" style={{
            padding: "14px 32px", borderRadius: "9999px", background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 500, textDecoration: "none", transition: "all 0.2s",
          }}>
            Launch Dashboard →
          </Link>
          <Link href="/docs" style={{
            padding: "14px 32px", borderRadius: "9999px", border: "1px solid rgba(255,255,255,0.25)",
            color: "#fff", fontSize: "15px", textDecoration: "none", transition: "all 0.2s",
          }}>
            Read Documentation
          </Link>
        </div>
      </div>

      {/* Floating 3D Stats */}
      <div style={{
        display: "flex", gap: "48px", marginTop: "80px", opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.3s",
      }}>
        {[
          { value: "1,058", label: "Tests Passing" },
          { value: "22", label: "MCP Tools" },
          { value: "4/4", label: "CRDB Tools" },
          { value: "5/5", label: "AWS Services" },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "32px", fontWeight: 700, color: "#00e5ff" }}>{s.value}</div>
            <div style={{ fontSize: "12px", color: "#7d8187", textTransform: "uppercase", letterSpacing: "1px" }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Features ────────────────────────────────────────────────── */
const features = [
  { icon: "🔐", title: "Cryptographic Integrity", desc: "SHA-256 hash chains with Merkle tree verification. Every memory is tamper-evident." },
  { icon: "⏱️", title: "Time-Travel Queries", desc: "AS OF SYSTEM TIME — restore any memory to any past state. CockroachDB MVCC native." },
  { icon: "🌍", title: "Multi-Region Distributed", desc: "Globally distributed via CockroachDB. Memory stored in EU, retrieved from US in 12ms." },
  { icon: "🧠", title: "Auto-Contradiction Detection", desc: "When new facts contradict old ones, Bastion auto-supersedes. No competitor has this." },
  { icon: "💤", title: "Sleep-Time Dreaming", desc: "Agents learn during idle time. Episodic memories consolidate into semantic knowledge." },
  { icon: "🔄", title: "LTM Gateway", desc: "Check if a similar analysis exists before running expensive workflows. Saves tokens." },
  { icon: "🔍", title: "Multi-Signal Retrieval", desc: "BM25 + Vector + Entity + Temporal fusion. 100% recall on test benchmarks." },
  { icon: "🛡️", title: "OWASP ASI06 Guard", desc: "Real-time prompt injection detection, PII firewall, multi-language scanning." },
];

function Features() {
  return (
    <section style={{ padding: "120px 48px", position: "relative", zIndex: 1 }}>
      <div style={{ textAlign: "center", marginBottom: "64px" }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "3px", color: "#7d8187", marginBottom: "16px",
        }}>
          Architecture
        </div>
        <h2 style={{ fontSize: "48px", fontWeight: 400, letterSpacing: "-1.2px", color: "#fff" }}>
          Built for production, not demos
        </h2>
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "24px", maxWidth: "1200px", margin: "0 auto",
      }}>
        {features.map((f, i) => (
          <div key={i} style={{
            background: "#191919", border: "1px solid #212327", borderRadius: "8px",
            padding: "32px", transition: "border-color 0.2s, box-shadow 0.2s",
          }}>
            <div style={{ fontSize: "32px", marginBottom: "16px" }}>{f.icon}</div>
            <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#fff", marginBottom: "8px" }}>{f.title}</h3>
            <p style={{ fontSize: "14px", lineHeight: "1.6", color: "#7d8187" }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Benchmark ───────────────────────────────────────────────── */
function Benchmark() {
  return (
    <section style={{ padding: "120px 48px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "3px", color: "#7d8187", marginBottom: "16px",
          }}>
            Benchmarks
          </div>
          <h2 style={{ fontSize: "48px", fontWeight: 400, letterSpacing: "-1.2px", color: "#fff" }}>
            Numbers that matter
          </h2>
        </div>

        <div style={{ background: "#191919", border: "1px solid #212327", borderRadius: "8px", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #212327" }}>
                {["System", "Recall@5", "Latency", "Cost/Year", "Multi-Region"].map((h) => (
                  <th key={h} style={{
                    padding: "16px 20px", textAlign: "left", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px", color: "#7d8187",
                    fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Bastion", recall: "100%", latency: "0.4ms", cost: "$0", region: "✅ Global", highlight: true },
                { name: "agentmemory", recall: "95.2%", latency: "~200ms", cost: "~$10", region: "❌ Local" },
                { name: "Mem0", recall: "94.4%", latency: "~200ms", cost: "~$6,000", region: "❌ Single" },
                { name: "Cognee", recall: "~90%", latency: "Unknown", cost: "$0", region: "❌ Single" },
              ].map((r, i) => (
                <tr key={i} style={{
                  borderTop: "1px solid #212327",
                  background: r.highlight ? "rgba(0, 229, 255, 0.04)" : "transparent",
                }}>
                  <td style={{ padding: "16px 20px", fontWeight: 600, color: r.highlight ? "#00e5ff" : "#fff" }}>{r.name}</td>
                  <td style={{ padding: "16px 20px", color: r.highlight ? "#00e5ff" : "#dadbdf" }}>{r.recall}</td>
                  <td style={{ padding: "16px 20px", color: "#dadbdf" }}>{r.latency}</td>
                  <td style={{ padding: "16px 20px", color: "#dadbdf" }}>{r.cost}</td>
                  <td style={{ padding: "16px 20px", color: r.highlight ? "#00e5ff" : "#dadbdf" }}>{r.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── CTA ─────────────────────────────────────────────────────── */
function CTA() {
  return (
    <section style={{
      padding: "120px 48px", textAlign: "center", position: "relative", zIndex: 1,
    }}>
      <h2 style={{ fontSize: "48px", fontWeight: 400, letterSpacing: "-1.2px", color: "#fff", marginBottom: "24px" }}>
        Start building<span style={{ color: "#00e5ff" }}>.</span>
      </h2>
      <p style={{ fontSize: "18px", color: "#7d8187", marginBottom: "48px", maxWidth: "500px", margin: "0 auto 48px" }}>
        Open source. MIT licensed. Deploy on CockroachDB Serverless for free.
      </p>
      <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
        <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer" style={{
          padding: "14px 32px", borderRadius: "9999px", border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff", fontSize: "15px", textDecoration: "none",
        }}>
          View on GitHub →
        </a>
        <Link href="/docs" style={{
          padding: "14px 32px", borderRadius: "9999px", background: "#fff", color: "#0a0a0a",
          fontSize: "15px", fontWeight: 500, textDecoration: "none",
        }}>
          Read the Docs
        </Link>
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{
      padding: "48px", borderTop: "1px solid #212327", position: "relative", zIndex: 1,
    }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#00e5ff" strokeWidth="2" />
            <circle cx="12" cy="12" r="2" fill="#00e5ff" />
          </svg>
          <span style={{ color: "#7d8187", fontSize: "13px" }}>Bastion &copy; 2026</span>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} style={{ color: "#7d8187", fontSize: "13px", textDecoration: "none" }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <Particles />
      <Navbar />
      <Hero />
      <Features />
      <Benchmark />
      <CTA />
      <Footer />
    </>
  );
}
