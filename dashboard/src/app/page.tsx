"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
  canvas: "#0a0a0a", canvasSoft: "#111520", card: "#0c1018",
  hairline: "rgba(255,255,255,0.08)", ink: "#ffffff", body: "#c8ccd4",
  mute: "#6b7280", sunset: "#ff7a17", dusk: "#7c3aed",
  breeze: "#00e5ff", emerald: "#00ff88", accent: "#00e5ff",
};

/* ── Navigation Links ──────────────────────────────────────── */
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
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ── Smooth Scroll Hook ──────────────────────────────────────── */
function useSmoothScroll() {
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href^="#"]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href === '#') return;
      const el = document.querySelector(href);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);
}

/* ── Parallax Scroll Hook ────────────────────────────────────── */
function useParallax() {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return scrollY;
}

/* ── Scroll Progress Hook ────────────────────────────────────── */
function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollTop = window.scrollY;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          setProgress(docHeight > 0 ? scrollTop / docHeight : 0);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  return progress;
}

/* ── Magnetic Cursor Hook ────────────────────────────────────── */
function useMagnetic(strength = 0.3) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
    };
    const handleLeave = () => {
      el.style.transform = 'translate(0, 0)';
    };
    el.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      el.removeEventListener('mousemove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [strength]);
  return ref;
}

/* ── Animated Counter ────────────────────────────────────────── */
function AnimatedCounter({ target, duration = 2000, suffix = "" }: { target: number; duration?: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const { ref, visible } = useInView(0.3);
  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [visible, target, duration]);
  return (
    <span ref={ref} style={{ display: "inline-block" }}>
      {count}{suffix}
    </span>
  );
}

/* ── Floating Orb ────────────────────────────────────────────── */
function FloatingOrb({ color, size, top, left, delay = 0 }: { color: string; size: number; top: string; left: string; delay?: number }) {
  return (
    <div style={{
      position: "absolute", top, left, width: `${size}px`, height: `${size}px`,
      borderRadius: "50%", background: `radial-gradient(circle, ${color}15 0%, transparent 70%)`,
      filter: "blur(40px)", pointerEvents: "none",
      animation: `orbFloat 8s ease-in-out infinite ${delay}s`,
    }} />
  );
}

/* ── Cursor Glow ─────────────────────────────────────────────── */
function CursorGlow() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);
  return (
    <div style={{
      position: "fixed", left: pos.x - 150, top: pos.y - 150,
      width: "300px", height: "300px", borderRadius: "50%",
      background: "radial-gradient(circle, rgba(0,229,255,0.06) 0%, transparent 70%)",
      pointerEvents: "none", zIndex: 0, transition: "left 0.15s ease-out, top 0.15s ease-out",
    }} />
  );
}

/* ── Particle Network with Glow ──────────────────────────────── */
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

    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.8 + 0.4,
      o: Math.random() * 0.25 + 0.08,
      z: Math.random(),
      pulse: Math.random() * Math.PI * 2,
    }));

    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Draw glowing connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const avgZ = (particles[i].z + particles[j].z) / 2;
            const alpha = 0.1 * (1 - dist / 160) * (0.5 + avgZ * 0.5);
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Draw particles with glow
      for (const p of particles) {
        p.x += p.vx * (0.5 + p.z * 0.5);
        p.y += p.vy * (0.5 + p.z * 0.5);
        p.pulse += 0.015;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;

        const alpha = p.o * (0.5 + p.z * 0.5);
        const size = p.r * (0.5 + p.z * 0.5) * (1 + Math.sin(p.pulse) * 0.12);

        // Outer glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 229, 255, ${alpha * 0.08})`;
        ctx.fill();

        // Core glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
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
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
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

/* ── Navbar ──────────────────────────────────────────────────── */
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
        <span style={{
          fontWeight: 800, fontSize: "18px", letterSpacing: "3px",
          color: "#fff", textTransform: "uppercase",
        }}>
          BASTION
        </span>
      </Link>

      <div className="nav-links" style={{ display: "flex", gap: "40px", alignItems: "center" }}>
        {navLinks.map((l) => (
          <Link key={l.href} href={l.href} className="hover-underline" style={{
            color: l.href === "/" ? "#fff" : "#9ca3af",
            fontSize: "14px", textDecoration: "none", transition: "color 0.2s",
            fontWeight: 500,
          }}>
            {l.label}
          </Link>
        ))}
        <Link href="/dashboard" className="btn-animated" style={{
          padding: "12px 32px", borderRadius: "9999px",
          border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
          color: "#fff", fontSize: "14px", fontWeight: 500, textDecoration: "none",
          transition: "all 0.2s",
        }}>
          Launch Dashboard
        </Link>
      </div>
    </nav>
  );
}

