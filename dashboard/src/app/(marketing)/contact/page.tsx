"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

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
      <div className="skeleton skeleton-title" style={{ width: "160px" }} />
      <div className="skeleton skeleton-text" style={{ width: "240px" }} />
      <div className="skeleton" style={{ width: "100%", maxWidth: "500px", height: "280px", borderRadius: "16px", marginTop: "24px" }} />
    </div>
  );
}

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
            color: l.href === "/contact" ? "#fff" : "#9ca3af",
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
export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);
  const { ref, visible } = useInView(0.1);

  return (
    <>
      <SkeletonLoader />
      <FireEmbers />
      <Navbar />

      <div ref={ref} style={{ padding: "160px 48px 120px", maxWidth: "640px", margin: "0 auto", position: "relative", zIndex: 1 }}>
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
          }}>Contact</div>
          <h1 style={{
            fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, letterSpacing: "-2px",
            color: "#fff", marginBottom: "16px",
          }}>
            Get in touch<span style={{ color: "#00e5ff" }}>.</span>
          </h1>
          <p style={{ fontSize: "17px", color: "#9ca3af", marginBottom: "56px" }}>
            Questions about Bastion? We&apos;d love to hear from you.
          </p>
        </div>

        {submitted ? (
          <div className="glow-card" style={{
            background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px", padding: "72px", textAlign: "center",
            opacity: visible ? 1 : 0, transform: visible ? "scale(1)" : "scale(0.95)",
            transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
          }}>
            <div style={{
              width: "72px", height: "72px", borderRadius: "50%", margin: "0 auto 28px",
              background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 40px rgba(0,255,136,0.15)",
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 style={{ fontSize: "22px", fontWeight: 600, color: "#fff", marginBottom: "10px" }}>Message sent</h3>
            <p style={{ fontSize: "15px", color: "#9ca3af" }}>We&apos;ll get back to you within 24 hours.</p>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }} className="glow-card" style={{
            background: "#0c1018", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "20px", padding: "44px",
            opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(20px)",
            transition: "all 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
          }}>
            {[
              { name: "name", label: "Name", type: "text", placeholder: "Your name" },
              { name: "email", label: "Email", type: "email", placeholder: "you@company.com" },
            ].map((f) => (
              <div key={f.name} style={{ marginBottom: "24px" }}>
                <label style={{
                  display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "10px",
                  textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "'JetBrains Mono', monospace",
                }}>{f.label}</label>
                <input type={f.type} required placeholder={f.placeholder} className="input-glow" style={{
                  width: "100%", padding: "16px 20px", background: "#111520",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px",
                  color: "#fff", fontSize: "15px", outline: "none",
                  transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(0,229,255,0.4)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,255,0.1), 0 0 20px rgba(0,229,255,0.08)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            ))}
            <div style={{ marginBottom: "32px" }}>
              <label style={{
                display: "block", fontSize: "11px", color: "#6b7280", marginBottom: "10px",
                textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "'JetBrains Mono', monospace",
              }}>Message</label>
              <textarea required rows={5} placeholder="Tell us about your use case..." className="input-glow" style={{
                width: "100%", padding: "16px 20px", background: "#111520",
                border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px",
                color: "#fff", fontSize: "15px", outline: "none", resize: "vertical",
                transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(0,229,255,0.4)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,255,0.1), 0 0 20px rgba(0,229,255,0.08)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>
            <button type="submit" className="glow-btn" style={{
              width: "100%", padding: "18px", borderRadius: "9999px",
              background: "#fff", color: "#0a0a0a",
              fontSize: "15px", fontWeight: 600, border: "none", cursor: "pointer",
            }}>
              Send Message
            </button>
          </form>
        )}
      </div>

      <style>{`
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body { background: #0a0510; }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }
        @keyframes skeletonShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .skeleton { background: linear-gradient(90deg, #0c1018 25%, #1a1f2e 50%, #0c1018 75%); background-size: 200% 100%; animation: skeletonShimmer 1.5s ease-in-out infinite; border-radius: 8px; }
        .skeleton-text { height: 14px; border-radius: 4px; }
        .skeleton-title { height: 28px; border-radius: 6px; }
        .glow-card { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); position: relative; }
        .glow-card::before { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: linear-gradient(135deg, rgba(255,69,0,0.25), rgba(156,39,176,0.20)); opacity: 0; transition: opacity 0.4s ease; z-index: -1; filter: blur(10px); }
        .glow-card:hover::before { opacity: 1; }
        .glow-card:hover { transform: translateY(-6px); border-color: rgba(255,69,0,0.3) !important; box-shadow: 0 20px 60px rgba(255,69,0,0.15); }
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
