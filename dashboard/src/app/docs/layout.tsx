"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-sg" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter" });

const P = {
  gold: "#ffc800", lava: "#ff2a00", magma: "#ff9c00", cyan: "#00e5ff",
  body: "#e8e2ec", mute: "#8a8290",
};

/* ── Canvas Background ────────────────────────────────────── */
function DocsCanvas() {
  const cvs = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = cvs.current!;
    const ctx = canvas.getContext("2d")!;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3, vy: -(Math.random() * 0.6 + 0.1),
      sz: Math.random() * 2.5 + 0.8, life: Math.random(), decay: Math.random() * 0.002 + 0.0005,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.6);
      grad.addColorStop(0, "rgba(255,170,0,0.06)");
      grad.addColorStop(0.5, "rgba(180,20,0,0.02)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0 || p.y < -10) { p.x = Math.random() * W; p.y = H + 10; p.life = 1; }
        const alpha = p.life * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,170,0,${alpha})`; ctx.fill();
        ctx.shadowColor = "rgba(255,170,0,0.3)"; ctx.shadowBlur = 8;
      }
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={cvs} style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }} />;
}

/* ── Sidebar Navigation ────────────────────────────────────── */
const navItems = [
  { href: "/docs/introduction", label: "Introduction", icon: "📖" },
  { href: "/docs/quickstart", label: "Quick Start", icon: "⚡" },
  { href: "/docs/architecture", label: "Architecture", icon: "🏗️" },
  { href: "/docs/security", label: "Security", icon: "🛡️" },
  { href: "/docs/cockroachdb", label: "CockroachDB", icon: "🦎" },
  { href: "/docs/setup", label: "Setup Guide", icon: "🔧" },
];

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <aside style={{
      width: "260px", position: "sticky", top: "90px", height: "calc(100vh - 120px)",
      flexShrink: 0, display: "flex", flexDirection: "column", gap: "4px",
      borderRight: "1px solid rgba(255,170,0,.15)", paddingRight: "24px",
      overflowY: "auto",
    }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, color: P.mute, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "16px" }}>Documentation</div>
      {navItems.map(item => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.href} href={item.href} style={{
            display: "flex", alignItems: "center", gap: "10px",
            padding: "10px 14px", fontSize: "14px",
            fontWeight: active ? 700 : 500,
            color: active ? P.gold : P.body,
            borderLeft: `3px solid ${active ? P.lava : "transparent"}`,
            borderRadius: "0 6px 6px 0",
            background: active ? "rgba(255,42,0,.06)" : "transparent",
            textDecoration: "none",
            transition: "all .3s",
            fontFamily: "var(--font-sg)",
          }}>
            <span>{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </aside>
  );
}

/* ── Docs Layout ─────────────────────────────────────────── */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable}`}
      style={{ position: "relative", minHeight: "100vh", fontFamily: "var(--font-inter), sans-serif", overflowX: "hidden", background: "#0a0308", color: "#e8e2ec" }}>
      <DocsCanvas />
      {/* Nav */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 900,
        padding: "14px 48px", display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "rgba(6,3,7,.85)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,170,0,.15)",
      }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "6px", background: `linear-gradient(135deg,${P.lava},${P.magma})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 16px ${P.lava}40` }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/></svg>
          </div>
          <span style={{ fontWeight: 900, fontSize: "16px", letterSpacing: "3px", color: "#fff", textTransform: "uppercase", fontFamily: "var(--font-sg)" }}>BASTION</span>
        </Link>
        <div style={{ display: "flex", gap: "28px", alignItems: "center" }}>
          <Link href="/" style={{ color: P.body, fontSize: "13px", textDecoration: "none", fontWeight: 600 }}>Home</Link>
          <Link href="/playground" style={{ color: P.body, fontSize: "13px", textDecoration: "none", fontWeight: 600 }}>Live Demo</Link>
          <Link href="/playground" style={{ padding: "8px 18px", borderRadius: "6px", background: `linear-gradient(135deg,${P.lava},${P.magma})`, color: "#fff", fontSize: "12px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px" }}>Enter Live Demo</Link>
        </div>
      </nav>
      {/* Content */}
      <div style={{ display: "flex", maxWidth: "1200px", margin: "0 auto", padding: "100px 40px 100px 40px", gap: "48px" }}>
        <Sidebar pathname={pathname} />
        <main style={{ flexGrow: 1, minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}