/* ── Hero Section ──────────────────────────────────────────────── */
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
      {/* Gradient Background */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "linear-gradient(180deg, #0a0a0a 0%, #111827 50%, #0a0a0a 100%)",
      }} />

      {/* Subtle Grid Pattern */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0, opacity: 0.03,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
        `,
        backgroundSize: "80px 80px",
      }} />

      {/* Glowing Orbs */}
      <div style={{
        position: "absolute", top: "20%", left: "50%", transform: `translateX(-50%) translateY(${scrollY * 0.15}px)`,
        width: "800px", height: "800px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,229,255,0.06) 0%, rgba(124,58,237,0.03) 40%, transparent 70%)",
        filter: "blur(100px)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", top: "30%", left: "30%", transform: `translateY(${scrollY * 0.1}px)`,
        width: "400px", height: "400px", borderRadius: "50%",
        background: "radial-gradient(circle, rgba(124,58,237,0.04) 0%, transparent 60%)",
        filter: "blur(80px)", pointerEvents: "none",
      }} />

      {/* Floating Orbs */}
      <FloatingOrb color="#00e5ff" size={200} top="15%" left="10%" delay={0} />
      <FloatingOrb color="#7c3aed" size={160} top="60%" left="80%" delay={2} />
      <FloatingOrb color="#ff7a17" size={120} top="70%" left="15%" delay={4} />
      <FloatingOrb color="#00ff88" size={140} top="20%" left="75%" delay={1} />

      <div style={{
        position: "relative", zIndex: 1,
        opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(50px)",
        transition: "all 1.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Version Badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "8px 20px", borderRadius: "9999px",
          background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.15)",
          marginBottom: "40px",
        }}>
          <div style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "#00ff88", boxShadow: "0 0 8px #00ff88",
          }} />
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "2px", color: "#00e5ff",
          }}>
            VERSION 1.0 HAS BEEN LAUNCHED
          </span>
        </div>

        {/* Main Headline */}
        <h1 style={{
          fontSize: "clamp(56px, 8vw, 96px)", fontWeight: 500, lineHeight: "0.92",
          letterSpacing: "-4px", color: "#fff", marginBottom: "32px",
          maxWidth: "900px", fontFamily: "'Space Grotesk', system-ui, sans-serif",
        }}>
          Strategic AI to Scale Your
          <br />
          <span style={{
            background: "linear-gradient(135deg, #00e5ff 0%, #7c3aed 50%, #ff7a17 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Business Growth.
          </span>
        </h1>

        {/* Subheadline */}
        <p style={{
          fontSize: "18px", lineHeight: "1.8", color: "#9ca3af",
          maxWidth: "600px", margin: "0 auto 56px",
        }}>
          Transform complex workflows into intelligent, streamlined systems.
          We build AI solutions that move in sync with your team's rhythm.
        </p>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" className="glow-btn" style={{
            padding: "18px 40px", borderRadius: "9999px",
            background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 600, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: "10px",
            boxShadow: "0 4px 24px rgba(255,255,255,0.15)",
          }}>
            Start Your AI
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
          <Link href="/docs" className="glow-btn" style={{
            padding: "18px 40px", borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.2)", background: "transparent",
            color: "#fff", fontSize: "15px", fontWeight: 500, textDecoration: "none",
          }}>
            Read Documentation
          </Link>
        </div>
      </div>

      {/* Floating Stats */}
      <div className="hero-stats" style={{
        display: "flex", gap: "64px", marginTop: "120px",
        opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(30px)",
        transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s",
        position: "relative", zIndex: 1,
      }}>
        {[
          { value: "1,058", label: "Tests Passing", color: "#00e5ff" },
          { value: "22", label: "MCP Tools", color: "#7c3aed" },
          { value: "4/4", label: "CRDB Features", color: "#ff7a17" },
          { value: "5/5", label: "AWS Services", color: "#00ff88" },
        ].map((s, i) => (
          <div key={s.label} style={{ textAlign: "center" }}>
            <div style={{
              fontSize: "42px", fontWeight: 700, color: s.color,
              textShadow: `0 0 30px ${s.color}40`,
              lineHeight: 1,
            }}>{s.value}</div>
            <div style={{
              fontSize: "11px", color: "#6b7280", textTransform: "uppercase",
              letterSpacing: "2.5px", marginTop: "8px", fontWeight: 500,
            }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Logo Strip ──────────────────────────────────────────────── */
function LogoStrip() {
  const { ref, visible } = useInView(0.3);
  const logos = [
    { name: "CockroachDB", color: "#6933ff" },
    { name: "Vercel", color: "#fff" },
    { name: "GitHub", color: "#fff" },
    { name: "AWS", color: "#ff9900" },
    { name: "Slack", color: "#4a154b" },
    { name: "Mintlify", color: "#00e5ff" },
  ];

  return (
    <section ref={ref} style={{
      padding: "80px 48px",
      borderTop: "1px solid rgba(255,255,255,0.04)",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      position: "relative", zIndex: 1,
      opacity: visible ? 1 : 0,
      transition: "opacity 0.8s ease",
    }}>
      <div style={{
        maxWidth: "1200px", margin: "0 auto",
        display: "flex", alignItems: "center", gap: "64px",
      }}>
        <div style={{
          fontSize: "13px", color: "#6b7280", whiteSpace: "nowrap",
          fontWeight: 500, letterSpacing: "0.5px",
        }}>
          Trusted by <span style={{ color: "#fff", fontWeight: 600 }}>80,000+</span>
          <br />companies of all sizes
        </div>

        <div style={{
          flex: 1, overflow: "hidden", position: "relative",
          maskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, black 10%, black 90%, transparent)",
        }}>
          <div className="logo-scroll" style={{
            display: "flex", gap: "64px", alignItems: "center",
            width: "max-content",
          }}>
            {[...logos, ...logos].map((logo, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "8px",
                opacity: 0.4, transition: "opacity 0.2s",
                cursor: "default",
              }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.8"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "0.4"}
              >
                <div style={{
                  width: "28px", height: "28px", borderRadius: "6px",
                  background: logo.color === "#fff" ? "rgba(255,255,255,0.1)" : `${logo.color}20`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={logo.color === "#fff" ? "#fff" : logo.color}>
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                </div>
                <span style={{
                  fontSize: "14px", fontWeight: 600, color: "#fff",
                  letterSpacing: "0.5px",
                }}>
                  {logo.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Features Section (Two-Column) ────────────────────────────── */
function Features() {
  const { ref, visible } = useInView(0.1);
  const features = [
    {
      num: "01",
      title: "Cryptographic Integrity",
      desc: "SHA-256 hash chains with Merkle tree verification. Every memory is tamper-evident and auditable.",
      accent: "#00e5ff",
    },
    {
      num: "02",
      title: "Time-Travel Queries",
      desc: "AS OF SYSTEM TIME — restore any memory to any past state. CockroachDB MVCC native.",
      accent: "#7c3aed",
    },
    {
      num: "03",
      title: "Multi-Region Distributed",
      desc: "Globally distributed via CockroachDB. Memory stored in EU, retrieved from US in 12ms.",
      accent: "#00ff88",
    },
    {
      num: "04",
      title: "Auto-Contradiction",
      desc: "When new facts contradict old ones, Bastion auto-supersedes. No competitor has this.",
      accent: "#ff7a17",
    },
  ];

  return (
    <section ref={ref} style={{
      padding: "160px 48px", position: "relative", zIndex: 1,
      maxWidth: "1400px", margin: "0 auto",
    }}>
      <div className="features-grid" style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "120px",
        alignItems: "start",
      }}>
        {/* Left Column */}
        <div style={{
          opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)",
          transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
          position: "sticky", top: "160px",
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280",
            marginBottom: "24px",
          }}>
            Architecture
          </div>
          <h2 style={{
            fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 500, letterSpacing: "-2px",
            color: "#fff", lineHeight: "1.05", marginBottom: "28px",
          }}>
            Focused on Results,
            <br />
            Not Complexity.
          </h2>
          <p style={{
            fontSize: "17px", lineHeight: "1.8", color: "#9ca3af",
            maxWidth: "440px",
          }}>
            We translate the potential of AI into concrete operational strategies.
            No fluff, just direct impact on your bottom line.
          </p>
        </div>

        {/* Right Column */}
        <div style={{
          display: "flex", flexDirection: "column", gap: "0",
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "3px", color: "#6b7280",
            marginBottom: "40px", paddingBottom: "24px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}>
            WHAT SETS US APART
          </div>

          {features.map((f, i) => (
            <div key={i} className="feature-row" style={{
              padding: "32px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "grid", gridTemplateColumns: "60px 1fr", gap: "24px",
              alignItems: "start", cursor: "default", borderRadius: "12px",
              marginLeft: "-24px", marginRight: "-24px",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(20px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
            }}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: "13px",
                color: f.accent, fontWeight: 600, marginTop: "4px",
                textShadow: `0 0 12px ${f.accent}50`,
              }}>
                /{f.num}
              </div>
              <div>
                <h3 style={{
                  fontSize: "18px", fontWeight: 600, color: "#fff",
                  marginBottom: "8px", letterSpacing: "-0.3px",
                }}>
                  {f.title}
                </h3>
                <p style={{
                  fontSize: "14px", lineHeight: "1.7", color: "#9ca3af",
                }}>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Stats Section ────────────────────────────────────────────── */
function Stats() {
  const { ref, visible } = useInView(0.2);
  const stats = [
    { value: "7", label: "Production-Ready", sublabel: "Core Features", color: "#00e5ff" },
    { value: "48+", label: "MCP Tools", sublabel: "Available Now", color: "#7c3aed" },
    { value: "64%", label: "Cost Reduction", sublabel: "vs. Competitors", color: "#00ff88" },
  ];

  return (
    <section ref={ref} style={{
      padding: "140px 48px", position: "relative", zIndex: 1,
      background: "linear-gradient(180deg, transparent 0%, rgba(0,229,255,0.02) 50%, transparent 100%)",
    }}>
      <div className="stats-grid" style={{
        maxWidth: "1200px", margin: "0 auto",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "80px",
      }}>
        {stats.map((s, i) => (
          <div key={i} style={{
            textAlign: "center",
            opacity: visible ? 1 : 0,
            transform: visible ? "translateY(0)" : "translateY(40px)",
            transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.15}s`,
          }}>
            <div style={{
              fontSize: "clamp(64px, 8vw, 96px)", fontWeight: 700, color: s.color,
              textShadow: `0 0 40px ${s.color}30`,
              lineHeight: 0.9, marginBottom: "16px",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
            }}>
              {s.value}
            </div>
            <div style={{
              fontSize: "16px", fontWeight: 600, color: "#fff",
              marginBottom: "4px",
            }}>
              {s.label}
            </div>
            <div style={{
              fontSize: "13px", color: "#6b7280",
              letterSpacing: "1px", textTransform: "uppercase",
            }}>
              {s.sublabel}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Partners Section ─────────────────────────────────────────── */
