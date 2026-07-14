"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";

/* ── Google Fonts Preloading for 100% Visibility ──────────────── */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-space-grotesk",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-inter",
});

/* ── Hooks ─────────────────────────────────────────────────── */
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

/* ── Volcanic Palette ─────────────────────────────────────────── */
const C = {
  obsidian: "#040104",
  lava: "#ff2a00",
  lavaLight: "#ff6200",
  magma: "#ff9c00",
  gold: "#ffc800",
  soulFire: "#00e5ff",
  portalPurple: "#b026ff",
  ink: "#ffffff",
  body: "#fcf8f9", // Max visibility high-contrast white
  mute: "#cfb5b7", // Brightened mute text
  hairline: "rgba(255, 42, 0, 0.3)",
};

/* ── Scroll Entrance Component ────────────────────────────────── */
function ScrollFadeSection({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setInView(true);
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div 
      ref={ref} 
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0) scale(1)" : "translateY(60px) scale(0.98)",
        transition: "opacity 1.4s cubic-bezier(0.16, 1, 0.3, 1), transform 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
        ...style
      }}
    >
      {children}
    </div>
  );
}

/* ── Interactive Cursor Spotlight Card (No Tilt, pure hover glow) ── */
interface SpotlightCardProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}
function SpotlightCard({ children, color = C.lava, className = "", style = {} }: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isFocused, setIsFocused] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    setPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsFocused(true)}
      onMouseLeave={() => setIsFocused(false)}
      className={`spotlight-card ${className}`}
      style={{
        position: "relative",
        background: isFocused 
          ? `radial-gradient(350px circle at ${pos.x}px ${pos.y}px, rgba(255, 42, 0, 0.18), transparent 60%), rgba(12, 4, 10, 0.9)`
          : "rgba(8, 2, 6, 0.8)",
        border: `1px solid ${isFocused ? color : C.hairline}`,
        borderRadius: "14px",
        padding: "36px",
        transition: "border-color 0.4s ease, background 0.3s ease, transform 0.4s ease, box-shadow 0.4s ease",
        transform: isFocused ? "translateY(-6px)" : "none",
        boxShadow: isFocused ? `0 20px 45px rgba(255, 42, 0, 0.12), 0 0 25px ${color}35` : "0 4px 20px rgba(0,0,0,0.6)",
        cursor: "pointer",
        ...style
      }}
    >
      {/* Corner Magma Highlights */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "16px", height: "16px", borderTop: `2px solid ${isFocused ? color : "transparent"}`, borderLeft: `2px solid ${isFocused ? color : "transparent"}`, transition: "all 0.3s" }} />
      <div style={{ position: "absolute", bottom: 0, right: 0, width: "16px", height: "16px", borderBottom: `2px solid ${isFocused ? color : "transparent"}`, borderRight: `2px solid ${isFocused ? color : "transparent"}`, transition: "all 0.3s" }} />
      {children}
    </div>
  );
}

