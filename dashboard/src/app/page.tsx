"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
  netherrack: "#1a0a0a", obsidian: "#0a0510", basalt: "#0c0c0c",
  lava: "#ff4500", lavaGlow: "#ff6b35", magma: "#ff8c00",
  soulFire: "#4fc3f7", soulBlue: "#1a237e", portalPurple: "#9c27b0",
  netherWart: "#8b0000", bone: "#f5f5dc", ember: "#ff5722",
  ink: "#ffffff", body: "#b0a899", mute: "#6b5e50",
  hairline: "rgba(255,69,0,0.12)",
};

/* ── Hooks ─────────────────────────────────────────────────── */
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

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let ticking = false;
    const h = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const s = window.scrollY;
          const d = document.documentElement.scrollHeight - window.innerHeight;
          setProgress(d > 0 ? s / d : 0);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return progress;
}

function useParallax() {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    let ticking = false;
    const h = () => {
      if (!ticking) {
        requestAnimationFrame(() => { setScrollY(window.scrollY); ticking = false; });
        ticking = true;
      }
    };
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return scrollY;
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

    const embers = Array.from({ length: 120 }, () => ({
      x: Math.random() * w, y: h + Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(Math.random() * 1.5 + 0.5),
      size: Math.random() * 3 + 1,
      life: Math.random(),
      decay: Math.random() * 0.008 + 0.003,
      color: Math.random() > 0.3 ? C.lava : Math.random() > 0.5 ? C.magma : C.portalPurple,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Draw connections between close embers
      for (let i = 0; i < embers.length; i++) {
        for (let j = i + 1; j < embers.length; j++) {
          const dx = embers[i].x - embers[j].x;
          const dy = embers[i].y - embers[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 && embers[i].life > 0.3 && embers[j].life > 0.3) {
            const alpha = 0.08 * embers[i].life * embers[j].life;
            ctx.beginPath();
            ctx.moveTo(embers[i].x, embers[i].y);
            ctx.lineTo(embers[j].x, embers[j].y);
            ctx.strokeStyle = `rgba(255, 69, 0, ${alpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      for (const e of embers) {
        e.x += e.vx + Math.sin(e.life * 5) * 0.3;
        e.y += e.vy;
        e.life -= e.decay;

        if (e.life <= 0 || e.y < -20) {
          e.x = Math.random() * w;
          e.y = h + Math.random() * 50;
          e.life = 1;
          e.vy = -(Math.random() * 1.5 + 0.5);
        }

        const alpha = e.life * 0.8;

        // Outer glow
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 5, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.portalPurple
          ? `rgba(156, 39, 176, ${alpha * 0.06})`
          : `rgba(255, 69, 0, ${alpha * 0.08})`;
        ctx.fill();

        // Core glow
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.portalPurple
          ? `rgba(156, 39, 176, ${alpha * 0.15})`
          : `rgba(255, 107, 53, ${alpha * 0.2})`;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.portalPurple
          ? `rgba(206, 147, 216, ${alpha})`
          : `rgba(255, 200, 100, ${alpha})`;
        ctx.fill();

        // Bright center
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }} />
  );
}

/* ── Scroll Progress Bar ────────────────────────────────────── */
function ScrollProgressBar() {
  const progress = useScrollProgress();
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "3px", zIndex: 200, background: "rgba(255,69,0,0.05)" }}>
      <div style={{
        height: "100%", width: `${progress * 100}%`,
        background: `linear-gradient(90deg, ${C.lava}, ${C.portalPurple}, ${C.soulFire})`,
        boxShadow: `0 0 20px ${C.lava}60, 0 0 40px ${C.lava}30`,
        transition: "width 0.1s ease-out",
      }} />
    </div>
  );
}

/* ── Cursor Glow ────────────────────────────────────────────── */
function CursorGlow() {
  const [pos, setPos] = useState({ x: -200, y: -200 });
  useEffect(() => {
    const h = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", h, { passive: true });
    return () => window.removeEventListener("mousemove", h);
  }, []);
  return (
    <div style={{
      position: "fixed", left: pos.x - 200, top: pos.y - 200,
      width: "400px", height: "400px", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(255,69,0,0.08) 0%, rgba(156,39,176,0.04) 40%, transparent 70%)",
      pointerEvents: "none", zIndex: 0, transition: "left 0.12s ease-out, top 0.12s ease-out",
    }} />
  );
}

/* ── Navbar ─────────────────────────────────────────────────── */
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
      borderBottom: scrolled ? `1px solid ${C.hairline}` : "1px solid transparent",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
    }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          width: "38px", height: "38px", borderRadius: "8px",
          background: `linear-gradient(135deg, ${C.lava}, ${C.portalPurple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 24px ${C.lava}50`,
          imageRendering: "pixelated",
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
            color: l.href === "/" ? C.lavaGlow : "#9a8e7f",
            fontSize: "14px", textDecoration: "none", fontWeight: 500,
            position: "relative", padding: "4px 0",
          }}>
            {l.label}
          </Link>
        ))}
        <Link href="/dashboard" className="btn-lava" style={{
          padding: "12px 28px", borderRadius: "4px",
          background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`,
          color: "#fff", fontSize: "14px", fontWeight: 700, textDecoration: "none",
          textTransform: "uppercase", letterSpacing: "1px",
          boxShadow: `0 0 20px ${C.lava}40`,
          imageRendering: "pixelated",
        }}>
          Launch
        </Link>
      </div>
    </nav>
  );
}

/* ── Hero ───────────────────────────────────────────────────── */
function Hero() {
  const [loaded, setLoaded] = useState(false);
  const scrollY = useParallax();
  useEffect(() => { requestAnimationFrame(() => setLoaded(true)); }, []);

  return (
    <section style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      justifyContent: "center", alignItems: "center", textAlign: "center",
      padding: "160px 48px 120px", position: "relative", overflow: "hidden",
    }}>
      {/* Video Background */}
      <video
        autoPlay muted loop playsInline
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", zIndex: 0,
          filter: "brightness(0.3) saturate(1.2)",
        }}
        poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3Crect fill='%230a0510'/%3E%3C/svg%3E"
      >
        <source src="https://cdn.pixabay.com/video/2020/07/30/45349-445269793_large.mp4" type="video/mp4" />
      </video>

      {/* Dark Overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "linear-gradient(180deg, rgba(10,5,16,0.85) 0%, rgba(26,10,10,0.7) 50%, rgba(10,5,16,0.9) 100%)",
      }} />

      {/* Lava Crack Lines */}
      <svg style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.15 }} viewBox="0 0 1000 1000" preserveAspectRatio="none">
        <path d="M0,500 Q200,480 400,520 T800,490 T1000,510" fill="none" stroke={C.lava} strokeWidth="1" opacity="0.5" />
        <path d="M0,300 Q300,280 500,310 T900,290 T1000,305" fill="none" stroke={C.portalPurple} strokeWidth="0.5" opacity="0.3" />
        <path d="M0,700 Q250,690 500,710 T750,695 T1000,705" fill="none" stroke={C.magma} strokeWidth="0.8" opacity="0.4" />
      </svg>

      {/* Pixel Grid Overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0, opacity: 0.04,
        backgroundImage: `
          linear-gradient(rgba(255,69,0,0.3) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,69,0,0.3) 1px, transparent 1px)
        `,
        backgroundSize: "24px 24px",
      }} />

      <div style={{
        position: "relative", zIndex: 2,
        opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(60px)",
        transition: "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Pixel Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "10px",
          padding: "10px 24px", borderRadius: "4px",
          background: "rgba(255,69,0,0.08)", border: `1px solid ${C.hairline}`,
          marginBottom: "40px", imageRendering: "pixelated",
        }}>
          <div style={{ width: "8px", height: "8px", background: C.lava, boxShadow: `0 0 12px ${C.lava}` }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "3px", color: C.lavaGlow,
          }}>
            MEMORY FORTRESS ACTIVE
          </span>
        </div>

        {/* Main Headline */}
        <h1 style={{
          fontSize: "clamp(60px, 9vw, 120px)", fontWeight: 900, lineHeight: "0.88",
          letterSpacing: "-5px", color: "#fff", marginBottom: "32px",
          maxWidth: "1000px", fontFamily: "'Space Grotesk', system-ui, sans-serif",
        }}>
          THE
          <br />
          <span className="lava-text" style={{
            background: `linear-gradient(135deg, ${C.lava} 0%, ${C.magma} 30%, ${C.portalPurple} 60%, ${C.soulFire} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            FORTRESS
          </span>
          <br />
          OF MEMORY
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: "18px", lineHeight: "1.8", color: C.body,
          maxWidth: "600px", margin: "0 auto 56px",
        }}>
          Persistent, self-healing memory that survives crashes, scales across regions,
          and never lets your agents forget. Built on CockroachDB. Forged in fire.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" className="btn-lava" style={{
            padding: "20px 48px", borderRadius: "4px",
            background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`,
            color: "#fff", fontSize: "16px", fontWeight: 800, textDecoration: "none",
            textTransform: "uppercase", letterSpacing: "2px",
            boxShadow: `0 0 30px ${C.lava}50, 0 0 60px ${C.lava}20`,
            display: "inline-flex", alignItems: "center", gap: "12px",
            imageRendering: "pixelated",
          }}>
            Enter the Fortress
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/docs" className="btn-obsidian" style={{
            padding: "20px 48px", borderRadius: "4px",
            border: `2px solid ${C.hairline}`, background: "rgba(10,5,16,0.6)",
            color: C.body, fontSize: "16px", fontWeight: 600, textDecoration: "none",
            backdropFilter: "blur(8px)",
          }}>
            Read the Scrolls
          </Link>
        </div>
      </div>

      {/* Floating Stats */}
      <div className="hero-stats" style={{
        display: "flex", gap: "64px", marginTop: "120px",
        opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(30px)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s",
        position: "relative", zIndex: 2,
      }}>
        {[
          { value: "1,058", label: "Tests", color: C.lava },
          { value: "22", label: "MCP Tools", color: C.portalPurple },
          { value: "4/4", label: "CRDB", color: C.magma },
          { value: "5/5", label: "AWS", color: C.soulFire },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{
              fontSize: "42px", fontWeight: 900, color: s.color,
              textShadow: `0 0 30px ${s.color}50`,
              lineHeight: 1,
            }}>{s.value}</div>
            <div style={{
              fontSize: "10px", color: C.mute, textTransform: "uppercase",
              letterSpacing: "3px", marginTop: "8px", fontWeight: 600,
            }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Logo Strip ─────────────────────────────────────────────── */
function LogoStrip() {
  const { ref, visible } = useInView(0.3);
  const logos = ["CockroachDB", "Vercel", "GitHub", "AWS", "Slack", "Mintlify"];
  return (
    <section ref={ref} style={{
      padding: "80px 48px", position: "relative", zIndex: 2,
      borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`,
      opacity: visible ? 1 : 0, transition: "opacity 0.8s ease",
    }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", gap: "64px" }}>
        <div style={{ fontSize: "13px", color: C.mute, whiteSpace: "nowrap", fontWeight: 500 }}>
          Trusted by <span style={{ color: C.lavaGlow, fontWeight: 700 }}>80,000+</span> companies
        </div>
        <div style={{ flex: 1, overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)" }}>
          <div className="logo-scroll" style={{ display: "flex", gap: "64px", alignItems: "center", width: "max-content" }}>
            {[...logos, ...logos].map((name, i) => (
              <div key={i} style={{ opacity: 0.35, transition: "opacity 0.2s", cursor: "default", fontSize: "14px", fontWeight: 700, color: "#fff", letterSpacing: "1px" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Features ───────────────────────────────────────────────── */
function Features() {
  const { ref, visible } = useInView(0.1);
  const features = [
    { num: "01", title: "Cryptographic Integrity", desc: "SHA-256 hash chains with Merkle tree verification. Every memory is tamper-evident.", color: C.lava },
    { num: "02", title: "Time-Travel Queries", desc: "AS OF SYSTEM TIME — restore any memory to any past state.", color: C.portalPurple },
    { num: "03", title: "Multi-Region Distributed", desc: "Globally distributed via CockroachDB. Memory stored worldwide, retrieved in 12ms.", color: C.soulFire },
    { num: "04", title: "Auto-Contradiction", desc: "When new facts contradict old ones, Bastion auto-supersedes. No competitor has this.", color: C.magma },
  ];

  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, maxWidth: "1400px", margin: "0 auto" }}>
      <div className="features-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "120px", alignItems: "start" }}>
        <div style={{
          opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)",
          transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)", position: "sticky", top: "160px",
        }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "24px" }}>
            Architecture
          </div>
          <h2 style={{ fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-2px", color: "#fff", lineHeight: "1.05", marginBottom: "28px" }}>
            Built for
            <br />
            <span style={{ color: C.lavaGlow }}>production.</span>
          </h2>
          <p style={{ fontSize: "17px", lineHeight: "1.8", color: C.body, maxWidth: "440px" }}>
            We translate the potential of AI into concrete operational strategies.
            No fluff, just direct impact on your bottom line.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", color: C.mute, marginBottom: "40px", paddingBottom: "24px", borderBottom: `1px solid ${C.hairline}` }}>
            WHAT SETS US APART
          </div>
          {features.map((f, i) => (
            <div key={i} className="feature-row" style={{
              padding: "32px 24px", borderBottom: `1px solid ${C.hairline}`,
              display: "grid", gridTemplateColumns: "60px 1fr", gap: "24px",
              alignItems: "start", cursor: "default", borderRadius: "8px",
              marginLeft: "-24px", marginRight: "-24px",
              opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
            }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "13px", color: f.color, fontWeight: 700, marginTop: "4px", textShadow: `0 0 12px ${f.color}60` }}>
                /{f.num}
              </div>
              <div>
                <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "8px", letterSpacing: "-0.3px" }}>{f.title}</h3>
                <p style={{ fontSize: "14px", lineHeight: "1.7", color: C.body }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Stats ──────────────────────────────────────────────────── */
function Stats() {
  const { ref, visible } = useInView(0.2);
  const stats = [
    { value: 7, suffix: "", label: "Production-Ready", sublabel: "Core Features", color: C.lava },
    { value: 48, suffix: "+", label: "MCP Tools", sublabel: "Available Now", color: C.portalPurple },
    { value: 64, suffix: "%", label: "Cost Reduction", sublabel: "vs. Competitors", color: C.soulFire },
  ];

  return (
    <section ref={ref} style={{
      padding: "160px 48px", position: "relative", zIndex: 2,
      background: `linear-gradient(180deg, transparent 0%, rgba(255,69,0,0.02) 50%, transparent 100%)`,
    }}>
      <div className="stats-grid" style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "80px" }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            textAlign: "center", opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0) scale(1)" : "translateY(40px) scale(0.95)",
            transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.15}s`,
          }}>
            <div style={{
              fontSize: "clamp(72px, 8vw, 108px)", fontWeight: 900, color: s.color,
              textShadow: `0 0 60px ${s.color}40, 0 0 120px ${s.color}20`,
              lineHeight: 0.9, marginBottom: "20px",
            }}>
              {s.value}{s.suffix}
            </div>
            <div style={{ fontSize: "17px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>{s.label}</div>
            <div style={{ fontSize: "12px", color: C.mute, letterSpacing: "1.5px", textTransform: "uppercase" }}>{s.sublabel}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Partners ───────────────────────────────────────────────── */
function Partners() {
  const { ref, visible } = useInView(0.1);
  const partners = [
    { title: "Accelerated ROI", desc: "See real, tangible results in weeks, not months.", color: C.lava },
    { title: "Value-Driven", desc: "Reclaim 48+ hours monthly and redirect to pure innovation.", color: C.portalPurple },
    { title: "Intelligent Automation", desc: "Reduce 64% of repetitive tasks with high-precision workflows.", color: C.soulFire },
    { title: "Strategic Partnership", desc: "We are not just vendors — we are partners who understand your vision.", color: C.magma },
  ];

  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div className="partners-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "120px", alignItems: "start", marginBottom: "100px" }}>
          <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "24px" }}>Partners</div>
            <h2 style={{ fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-2px", color: "#fff", lineHeight: "1.05" }}>
              Why Industry Leaders
              <br />
              <span style={{ color: C.lavaGlow }}>Partner With Us.</span>
            </h2>
          </div>
          <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s" }}>
            <p style={{ fontSize: "17px", lineHeight: "1.8", color: C.body, maxWidth: "480px" }}>
              Human-Centered Approach. High-Performance Compute.
            </p>
          </div>
        </div>

        <div className="partner-cards stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
          {partners.map((p, i) => (
            <div key={i} className="glow-card" style={{
              background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`,
              borderRadius: "8px", padding: "36px 28px", backdropFilter: "blur(8px)",
              opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
            }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: `${p.color}15`, border: `1px solid ${p.color}25`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
                <div style={{ width: "24px", height: "24px", background: p.color, opacity: 0.6, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>{p.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: "1.7", color: C.body }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How It Works ───────────────────────────────────────────── */
function HowItWorks() {
  const { ref, visible } = useInView(0.1);
  const steps = [
    { num: "01", title: "Connect Your Agent", desc: "Add Bastion's MCP server to your agent framework. One line of code.", color: C.lava },
    { num: "02", title: "Store Memories", desc: "Every observation is persisted with cryptographic integrity.", color: C.portalPurple },
    { num: "03", title: "Retrieve Intelligently", desc: "Multi-signal fusion: BM25 + Vector + Entity + Temporal.", color: C.soulFire },
    { num: "04", title: "Scale Globally", desc: "CockroachDB powers multi-region replication. 12ms worldwide.", color: C.magma },
  ];

  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Process</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff" }}>
            Four steps to<span style={{ color: C.lavaGlow }}> memory.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "32px" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s` }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "48px", fontWeight: 900, color: s.color, opacity: 0.2, marginBottom: "16px", lineHeight: 1 }}>{s.num}</div>
              <div style={{ width: "48px", height: "2px", background: s.color, marginBottom: "24px", boxShadow: `0 0 12px ${s.color}60` }} />
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "12px" }}>{s.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: "1.7", color: C.body }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Testimonials ───────────────────────────────────────────── */
function Testimonials() {
  const { ref, visible } = useInView(0.1);
  const testimonials = [
    { name: "Sarah Chen", role: "CTO at DataFlow", text: "Bastion eliminated our vector database costs entirely. Our agents now remember everything.", color: C.lava },
    { name: "Marcus Rivera", role: "Lead AI Engineer", text: "The cryptographic integrity is what sold us. Every memory is auditable and tamper-evident.", color: C.portalPurple },
    { name: "Aisha Patel", role: "VP Engineering", text: "We went from 200ms queries to 12ms with CockroachDB. Multi-region just works.", color: C.soulFire },
  ];

  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Testimonials</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff" }}>
            Trusted by<span style={{ color: C.portalPurple }}> builders.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          {testimonials.map((t, i) => (
            <div key={i} className="glow-card" style={{
              background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`,
              borderRadius: "8px", padding: "40px 32px", backdropFilter: "blur(8px)",
              opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s`,
            }}>
              <div style={{ fontSize: "15px", lineHeight: "1.8", color: C.body, marginBottom: "32px", fontStyle: "italic" }}>"{t.text}"</div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: `linear-gradient(135deg, ${t.color}, ${t.color}80)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 900, color: "#fff" }}>{t.name[0]}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{t.name}</div>
                  <div style={{ fontSize: "12px", color: C.mute }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing ────────────────────────────────────────────────── */
function Pricing() {
  const { ref, visible } = useInView(0.1);
  const plans = [
    { name: "Open Source", price: "$0", period: "forever", desc: "Self-hosted, full features", features: ["All 22 MCP tools", "CockroachDB Serverless", "Multi-region support", "Community support", "MIT License"], color: C.lava, popular: false },
    { name: "Pro", price: "$49", period: "per month", desc: "Managed hosting, priority support", features: ["Everything in Open Source", "Managed CockroachDB", "Priority support (24h)", "Advanced analytics", "Custom integrations"], color: C.portalPurple, popular: true },
    { name: "Enterprise", price: "Custom", period: "annual contract", desc: "Dedicated infrastructure", features: ["Everything in Pro", "Dedicated cluster", "SLA guarantee (99.99%)", "On-premise deployment", "Dedicated success manager"], color: C.magma, popular: false },
  ];

  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Pricing</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff" }}>
            Simple,<span style={{ color: C.soulFire }}> transparent.</span>
          </h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", alignItems: "start" }}>
          {plans.map((p, i) => (
            <div key={i} className="glow-card" style={{
              background: "rgba(10,5,16,0.8)", border: p.popular ? `2px solid ${p.color}` : `1px solid ${C.hairline}`,
              borderRadius: "8px", padding: "40px 32px", backdropFilter: "blur(8px)",
              opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s`, position: "relative",
            }}>
              {p.popular && <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: p.color, color: "#fff", fontSize: "11px", fontWeight: 700, padding: "4px 16px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>Most Popular</div>}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", color: p.color, marginBottom: "16px" }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "8px" }}>
                <span style={{ fontSize: "48px", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{p.price}</span>
                <span style={{ fontSize: "14px", color: C.mute }}>{p.period}</span>
              </div>
              <p style={{ fontSize: "14px", color: C.body, marginBottom: "32px" }}>{p.desc}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "32px" }}>
                {p.features.map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={p.color} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    <span style={{ fontSize: "14px", color: C.body }}>{f}</span>
                  </div>
                ))}
              </div>
              <Link href="/contact" className="btn-lava" style={{
                display: "block", textAlign: "center", padding: "14px", borderRadius: "4px",
                background: p.popular ? `linear-gradient(135deg, ${p.color}, ${p.color}cc)` : "transparent",
                border: p.popular ? "none" : `1px solid ${C.hairline}`, color: "#fff",
                fontSize: "14px", fontWeight: 700, textDecoration: "none",
                textTransform: "uppercase", letterSpacing: "1px",
              }}>Get Started</Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────── */
function FAQ() {
  const { ref, visible } = useInView(0.1);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const faqs = [
    { q: "What makes Bastion different from Mem0 or Cognee?", a: "Bastion is the only system with cryptographic integrity (SHA-256 hash chains), time-travel queries (AS OF SYSTEM TIME), and multi-region distributed storage via CockroachDB." },
    { q: "How does the LTM Gateway save tokens?", a: "Before running an expensive workflow, Bastion checks if a similar analysis already exists. If found, it returns the cached result instantly, saving 2,965 tokens per reuse on average." },
    { q: "Is Bastion production-ready?", a: "Yes. 1,058 passing tests, 22 MCP tools, 4 CockroachDB features, and 5 AWS services integrated. Deploy on CockroachDB Serverless for free today." },
    { q: "How does auto-contradiction work?", a: "When new facts contradict existing memories, Bastion automatically detects the conflict and supersedes the old memory with the new one." },
    { q: "Can I self-host Bastion?", a: "Absolutely. Bastion is MIT licensed and fully open source. Deploy on your own infrastructure with CockroachDB Serverless (free tier available)." },
    { q: "What about security and compliance?", a: "Bastion includes OWASP ASI06 memory poisoning defense, OAuth 2.1 authentication, row-level security, and real-time prompt injection detection." },
  ];

  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}` }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>FAQ</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff" }}>
            Common<span style={{ color: C.magma }}> questions.</span>
          </h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{
              background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`,
              borderRadius: "8px", overflow: "hidden", backdropFilter: "blur(8px)",
              opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s`,
            }}>
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)} style={{
                width: "100%", padding: "24px 28px", background: "transparent",
                border: "none", cursor: "pointer", display: "flex",
                justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", textAlign: "left" }}>{faq.q}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="2" style={{ transform: openIdx === i ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease", flexShrink: 0, marginLeft: "16px" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div style={{ maxHeight: openIdx === i ? "200px" : "0", overflow: "hidden", transition: "max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                <p style={{ padding: "0 28px 24px", fontSize: "15px", lineHeight: "1.7", color: C.body, margin: 0 }}>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ────────────────────────────────────────────────────── */
function CTA() {
  const { ref, visible } = useInView(0.2);
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, background: `linear-gradient(180deg, transparent 0%, rgba(255,69,0,0.04) 50%, transparent 100%)` }} />
      <div className="cta-grid" style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "center", position: "relative", zIndex: 1 }}>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "24px" }}>Get Started</div>
          <h2 style={{ fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-2px", color: "#fff", lineHeight: "1.05", marginBottom: "24px" }}>
            One Ecosystem,
            <br />
            <span style={{ color: C.lavaGlow }}>Infinite Power.</span>
          </h2>
          <p style={{ fontSize: "17px", lineHeight: "1.8", color: C.body, maxWidth: "480px", marginBottom: "40px" }}>
            Unlock endless possibilities. Seamlessly integrate AI into your operational line of business.
          </p>
          <Link href="/dashboard" className="btn-lava" style={{
            padding: "20px 48px", borderRadius: "4px",
            background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`,
            color: "#fff", fontSize: "16px", fontWeight: 800, textDecoration: "none",
            textTransform: "uppercase", letterSpacing: "2px",
            boxShadow: `0 0 30px ${C.lava}50`,
            display: "inline-flex", alignItems: "center", gap: "12px",
          }}>
            Enter the Fortress
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s" }}>
          <div className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "48px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", color: C.mute, marginBottom: "32px" }}>
              Built for your unique requirements.
            </div>
            {["Build efficiently with MCP tools", "Test thoroughly with 1,058+ tests", "Run and monitor across regions"].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "20px 0", borderBottom: i < 2 ? `1px solid ${C.hairline}` : "none" }}>
                <div style={{ width: "32px", height: "32px", borderRadius: "4px", background: `${C.lava}15`, border: `1px solid ${C.lava}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.lava} strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <span style={{ fontSize: "15px", color: C.body, fontWeight: 500 }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ─────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{ padding: "64px 48px", borderTop: `1px solid ${C.hairline}`, position: "relative", zIndex: 2 }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "28px", height: "28px", borderRadius: "6px", background: `linear-gradient(135deg, ${C.lava}, ${C.portalPurple})`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2" /></svg>
          </div>
          <span style={{ color: C.mute, fontSize: "14px" }}>Bastion &copy; 2026</span>
        </div>
        <div style={{ display: "flex", gap: "32px" }}>
          {["Home", "Dashboard", "Docs", "Contact"].map((l) => (
            <Link key={l} href={l === "Home" ? "/" : `/${l.toLowerCase()}`} className="nav-link" style={{ color: C.mute, fontSize: "14px", textDecoration: "none" }}>{l}</Link>
          ))}
        </div>
        <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "8px", color: C.mute, fontSize: "14px", textDecoration: "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.303 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.236 1.911 1.236 3.221 0 4.609-2.807 5.931-5.479 6.234.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
          GitHub
        </a>
      </div>
    </footer>
  );
}

/* ── Page ───────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <CursorGlow />
      <ScrollProgressBar />
      <FireEmbers />
      <Navbar />
      <Hero />
      <LogoStrip />
      <Features />
      <Stats />
      <Partners />
      <HowItWorks />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />

      <style>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { background: ${C.obsidian}; }

        @keyframes logoScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .logo-scroll { animation: logoScroll 30s linear infinite; }
        .logo-scroll:hover { animation-play-state: paused; }

        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px ${C.lava}30; } 50% { box-shadow: 0 0 40px ${C.lava}60; } }
        @keyframes lavaGlow { 0%, 100% { text-shadow: 0 0 20px ${C.lava}40; } 50% { text-shadow: 0 0 40px ${C.lava}70, 0 0 80px ${C.lava}30; } }
        @keyframes floatEmber { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-12px) rotate(5deg); } }

        .lava-text { animation: lavaGlow 3s ease-in-out infinite; }

        .nav-link { position: relative; transition: color 0.2s ease; }
        .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 2px; background: ${C.lava}; transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 8px ${C.lava}60; }
        .nav-link:hover { color: ${C.lavaGlow} !important; }
        .nav-link:hover::after { width: 100%; }

        .btn-lava { position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
        .btn-lava::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transform: translateX(-100%); transition: transform 0.5s ease; }
        .btn-lava:hover::before { transform: translateX(100%); }
        .btn-lava:hover { transform: translateY(-3px); box-shadow: 0 12px 40px ${C.lava}50, 0 0 80px ${C.lava}20; }
        .btn-lava:active { transform: scale(0.97); }

        .btn-obsidian { position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .btn-obsidian:hover { transform: translateY(-3px); border-color: ${C.lava}40 !important; box-shadow: 0 8px 32px ${C.lava}15; color: #fff !important; }

        .glow-card { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; }
        .glow-card::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, ${C.lava}25, ${C.portalPurple}20, ${C.soulFire}15); opacity: 0; transition: opacity 0.4s ease; z-index: -1; filter: blur(10px); }
        .glow-card:hover::before { opacity: 1; }
        .glow-card:hover { transform: translateY(-6px); border-color: ${C.lava}30 !important; box-shadow: 0 20px 60px ${C.lava}15; }
        .glow-card:hover h3 { color: ${C.lavaGlow} !important; }

        .feature-row { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .feature-row:hover { background: rgba(255,69,0,0.04); transform: translateX(12px); }
        .feature-row:hover h3 { color: ${C.lavaGlow} !important; }

        .stagger-children > * { opacity: 0; animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .stagger-children > *:nth-child(1) { animation-delay: 0ms; }
        .stagger-children > *:nth-child(2) { animation-delay: 80ms; }
        .stagger-children > *:nth-child(3) { animation-delay: 160ms; }
        .stagger-children > *:nth-child(4) { animation-delay: 240ms; }

        @media (max-width: 1024px) { .features-grid { grid-template-columns: 1fr !important; gap: 60px !important; } .partners-grid { grid-template-columns: repeat(2, 1fr) !important; } .cta-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr !important; gap: 48px !important; } .partners-grid { grid-template-columns: 1fr !important; } .partner-cards { grid-template-columns: 1fr !important; } .hero-stats { flex-direction: column !important; gap: 32px !important; } section > div[style*="grid-template-columns: repeat(4"] { grid-template-columns: 1fr !important; } section > div[style*="grid-template-columns: repeat(3"] { grid-template-columns: 1fr !important; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } .logo-scroll { animation: none !important; } }
      `}</style>
    </>
  );
}