function Partners() {
  const { ref, visible } = useInView(0.1);
  const partners = [
    {
      title: "Accelerated ROI",
      desc: "See real, tangible results in weeks, not months.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
    },
    {
      title: "Value-Driven",
      desc: "Reclaim 48+ hours monthly and redirect your team to focus on pure innovation.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    {
      title: "Intelligent Automation",
      desc: "Reduce 64% of repetitive tasks with high-precision workflows.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ),
    },
    {
      title: "Strategic Partnership",
      desc: "We are not just vendors — we are partners who understand your vision.",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff7a17" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
    },
  ];

  return (
    <section ref={ref} style={{
      padding: "160px 48px", position: "relative", zIndex: 1,
      borderTop: "1px solid rgba(255,255,255,0.04)",
    }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div className="partners-grid" style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "120px",
          alignItems: "start", marginBottom: "100px",
        }}>
          {/* Left */}
          <div style={{
            opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)",
            transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280",
              marginBottom: "24px",
            }}>
              Partners
            </div>
            <h2 style={{
              fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 500, letterSpacing: "-2px",
              color: "#fff", lineHeight: "1.05",
            }}>
              Why Industry Leaders
              <br />
              Partner With Us.
            </h2>
          </div>

          {/* Right */}
          <div style={{
            opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)",
            transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
          }}>
            <p style={{
              fontSize: "17px", lineHeight: "1.8", color: "#9ca3af",
              maxWidth: "480px",
            }}>
              Human-Centered Approach. High-Performance Compute.
            </p>
          </div>
        </div>

        {/* Partner Cards Grid */}
        <div className="partner-cards stagger-children" style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px",
        }}>
          {partners.map((p, i) => (
            <div key={i} className="glow-card" style={{
              background: C.card, border: `1px solid ${C.hairline}`,
              borderRadius: "16px", padding: "36px 28px",
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(30px)",
              transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.1}s`,
            }}>
              <div className="icon-glow" style={{
                width: "48px", height: "48px", borderRadius: "12px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                display: "flex", alignItems: "center", justifyContent: "center",
                marginBottom: "24px",
                transition: "all 0.3s ease",
              }}>
                {p.icon}
              </div>
              <h3 style={{
                fontSize: "16px", fontWeight: 600, color: "#fff",
                marginBottom: "12px", letterSpacing: "-0.2px",
              }}>
                {p.title}
              </h3>
              <p style={{
                fontSize: "14px", lineHeight: "1.7", color: "#9ca3af",
              }}>
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA Section ──────────────────────────────────────────────── */
function CTA() {
  const { ref, visible } = useInView(0.2);
  const features = [
    "Build efficiently with MCP tools",
    "Test thoroughly with 1,058+ tests",
    "Run and monitor across regions",
  ];

  return (
    <section ref={ref} style={{
      padding: "160px 48px", position: "relative", zIndex: 1,
      overflow: "hidden",
    }}>
      {/* Background Gradient */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: "linear-gradient(180deg, transparent 0%, rgba(0,229,255,0.03) 50%, transparent 100%)",
      }} />

      <div className="cta-grid" style={{
        maxWidth: "1200px", margin: "0 auto",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "80px",
        alignItems: "center",
        position: "relative", zIndex: 1,
      }}>
        {/* Left */}
        <div style={{
          opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(-40px)",
          transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: "4px", color: "#6b7280",
            marginBottom: "24px",
          }}>
            Get Started
          </div>
          <h2 style={{
            fontSize: "clamp(40px, 5vw, 56px)", fontWeight: 500, letterSpacing: "-2px",
            color: "#fff", lineHeight: "1.05", marginBottom: "24px",
          }}>
            One Ecosystem,
            <br />
            <span style={{
              background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Infinite Power.
            </span>
          </h2>
          <p style={{
            fontSize: "17px", lineHeight: "1.8", color: "#9ca3af",
            maxWidth: "480px", marginBottom: "40px",
          }}>
            Unlock endless possibilities. Seamlessly integrate AI into your
            operational line of business. Our custom architecture designed to align
            with your organization's workflow, ensuring all departments move in sync.
          </p>

          <Link href="/dashboard" className="glow-btn" style={{
            padding: "18px 40px", borderRadius: "9999px",
            background: "#fff", color: "#0a0a0a",
            fontSize: "15px", fontWeight: 600, textDecoration: "none",
            display: "inline-flex", alignItems: "center", gap: "10px",
            boxShadow: "0 4px 24px rgba(255,255,255,0.15)",
          }}>
            Start Your AI
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        {/* Right - Feature List */}
        <div style={{
          opacity: visible ? 1 : 0, transform: visible ? "translateX(0)" : "translateX(40px)",
          transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
        }}>
          <div style={{
            background: C.card, border: `1px solid ${C.hairline}`,
            borderRadius: "20px", padding: "48px",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", fontWeight: 600,
              textTransform: "uppercase", letterSpacing: "3px", color: "#6b7280",
              marginBottom: "32px",
            }}>
              Intelligent architecture tailored to your unique requirements.
            </div>

            {features.map((f, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "16px",
                padding: "20px 0",
                borderBottom: i < features.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}>
                <div style={{
                  width: "32px", height: "32px", borderRadius: "8px",
                  background: "rgba(0,229,255,0.08)",
                  border: "1px solid rgba(0,229,255,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span style={{ fontSize: "15px", color: "#c8ccd4", fontWeight: 500 }}>
                  {f}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Footer ────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer style={{
      padding: "64px 48px", borderTop: `1px solid ${C.hairline}`,
      position: "relative", zIndex: 1,
    }}>
      <div style={{
        maxWidth: "1200px", margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "28px", height: "28px", borderRadius: "8px",
            background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2" />
            </svg>
          </div>
          <span style={{ color: "#6b7280", fontSize: "14px" }}>
            Bastion &copy; 2026
          </span>
        </div>

        <div style={{ display: "flex", gap: "32px" }}>
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="hover-underline" style={{
              color: "#6b7280", fontSize: "14px", textDecoration: "none",
              transition: "color 0.2s",
            }}>
              {l.label}
            </Link>
          ))}
        </div>

        <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: "8px",
            color: "#6b7280", fontSize: "14px", textDecoration: "none",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = "#fff"}
          onMouseLeave={(e) => e.currentTarget.style.color = "#6b7280"}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.303 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.236 1.911 1.236 3.221 0 4.609-2.807 5.931-5.479 6.234.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub
        </a>
      </div>
    </footer>
  );
}

/* ── Skeleton Loading ──────────────────────────────────────────── */
function SkeletonLoader() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShow(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#0a0a0a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: "24px", padding: "48px",
      animation: "fadeOut 0.5s ease forwards",
      animationDelay: "0.8s",
    }}>
      <div style={{
        width: "48px", height: "48px", borderRadius: "12px",
        background: "linear-gradient(135deg, #00e5ff, #7c3aed)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "pulseGlow 1.5s ease-in-out infinite",
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="#fff" strokeWidth="2.5" />
        </svg>
      </div>
      <div className="skeleton skeleton-title" style={{ width: "200px" }} />
      <div className="skeleton skeleton-text" style={{ width: "300px" }} />
    </div>
  );
}

/* ── Scroll Progress Bar ──────────────────────────────────────── */
function ScrollProgressBar() {
  const progress = useScrollProgress();
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, height: "3px", zIndex: 200,
      background: "rgba(255,255,255,0.03)",
    }}>
      <div style={{
        height: "100%", width: `${progress * 100}%`,
        background: "linear-gradient(90deg, #00e5ff, #7c3aed, #ff7a17)",
        boxShadow: "0 0 12px rgba(0,229,255,0.4)",
        transition: "width 0.1s ease-out",
      }} />
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */
export default function LandingPage() {
  useSmoothScroll();

  return (
    <>
      <SkeletonLoader />
      <CursorGlow />
      <ScrollProgressBar />
      <ParticleNetwork />
      <Navbar />
      <Hero />
      <LogoStrip />
      <Features />
      <Stats />
      <Partners />
      <CTA />
      <Footer />

      {/* Global Animations & Effects */}
      <style>{`
        /* Logo Carousel */
        @keyframes logoScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .logo-scroll {
          animation: logoScroll 30s linear infinite;
        }
        .logo-scroll:hover {
          animation-play-state: paused;
        }

        /* Page Enter Animation */
        @keyframes pageReveal {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        body > div > *:not(canvas):not(nav) {
          animation: pageReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Fade Out */
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; pointer-events: none; }
        }

        /* Glowing Card Hover */
        .glow-card {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          position: relative;
        }
        .glow-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(0,229,255,0.15), rgba(124,58,237,0.15), rgba(255,122,23,0.1));
          opacity: 0;
          transition: opacity 0.4s ease;
          z-index: -1;
          filter: blur(8px);
        }
        .glow-card:hover::before {
          opacity: 1;
        }
        .glow-card:hover {
          transform: translateY(-4px);
          border-color: rgba(0,229,255,0.2);
        }

        /* Glowing Button */
        .glow-btn {
          position: relative;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .glow-btn::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          background: linear-gradient(135deg, #00e5ff, #7c3aed);
          opacity: 0;
          filter: blur(12px);
          transition: opacity 0.3s ease;
          z-index: -1;
        }
        .glow-btn:hover::after {
          opacity: 0.4;
        }
        .glow-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 32px rgba(0,229,255,0.25);
        }
        .glow-btn:active {
          transform: scale(0.97);
        }

        /* Section Fade In */
        @keyframes sectionFadeIn {
          from { opacity: 0; transform: translateY(40px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Gradient Text Animation */
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .gradient-text-animated {
          background: linear-gradient(135deg, #00e5ff 0%, #7c3aed 25%, #ff7a17 50%, #7c3aed 75%, #00e5ff 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradientShift 4s ease-in-out infinite;
        }

        /* Pulse Glow */
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(0,229,255,0.15); }
          50% { box-shadow: 0 0 40px rgba(0,229,255,0.3); }
        }
        .pulse-glow {
          animation: pulseGlow 3s ease-in-out infinite;
        }

        /* Floating Animation */
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .float {
          animation: float 4s ease-in-out infinite;
        }

        /* Orb Float */
        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -30px) scale(1.1); }
          50% { transform: translate(-10px, -50px) scale(0.95); }
          75% { transform: translate(-30px, -20px) scale(1.05); }
        }

        /* Gradient Border */
        @keyframes gradientBorder {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-border {
          position: relative;
        }
        .gradient-border::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, #00e5ff, #7c3aed, #ff7a17, #00e5ff);
          background-size: 300% 300%;
          animation: gradientBorder 4s ease infinite;
          z-index: -1;
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .gradient-border:hover::before {
          opacity: 1;
        }

        /* Line Reveal */
        @keyframes lineReveal {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        .line-reveal {
          transform-origin: left;
          animation: lineReveal 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Slide Up Stagger */
        @keyframes slideUpStagger {
          from { opacity: 0; transform: translateY(60px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .slide-up-stagger > * {
          opacity: 0;
          animation: slideUpStagger 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .slide-up-stagger > *:nth-child(1) { animation-delay: 0ms; }
        .slide-up-stagger > *:nth-child(2) { animation-delay: 100ms; }
        .slide-up-stagger > *:nth-child(3) { animation-delay: 200ms; }
        .slide-up-stagger > *:nth-child(4) { animation-delay: 300ms; }

        /* Glow Pulse Ring */
        @keyframes glowPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(0,229,255,0.4); }
          70% { box-shadow: 0 0 0 15px rgba(0,229,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
        }
        .glow-pulse-ring {
          animation: glowPulseRing 2s ease-in-out infinite;
        }

        /* Text Glow */
        @keyframes textGlow {
          0%, 100% { text-shadow: 0 0 10px rgba(0,229,255,0.3); }
          50% { text-shadow: 0 0 20px rgba(0,229,255,0.5), 0 0 40px rgba(0,229,255,0.2); }
        }
        .text-glow {
          animation: textGlow 3s ease-in-out infinite;
        }

        /* Border Glow */
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(0,229,255,0.1); box-shadow: 0 0 0 rgba(0,229,255,0); }
          50% { border-color: rgba(0,229,255,0.3); box-shadow: 0 0 20px rgba(0,229,255,0.1); }
        }
        .border-glow {
          animation: borderGlow 4s ease-in-out infinite;
        }

        /* Scale In */
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .scale-in {
          animation: scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Feature Row Hover */
        .feature-row {
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-row:hover {
          background: rgba(0,229,255,0.03);
          transform: translateX(8px);
        }
        .feature-row:hover h3 {
          color: #00e5ff;
        }

        /* Icon Glow on Hover */
        .icon-glow:hover {
          background: rgba(0,229,255,0.08) !important;
          border-color: rgba(0,229,255,0.2) !important;
          box-shadow: 0 0 20px rgba(0,229,255,0.2);
          transform: scale(1.05);
        }

        /* Skeleton Loading */
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
        .skeleton-title { height: 28px; border-radius: 6px; width: 60%; }
        .skeleton-card {
          height: 200px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.06);
        }

        /* Stagger Children */
        .stagger-children > * {
          opacity: 0;
          animation: sectionFadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .stagger-children > *:nth-child(1) { animation-delay: 0ms; }
        .stagger-children > *:nth-child(2) { animation-delay: 80ms; }
        .stagger-children > *:nth-child(3) { animation-delay: 160ms; }
        .stagger-children > *:nth-child(4) { animation-delay: 240ms; }

        /* Glow Border Animation */
        @keyframes glowBorder {
          0%, 100% { border-color: rgba(0,229,255,0.15); }
          50% { border-color: rgba(0,229,255,0.35); }
        }
        .glow-border {
          animation: glowBorder 3s ease-in-out infinite;
        }

        /* Ripple Effect */
        @keyframes ripple {
          0% { transform: scale(0); opacity: 0.6; }
          100% { transform: scale(4); opacity: 0; }
        }

        /* Text Reveal */
        @keyframes textReveal {
          from { clip-path: inset(0 100% 0 0); }
          to { clip-path: inset(0 0% 0 0); }
        }
        .text-reveal {
          animation: textReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Counter Animation */
        @keyframes countUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .count-up {
          animation: countUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        /* Responsive */
        @media (max-width: 1024px) {
          .features-grid { grid-template-columns: 1fr !important; gap: 60px !important; }
          .partners-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .cta-grid { grid-template-columns: 1fr !important; }
          .nav-links { gap: 24px !important; }
        }
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: 1fr !important; gap: 48px !important; }
          .partners-grid { grid-template-columns: 1fr !important; }
          .partner-cards { grid-template-columns: 1fr !important; }
          .hero-stats { flex-direction: column !important; gap: 32px !important; }
          .features-grid { gap: 40px !important; }
          .cta-grid { gap: 40px !important; }
          .nav-links { display: none !important; }
        }
        @media (max-width: 640px) {
          .hero-stats { gap: 24px !important; }
        }

        /* Reduced Motion */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
          .logo-scroll { animation: none !important; }
        }
      `}</style>
    </>
  );
}
