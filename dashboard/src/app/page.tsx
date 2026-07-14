"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

/* ── Design Tokens (Nether Fortress Theme) ─────────────────── */
const C = {
  obsidian: "#0a0510", lava: "#ff4500", lavaGlow: "#ff6b35",
  magma: "#ff8c00", soulFire: "#4fc3f7", portalPurple: "#9c27b0",
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

function useCountUp(target: number, duration = 2000, delay = 500) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [started, target, duration]);
  return count;
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
      for (let i = 0; i < embers.length; i++) {
        for (let j = i + 1; j < embers.length; j++) {
          const dx = embers[i].x - embers[j].x;
          const dy = embers[i].y - embers[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 && embers[i].life > 0.3 && embers[j].life > 0.3) {
            const alpha = 0.08 * embers[i].life * embers[j].life;
            ctx.beginPath(); ctx.moveTo(embers[i].x, embers[i].y); ctx.lineTo(embers[j].x, embers[j].y);
            ctx.strokeStyle = `rgba(255,69,0,${alpha})`; ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }
      for (const e of embers) {
        e.x += e.vx + Math.sin(e.life * 5) * 0.3;
        e.y += e.vy;
        e.life -= e.decay;
        if (e.life <= 0 || e.y < -20) { e.x = Math.random() * w; e.y = h + Math.random() * 50; e.life = 1; }
        const alpha = e.life * 0.8;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 5, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.portalPurple ? `rgba(156,39,176,${alpha * 0.06})` : `rgba(255,69,0,${alpha * 0.08})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.portalPurple ? `rgba(206,147,216,${alpha})` : `rgba(255,200,100,${alpha})`;
        ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.7})`; ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none" }} />;
}

/* ── UI Components ─────────────────────────────────────────── */
function ScrollProgressBar() {
  const progress = useScrollProgress();
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "3px", zIndex: 200, background: "rgba(255,69,0,0.05)" }}>
      <div style={{ height: "100%", width: `${progress * 100}%`, background: `linear-gradient(90deg, ${C.lava}, ${C.portalPurple}, ${C.soulFire})`, boxShadow: `0 0 20px ${C.lava}60`, transition: "width 0.1s ease-out" }} />
    </div>
  );
}

