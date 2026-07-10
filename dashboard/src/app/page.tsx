"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

/* ── Design Tokens (xAI-Inspired) ────────────────────────────── */
const C = {
  canvas: "#0a0a0a", canvasSoft: "#111520", card: "#0c1018",
  hairline: "rgba(255,255,255,0.08)", ink: "#ffffff", body: "#c8ccd4",
  mute: "#6b7280", sunset: "#ff7a17", dusk: "#7c3aed",
  breeze: "#00e5ff", emerald: "#00ff88",
};

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/docs", label: "Docs" },
  { href: "/contact", label: "Contact" },
];

/* ── Intersection Observer Hook ──────────────────────────────── */
function useInView(threshold = 0.15) {
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

/* ── Enhanced Particle Network with Glow ──────────────────────── */
function ParticleNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 100 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 2 + 0.5,
      o: Math.random() * 0.3 + 0.1,
      z: Math.random(),
      pulse: Math.random() * Math.PI * 2,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Draw glowing connections first (behind particles)
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const avgZ = (particles[i].z + particles[j].z) / 2;
            const alpha = 0.12 * (1 - dist / 140) * (0.5 + avgZ * 0.5);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // Draw particles with glow
      for (const p of particles) {
        p.x += p.vx * (0.5 + p.z * 0.5);
        p.y += p.vy * (0.5 + p.z * 0.5);
        p.pulse += 0.02;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        const alpha = p.o * (0.5 + p.z * 0.5);
        const size = p.r * (0.5 + p.z * 0.5) * (1 + Math.sin(p.pulse) * 0.15);

        // Glow layer
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha * 0.15})`;
        ctx.fill();

        // Core particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.fill();

        // Bright center
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

/* ── Navbar with scroll effect ───────────────────────────────── */
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
      background: scrolled ? "rgba(10,10,10,0.95)" : "transparent",
      backdropFilter: scrolled ? "blur(20px)" : "none",
      borderBottom: scrolled ? "1px solid rgba(255,255,255,0.06)" : "1px solid transparent",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "32px", height: "32px", borderRadius: "8px",
          background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 20px rgba(0,229,255,0.3)",
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2.5" />
            <circle cx="12" cy="12" r="2" fill="#fff" />
          </svg>
        </div>
        <span style={{ fontWeight: 700, fontSize: "17px", letterSpacing: "2.5px", color: "#fff", textTransform: "uppercase" }}>
          Bastion
        </span>
      </Link>
      <div style={{ display: "flex", gap: "36px", alignItems: "center" }}>
        {navLinks.map((l) => (
          <Link key={l.href} href={l.href} className="hover-underline" style={{
            color: l.href === "/" ? "#fff" : "#6b7280",
            fontSize: "14px", textDecoration: "none", transition: "color 0.2s",
          }}>
            {l.label}
          </Link>
        ))}
        <Link href="/dashboard" className="btn-animated" style={{
          padding: "10px 28px", borderRadius: "9999px",
          border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
          color: "#fff", fontSize: "14px", fontWeight: 500, textDecoration: "none",
        }}>
          Open Dashboard
        </Link>
      </div>
    </nav>
  );
}

/* ── Hero Section ───────────────────────────────────────────── */
function Hero() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setLoaded(true)); }, []);

  return (
    <section style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center", textAlign: "center",
      padding: "140px 48px 100px", position: "relative", zIndex: 1,
    }}>
      {/* Glowing orb behind hero */}
      <div style={{
        position: "absolute", top: "15%", left: "50%", transform: "translateX(-50%)",
        width: "700px", height: "700px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,255,0.08) 0%, rgba(124,58,237,0.04) 40%, transparent 70%)",
        filter: "blur(80px)", pointerEvents: "none",
        animation: "orbPulse 4s ease-in-out infinite",
      }} />
      <style>{`
        @keyframes orbPulse {
          0%, 100% { opacity: 0.6; transform: translateX(-50%) scale(1); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
        }
      `}</style>

      <div style={{
        opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(40px)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Eyebrow */}
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280",
          marginBottom: "32px", opacity: loaded ? 1 : 0,
          transition: "opacity 0.6s ease 0.2s",
        }}>
          Agentic Memory Infrastructure
        </div>

        {/* Main headline */}
        <h1 style={{
          fontSize: "clamp(52px, 9vw, 108px)", fontWeight: 400, lineHeight: "0.95",
          letterSpacing: "-3px", color: "#fff", marginBottom: "40px",
          maxWidth: "950px",
        }}>
          The system of
          <br />
          record for
          <br />
          <span style={{
            background: "linear-gradient(135deg, #00e5ff 0%, #7c3aed 50%, #ff7a17 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            autonomous AI
          </span>
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: "18px", lineHeight: "1.8", color: "#9ca3af",
          maxWidth: "560px", margin: "0 auto 56px",
        }}>
          Persistent, self-healing memory that survives serverless crashes,
          scales across regions, and never lets your agents forget.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn-animated btn-press" style={{
            padding: "16px 36px", borderRadius: "9999px", background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 600, textDecoration: "none", display: "inline-flex",
            alignItems: "center", gap: "8px",
          }}>
            Launch Dashboard
            <span style={{ fontSize: "18px", transition: "transform 0.2s" }}>→</span>
          </Link>
          <Link href="/docs" className="btn-animated btn-press" style={{
            padding: "16px 36px", borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
            color: "#fff", fontSize: "15px", fontWeight: 500, textDecoration: "none",
          }}>
            Read Documentation
          </Link>
        </div>
      </div>

      {/* Floating Stats */}
      <div style={{
        display: "flex", gap: "56px", marginTop: "100px",
        opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(20px)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.4s",
      }}>
        {[
          { value: "1,058", label: "Tests", color: "#00e5ff" },
          { value: "22", label: "MCP Tools", color: "#7c3aed" },
          { value: "4/4", label: "CRDB Tools", color: "#ff7a17" },
          { value: "5/5", label: "AWS Services", color: "#00ff88" },
        ].map((s, i) => (
          <div key={s.label} style={{ textAlign: "center" }} className="animate-fade-in-up" >
            <div style={{
              fontSize: "36px", fontWeight: 700, color: s.color,
              textShadow: `0 0 20px ${s.color}33`,
            }}>{s.value}</div>
            <div style={{
              fontSize: "11px", color: "#6b7280", textTransform: "uppercase",
              letterSpacing: "2px", marginTop: "4px",
            }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Features Section ───────────────────────────────────────── */
const features = [
  { icon: "🔐", title: "Cryptographic Integrity", desc: "SHA-256 hash chains with Merkle tree verification. Every memory is tamper-evident.", accent: "#00e5ff" },
  { icon: "⏱️", title: "Time-Travel Queries", desc: "AS OF SYSTEM TIME — restore any memory to any past state. CockroachDB MVCC native.", accent: "#7c3aed" },
  { icon: "🌍", title: "Multi-Region Distributed", desc: "Globally distributed via CockroachDB. Memory stored in EU, retrieved from US in 12ms.", accent: "#00ff88" },
  { icon: "🧠", title: "Auto-Contradiction", desc: "When new facts contradict old ones, Bastion auto-supersedes. No competitor has this.", accent: "#ff7a17" },
  { icon: "💤", title: "Sleep-Time Dreaming", desc: "Agents learn during idle time. Episodic memories consolidate into semantic knowledge.", accent: "#a78bfa" },
  { icon: "🔄", title: "LTM Gateway", desc: "Check if a similar analysis exists before running expensive workflows. Saves tokens.", accent: "#00e5ff" },
  { icon: "🔍", title: "Multi-Signal Retrieval", desc: "BM25 + Vector + Entity + Temporal fusion. 100% recall on test benchmarks.", accent: "#f472b6" },
  { icon: "🛡️", title: "OWASP ASI06 Guard", desc: "Real-time prompt injection detection, PII firewall, multi-language scanning.", accent: "#00ff88" },
];

function Features() {
  const { ref, visible } = useInView(0.1);
  return (
    <section ref={ref} style={{ padding: "140px 48px", position: "relative", zIndex: 1 }}>
      <div style={{
        textAlign: "center", marginBottom: "80px",
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginBottom: "20px",
        }}>
          Architecture
        </div>
        <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, letterSpacing: "-1.5px", color: "#fff" }}>
          Built for production<span style={{ color: "#00e5ff" }}>.</span>
        </h2>
      </div>
      <div className="stagger-children" style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "20px", maxWidth: "1200px", margin: "0 auto", perspective: "1000px",
      }}>
        {features.map((f, i) => (
          <div key={i} className="card-interactive perspective-card" style={{
            background: C.card, border: `1px solid ${C.hairline}`, borderRadius: "12px",
            padding: "32px", position: "relative", overflow: "hidden",
            transformStyle: "preserve-3d",
          }}>
            {/* Glow accent */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "2px",
              background: `linear-gradient(90deg, transparent, ${f.accent}, transparent)`,
              opacity: 0.6,
            }} />
            <div style={{
              width: "48px", height: "48px", borderRadius: "12px",
              background: `${f.accent}11`, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: "24px", marginBottom: "20px",
              border: `1px solid ${f.accent}22`,
            }}>
              {f.icon}
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#fff", marginBottom: "10px" }}>{f.title}</h3>
            <p style={{ fontSize: "14px", lineHeight: "1.7", color: "#6b7280" }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Benchmark Table ────────────────────────────────────────── */
function Benchmark() {
  const { ref, visible } = useInView(0.1);
  return (
    <section ref={ref} style={{ padding: "140px 48px", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{
          textAlign: "center", marginBottom: "64px",
          opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
          transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280", marginBottom: "20px",
          }}>Benchmarks</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, letterSpacing: "-1.5px", color: "#fff" }}>
            Numbers that matter<span style={{ color: "#ff7a17" }}>.</span>
          </h2>
        </div>

        <div className="animate-scale-in" style={{
          background: C.card, border: `1px solid ${C.hairline}`, borderRadius: "12px",
          overflow: "hidden",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                {["System", "Recall@5", "Latency", "Cost/Year", "Multi-Region"].map((h) => (
                  <th key={h} style={{
                    padding: "18px 24px", textAlign: "left",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
                    textTransform: "uppercase", letterSpacing: "1.5px", color: "#6b7280", fontWeight: 600,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Bastion", recall: "100%", latency: "0.4ms", cost: "$0", region: "✅ Global", hl: true },
                { name: "agentmemory", recall: "95.2%", latency: "~200ms", cost: "~$10", region: "❌ Local" },
                { name: "Mem0", recall: "94.4%", latency: "~200ms", cost: "~$6,000", region: "❌ Single" },
                { name: "Cognee", recall: "~90%", latency: "Unknown", cost: "$0", region: "❌ Single" },
              ].map((r, i) => (
                <tr key={i} style={{
                  borderTop: `1px solid ${C.hairline}`,
                  background: r.hl ? "rgba(0, 229, 255, 0.03)" : "transparent",
                  transition: "background 0.2s",
                }} className="hover-glow">
                  <td style={{ padding: "18px 24px", fontWeight: 600, color: r.hl ? "#00e5ff" : "#fff" }}>{r.name}</td>
                  <td style={{ padding: "18px 24px", color: r.hl ? "#00e5ff" : "#c8ccd4", fontWeight: r.hl ? 600 : 400 }}>{r.recall}</td>
                  <td style={{ padding: "18px 24px", color: "#c8ccd4" }}>{r.latency}</td>
                  <td style={{ padding: "18px 24px", color: "#c8ccd4" }}>{r.cost}</td>
                  <td style={{ padding: "18px 24px", color: r.hl ? "#00e5ff" : "#c8ccd4" }}>{r.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── CTA Section ────────────────────────────────────────────── */
function CTA() {
  const { ref, visible } = useInView(0.2);
  return (
    <section ref={ref} style={{
      padding: "140px 48px", textAlign: "center", position: "relative", zIndex: 1,
    }}>
      {/* Gradient orb */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: "500px", height: "500px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)",
        filter: "blur(60px)", pointerEvents: "none",
      }} />
      <div style={{
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
        transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)", position: "relative",
      }}>
        <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 400, letterSpacing: "-1.5px", color: "#fff", marginBottom: "24px" }}>
          Start building<span style={{ color: "#00e5ff" }}>.</span>
        </h2>
        <p style={{ fontSize: "18px", color: "#6b7280", marginBottom: "56px", maxWidth: "480px", margin: "0 auto 56px" }}>
          Open source. MIT licensed. Deploy on CockroachDB Serverless for free.
        </p>
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer"
            className="btn-animated" style={{
              padding: "16px 36px", borderRadius: "9999px",
              border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
              color: "#fff", fontSize: "15px", fontWeight: 500, textDecoration: "none",
              display: "inline-flex", alignItems: "center", gap: "8px",
            }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.303 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.236 1.911 1.236 3.221 0 4.609-2.807 5.931-5.479 6.234.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
            View on GitHub
          </a>
          <Link href="/docs" className="btn-animated" style={{
            padding: "16px 36px", borderRadius: "9999px", background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 600, textDecoration: "none",
          }}>
            Read the Docs
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{
      padding: "48px", borderTop: `1px solid ${C.hairline}`, position: "relative", zIndex: 1,
    }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "24px", height: "24px", borderRadius: "6px",
            background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          <span style={{ color: "#6b7280", fontSize: "13px" }}>Bastion &copy; 2026</span>
        </div>
        <div style={{ display: "flex", gap: "28px" }}>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hover-underline" style={{ color: "#6b7280", fontSize: "13px", textDecoration: "none" }}>
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
      <ParticleNetwork />
      <Navbar />
      <Hero />
      <Features />
      <Benchmark />
      <CTA />
      <Footer />
    </>
  );
}