/* ── Full Screen Volcanic Canvas (One Big Waterfall, Magma blocks & Shimmer) ── */
function NetherFallsCanvas() {
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

    // Big Lava Waterfall configuration (on the right)
    const waterfall = {
      x: w * 0.82,
      width: 125, // Wide realistic stream
      flowSpeed: 4,
    };

    // Branching magma cracks across center background
    const cracks = [
      { startX: w * 0.15, startY: -100, endX: w * 0.35, endY: h + 100 },
      { startX: w * 0.35, startY: h * 0.3, endX: w * 0.05, endY: h * 0.85 },
      { startX: w * 0.65, startY: -100, endX: w * 0.5, endY: h + 100 },
      { startX: w * 0.45, startY: h * 0.4, endX: w * 0.75, endY: h * 0.9 },
    ];

    // Magma blocks on the left (glowing Minecraft blocks details)
    const magmaBlocks = [
      { x: w * 0.04, y: h * 0.15, size: 50 },
      { x: w * 0.06, y: h * 0.5, size: 60 },
      { x: w * 0.02, y: h * 0.8, size: 55 },
    ];

    // Splashes & steam at the base of the waterfall
    const splashParticles: Array<{ x: number; y: number; vx: number; vy: number; size: number; life: number; color: string }> = [];
    const steamParticles: Array<{ x: number; y: number; vx: number; vy: number; size: number; life: number; opacity: number }> = [];
    const currentsOffset = { val: 0 };

    // Floating sparks/embers (Across screen)
    const embers = Array.from({ length: 95 }, () => ({
      x: Math.random() * w,
      y: h + Math.random() * 200,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -(Math.random() * 1.5 + 0.6),
      size: Math.random() * 4 + 1.2,
      life: Math.random(),
      decay: Math.random() * 0.003 + 0.0015,
      color: Math.random() > 0.85 ? C.soulFire : Math.random() > 0.45 ? C.magma : C.lava,
    }));

    let raf: number;
    let pulseTime = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      pulseTime += 0.03;

      // Scroll Offset for Parallax Effect
      const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
      const py = scrollY * 0.45; // Background scrolls at 45% speed

      // Deep Nether base gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#040104");
      bgGrad.addColorStop(0.5, "#0b0206");
      bgGrad.addColorStop(1, "#100205");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Draw Minecraft Bastion silhouettes on the left side (with scroll parallax)
      ctx.fillStyle = "rgba(12, 4, 8, 0.96)";
      ctx.fillRect(0, 0, w * 0.15, h);
      
      // Fortress battlement crenellations
      ctx.fillStyle = "rgba(7, 2, 5, 0.98)";
      for (let y = -py % 120; y < h; y += 120) {
        ctx.fillRect(w * 0.15 - 15, y, 15, 60);
      }

      // Draw pulsating Minecraft-style Magma Blocks on the left (with scroll parallax)
      magmaBlocks.forEach(mb => {
        const glow = 0.5 + Math.sin(pulseTime * 2 + mb.x) * 0.3;
        const targetY = mb.y - py;
        // Only draw if on screen
        if (targetY > -100 && targetY < h + 100) {
          ctx.fillStyle = `rgba(32, 8, 12, 0.95)`;
          ctx.fillRect(mb.x, targetY, mb.size, mb.size);
          ctx.strokeStyle = `rgba(255, 98, 0, ${glow})`;
          ctx.lineWidth = 3;
          ctx.strokeRect(mb.x + 3, targetY + 3, mb.size - 6, mb.size - 6);
          ctx.beginPath();
          ctx.moveTo(mb.x + mb.size / 2, targetY + 3);
          ctx.lineTo(mb.x + mb.size / 2, targetY + mb.size - 3);
          ctx.moveTo(mb.x + 3, targetY + mb.size / 2);
          ctx.lineTo(mb.x + mb.size - 3, targetY + mb.size / 2);
          ctx.stroke();
        }
      });

      // Draw flowing magma cracks across background center (with scroll parallax)
      currentsOffset.val += 0.3;
      ctx.lineWidth = 4;
      cracks.forEach(c => {
        const sY = c.startY - py;
        const eY = c.endY - py;
        
        ctx.beginPath();
        ctx.moveTo(c.startX, sY);
        ctx.lineTo(c.endX, eY);
        ctx.strokeStyle = "rgba(255, 42, 0, 0.12)";
        ctx.lineWidth = 12;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(c.startX, sY);
        ctx.lineTo(c.endX, eY);
        ctx.strokeStyle = C.magma;
        ctx.lineWidth = 2.0;
        ctx.setLineDash([15, 40]);
        ctx.lineDashOffset = -currentsOffset.val * 3;
        ctx.stroke();
        ctx.setLineDash([]); // Reset
      });

      // ── Draw ONE Wide Lava Waterfall on the Right ──
      const wf = waterfall;
      // Main 3D cylinder gradient for the waterfall body (remains relative to view)
      const wfGrad = ctx.createLinearGradient(wf.x, 0, wf.x + wf.width, 0);
      wfGrad.addColorStop(0, "rgba(139, 0, 0, 0.95)"); // Deep red edge
      wfGrad.addColorStop(0.25, "rgba(255, 55, 0, 0.98)"); // Bright red
      wfGrad.addColorStop(0.5, "rgba(255, 200, 0, 0.98)"); // Yellow core
      wfGrad.addColorStop(0.75, "rgba(255, 55, 0, 0.98)");
      wfGrad.addColorStop(1, "rgba(139, 0, 0, 0.95)");

      ctx.fillStyle = wfGrad;
      ctx.fillRect(wf.x, 0, wf.width, h);

      // Flowing streaks/currents inside the waterfall body
      ctx.lineWidth = 4;
      for (let offset = 0; offset < wf.width; offset += 20) {
        ctx.beginPath();
        ctx.moveTo(wf.x + offset, 0);
        ctx.lineTo(wf.x + offset, h);
        ctx.strokeStyle = offset % 40 === 0 ? "rgba(255, 230, 0, 0.35)" : "rgba(255, 80, 0, 0.25)";
        ctx.setLineDash([50, 150]);
        ctx.lineDashOffset = -currentsOffset.val * (6 + (offset % 3));
        ctx.stroke();
      }
      ctx.setLineDash([]); // Reset

      // Spawn splashes at the base (bottom)
      if (Math.random() > 0.1) {
        for (let s = 0; s < 3; s++) {
          splashParticles.push({
            x: wf.x + Math.random() * wf.width,
            y: h - 25,
            vx: (Math.random() - 0.5) * 8,
            vy: -(Math.random() * 6.5 + 3.0),
            size: Math.random() * 4.0 + 2.0,
            life: 1.0,
            color: Math.random() > 0.4 ? C.magma : C.lava,
          });
        }
      }

      // Spawn steam/smoke drifting up from base
      if (Math.random() > 0.15) {
        steamParticles.push({
          x: wf.x + wf.width / 2 + (Math.random() - 0.5) * 80,
          y: h - 30,
          vx: (Math.random() - 0.5) * 2,
          vy: -(Math.random() * 1.5 + 0.8),
          size: Math.random() * 25 + 15,
          life: 1.0,
          opacity: 0.22,
        });
      }

      // Draw and update splashes
      for (let i = splashParticles.length - 1; i >= 0; i--) {
        const sp = splashParticles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.22; // Gravity
        sp.life -= 0.035;

        if (sp.life <= 0) {
          splashParticles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
        ctx.fillStyle = sp.color === C.magma ? `rgba(255, 156, 0, ${sp.life})` : `rgba(255, 42, 0, ${sp.life})`;
        ctx.shadowColor = sp.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Draw and update steam/smoke
      for (let i = steamParticles.length - 1; i >= 0; i--) {
        const sm = steamParticles[i];
        sm.x += sm.vx;
        sm.y += sm.vy;
        sm.life -= 0.012;

        if (sm.life <= 0) {
          steamParticles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(sm.x, sm.y, sm.size, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(sm.x, sm.y, 0, sm.x, sm.y, sm.size);
        grad.addColorStop(0, `rgba(255, 98, 0, ${sm.life * sm.opacity})`);
        grad.addColorStop(0.5, `rgba(8, 2, 5, ${sm.life * sm.opacity * 0.6})`);
        grad.addColorStop(1, "rgba(8, 2, 5, 0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // Update and draw floating embers
      for (const e of embers) {
        e.x += e.vx + Math.sin(e.life * 5) * 0.3;
        e.y += e.vy;
        e.life -= e.decay;

        if (e.life <= 0 || e.y < -30) {
          e.x = Math.random() * w;
          e.y = h + Math.random() * 100;
          e.life = 1;
        }

        const alpha = e.life * 0.95;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size * 4, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.soulFire 
          ? `rgba(0, 229, 255, ${alpha * 0.05})` 
          : `rgba(255, 42, 0, ${alpha * 0.05})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
        ctx.fillStyle = e.color === C.soulFire 
          ? `rgba(180, 248, 255, ${alpha})` 
          : `rgba(255, 215, 120, ${alpha})`;
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
    <>
      {/* Dynamic Heat Wave Distortion Filter */}
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="heat-shimmer">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="2" result="noise">
            <animate attributeName="baseFrequency" dur="16s" values="0.012 0.04;0.012 0.06;0.012 0.04" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <canvas 
        ref={canvasRef} 
        style={{ 
          position: "fixed", 
          inset: 0, 
          zIndex: -1, // Sits safely behind content overlays
          pointerEvents: "none",
          filter: "url(#heat-shimmer)" // Apply heat shimmer distortion
        }} 
      />
    </>
  );
}

/* ── Swirling Nether Portal Visual Core ────────────────────────── */
function NetherPortalCore() {
  return (
    <div className="portal-container" style={{
      position: "relative",
      width: "310px",
      height: "410px",
      background: "rgba(8, 2, 8, 0.95)",
      border: "24px solid #151119", // Thick obsidian border
      borderRadius: "6px",
      boxShadow: "0 0 60px rgba(158, 0, 255, 0.5), inset 0 0 50px rgba(158, 0, 255, 0.9)",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{ position: "absolute", inset: "-2px", border: "1px solid rgba(255,255,255,0.08)", pointerEvents: "none" }} />
      
      {/* Vortex rings */}
      <div className="portal-vortex" style={{
        width: "200%",
        height: "200%",
        background: "radial-gradient(circle, rgba(158,0,255,0.95) 0%, rgba(68,0,150,0.7) 40%, rgba(5,1,6,0.95) 75%)",
        animation: "swirlVortex 7s linear infinite",
        opacity: 0.9,
        filter: "blur(4px)"
      }} />

      {/* Internal portal layers for depth */}
      <div className="portal-inner-vortex" style={{
        position: "absolute",
        width: "120%",
        height: "120%",
        border: `3px dashed ${C.portalPurple}`,
        borderRadius: "50%",
        animation: "swirlVortex 12s linear infinite reverse",
        opacity: 0.4,
        filter: "blur(2px)"
      }} />

      {/* Floating portal particles */}
      <div className="portal-particles">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="portal-sparkle" style={{
            position: "absolute",
            bottom: "-10px",
            left: `${Math.random() * 100}%`,
            width: `${Math.random() * 8 + 3}px`,
            height: `${Math.random() * 8 + 3}px`,
            background: Math.random() > 0.4 ? C.portalPurple : C.soulFire,
            borderRadius: "50%",
            boxShadow: `0 0 12px ${C.portalPurple}`,
            animation: `floatSparks ${Math.random() * 3.5 + 2.5}s ease-in infinite`,
            animationDelay: `${Math.random() * 2.5}s`,
          }} />
        ))}
      </div>

      <div style={{ position: "absolute", zIndex: 10, textAlign: "center" }}>
        <div style={{ width: "48px", height: "48px", margin: "0 auto 14px", borderRadius: "50%", background: "rgba(0,0,0,0.6)", border: `1px solid ${C.soulFire}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 20px ${C.soulFire}` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.soulFire} strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" /></svg>
        </div>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", color: C.soulFire, fontFamily: "'JetBrains Mono', monospace" }}>LEDGER_SEAL</span>
      </div>

      <style>{`
        @keyframes swirlVortex {
          0% { transform: rotate(0deg) scale(1.0); }
          50% { transform: rotate(180deg) scale(1.15); }
          100% { transform: rotate(360deg) scale(1.0); }
        }
        @keyframes floatSparks {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          12% { opacity: 0.9; }
          85% { opacity: 0.9; }
          100% { transform: translateY(-400px) scale(0.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

/* ── Sleep-Time Consolidation (Structured Knowledge) Visualizer ── */
function ConsolidationVisualizer() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setStage(s => (s + 1) % 4);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <ScrollFadeSection style={{ borderTop: `1px solid ${C.hairline}`, padding: "140px 48px", background: "transparent" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", position: "relative", zIndex: 10 }}>
        <div style={{ textAlign: "center", marginBottom: "80px" }}>
          <div className="nether-eyebrow" style={{ textShadow: "0 2px 5px rgba(0,0,0,0.8)" }}>Structured Memory Consolidation</div>
          <h2 className="nether-title" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>Consolidation Engine</h2>
          <p className="nether-desc" style={{ margin: "16px auto 0", textShadow: "0 2px 10px rgba(0,0,0,0.95)" }}>
            Watch how Bastion's sleep-time Consolidation daemon runs asynchronously to compress redundant logs and merge contradictions.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: "60px", alignItems: "center" }}>
          {/* Details Column */}
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {[
                { title: "Stage 1: Scan & Fetch", desc: "Consolidation daemon wakes during agent inactivity. Scans the recent `agent_memory` entries on CockroachDB.", active: stage === 0, color: C.lava },
                { title: "Stage 2: Semantic Clustering", desc: "Clusters entries using AWS Titan v2 cosine distance to group semantic matches.", active: stage === 1, color: C.magma },
                { title: "Stage 3: Auto-Conflict Check", desc: "Identifies logical negations (\"not\", \"never\") and timestamps to override stale memories.", active: stage === 2, color: C.gold },
                { title: "Stage 4: Signed Ledger Seal", desc: "Writes the consolidated block, computes the SHA-256 link, and signs the chain.", active: stage === 3, color: C.soulFire },
              ].map((step, idx) => (
                <div key={idx} style={{
                  padding: "24px",
                  borderRadius: "8px",
                  background: step.active ? "rgba(255, 55, 0, 0.08)" : "rgba(8, 2, 6, 0.65)",
                  borderLeft: `4px solid ${step.active ? step.color : "transparent"}`,
                  border: step.active ? `1px solid ${C.hairline}` : "1px solid rgba(255, 255, 255, 0.05)",
                  transition: "all 0.4s ease-in-out",
                  opacity: step.active ? 1 : 0.6,
                  boxShadow: "0 4px 15px rgba(0,0,0,0.45)",
                }}>
                  <h3 style={{ fontSize: "19px", fontWeight: 700, color: "#fff", margin: "0 0 6px 0", fontFamily: "var(--font-space-grotesk), sans-serif", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>{step.title}</h3>
                  <p style={{ fontSize: "15px", color: C.body, margin: 0, lineHeight: 1.6, fontFamily: "var(--font-inter), sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Animation Canvas Wrapper */}
          <div className="panel" style={{ padding: "40px", minHeight: "380px", display: "flex", flexDirection: "column", justifyContent: "center", background: "rgba(8,3,8,0.92)", border: `1px solid ${C.hairline}`, boxShadow: "0 15px 35px rgba(0,0,0,0.8)" }}>
            <div style={{ textAlign: "center", marginBottom: "30px", fontFamily: "var(--font-mono), monospace", fontSize: "12px", color: C.mute, letterSpacing: "1px" }}>
              CONSOLIDATION_STATE: {stage === 0 ? "SCANNING_NODES" : stage === 1 ? "CLUSTERING_VECTORS" : stage === 2 ? "RESOLVING_CONFLICTS" : "COMMITING_LEDGER"}
            </div>

            {/* Nodes Visualizer Box */}
            <div style={{ position: "relative", height: "180px", width: "100%", display: "flex", justifyContent: "space-around", alignItems: "center" }}>
              {stage === 0 && (
                <>
                  <div className="node pulse-yellow">Memory A<span className="node-sub">port = 8080</span></div>
                  <div className="node pulse-yellow">Memory B<span className="node-sub">port = 8080</span></div>
                </>
              )}

              {stage === 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div className="node pulse-glow">Vector Group A <span className="node-sub">dist: 0.08</span></div>
                  <div style={{ borderLeft: "2px dashed var(--accent-breeze)", height: "35px", alignSelf: "center" }} />
                  <div className="node pulse-glow">Reference Centroid</div>
                </div>
              )}

              {stage === 2 && (
                <>
                  <div className="node error-red">Stale Memory<span className="node-sub">t = 12h ago</span></div>
                  <div style={{ fontSize: "28px" }}>➡️</div>
                  <div className="node success-green">New Fact<span className="node-sub">t = Now</span></div>
                </>
              )}

              {stage === 3 && (
                <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                  <div className="node success-green">Chained Block #14</div>
                  <div style={{ fontSize: "20px", color: C.soulFire }}>⛓️</div>
                  <div className="node success-green" style={{ border: `1px solid ${C.soulFire}`, boxShadow: `0 0 20px rgba(0, 212, 255, 0.2)` }}>Chained Block #15</div>
                </div>
              )}
            </div>

            {/* Progress status line */}
            <div className="progress-bar" style={{ marginTop: "30px" }}>
              <div className="progress-bar-fill" style={{
                width: `${(stage + 1) * 25}%`,
                background: `linear-gradient(90deg, ${C.lava}, ${C.magma}, ${C.soulFire})`,
                boxShadow: `0 0 10px ${C.lava}`
              }} />
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .node {
          padding: 14px 22px;
          border-radius: 6px;
          background: rgba(14,5,18,0.9);
          border: 1px solid var(--glass-border);
          color: #fff;
          font-size: 14px;
          font-weight: 700;
          font-family: var(--font-space-grotesk), sans-serif;
          text-align: center;
          box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }
        .node-sub {
          display: block;
          font-size: 11px;
          font-family: var(--font-mono), monospace;
          color: ${C.mute};
          margin-top: 4px;
        }
        .pulse-yellow { animation: pulseY 1.5s infinite; }
        .error-red { border-color: var(--accent-sunset); color: var(--accent-sunset); }
        .success-green { border-color: var(--accent-emerald); color: var(--accent-emerald); }
        @keyframes pulseY {
          0%, 100% { border-color: rgba(255, 183, 0, 0.3); box-shadow: 0 0 5px rgba(255, 183, 0, 0.1); }
          50% { border-color: rgba(255, 183, 0, 0.8); box-shadow: 0 0 15px rgba(255, 183, 0, 0.3); }
        }
      `}</style>
    </ScrollFadeSection>
  );
}

/* ── Comparison Table ────────────────────────────────────────── */
function NetherComparison() {
  return (
    <ScrollFadeSection style={{ borderTop: `1px solid ${C.hairline}`, padding: "140px 48px", background: "transparent" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", position: "relative", zIndex: 10 }}>
        <div style={{ textAlign: "center", marginBottom: "70px" }}>
          <div className="nether-eyebrow" style={{ textShadow: "0 2px 5px rgba(0,0,0,0.8)" }}>Comparison Matrix</div>
          <h2 className="nether-title" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>Rivaling the Alternatives</h2>
          <p className="nether-desc" style={{ margin: "16px auto 0", textShadow: "0 2px 10px rgba(0,0,0,0.95)" }}>
            Why leading autonomous agent frameworks rely on the Bastion memory model.
          </p>
        </div>

        <div style={{ background: "rgba(10,5,16,0.72)", border: `1px solid ${C.hairline}`, borderRadius: "12px", overflow: "hidden", backdropFilter: "blur(12px)", boxShadow: "0 15px 35px rgba(0,0,0,0.8)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "15px" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.hairline}`, background: "rgba(27,10,14,0.6)" }}>
                {["Feature Check", "Bastion", "Mem0", "Zep"].map((h) => (
                  <th key={h} style={{ padding: "22px 24px", textAlign: "left", fontFamily: "var(--font-mono), monospace", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1.5px", color: C.mute, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "Cryptographic Tamper-Evidence", bastion: "SHA-256 Chain (0.16ms)", mem0: "None (Raw DB)", zep: "None (Raw DB)", highlight: true },
                { name: "Time-Travel Querying (MVCC)", bastion: "AS OF SYSTEM TIME", mem0: "Manual logs", zep: "Snapshots only", highlight: false },
                { name: "EU AI Act Compliance (Art 12)", bastion: "Built-in Audit Trail", mem0: "Custom implementation", zep: "Custom implementation", highlight: false },
                { name: "Prompt Poisoning Guard (ASI06)", bastion: "OWASP Semantic Guard", mem0: "Unprotected", zep: "PII Filter only", highlight: true },
                { name: "Multi-Region Distributed Sync", bastion: "6 Regions (Global Sync)", mem0: "Single instance", zep: "Custom replications", highlight: false },
                { name: "Developer Cost", bastion: "MIT Free / Open Source", mem0: "$249/mo (Cloud)", zep: "$125/mo (Cloud)", highlight: true },
              ].map((r, idx) => (
                <tr key={idx} className="comparison-table-row" style={{ borderBottom: idx < 5 ? `1px solid ${C.hairline}` : "none", background: r.highlight ? "rgba(255, 60, 0, 0.05)" : "transparent" }}>
                  <td style={{ padding: "20px 24px", color: "#fff", fontWeight: 600, fontFamily: "var(--font-space-grotesk), sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{r.name}</td>
                  <td style={{ padding: "20px 24px", color: r.highlight ? C.gold : C.soulFire, fontWeight: 700 }}>{r.bastion}</td>
                  <td style={{ padding: "20px 24px", color: C.body }}>{r.mem0}</td>
                  <td style={{ padding: "20px 24px", color: C.body }}>{r.zep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ScrollFadeSection>
  );
}

/* ── FAQ Section ─────────────────────────────────────────────── */
function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqs = [
    { q: "What is the Nether Fortress aesthetic inspired by?", a: "It reflects Bastion's core concept: a solid, impenetrable volcanic fortress of memory. Built with dense obsidian-grade data reliability (serializable multi-region replication via CockroachDB) that survives crashing agents like obsidian survives fire." },
    { q: "How do dynamic database connection overrides work?", a: "By inputting your connection string in the Cockpit header, the frontend stores it locally and sends it with every query using the 'x-bastion-conn' header. The server creates an active PG connection pool instantly. No env restarts needed." },
    { q: "Does Bastion protect against LLM prompt injections?", a: "Yes. Bastion implements the OWASP ASI06 memory guard. Every memory ingested is classified by a semantic filter detecting injection keywords, secrets leakage, and PII before writing to disk." },
    { q: "Is the project fully open source?", a: "Absolutely. Bastion is released under the MIT license. You can download and deploy the complete dockerized memory stack in single-node or distributed configurations." }
  ];

  return (
    <ScrollFadeSection style={{ borderTop: `1px solid ${C.hairline}`, padding: "140px 48px", background: "transparent" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto", position: "relative", zIndex: 10 }}>
        <div style={{ textAlign: "center", marginBottom: "70px" }}>
          <div className="nether-eyebrow" style={{ textShadow: "0 2px 5px rgba(0,0,0,0.8)" }}>Scroll Scrolls</div>
          <h2 className="nether-title" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>Frequently Answered</h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {faqs.map((faq, i) => (
            <div key={i} className="faq-item-card" style={{ background: "rgba(10,5,16,0.8)", border: `1px solid ${C.hairline}`, borderRadius: "8px", overflow: "hidden", boxShadow: "0 4px 15px rgba(0,0,0,0.45)" }}>
              <button 
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                style={{ width: "100%", padding: "24px 28px", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: "17px", fontWeight: 700, color: "#fff", textAlign: "left", fontFamily: "var(--font-space-grotesk), sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{faq.q}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.mute} strokeWidth="2" style={{ transform: openIdx === i ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.3s ease" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div style={{ maxHeight: openIdx === i ? "200px" : "0", overflow: "hidden", transition: "max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1)" }}>
                <p style={{ padding: "0 28px 24px", fontSize: "15px", lineHeight: "1.7", color: C.body, margin: 0, fontFamily: "var(--font-inter), sans-serif", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollFadeSection>
  );
}

/* ── Main Landing Page Component ────────────────────────────── */
export default function LandingPage() {
  const [loaded, setLoaded] = useState(false);
  const scrollProgress = useScrollProgress();

  useEffect(() => {
    requestAnimationFrame(() => setLoaded(true));
  }, []);

  return (
    <div className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable}`} style={{ position: "relative", minHeight: "100vh", background: "transparent", overflowX: "hidden", fontFamily: "var(--font-inter), sans-serif" }}>
      {/* Scroll progress bar */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "4px", zIndex: 1000, background: "rgba(255, 55, 0, 0.05)" }}>
        <div style={{ height: "100%", width: `${scrollProgress * 100}%`, background: `linear-gradient(90deg, ${C.lava}, ${C.magma}, ${C.gold})`, boxShadow: `0 0 15px ${C.lava}` }} />
      </div>

      <NetherFallsCanvas />

      {/* Grid Pattern overlay */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 0.07, pointerEvents: "none", backgroundImage: "linear-gradient(rgba(255, 55, 0, 0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 55, 0, 0.25) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

      {/* Header */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 900, padding: "20px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(6,3,7,0.7)", backdropFilter: "blur(24px)", borderBottom: `1px solid ${C.hairline}` }}>
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "6px", background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 20px ${C.lava}40` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" /></svg>
          </div>
          <span style={{ fontWeight: 900, fontSize: "20px", letterSpacing: "3.5px", color: "#fff", textTransform: "uppercase", fontFamily: "var(--font-space-grotesk), sans-serif" }}>BASTION</span>
        </Link>
        <div style={{ display: "flex", gap: "36px", alignItems: "center" }}>
          <Link href="/dashboard" className="nav-link" style={{ color: "#eae3e4", fontSize: "15px", textDecoration: "none", fontWeight: 700, letterSpacing: "0.5px" }}>Cockpit</Link>
          <Link href="/dashboard" className="glow-nether-btn" style={{ padding: "12px 28px", borderRadius: "4px", background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`, color: "#fff", fontSize: "14px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px", boxShadow: `0 0 15px ${C.lava}30` }}>Launch Cockpit</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "160px 48px 100px", position: "relative", zIndex: 2 }}>
        {/* Dark backing overlay with a smooth gradient to merge Hero background with lower backgrounds seamlessly */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(4, 1, 4, 0.92) 0%, rgba(4, 1, 4, 0.7) 60%, rgba(4, 1, 4, 0.45) 85%, rgba(4, 1, 4, 0.25) 100%)",
          zIndex: -1,
          pointerEvents: "none"
        }} />

        <div style={{ width: "100%", maxWidth: "1240px", display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: "60px", alignItems: "center", opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(50px)", transition: "opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          
          {/* Hero Content Left */}
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 22px", borderRadius: "4px", background: "rgba(255, 55, 0, 0.08)", border: `1px solid ${C.hairline}`, marginBottom: "28px" }}>
              <div className="status-spark" style={{ width: "6px", height: "6px", background: C.gold, borderRadius: "50%", boxShadow: `0 0 8px ${C.gold}` }} />
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3px", color: C.gold }}>Bastion Secure Ledger Active</span>
            </div>

            <h1 className="hero-giant-title" style={{ fontSize: "clamp(70px, 9vw, 130px)", fontWeight: 900, lineHeight: "0.85", letterSpacing: "-4.5px", color: "#fff", marginBottom: "28px", fontFamily: "var(--font-space-grotesk), sans-serif", textShadow: "0 4px 15px rgba(0,0,0,0.85)" }}>
              THE FORTRESS<br />
              OF AGENTIC<br />
              <span className="magma-glowing-text" style={{ background: `linear-gradient(135deg, ${C.lava}, ${C.magma}, ${C.gold}, ${C.lava})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", textShadow: `0 0 50px rgba(255, 55, 0, 0.35)` }}>MEMORY</span>
            </h1>

            <p style={{ fontSize: "20.5px", lineHeight: "1.8", color: "#ffffff", fontWeight: 600, maxWidth: "580px", marginBottom: "44px", textShadow: "0 2px 12px rgba(0, 0, 0, 0.98)" }}>
              Persistent, self-healing memory designed for autonomous AI agents. Survives server crashes, blocks malicious prompt poisoning, and syncs across 6 regions. Forged in CockroachDB.
            </p>

            {/* Quick entry links */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <Link href="/dashboard" className="glow-nether-btn" style={{ padding: "18px 40px", borderRadius: "4px", background: `linear-gradient(135deg, ${C.lava}, ${C.magma})`, color: "#fff", fontSize: "14px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px", boxShadow: `0 0 25px ${C.lava}40`, display: "inline-flex", alignItems: "center", gap: "10px" }}>
                Try the Demo Dashboard
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </Link>
              <Link href="/dashboard?tour=start" style={{ padding: "18px 40px", borderRadius: "4px", border: `1px solid ${C.hairline}`, background: "rgba(27,10,14,0.55)", color: "#fff", fontSize: "14px", fontWeight: 700, textDecoration: "none", backdropFilter: "blur(12px)" }}>
                Begin Onboarding Tour
              </Link>
            </div>
          </div>

          {/* Hero Core Right (Swirling Portal Core) */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <NetherPortalCore />
          </div>
        </div>

        {/* Onboarding Tour HUD Cards */}
        <div style={{ width: "100%", maxWidth: "1240px", marginTop: "110px", opacity: loaded ? 1 : 0, transform: loaded ? "translateY(0)" : "translateY(30px)", transition: "opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.3s" }}>
          <div style={{ borderBottom: `1px solid ${C.hairline}`, paddingBottom: "16px", marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", color: C.lava, fontWeight: 700, letterSpacing: "2.5px", textTransform: "uppercase", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>Quick Start Portal</span>
              <h2 style={{ fontSize: "26px", fontWeight: 800, color: "#fff", margin: "4px 0 0 0", fontFamily: "var(--font-space-grotesk), sans-serif", textShadow: "0 2px 8px rgba(0,0,0,0.9)" }}>Guided Onboarding Views</h2>
            </div>
            <span style={{ fontSize: "13px", color: C.mute, fontFamily: "var(--font-mono), monospace" }}>JUDGES_RECOMMENDED</span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
            {[
              {
                title: "Command Center Dashboard",
                desc: "Live telemetry tracking memories ingestion rates, regions distribution, average importance weights, and event logs.",
                link: "/dashboard?tour=start",
                color: C.lava,
                badge: "Start Tour 1",
              },
              {
                title: "Temporal Graph Explorer",
                desc: "Traverse memory node connections. Run time-travel slider (AS OF SYSTEM TIME) to view historical states.",
                link: "/graph?tour=start",
                color: C.gold,
                badge: "Start Tour 2",
              },
              {
                title: "Cryptographic Registry Ledger",
                desc: "Verify memory block hashes, verify previous link chaining signatures, and browse database entries.",
                link: "/logs?tour=start",
                color: C.portalPurple,
                badge: "Start Tour 3",
              },
              {
                title: "MemoryGuard Panel",
                desc: "Interactive scanner showing OWASP ASI06 guard sanitizing prompt injection, PII, and API keys before commitment.",
                link: "/dashboard?tour=start#memoryguard",
                color: C.soulFire,
                badge: "Start Tour 4",
              },
            ].map((tour, idx) => (
              <Link 
                key={idx}
                href={tour.link}
                style={{ textDecoration: "none" }}
              >
                <SpotlightCard color={tour.color} style={{ minHeight: "240px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <span className="badge-mono" style={{ background: `${tour.color}15`, color: tour.color, border: `1px solid ${tour.color}25` }}>{tour.badge}</span>
                      <span style={{ fontSize: "18px" }}>➡️</span>
                    </div>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0", fontFamily: "var(--font-space-grotesk), sans-serif", textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>{tour.title}</h3>
                    <p style={{ fontSize: "14px", color: C.body, lineHeight: "1.6", margin: 0, fontFamily: "var(--font-inter), sans-serif", textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}>{tour.desc}</p>
                  </div>
                </SpotlightCard>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Structured Sections */}
      <ConsolidationVisualizer />
      <NetherComparison />
      <FAQSection />

      {/* Footer */}
      <footer style={{ padding: "60px 48px", borderTop: `1px solid ${C.hairline}`, background: "rgba(6,3,7,0.95)", position: "relative", zIndex: 10 }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "24px" }}>
          <span style={{ fontSize: "13px", color: C.mute }}>Bastion Agentic Memory Framework &copy; 2026 &middot; MIT License</span>
          <div style={{ display: "flex", gap: "24px" }}>
            <Link href="/dashboard" style={{ color: C.mute, fontSize: "13px", textDecoration: "none" }}>Dashboard</Link>
            <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer" style={{ color: C.mute, fontSize: "13px", textDecoration: "none" }}>GitHub</a>
          </div>
        </div>
      </footer>

      {/* Global CSS Inject */}
      <style>{`
        html {
          scroll-behavior: smooth;
        }

        * { box-sizing: border-box; }
        
        .nether-section {
          position: relative;
          z-index: 2;
        }
        
        .nether-eyebrow {
          font-family: var(--font-mono), monospace;
          font-size: 13px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 3.5px;
          color: ${C.lava};
          margin-bottom: 12px;
        }
        
        .nether-title {
          font-size: clamp(38px, 6vw, 56px);
          fontWeight: 900;
          color: #fff;
          font-family: var(--font-space-grotesk), sans-serif;
          letter-spacing: -1.5px;
          margin: 0;
          text-shadow: 0 0 30px rgba(255, 55, 0, 0.2);
        }
        
        .nether-desc {
          font-size: 17.5px;
          color: ${C.body};
          max-width: 640px;
          line-height: 1.7;
          font-family: var(--font-inter), sans-serif;
        }

        .badge-mono {
          font-family: var(--font-mono), monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1px;
          padding: 4px 10px;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .glow-nether-btn {
          position: relative;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .glow-nether-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
          transform: translateX(-100%);
          transition: transform 0.5s ease;
        }
        .glow-nether-btn:hover::after {
          transform: translateX(100%);
        }
        .glow-nether-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px ${C.lava}50;
        }
        .glow-nether-btn:active {
          transform: scale(0.97);
        }

        @keyframes pulseSpark {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.35); opacity: 1; }
        }
        .status-spark {
          animation: pulseSpark 1.5s ease-in-out infinite;
        }

        @keyframes shiftGradient {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .magma-glowing-text {
          background-size: 200% auto !important;
          animation: shiftGradient 5s ease infinite;
        }

        /* 2026 Micro-interactions & animations */
        .nav-link {
          position: relative;
          padding-bottom: 4px;
          transition: color 0.3s ease;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          width: 0;
          height: 2px;
          background: ${C.lava};
          transition: width 0.3s ease, left 0.3s ease;
        }
        .nav-link:hover::after {
          width: 100%;
          left: 0;
        }

        .comparison-table-row {
          transition: background-color 0.3s ease, border-color 0.3s ease;
        }
        .comparison-table-row:hover {
          background-color: rgba(255, 42, 0, 0.06) !important;
        }

        .faq-item-card {
          transition: border-color 0.3s ease, box-shadow 0.3s ease, background-color 0.3s ease;
        }
        .faq-item-card:hover {
          border-color: ${C.lava} !important;
          box-shadow: 0 0 20px rgba(255, 42, 0, 0.12);
          background-color: rgba(14, 6, 18, 0.85) !important;
        }
      `}</style>
    </div>
  );
}