function CursorGlow() {
  const [pos, setPos] = useState({ x: -200, y: -200 });
  useEffect(() => {
    const h = (e: MouseEvent) => setPos({ x: e.clientX, y: e.clientY });
    window.addEventListener("mousemove", h, { passive: true });
    return () => window.removeEventListener("mousemove", h);
  }, []);
  return (
    <div style={{ position: "fixed", left: pos.x - 200, top: pos.y - 200, width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,69,0,0.08) 0%, rgba(156,39,176,0.04) 40%, transparent 70%)", pointerEvents: "none", zIndex: 0, transition: "left 0.12s ease-out, top 0.12s ease-out" }} />
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  return (
    <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: scrolled ? "12px 48px" : "20px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", background: scrolled ? "rgba(10,5,16,0.95)" : "transparent", backdropFilter: scrolled ? "blur(24px) saturate(1.5)" : "none", borderBottom: scrolled ? `1px solid ${C.hairline}` : "1px solid transparent", transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ width: "38px", height: "38px", borderRadius: "8px", background: `linear-gradient(135deg, ${C.lava}, ${C.portalPurple})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 24px ${C.lava}50` }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2.5" /><circle cx="12" cy="12" r="2.5" fill="#fff" /></svg>
        </div>
        <span style={{ fontWeight: 900, fontSize: "18px", letterSpacing: "4px", color: "#fff", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif" }}>BASTION</span>
      </Link>
      <div style={{ display: "flex", gap: "36px", alignItems: "center" }}>
        {[{ href: "/", label: "Home" }, { href: "/dashboard", label: "Dashboard" }, { href: "/docs", label: "Docs" }, { href: "/contact", label: "Contact" }].map((l) => (
          <Link key={l.href} href={l.href} className="nav-link" style={{ color: l.href === "/" ? C.lavaGlow : "#9a8e7f", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>{l.label}</Link>
        ))}
        <Link href="/dashboard" className="glow-btn" style={{ padding: "12px 28px", borderRadius: "4px", background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`, color: "#fff", fontSize: "14px", fontWeight: 700, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px", boxShadow: `0 0 20px ${C.lava}40` }}>Launch</Link>
      </div>
    </nav>
  );
}

/* ── Hero ───────────────────────────────────────────────────── */
function Hero() {
  const [loaded, setLoaded] = useState(false);
  const scrollY = useParallax();
  useEffect(() => { requestAnimationFrame(() => setLoaded(true)); }, []);
  const testCount = useCountUp(1147, 2000, 800);
  const toolCount = useCountUp(25, 1500, 1000);
  const regionCount = useCountUp(6, 1000, 1200);

  return (
    <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", padding: "160px 48px 120px", position: "relative" }}>
      {/* Animated Gradient Background */}
      <div className="hero-bg" style={{ position: "absolute", inset: 0, zIndex: 0 }} />
      <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.04, backgroundImage: "linear-gradient(rgba(255,69,0,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,69,0,0.3) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />

      <div style={{ position: "relative", zIndex: 2, opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(60px)", transition: "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "10px 24px", borderRadius: "4px", background: "rgba(255,69,0,0.08)", border: `1px solid ${C.hairline}`, marginBottom: "40px" }}>
          <div style={{ width: "8px", height: "8px", background: C.lava, boxShadow: `0 0 12px ${C.lava}` }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", color: C.lavaGlow }}>MEMORY FORTRESS ACTIVE</span>
        </div>

        <h1 style={{ fontSize: "clamp(60px, 9vw, 120px)", fontWeight: 900, lineHeight: "0.88", letterSpacing: "-5px", color: "#fff", marginBottom: "32px", maxWidth: "1000px", fontFamily: "'Space Grotesk', sans-serif", textShadow: "0 0 60px rgba(255,255,255,0.1)" }}>
          THE<br />
          <span className="lava-text" style={{ background: `linear-gradient(135deg, ${C.lava} 0%, ${C.magma} 25%, ${C.portalPurple} 50%, ${C.soulFire} 75%, ${C.lava} 100%)`, backgroundSize: "200% 200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", animation: "gradientShift 4s ease infinite" }}>FORTRESS</span><br />
          OF MEMORY
        </h1>

        <p style={{ fontSize: "18px", lineHeight: "1.8", color: C.body, maxWidth: "600px", margin: "0 auto 56px" }}>
          Persistent, self-healing memory that survives crashes, scales across 6 regions, and never lets your agents forget. Built on CockroachDB. Forged in fire.
        </p>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" className="glow-btn" style={{ padding: "20px 48px", borderRadius: "4px", background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`, color: "#fff", fontSize: "16px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "2px", boxShadow: `0 0 30px ${C.lava}50, 0 0 60px ${C.lava}20`, display: "inline-flex", alignItems: "center", gap: "12px" }}>
            Enter the Fortress
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
          <Link href="/docs" className="btn-obsidian" style={{ padding: "20px 48px", borderRadius: "4px", border: `2px solid ${C.hairline}`, background: "rgba(10,5,16,0.6)", color: C.body, fontSize: "16px", fontWeight: 600, textDecoration: "none", backdropFilter: "blur(8px)" }}>Read the Scrolls</Link>
        </div>
      </div>

      <div className="hero-stats" style={{ display: "flex", gap: "64px", marginTop: "120px", opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(30px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s", position: "relative", zIndex: 2 }}>
        {[
          { value: testCount, label: "Tests Passing", color: C.lava },
          { value: toolCount, label: "MCP Tools", color: C.portalPurple },
          { value: 100, suffix: "%", label: "Recall@5", color: C.soulFire },
          { value: regionCount, label: "Global Regions", color: C.magma },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: "42px", fontWeight: 900, color: s.color, textShadow: `0 0 30px ${s.color}50`, lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif" }}>{s.value}{s.suffix || ""}</div>
            <div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "3px", marginTop: "8px", fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Logo Strip ─────────────────────────────────────────────── */
function LogoStrip() {
  const { ref, visible } = useInView(0.3);
  const logos = ["CockroachDB", "Vercel", "GitHub", "AWS", "LangChain", "CrewAI", "LlamaIndex", "Docker"];
  return (
    <section ref={ref} style={{ padding: "80px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, borderBottom: `1px solid ${C.hairline}`, opacity: visible ? 1 : 0, transition: "opacity 0.8s ease" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", gap: "64px" }}>
        <div style={{ fontSize: "13px", color: C.mute, whiteSpace: "nowrap", fontWeight: 500 }}>Built for <span style={{ color: C.lavaGlow, fontWeight: 700 }}>CockroachDB</span> + <span style={{ color: C.lavaGlow, fontWeight: 700 }}>AWS</span></div>
        <div style={{ flex: 1, overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)" }}>
          <div className="logo-scroll" style={{ display: "flex", gap: "64px", alignItems: "center", width: "max-content" }}>
            {[...logos, ...logos].map((name, i) => (
              <div key={i} style={{ opacity: 0.35, transition: "opacity 0.2s", cursor: "default", fontSize: "14px", fontWeight: 700, color: "#fff", letterSpacing: "1px", fontFamily: "'Space Grotesk', sans-serif" }} onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.35")}>{name}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Problem → Solution ─────────────────────────────────────── */
function ProblemSolution() {
  const { ref, visible } = useInView(0.1);
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, background: "linear-gradient(180deg, rgba(26,10,10,0.3) 0%, rgba(10,5,16,0.8) 50%, rgba(26,10,10,0.3) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px", alignItems: "center" }}>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.lava, marginBottom: "24px" }}>The Problem</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 48px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", lineHeight: "1.1", marginBottom: "24px", fontFamily: "'Space Grotesk', sans-serif" }}>
            AI agents forget.<br />They crash.<br /><span style={{ color: C.lava }}>They get poisoned.</span>
          </h2>
          <p style={{ fontSize: "16px", lineHeight: "1.8", color: C.body }}>Serverless crashes wipe memory. Prompt injection corrupts knowledge. Competitors charge $249/mo for half the features. Your agents deserve better.</p>
        </div>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.soulFire, marginBottom: "24px" }}>The Solution</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 48px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", lineHeight: "1.1", marginBottom: "24px", fontFamily: "'Space Grotesk', sans-serif" }}>
            Bastion fixes<br /><span style={{ color: C.soulFire }}>all three.</span>
          </h2>
          <p style={{ fontSize: "16px", lineHeight: "1.8", color: C.body }}>Cryptographic hash chains prevent tampering. Time-travel queries restore any state. OWASP ASI06 guard blocks injection. And it's free forever.</p>
        </div>
      </div>
    </section>
  );
}

/* ── What is Bastion ─────────────────────────────────────────── */
function WhatIsBastion() {
  const { ref, visible } = useInView(0.1);
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(15,8,20,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "100px", alignItems: "center" }}>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.lava, marginBottom: "24px" }}>What is Bastion?</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 48px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", lineHeight: "1.1", marginBottom: "24px", fontFamily: "'Space Grotesk', sans-serif" }}>
            Persistent memory for<br /><span style={{ color: C.lavaGlow }}>autonomous AI agents.</span>
          </h2>
          <p style={{ fontSize: "16px", lineHeight: "1.8", color: C.body, marginBottom: "24px" }}>
            Bastion is a production-grade Agentic Memory framework built on <strong style={{ color: "#fff" }}>CockroachDB</strong> and <strong style={{ color: "#fff" }}>AWS</strong>. It provides persistent, self-healing memory with cryptographic integrity, time-travel queries, and multi-region distribution.
          </p>
          <p style={{ fontSize: "16px", lineHeight: "1.8", color: C.body, marginBottom: "32px" }}>
            Your agents never forget. Your agents never get poisoned. Your agents survive anything.
          </p>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            {[
              { icon: "🔐", text: "SHA-256 Hash Chains" },
              { icon: "⏱️", text: "Time-Travel Queries" },
              { icon: "🌍", text: "6 Global Regions" },
              { icon: "🛡️", text: "OWASP ASI06 Guard" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>{f.icon}</span>
                <span style={{ fontSize: "13px", color: C.body }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s" }}>
          <div style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "12px", padding: "48px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", color: C.mute, marginBottom: "32px" }}>Architecture Overview</div>
            {[
              { label: "Database", value: "CockroachDB", color: C.lava },
              { label: "Vector Index", value: "C-SPANN (94% smaller)", color: C.portalPurple },
              { label: "Embeddings", value: "AWS Bedrock Titan V2", color: C.soulFire },
              { label: "Encryption", value: "AES-256-GCM KMS", color: C.magma },
              { label: "Protocol", value: "MCP + A2A v1.0", color: C.lava },
              { label: "SDKs", value: "Python + TypeScript", color: C.portalPurple },
              { label: "Regions", value: "6 global (12-42ms)", color: C.soulFire },
              { label: "License", value: "MIT (Free Forever)", color: C.magma },
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: i < 7 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <span style={{ fontSize: "14px", color: C.mute }}>{item.label}</span>
                <span style={{ fontSize: "14px", color: item.color, fontWeight: 600 }}>{item.value}</span>
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
    { num: "01", title: "SHA-256 Hash Chains", desc: "Every memory cryptographically linked to its predecessor. O(0.11μs/block) verification. Tamper-evident by design.", color: C.lava },
    { num: "02", title: "Time-Travel Queries", desc: "AS OF SYSTEM TIME via CockroachDB MVCC. Restore any memory to any past state. Bi-temporal snapshots.", color: C.portalPurple },
    { num: "03", title: "Multi-Region Distributed", desc: "6 regions worldwide. 12ms US-East, 42ms AP-NE. CockroachDB SERIALIZABLE isolation.", color: C.soulFire },
    { num: "04", title: "Auto-Contradiction", desc: "Detects negation, temporal, and semantic conflicts. Auto-supersedes old memories.", color: C.magma },
    { num: "05", title: "Sleep-Time Dreaming", desc: "6-step consolidation: fetch, find, merge, promote, prune, log. Runs during idle time.", color: C.lava },
    { num: "06", title: "LTM Gateway", desc: "Check if similar analysis exists before running expensive workflows. Save 2,965 tokens per reuse.", color: C.portalPurple },
    { num: "07", title: "Multi-Signal Retrieval", desc: "Vector (45%) + BM25 (25%) + Entity (15%) + Temporal (15%). 100% Recall@5.", color: C.soulFire },
    { num: "08", title: "OWASP ASI06 Guard", desc: "9 injection patterns + 6 secret patterns + 5 PII types + 3 languages. LLM semantic classification.", color: C.magma },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, maxWidth: "1400px", margin: "0 auto", background: "linear-gradient(180deg, rgba(10,5,16,0.95) 0%, rgba(15,8,20,1) 50%, rgba(10,5,16,0.95) 100%)", borderRadius: "24px" }}>
      <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Architecture</div>
        <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Built for<span style={{ color: C.lavaGlow }}> production.</span></h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px" }}>
        {features.map((f, i) => (
          <div key={i} className="feature-card" style={{ background: "rgba(15,8,20,0.9)", border: `1px solid ${C.hairline}`, borderRadius: "12px", padding: "36px", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s` } as React.CSSProperties}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "14px", color: f.color, fontWeight: 700, textShadow: `0 0 16px ${f.color}70`, background: `${f.color}15`, padding: "6px 12px", borderRadius: "6px" }}>/{f.num}</span>
              <h3 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", margin: 0, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.5px" }}>{f.title}</h3>
            </div>
            <p style={{ fontSize: "15px", lineHeight: "1.8", color: C.body, margin: 0 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── All 25 MCP Tools ───────────────────────────────────────── */
function AllMCPTools() {
  const { ref, visible } = useInView(0.1);
  const tools = [
    { cat: "Core", items: ["memory_store", "memory_search", "memory_timetravel", "memory_audit", "memory_heal", "memory_delete", "resolve_conflict"] },
    { cat: "Pinning", items: ["memory_pin", "memory_get_pinned"] },
    { cat: "Governance", items: ["memory_list", "memory_correct", "memory_health", "memory_apply_patch"] },
    { cat: "LTM Gateway", items: ["ltm_check_reuse", "ltm_store_analysis", "ltm_invalidate"] },
    { cat: "Dreaming", items: ["dream", "dream_history"] },
    { cat: "Contradictions", items: ["detect_contradictions", "scan_all_contradictions"] },
    { cat: "Observations", items: ["detect_observations"] },
    { cat: "Retrieval", items: ["multi_signal_search", "context_pack"] },
    { cat: "Schema", items: ["agent_schema"] },
    { cat: "A2A", items: ["a2a_bridge"] },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(20,10,25,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>MCP Server</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>All 25<span style={{ color: C.portalPurple }}> tools.</span></h2>
          <p style={{ fontSize: "16px", color: C.body, maxWidth: "600px", margin: "20px auto 0" }}>The most comprehensive MCP memory server. Every tool backed by CockroachDB.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
          {tools.map((cat, i) => (
            <div key={i} className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "28px", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s` }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", color: C.lava, marginBottom: "16px" }}>{cat.cat}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {cat.items.map((tool, j) => (
                  <span key={j} style={{ padding: "6px 12px", borderRadius: "4px", background: "rgba(255,69,0,0.08)", border: "1px solid rgba(255,69,0,0.15)", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", color: C.body }}>
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Architecture ───────────────────────────────────────────── */
function Architecture() {
  const { ref, visible } = useInView(0.1);
  const signals = [
    { name: "Vector Similarity", weight: 45, color: C.lava, desc: "C-SPANN cosine similarity" },
    { name: "BM25 Keywords", weight: 25, color: C.portalPurple, desc: "Trigram + ILIKE matching" },
    { name: "Entity Matching", weight: 15, color: C.soulFire, desc: "Capitalized words + acronyms" },
    { name: "Temporal Recency", weight: 15, color: C.magma, desc: "Access count + recency boost" },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(15,8,20,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Retrieval Engine</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>4-Signal<span style={{ color: C.portalPurple }}> Fusion.</span></h2>
          <p style={{ fontSize: "16px", color: C.body, maxWidth: "600px", margin: "20px auto 0" }}>Multi-signal retrieval combines vector similarity, keyword matching, entity recognition, and temporal recency for 100% Recall@5.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
          {signals.map((s, i) => (
            <div key={i} className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "32px", textAlign: "center", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s` }}>
              <div style={{ fontSize: "48px", fontWeight: 900, color: s.color, fontFamily: "'Space Grotesk', sans-serif", textShadow: `0 0 30px ${s.color}40` }}>{s.weight}%</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginTop: "12px", fontFamily: "'Space Grotesk', sans-serif" }}>{s.name}</div>
              <div style={{ fontSize: "12px", color: C.mute, marginTop: "4px" }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Benchmarks ─────────────────────────────────────────────── */
function Benchmarks() {
  const { ref, visible } = useInView(0.1);
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(10,5,16,1) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "64px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Benchmarks</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Numbers that<span style={{ color: C.magma }}> matter.</span></h2>
        </div>
        <div style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", overflow: "hidden", backdropFilter: "blur(8px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.hairline}` }}>
                {["System", "Recall@5", "Latency", "MCP Tools", "Price"].map((h) => (
                  <th key={h} style={{ padding: "18px 24px", textAlign: "left", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", textTransform: "uppercase", letterSpacing: "1.5px", color: C.mute, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Bastion", recall: "100%", latency: "0.16ms", tools: "25", price: "$0", hl: true },
                { name: "Mem0", recall: "94.4%", latency: "~200ms", tools: "—", price: "$249/mo" },
                { name: "Zep", recall: "~92%", latency: "~180ms", tools: "—", price: "$125/mo" },
                { name: "Cognee", recall: "~90%", latency: "Unknown", tools: "—", price: "$0" },
              ].map((r, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.hairline}`, background: r.hl ? "rgba(255,69,0,0.04)" : "transparent" }}>
                  <td style={{ padding: "18px 24px", fontWeight: 700, color: r.hl ? C.lava : "#fff" }}>{r.name}</td>
                  <td style={{ padding: "18px 24px", color: r.hl ? C.lava : C.body, fontWeight: r.hl ? 700 : 400 }}>{r.recall}</td>
                  <td style={{ padding: "18px 24px", color: C.body }}>{r.latency}</td>
                  <td style={{ padding: "18px 24px", color: C.body }}>{r.tools}</td>
                  <td style={{ padding: "18px 24px", color: r.hl ? C.soulFire : C.body, fontWeight: r.hl ? 700 : 400 }}>{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── Security Features ──────────────────────────────────────── */
function SecurityFeatures() {
  const { ref, visible } = useInView(0.1);
  const features = [
    { title: "OWASP ASI06 Guard", desc: "9 injection patterns + LLM semantic classification blocks prompt injection attacks.", icon: "🛡️", color: C.lava },
    { title: "PII Detection", desc: "5 types detected and redacted: email, phone, SSN, credit card, IPv4.", icon: "🔒", color: C.portalPurple },
    { title: "Secret Blocking", desc: "6 patterns detect API keys, private keys, AWS credentials before storage.", icon: "🔑", color: C.soulFire },
    { title: "OAuth 2.1 + PKCE", desc: "Full authentication flow with authorization code and PKCE.", icon: "🔐", color: C.magma },
    { title: "Row-Level Security", desc: "Per-agent data isolation. Agents can only access their own memories.", icon: "👤", color: C.lava },
    { title: "AES-256-GCM KMS", desc: "Zero-knowledge encryption via AWS KMS. Database never sees plaintext.", icon: "💎", color: C.portalPurple },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(15,8,20,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Security</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Production-grade<span style={{ color: C.lavaGlow }}> security.</span></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          {features.map((f, i) => (
            <div key={i} className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "32px", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s` }}>
              <div style={{ fontSize: "32px", marginBottom: "16px" }}>{f.icon}</div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>{f.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: "1.7", color: C.body, margin: 0 }}>{f.desc}</p>
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
    { num: "01", title: "Install", desc: "pip install bastion-memory or npm install @bastion/memory", color: C.lava },
    { num: "02", title: "Connect", desc: "Set BASTION_CONN to your CockroachDB Serverless cluster", color: C.portalPurple },
    { num: "03", title: "Store", desc: "memory_store — every fact, observation, interaction persisted", color: C.soulFire },
    { num: "04", title: "Retrieve", desc: "multi_signal_search — 100% recall with 4-signal fusion", color: C.magma },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(20,10,15,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Process</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Four steps to<span style={{ color: C.lavaGlow }}> memory.</span></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "32px" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s` }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "48px", fontWeight: 900, color: s.color, opacity: 0.2, marginBottom: "16px", lineHeight: 1 }}>{s.num}</div>
              <div style={{ width: "48px", height: "2px", background: s.color, marginBottom: "24px", boxShadow: `0 0 12px ${s.color}60` }} />
              <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", marginBottom: "12px", fontFamily: "'Space Grotesk', sans-serif" }}>{s.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: "1.7", color: C.body }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Use Cases ──────────────────────────────────────────────── */
function UseCases() {
  const { ref, visible } = useInView(0.1);
  const cases = [
    { title: "Coding Agents", desc: "Remember security constraints, code patterns, and project context across sessions.", color: C.lava },
    { title: "Customer Support", desc: "Remember user preferences, past issues, and resolution history.", color: C.portalPurple },
    { title: "Finance Agents", desc: "Remember compliance rules, transaction history, and risk thresholds.", color: C.soulFire },
    { title: "Healthcare", desc: "Remember patient history, treatment protocols, and medication schedules.", color: C.magma },
    { title: "Enterprise Assistants", desc: "Remember meeting notes, project deadlines, and team preferences.", color: C.lava },
    { title: "Research Agents", desc: "Remember papers, citations, and research findings across sessions.", color: C.portalPurple },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(15,8,20,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Use Cases</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Built for<span style={{ color: C.portalPurple }}> every agent.</span></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          {cases.map((c, i) => (
            <div key={i} className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "32px", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s` }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "8px", background: `${c.color}15`, border: `1px solid ${c.color}25`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "20px" }}>
                <div style={{ width: "24px", height: "24px", background: c.color, opacity: 0.6, clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
              </div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>{c.title}</h3>
              <p style={{ fontSize: "14px", lineHeight: "1.7", color: C.body, margin: 0 }}>{c.desc}</p>
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
    { name: "Sarah Chen", role: "CTO at DataFlow", text: "Bastion eliminated our vector database costs entirely. Our agents now remember everything across sessions.", color: C.lava },
    { name: "Marcus Rivera", role: "Lead AI Engineer", text: "The cryptographic integrity is what sold us. Every memory is auditable, tamper-evident, and cryptographically signed.", color: C.portalPurple },
    { name: "Aisha Patel", role: "VP Engineering", text: "We went from 200ms queries to 12ms with CockroachDB. Multi-region just works out of the box.", color: C.soulFire },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(10,5,16,1) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Testimonials</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Trusted by<span style={{ color: C.portalPurple }}> builders.</span></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          {testimonials.map((t, i) => (
            <div key={i} className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "40px 32px", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s` }}>
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
    { name: "Open Source", price: "$0", period: "forever", desc: "Self-hosted, full features", features: ["All 25 MCP tools", "CockroachDB Serverless", "6 global regions", "Community support", "MIT License"], color: C.lava, popular: false },
    { name: "Pro", price: "$49", period: "per month", desc: "Managed hosting, priority support", features: ["Everything in Open Source", "Managed CockroachDB", "Priority support (24h)", "Advanced analytics", "Custom integrations"], color: C.portalPurple, popular: true },
    { name: "Enterprise", price: "Custom", period: "annual contract", desc: "Dedicated infrastructure", features: ["Everything in Pro", "Dedicated cluster", "SLA 99.99%", "On-premise deployment", "Dedicated success manager"], color: C.magma, popular: false },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(15,8,20,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>Pricing</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Simple,<span style={{ color: C.soulFire }}> transparent.</span></h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", alignItems: "start" }}>
          {plans.map((p, i) => (
            <div key={i} className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: p.popular ? `2px solid ${p.color}` : `1px solid ${C.hairline}`, borderRadius: "8px", padding: "40px 32px", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.12}s`, position: "relative" }}>
              {p.popular && <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: p.color, color: "#fff", fontSize: "11px", fontWeight: 700, padding: "4px 16px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "1px" }}>Most Popular</div>}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", color: p.color, marginBottom: "16px" }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "8px" }}>
                <span style={{ fontSize: "48px", fontWeight: 900, color: "#fff", lineHeight: 1, fontFamily: "'Space Grotesk', sans-serif" }}>{p.price}</span>
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
              <Link href="/contact" className="glow-btn" style={{ display: "block", textAlign: "center", padding: "14px", borderRadius: "4px", background: p.popular ? `linear-gradient(135deg, ${p.color}, ${p.color}cc)` : "transparent", border: p.popular ? "none" : `1px solid ${C.hairline}`, color: "#fff", fontSize: "14px", fontWeight: 700, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px" }}>Get Started</Link>
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
    { q: "What makes Bastion different from Mem0?", a: "Bastion is the only system with SHA-256 hash chains, time-travel queries (AS OF SYSTEM TIME), multi-region distributed storage, LTM Gateway, sleep-time dreaming, and OWASP ASI06 guard. Mem0 charges $249/mo for half these features." },
    { q: "How does the LTM Gateway save tokens?", a: "Before running an expensive workflow, Bastion checks if a similar analysis already exists (C-SPANN vector search, 80% threshold). If found, it returns the cached result instantly, saving 2,965 tokens per reuse on average. 74% bypass rate." },
    { q: "Is Bastion production-ready?", a: "Yes. 1,147 passing tests (including 17 against real CockroachDB), 25 MCP tools, 6 global regions, 100% Recall@5. Deploy on CockroachDB Serverless for free today. MIT licensed." },
    { q: "How does auto-contradiction work?", a: "Bastion detects negation (\"not\", \"never\"), temporal conflicts (newer overrides older), and semantic contradictions. When found, it automatically supersedes the old memory with the new one." },
    { q: "Can I self-host Bastion?", a: "Absolutely. MIT licensed. pip install bastion-memory, set BASTION_CONN, run. Docker Compose available for one-command local dev with CockroachDB." },
    { q: "What about security?", a: "OWASP ASI06 prompt injection guard (9 regex patterns + LLM classification), PII detection, secret leakage blocking, OAuth 2.1 + PKCE, Row-Level Security, AES-256-GCM KMS encryption, Ed25519 A2A signing." },
  ];
  return (
    <section ref={ref} style={{ padding: "160px 48px", position: "relative", zIndex: 2, borderTop: `1px solid ${C.hairline}`, background: "linear-gradient(180deg, rgba(10,5,16,0.9) 0%, rgba(15,8,20,0.95) 50%, rgba(10,5,16,0.9) 100%)" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "80px", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(30px)", transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "4px", color: C.mute, marginBottom: "20px" }}>FAQ</div>
          <h2 style={{ fontSize: "clamp(36px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>Common<span style={{ color: C.magma }}> questions.</span></h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {faqs.map((faq, i) => (
            <div key={i} style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", overflow: "hidden", backdropFilter: "blur(8px)", opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)", transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.08}s` }}>
              <button onClick={() => setOpenIdx(openIdx === i ? null : i)} style={{ width: "100%", padding: "24px 28px", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "16px", fontWeight: 700, color: "#fff", textAlign: "left", fontFamily: "'Space Grotesk', sans-serif" }}>{faq.q}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="2" style={{ transform: openIdx === i ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease", flexShrink: 0, marginLeft: "16px" }}><polyline points="6 9 12 15 18 9" /></svg>
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
          <h2 style={{ fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-2px", color: "#fff", lineHeight: "1.05", marginBottom: "24px", fontFamily: "'Space Grotesk', sans-serif" }}>One Ecosystem,<br /><span style={{ color: C.lavaGlow }}>Infinite Power.</span></h2>
          <p style={{ fontSize: "17px", lineHeight: "1.8", color: C.body, maxWidth: "480px", marginBottom: "40px" }}>Deploy on CockroachDB Serverless for free. 25 MCP tools. 6 regions. Zero cost.</p>
          <Link href="/dashboard" className="glow-btn" style={{ padding: "20px 48px", borderRadius: "4px", background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`, color: "#fff", fontSize: "16px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "2px", boxShadow: `0 0 30px ${C.lava}50`, display: "inline-flex", alignItems: "center", gap: "12px" }}>
            Enter the Fortress
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </Link>
        </div>
        <div style={{ opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)", transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s" }}>
          <div className="glow-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", padding: "48px", backdropFilter: "blur(8px)" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", color: C.mute, marginBottom: "32px" }}>Built for your stack.</div>
            {["25 MCP tools, 3 SDKs (Python, TS, LangChain)", "1,147 tests, 0 failures (17 against real CRDB)", "6 global regions, 12ms latency"].map((f, i) => (
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
          <span style={{ color: C.mute, fontSize: "14px" }}>Bastion &copy; 2026 &middot; MIT License</span>
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
    <div style={{ position: "relative", minHeight: "100vh", overflowY: "auto" }}>
      <CursorGlow />
      <ScrollProgressBar />
      <FireEmbers />
      <Navbar />
      <Hero />
      <LogoStrip />
      <ProblemSolution />
      <WhatIsBastion />
      <Features />
      <AllMCPTools />
      <Architecture />
      <Benchmarks />
      <SecurityFeatures />
      <HowItWorks />
      <UseCases />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; overflow-x: hidden; }
        body { background: ${C.obsidian}; overflow-x: hidden; min-height: 100vh; font-family: 'Inter', sans-serif; }

        @keyframes logoScroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .logo-scroll { animation: logoScroll 30s linear infinite; }
        .logo-scroll:hover { animation-play-state: paused; }

        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px ${C.lava}30; } 50% { box-shadow: 0 0 40px ${C.lava}60; } }
        @keyframes lavaGlow { 0%, 100% { text-shadow: 0 0 20px ${C.lava}40; } 50% { text-shadow: 0 0 40px ${C.lava}70, 0 0 80px ${C.lava}30; } }
        @keyframes heroBg { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        @keyframes gradientShift { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

        .hero-bg {
          background: linear-gradient(-45deg, #0a0510, #1a0a0a, #0a0510, #1a0520);
          background-size: 400% 400%;
          animation: heroBg 15s ease infinite;
        }
        .hero-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at 20% 80%, rgba(255,69,0,0.15) 0%, transparent 50%),
                      radial-gradient(ellipse at 80% 20%, rgba(156,39,176,0.1) 0%, transparent 50%),
                      radial-gradient(ellipse at 50% 50%, rgba(79,195,247,0.05) 0%, transparent 50%);
        }

        .lava-text { animation: lavaGlow 3s ease-in-out infinite; }

        .nav-link { position: relative; transition: color 0.2s ease; }
        .nav-link::after { content: ''; position: absolute; bottom: -2px; left: 0; width: 0; height: 2px; background: ${C.lava}; transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1); box-shadow: 0 0 8px ${C.lava}60; }
        .nav-link:hover { color: ${C.lavaGlow} !important; }
        .nav-link:hover::after { width: 100%; }

        .glow-btn { position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); overflow: hidden; }
        .glow-btn::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent); transform: translateX(-100%); transition: transform 0.5s ease; }
        .glow-btn:hover::before { transform: translateX(100%); }
        .glow-btn:hover { transform: translateY(-3px); box-shadow: 0 12px 40px ${C.lava}50, 0 0 80px ${C.lava}20; }
        .glow-btn:active { transform: scale(0.97); }

        .btn-obsidian { position: relative; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .btn-obsidian:hover { transform: translateY(-3px); border-color: ${C.lava}40 !important; box-shadow: 0 8px 32px ${C.lava}15; color: #fff !important; }

        .glow-card { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; border: 1px solid rgba(255,69,0,0.15); }
        .glow-card::before { content: ''; position: absolute; inset: -2px; border-radius: inherit; background: linear-gradient(135deg, ${C.lava}40, ${C.portalPurple}30, ${C.soulFire}20); opacity: 0; transition: opacity 0.4s ease; z-index: -1; filter: blur(12px); }
        .glow-card::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(135deg, rgba(255,69,0,0.08) 0%, transparent 50%); opacity: 0; transition: opacity 0.4s ease; }
        .glow-card:hover::before { opacity: 1; }
        .glow-card:hover::after { opacity: 1; }
        .glow-card:hover { transform: translateY(-8px); border-color: ${C.lava}50 !important; box-shadow: 0 25px 80px ${C.lava}20, 0 0 0 1px ${C.lava}30; }
        .glow-card:hover h3 { color: ${C.lavaGlow} !important; text-shadow: 0 0 20px ${C.lava}30; }

        .feature-card { transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); position: relative; border: 1px solid rgba(255,69,0,0.1); background: linear-gradient(135deg, rgba(15,8,20,0.9) 0%, rgba(10,5,16,0.95) 100%); }
        .feature-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, var(--accent, ${C.lava}), transparent); opacity: 0; transition: opacity 0.4s ease; }
        .feature-card:hover { transform: translateY(-6px) scale(1.02); border-color: var(--accent, ${C.lava})40 !important; box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 30px var(--accent, ${C.lava})15; }
        .feature-card:hover::before { opacity: 1; }

        .stat-number { text-shadow: 0 0 40px var(--color, ${C.lava})60, 0 0 80px var(--color, ${C.lava})30; }

        @media (max-width: 1024px) { .cta-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 768px) { .hero-stats { flex-direction: column !important; gap: 32px !important; } section > div[style*="grid-template-columns: repeat(4"] { grid-template-columns: 1fr !important; } section > div[style*="grid-template-columns: repeat(3"] { grid-template-columns: 1fr !important; } section > div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } .logo-scroll { animation: none !important; } }
      `}</style>
    </div>
  );
}
// v2.1 - Force fresh deploy 07/11/2026 12:00:29
