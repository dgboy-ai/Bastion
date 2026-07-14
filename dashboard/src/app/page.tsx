"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";

/* ── Fonts ───────────────────────────────────────────────── */
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-sg" });
const jetMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter" });

/* ── Design Tokens ───────────────────────────────────────── */
const T = {
  lava:   "#ff2a00",
  ember:  "#ff6200",
  magma:  "#ff9c00",
  gold:   "#ffc800",
  cyan:   "#00e5ff",
  purple: "#b026ff",
  obs:    "#040104",
  ink:    "#ffffff",
  body:   "#f0e8ea",
  mute:   "#c8a8ac",
  line:   "rgba(255,42,0,0.25)",
  glass:  "rgba(8,2,6,0.88)",
};

/* ── Scroll Progress Hook ────────────────────────────────── */
function useScroll() {
  const [y, setY]  = useState(0);
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const fn = () => {
      const sy = window.scrollY;
      setY(sy);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setPct(max > 0 ? sy / max : 0);
    };
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);
  return { y, pct };
}

/* ── InView Hook ─────────────────────────────────────────── */
function useInView(threshold = 0.08) {
  const ref  = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, seen };
}

/* ── Animated Count-Up Number ────────────────────────────── */
function CountUp({ end, suffix = "", duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [val, setVal] = useState(0);
  const { ref, seen } = useInView(0.3);
  useEffect(() => {
    if (!seen) return;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setVal(Math.round(eased * end));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [seen, end, duration]);
  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {val.toLocaleString()}{suffix}
    </span>
  );
}

/* ── Scroll-Fade Wrapper ─────────────────────────────────── */
function Reveal({ children, delay = 0, style = {} }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: seen ? 1 : 0,
      transform: seen ? "translateY(0) scale(1)" : "translateY(40px) scale(0.97)",
      transition: `opacity 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ── Spotlight Hover Card ────────────────────────────────── */
function Card({ children, accent = T.lava, style = {} }: { children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  const ref  = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hot, setHot] = useState(false);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <div ref={ref} onMouseMove={onMove} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{
        position: "relative",
        background: hot
          ? `radial-gradient(320px circle at ${pos.x}px ${pos.y}px, ${accent}18, transparent 65%), ${T.glass}`
          : T.glass,
        border: `2px solid ${hot ? accent : "rgba(80,60,65,0.5)"}`,
        boxShadow: hot
          ? `0 0 30px ${accent}25, inset 2px 2px 0 rgba(255,255,255,0.07), inset -2px -2px 0 rgba(0,0,0,0.5)`
          : "inset 2px 2px 0 rgba(255,255,255,0.04), inset -2px -2px 0 rgba(0,0,0,0.5)",
        borderRadius: "3px",
        padding: "28px",
        transition: "all 0.28s cubic-bezier(0.16,1,0.3,1)",
        transform: hot ? "translateY(-5px)" : "none",
        backdropFilter: "blur(14px)",
        ...style,
      }}>
      {children}
    </div>
  );
}

/* ── Procedural Pixel-Art Block ──────────────────────────── */
type BlockType = "obsidian" | "blackstone" | "gilded" | "crying" | "netherrack" | "soul";
function drawBlock(ctx: CanvasRenderingContext2D, bx: number, by: number, sz: number, type: BlockType, seed: number) {
  const px = sz / 5;
  const r  = (i: number) => { const x = Math.sin(seed + i) * 9999; return x - Math.floor(x); };
  for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 5; gy++) {
    const v = r(gx + gy * 5);
    let c = "#000";
    if (type === "obsidian")   c = v > .7 ? "#1c0d28" : v > .4 ? "#0c0516" : "#050109";
    if (type === "crying")     c = v > .85 ? T.purple : v > .6 ? "#1c0d28" : v > .3 ? "#0c0516" : "#050109";
    if (type === "blackstone") c = v > .8 ? "#2b252c" : v > .4 ? "#181419" : "#0c0a0d";
    if (type === "gilded")     c = v > .82 ? T.gold : v > .5 ? "#221b24" : v > .2 ? "#141016" : "#0a080b";
    if (type === "netherrack") c = v > .8 ? "#722527" : v > .5 ? "#501618" : v > .25 ? "#300b0c" : "#1a0405";
    if (type === "soul")       c = v > .8 ? "#453229" : v > .5 ? "#2e211b" : v > .25 ? "#1f1511" : "#100907";
    ctx.fillStyle = c;
    ctx.fillRect(bx + gx * px, by + gy * px, px, px);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.055)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, sz, sz);
}

/* ── Canvas Background ───────────────────────────────────── */
function NetherCanvas() {
  const cvs = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = cvs.current!;
    const ctx = canvas.getContext("2d")!;
    let w = canvas.width  = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    window.addEventListener("resize", () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; });

    const BS = 44; // block size
    type WObj = { type: "block"|"magma"|"quartz"|"lantern"; x: number; y: number; sz: number; bt?: BlockType };
    const world: WObj[] = [];

    // Left + right pillars down 5500px
    for (let y = 0; y < 5500; y += BS) {
      const seg = y < 1400 ? 0 : y < 2800 ? 1 : 2;
      const pickL = (): BlockType => {
        const v = Math.random();
        if (seg === 0) return v > .85 ? "crying" : v > .6 ? "gilded" : v > .35 ? "obsidian" : "blackstone";
        if (seg === 1) return "netherrack";
        return "soul";
      };
      const pickR = (): BlockType => seg === 0 ? (Math.random() > .75 ? "gilded" : "blackstone") : seg === 1 ? "netherrack" : "soul";

      const leftCount  = Math.random() > .4 ? 3 : 2;
      const rightCount = Math.random() > .5 ? 3 : 2;
      for (let c = 0; c < leftCount;  c++) world.push({ type: "block", x: c * BS, y, sz: BS, bt: pickL() });
      for (let c = 0; c < rightCount; c++) world.push({ type: "block", x: w - BS - c * BS, y, sz: BS, bt: pickR() });
    }

    // Accent nodes
    for (let y = 300; y < 5000; y += 420) {
      const seg = y < 1400 ? 0 : y < 2800 ? 1 : 2;
      if (seg === 0) world.push({ type: "magma",   x: w * .18 + Math.random() * w * .18, y, sz: 48 });
      if (seg === 1) world.push({ type: "quartz",  x: w * .20 + Math.random() * w * .35, y, sz: 55 });
      if (seg === 2) world.push({ type: "lantern", x: w * .14 + Math.random() * 60,       y, sz: 28 });
    }

    // Cracks
    const cracks = [
      { x: w*.28, y:  180, len: 320, a:  .75, c: T.lava },
      { x: w*.52, y:  620, len: 240, a: -.60, c: T.magma },
      { x: w*.38, y: 1500, len: 370, a:  .40, c: T.lava },
      { x: w*.62, y: 2200, len: 290, a: -.48, c: T.magma },
      { x: w*.33, y: 3100, len: 410, a:  .62, c: T.cyan },
      { x: w*.57, y: 3900, len: 310, a: -.68, c: T.cyan },
    ];

    // Drips from crying obsidian
    type Drip = { x: number; y: number; vy: number; sz: number; life: number; maxL: number };
    const drips: Drip[] = [];
    // Splash + steam
    type Splash = { x: number; y: number; vx: number; vy: number; sz: number; life: number; soul: boolean };
    type Steam  = { x: number; y: number; vx: number; vy: number; sz: number; life: number; soul: boolean };
    const splashes: Splash[] = [];
    const steams:   Steam[]  = [];
    // Embers
    const embers = Array.from({ length: 100 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - .5) * .55,
      vy: -(Math.random() * 1.3 + .4),
      sz: Math.random() * 2.8 + .8,
      life: Math.random(),
      decay: Math.random() * .0025 + .001,
    }));

    let raf: number;
    let t = 0, wfOff = 0;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      t += .032;
      wfOff += .22;
      const sy   = window.scrollY;
      const narrow = w < 1140;
      const soulZone = sy > 2000;

      ctx.globalAlpha = narrow ? .06 : .9;

      // World blocks
      world.forEach((o, idx) => {
        const dy = o.y - sy;
        if (dy < -120 || dy > h + 120) return;
        const dx = o.x > w / 2 ? w - (w - o.x) : o.x;
        if (o.type === "block" && o.bt) {
          drawBlock(ctx, dx, dy, o.sz, o.bt, idx);
          // Crying obsidian drips
          if (o.bt === "crying" && Math.random() > .984 && !narrow) {
            drips.push({ x: dx + Math.random() * o.sz, y: dy + o.sz, vy: Math.random() * .9 + .7, sz: Math.random() * 2 + 1.2, life: 1, maxL: Math.random() * 65 + 45 });
          }
        } else if (o.type === "magma") {
          const g = .4 + Math.sin(t * 2.4 + o.y) * .35;
          ctx.fillStyle = "rgba(30,8,8,.95)";
          ctx.fillRect(o.x, dy, o.sz, o.sz);
          ctx.strokeStyle = `rgba(255,90,0,${g})`; ctx.lineWidth = 3;
          ctx.strokeRect(o.x + 3, dy + 3, o.sz - 6, o.sz - 6);
        } else if (o.type === "quartz") {
          ctx.fillStyle = "rgba(38,30,42,.9)";
          ctx.fillRect(o.x, dy, o.sz, o.sz * .7);
          ctx.fillStyle = "#fff";
          ctx.fillRect(o.x + 7, dy + 9, 9, 9); ctx.fillRect(o.x + 20, dy + 15, 11, 7);
        } else if (o.type === "lantern") {
          const g = .55 + Math.sin(t * 2.9) * .25;
          ctx.fillStyle = "#1c1e20"; ctx.fillRect(o.x, dy, 13, 18);
          ctx.fillStyle = T.cyan; ctx.shadowColor = T.cyan; ctx.shadowBlur = g * 14;
          ctx.fillRect(o.x - 3, dy + 16, 20, 20); ctx.shadowBlur = 0;
        }
      });

      // Cracks
      cracks.forEach(c => {
        const dy = c.y - sy;
        if (dy < -300 || dy > h + 300) return;
        ctx.beginPath();
        ctx.moveTo(c.x, dy);
        ctx.lineTo(c.x + Math.cos(c.a) * c.len, dy + Math.sin(c.a) * c.len);
        ctx.strokeStyle = c.c; ctx.shadowColor = c.c; ctx.shadowBlur = 8; ctx.lineWidth = 2.5;
        ctx.stroke(); ctx.shadowBlur = 0;
      });

      // Purple drips
      if (!narrow) {
        for (let i = drips.length - 1; i >= 0; i--) {
          const d = drips[i];
          d.y += d.vy; d.life -= 1 / d.maxL;
          if (d.life <= 0 || d.y > h) { drips.splice(i, 1); continue; }
          ctx.fillStyle = `rgba(176,38,255,${d.life * .85})`;
          ctx.fillRect(d.x, d.y, d.sz, d.sz * 1.6);
        }
      }

      // Waterfall (right side)
      const wfW = 88, wfX = w - wfW - 115;
      const wfCoreColor = soulZone ? T.cyan  : "#ffcc00";
      const wfEdgeColor = soulZone ? "rgba(0,120,240,.88)" : "rgba(255,42,0,.88)";
      const wg = ctx.createLinearGradient(wfX, 0, wfX + wfW, 0);
      wg.addColorStop(0, wfEdgeColor); wg.addColorStop(.35, wfCoreColor); wg.addColorStop(.65, wfCoreColor); wg.addColorStop(1, wfEdgeColor);
      ctx.fillStyle = wg;
      for (let y = 0; y < h; y += 38) {
        ctx.fillRect(wfX + Math.sin(y * .05 + wfOff * .1) * 5, y, wfW, 40);
      }
      for (let off = 14; off < wfW; off += 18) {
        ctx.beginPath(); ctx.moveTo(wfX + off, 0); ctx.lineTo(wfX + off, h);
        ctx.strokeStyle = soulZone ? "rgba(0,229,255,.22)" : "rgba(255,200,0,.22)";
        ctx.setLineDash([28, 88]); ctx.lineDashOffset = -wfOff * (4 + off % 3); ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Splash spawn
      if (Math.random() > .12) splashes.push({ x: wfX + Math.random() * wfW, y: h - 18, vx: (Math.random() - .5) * 5.5, vy: -(Math.random() * 4.5 + 1.8), sz: Math.random() * 2.8 + 1.2, life: 1, soul: soulZone });
      if (Math.random() > .16) steams.push({ x: wfX + wfW / 2 + (Math.random() - .5) * 55, y: h - 22, vx: (Math.random() - .5) * 1.4, vy: -(Math.random() * 1.1 + .5), sz: Math.random() * 18 + 10, life: 1, soul: soulZone });

      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]; s.x += s.vx; s.y += s.vy; s.vy += .18; s.life -= .028;
        if (s.life <= 0) { splashes.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(s.x, s.y, s.sz, 0, Math.PI * 2);
        ctx.fillStyle = s.soul ? `rgba(0,229,255,${s.life})` : `rgba(255,50,0,${s.life})`; ctx.fill();
      }
      for (let i = steams.length - 1; i >= 0; i--) {
        const s = steams[i]; s.x += s.vx; s.y += s.vy; s.life -= .014;
        if (s.life <= 0) { steams.splice(i, 1); continue; }
        const sg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.sz);
        sg.addColorStop(0, s.soul ? "rgba(0,200,255,.14)" : "rgba(255,90,0,.14)");
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath(); ctx.arc(s.x, s.y, s.sz, 0, Math.PI * 2); ctx.fillStyle = sg; ctx.fill();
      }

      // Embers
      ctx.globalAlpha = narrow ? .05 : .75;
      for (const e of embers) {
        e.x += e.vx + Math.sin(e.life * 5.8) * .18; e.y += e.vy; e.life -= e.decay;
        if (e.life <= 0 || e.y < -18) { e.x = Math.random() * w; e.y = h + 60; e.life = 1; }
        const ec = soulZone ? T.cyan : Math.random() > .52 ? T.magma : T.lava;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.sz, 0, Math.PI * 2);
        ctx.fillStyle = ec; ctx.shadowColor = ec; ctx.shadowBlur = 5; ctx.fill(); ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <filter id="heatwave">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.025" numOctaves="2" result="n">
            <animate attributeName="baseFrequency" dur="16s" values="0.008 0.025;0.008 0.04;0.008 0.025" repeatCount="indefinite" />
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <canvas ref={cvs} style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", filter: "url(#heatwave)" }} />
    </>
  );
}

/* ── Ledger Seal Widget ───────────────────────────────────── */
function LedgerSeal() {
  const [busy,  setBusy]  = useState(false);
  const [stat,  setStat]  = useState("SECURED");
  const [log,   setLog]   = useState("SYSTEM_IDLE");
  const [pct,   setPct]   = useState(100);

  const verify = useCallback((e: React.MouseEvent) => {
    if (busy) return;
    setBusy(true); setStat("VERIFYING…"); setPct(0);
    const ripple = document.createElement("div"); ripple.className = "ripple-ring";
    ripple.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
    document.body.appendChild(ripple); setTimeout(() => ripple.remove(), 1300);
    const steps = [
      [200,  "SCANNING_SHA256", 25],
      [550,  "VERIFY_ED25519",  55],
      [950,  "MERKLE_ROOTS_OK", 80],
      [1300, "CHAIN_COMPLETE",  100],
    ] as const;
    steps.forEach(([ms, msg, p]) => setTimeout(() => { setLog(msg as string); setPct(p as number); }, ms));
    setTimeout(() => { setBusy(false); setStat("100% VERIFIED"); }, 1450);
  }, [busy]);

  return (
    <div onClick={verify} style={{
      width: "290px", height: "380px",
      background: "rgba(8,2,10,0.97)",
      border: `10px solid #180c22`,
      borderRadius: "2px",
      boxShadow: busy
        ? `0 0 60px ${T.cyan}, 0 0 120px ${T.cyan}40, inset 0 0 30px ${T.cyan}30`
        : `0 0 40px ${T.purple}35, 0 0 80px ${T.purple}15, inset 0 0 25px ${T.purple}50`,
      cursor: "pointer",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
      padding: "22px 18px",
      transition: "all 0.4s ease",
      transform: busy ? "scale(1.04)" : "scale(1)",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", width: "100%" }}>
        <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", letterSpacing: "2.5px", color: T.mute, textTransform: "uppercase" }}>
          BASTION // MEMORY INTEGRITY SEAL
        </div>
        <div style={{ height: "1px", background: `linear-gradient(90deg, transparent, ${T.purple}80, transparent)`, margin: "8px 0" }} />
      </div>

      {/* Rotating Shield */}
      <div style={{ position: "relative", width: "120px", height: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {/* Orbit labels */}
        {[["SHA-256", "orbit-a"], ["Ed25519", "orbit-b"], ["pgvec", "orbit-c"]].map(([label, cls]) => (
          <span key={label} className={`orbit-tag ${cls}`}
            style={{ position: "absolute", padding: "2px 7px", background: "rgba(10,3,14,.95)", border: "1px solid rgba(255,255,255,.07)", borderRadius: "2px", fontSize: "8px", fontFamily: "var(--font-mono)", color: T.body, whiteSpace: "nowrap", pointerEvents: "none" }}>
            {label}
          </span>
        ))}
        {/* Core */}
        <div className={busy ? "seal-spin" : "seal-float"} style={{
          width: "86px", height: "86px", borderRadius: "50%",
          background: `radial-gradient(circle, ${T.obs} 0%, #1a0830 70%, ${T.purple} 100%)`,
          border: `3px solid ${busy ? T.cyan : T.purple}`,
          boxShadow: busy ? `0 0 30px ${T.cyan}` : `0 0 18px ${T.purple}60`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.3s",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={busy ? T.cyan : "#fff"} strokeWidth="2.4">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        {busy && <div className="scanline" />}
      </div>

      {/* HUD Display */}
      <div style={{ width: "100%", background: "rgba(0,0,0,.5)", borderRadius: "2px", padding: "10px 12px", border: "1px solid rgba(255,255,255,.04)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: T.mute }}>CHAIN_STATUS</span>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", fontWeight: 700, color: busy ? T.cyan : T.gold }}>{stat}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: T.mute }}>VERIFY_LOG</span>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: T.body, maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log}</span>
        </div>
        {/* Progress bar */}
        <div style={{ height: "3px", background: "rgba(255,255,255,.06)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${T.lava}, ${T.cyan})`, transition: "width 0.3s ease", boxShadow: `0 0 6px ${T.cyan}` }} />
        </div>
      </div>

      {/* CTA */}
      <div style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: busy ? T.cyan : T.ember, letterSpacing: "1px", textTransform: "uppercase", animation: busy ? "none" : "sealPulse 1.6s infinite" }}>
        {busy ? "Verifying ledger chain…" : "⚡ Click to Verify Chain"}
      </div>

      <style>{`
        .seal-float { animation: sealFloat 4.2s ease-in-out infinite; }
        .seal-spin  { animation: sealSpin .65s linear infinite !important; }
        @keyframes sealFloat { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-9px) rotate(6deg)} }
        @keyframes sealSpin  { to{transform:rotate(360deg)} }
        @keyframes sealPulse { 0%,100%{opacity:.55} 50%{opacity:1;text-shadow:0 0 8px ${T.lava}} }

        .orbit-tag { animation-duration: 8s; animation-timing-function: linear; animation-iteration-count: infinite; }
        .orbit-a { animation-name: orbitA; }
        .orbit-b { animation-name: orbitB; }
        .orbit-c { animation-name: orbitC; }
        @keyframes orbitA { from{transform:rotate(0deg) translateX(65px) rotate(0deg)} to{transform:rotate(360deg) translateX(65px) rotate(-360deg)} }
        @keyframes orbitB { from{transform:rotate(120deg) translateX(65px) rotate(-120deg)} to{transform:rotate(480deg) translateX(65px) rotate(-480deg)} }
        @keyframes orbitC { from{transform:rotate(240deg) translateX(65px) rotate(-240deg)} to{transform:rotate(600deg) translateX(65px) rotate(-600deg)} }

        .scanline {
          position:absolute; top:0; left:0; right:0; height:3px;
          background:${T.cyan}; box-shadow:0 0 10px ${T.cyan};
          animation:scanDown 1.5s linear infinite;
        }
        @keyframes scanDown { 0%{top:0} 100%{top:100%} }

        .ripple-ring {
          position:fixed; pointer-events:none; z-index:9999;
          width:70px; height:70px; border-radius:50%;
          border:4px solid ${T.cyan}; box-shadow:0 0 20px ${T.cyan};
          transform:translate(-50%,-50%) scale(.1); opacity:1;
          animation:rippleOut 1.2s cubic-bezier(.1,.85,.25,1) forwards;
        }
        @keyframes rippleOut {
          from{transform:translate(-50%,-50%) scale(.1);opacity:1}
          to  {transform:translate(-50%,-50%) scale(24);opacity:0;filter:blur(12px)}
        }
      `}</style>
    </div>
  );
}

/* ── Consolidation Visualizer ─────────────────────────────── */
function Consolidation() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStage(s => (s + 1) % 4), 4500);
    return () => clearInterval(iv);
  }, []);

  const steps = [
    { t: "Stage 1 — Scan & Fetch",        d: "Daemon wakes during inactivity. Scans recent agent_memory entries on CockroachDB.", c: T.lava },
    { t: "Stage 2 — Semantic Clustering",  d: "Clusters entries using AWS Titan v2 cosine distance vectors to identify duplicates.", c: T.magma },
    { t: "Stage 3 — Conflict Resolution",  d: "Detects logical negations & temporal ordering to determine canonical memory state.", c: T.gold },
    { t: "Stage 4 — Ledger Commit",        d: "SHA-256 links the block to chain tip and signs with the agent Ed25519 private key.", c: T.cyan },
  ];

  return (
    <Reveal>
      <div style={{ maxWidth: "960px", margin: "0 auto", position: "relative", zIndex: 10 }}>
        <SectionHeader eyebrow="Consolidation Engine" title="Sleep-Time Memory Fusion" sub="Watch the background daemon compress, deduplicate, and cryptographically seal AI memory chains." />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: "36px", alignItems: "center" }} className="two-col-grid">
          {/* Step list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {steps.map((s, i) => (
              <div key={i} style={{
                padding: "18px 22px",
                background: stage === i ? "rgba(255,60,0,.07)" : "rgba(8,2,6,.85)",
                border: `2px solid ${stage === i ? s.c : "rgba(70,50,55,.5)"}`,
                borderRadius: "3px",
                transition: "all .4s ease",
                opacity: stage === i ? 1 : .6,
                boxShadow: stage === i ? `0 0 15px ${s.c}20` : "none",
              }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "5px", fontFamily: "var(--font-sg)" }}>{s.t}</div>
                <div style={{ fontSize: "13.5px", color: T.body, lineHeight: 1.55, fontFamily: "var(--font-inter)" }}>{s.d}</div>
              </div>
            ))}
          </div>

          {/* Viz panel */}
          <Card style={{ minHeight: "340px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "20px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.mute, letterSpacing: "1.5px", textAlign: "center" }}>
              DAEMON_STATE // {["SCANNING","CLUSTERING","RESOLVING","COMMITTING"][stage]}
            </div>
            <div style={{ minHeight: "130px", display: "flex", justifyContent: "center", alignItems: "center", gap: "16px" }}>
              {stage === 0 && (
                <>{["Memory A", "Memory B"].map(l => <div key={l} className="mini-node pulse-amber">{l}</div>)}</>
              )}
              {stage === 1 && (
                <div style={{ display:"flex",flexDirection:"column",gap:"12px",alignItems:"center" }}>
                  <div className="mini-node pulse-lava">Group A — dist: 0.08</div>
                  <div style={{ width:"2px",height:"24px",background:T.lava+"60" }} />
                  <div className="mini-node pulse-lava">Reference Centroid</div>
                </div>
              )}
              {stage === 2 && (
                <>{[{l:"Stale Memory",c:"#f33"},{l:"→",c:T.mute},{l:"New Fact",c:"#3f3"}].map(({l,c},i)=> <span key={i} style={{color:c,fontWeight:700,fontFamily:"var(--font-sg)",fontSize:"14px"}}>{l}</span>)}</>
              )}
              {stage === 3 && (
                <div style={{ display:"flex",alignItems:"center",gap:"14px" }}>
                  <div className="mini-node" style={{borderColor:"#3f3",color:"#3f3"}}>Block #n</div>
                  <span style={{fontSize:"20px"}}>⛓️</span>
                  <div className="mini-node" style={{borderColor:T.cyan,color:T.cyan,boxShadow:`0 0 12px ${T.cyan}30`}}>Block #n+1</div>
                </div>
              )}
            </div>
            {/* Progress */}
            <div style={{ height:"4px",background:"rgba(255,255,255,.06)",borderRadius:"2px",overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(stage+1)*25}%`, background:`linear-gradient(90deg,${T.lava},${T.magma},${T.cyan})`, boxShadow:`0 0 8px ${T.lava}`, transition:"width .5s ease" }} />
            </div>
          </Card>
        </div>
      </div>
      <style>{`
        .mini-node{padding:10px 16px;border-radius:2px;background:rgba(12,4,16,.97);border:2px solid rgba(80,60,65,.6);color:#fff;font-size:13px;font-weight:700;font-family:var(--font-sg);text-align:center;box-shadow:inset 1px 1px 0 rgba(255,255,255,.08)}
        .pulse-amber{animation:pAmber 1.6s infinite}
        .pulse-lava{animation:pLava 1.6s infinite}
        @keyframes pAmber{0%,100%{border-color:rgba(255,183,0,.35)}50%{border-color:rgba(255,183,0,.95)}}
        @keyframes pLava{0%,100%{border-color:rgba(255,42,0,.35)}50%{border-color:rgba(255,42,0,.95)}}
        .two-col-grid{@media(max-width:820px){grid-template-columns:1fr!important}}
      `}</style>
    </Reveal>
  );
}

/* ── Comparison Table ─────────────────────────────────────── */
function Comparison() {
  const rows = [
    { feat: "Cryptographic Tamper-Evidence", bastion: "SHA-256 Chain (0.16ms)",   mem0: "None (Raw DB)",      zep: "None (Raw DB)",          hot: true  },
    { feat: "Time-Travel Query (MVCC)",       bastion: "AS OF SYSTEM TIME",         mem0: "Manual logs",        zep: "Snapshots only",          hot: false },
    { feat: "EU AI Act Art.12 Compliance",    bastion: "Built-in Audit Trail",      mem0: "Custom build",       zep: "Custom build",            hot: false },
    { feat: "Prompt Poisoning Guard (ASI06)", bastion: "OWASP MemoryGuard",         mem0: "Unprotected",        zep: "PII filter only",         hot: true  },
    { feat: "Multi-Region Distributed Sync",  bastion: "6 Regions (CockroachDB)",   mem0: "Single node",        zep: "Manual replication",      hot: false },
    { feat: "Developer Cost",                 bastion: "MIT — Free Open Source",    mem0: "$249/mo Cloud",       zep: "$125/mo Cloud",           hot: true  },
  ];

  return (
    <Reveal>
      <div style={{ maxWidth: "960px", margin: "0 auto", zIndex: 10, position: "relative" }}>
        <SectionHeader eyebrow="Comparison Matrix" title="Rivaling the Alternatives" sub="Why enterprise AI teams reach for Bastion over proprietary memory services." />
        <div style={{ background: "rgba(8,3,10,.9)", border: "3px solid rgba(80,60,65,.55)", borderRadius: "3px", overflow: "hidden", backdropFilter: "blur(16px)", boxShadow: "0 20px 50px rgba(0,0,0,.8)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", minWidth: "600px" }}>
            <thead>
              <tr style={{ background: "rgba(25,8,14,.75)", borderBottom: "2px solid rgba(80,60,65,.55)" }}>
                {["Feature", "Bastion ✦", "Mem0", "Zep"].map(h => (
                  <th key={h} style={{ padding: "18px 20px", textAlign: "left", fontFamily: "var(--font-mono)", fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "1.8px", color: h === "Bastion ✦" ? T.gold : T.mute, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="cmp-row" style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(80,60,65,.3)" : "none", background: r.hot ? "rgba(255,50,0,.04)" : "transparent" }}>
                  <td style={{ padding: "16px 20px", color: "#fff", fontWeight: 600, fontFamily: "var(--font-sg)", fontSize: "13.5px" }}>{r.feat}</td>
                  <td style={{ padding: "16px 20px", color: r.hot ? T.gold : T.cyan, fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>{r.bastion}</td>
                  <td style={{ padding: "16px 20px", color: T.body, fontSize: "13px" }}>{r.mem0}</td>
                  <td style={{ padding: "16px 20px", color: T.body, fontSize: "13px" }}>{r.zep}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`.cmp-row{transition:background .2s}.cmp-row:hover{background:rgba(255,42,0,.06)!important}`}</style>
    </Reveal>
  );
}

/* ── Feature Grid ─────────────────────────────────────────── */
function Features() {
  const items = [
    { icon: "🔐", title: "SHA-256 Ledger Chain",         desc: "Every memory block cryptographically links to the previous, creating a tamper-evident chain. Any corruption is immediately detected.",              color: T.lava   },
    { icon: "⏳", title: "AS OF SYSTEM TIME Queries",    desc: "Full MVCC time-travel. Query exactly what your agent knew at 3:47 AM last Tuesday — down to the millisecond.",                                  color: T.gold   },
    { icon: "🛡️", title: "OWASP ASI06 MemoryGuard",      desc: "Semantic classifier blocks prompt injection, API key leakage, and PII from ever being written to the memory store.",                          color: T.cyan   },
    { icon: "🌍", title: "6-Region Global Sync",          desc: "CockroachDB serializable isolation across US, EU, and APAC ensures sub-50ms reads with zero-downtime failover.",                                color: T.magma  },
    { icon: "🧠", title: "Sleep-Time Consolidation",      desc: "Background daemon deduplicates, merges contradictions, and reseals the ledger — zero-overhead during agent operation.",                         color: T.purple },
    { icon: "📋", title: "A2A Ed25519 Memory Cards",      desc: "Agents transfer signed memory bundles with provenance proofs. The receiving agent can cryptographically verify the card's integrity.",         color: T.gold   },
  ];

  return (
    <Reveal>
      <div style={{ maxWidth: "960px", margin: "0 auto", zIndex: 10, position: "relative" }}>
        <SectionHeader eyebrow="Core Capabilities" title="What Makes Bastion Different" sub="Every feature exists to make AI agent memory durable, auditable, and injection-proof." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
          {items.map((f, i) => (
            <Reveal key={i} delay={i * 80}>
              <Card accent={f.color} style={{ height: "100%", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ fontSize: "32px", lineHeight: 1 }}>{f.icon}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{f.title}</div>
                <div style={{ fontSize: "13.5px", color: T.body, lineHeight: 1.6, fontFamily: "var(--font-inter)", flexGrow: 1 }}>{f.desc}</div>
                <div style={{ height: "2px", background: `linear-gradient(90deg, ${f.color}, transparent)`, borderRadius: "1px" }} />
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ── FAQ ──────────────────────────────────────────────────── */
function FAQ() {
  const [open, setOpen] = useState<number|null>(null);
  const qs = [
    { q: "What does Bastion actually store?",              a: "Bastion stores structured agent observations, user facts, and world-state deltas — timestamped, vectorized, and cryptographically sealed into a PGVector-indexed ledger on CockroachDB." },
    { q: "How does the SHA-256 ledger chain work?",        a: "Each memory block stores SHA-256(previous_hash ‖ content ‖ timestamp). Any tampering breaks the chain — detectable in O(n) via the /logs inspector." },
    { q: "Does Bastion protect against prompt injection?", a: "Yes. Every memory write passes through the OWASP ASI06 semantic guard — a lightweight classifier that blocks injection patterns, PII, and credential leakage before committing." },
    { q: "How do dynamic database connections work?",      a: "Paste your CockroachDB connection string in the Cockpit modal. The frontend stores it in localStorage and sends it as 'x-bastion-conn' on every API call — no restart needed." },
    { q: "Is this fully open source?",                     a: "Yes, MIT licensed. Clone, self-host, and modify freely. The full stack — API, schema, consolidation daemon, and MemoryGuard — is in the repo." },
  ];

  return (
    <Reveal>
      <div style={{ maxWidth: "820px", margin: "0 auto", zIndex: 10, position: "relative" }}>
        <SectionHeader eyebrow="Questions & Answers" title="Frequently Asked" sub="Everything you need to evaluate Bastion before integrating." eyebrowColor={T.cyan} />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {qs.map((faq, i) => (
            <div key={i} className="faq-card" style={{ background: "rgba(8,3,12,.92)", border: `2px solid rgba(80,60,65,.5)`, borderRadius: "3px", overflow: "hidden", boxShadow: "inset 2px 2px 0 rgba(255,255,255,.04)" }}>
              <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", padding: "18px 22px", background: "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "15px", fontWeight: 700, color: "#fff", textAlign: "left", fontFamily: "var(--font-sg)" }}>{faq.q}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.mute} strokeWidth="2" style={{ flexShrink: 0, transform: open === i ? "rotate(180deg)" : "none", transition: "transform .3s ease" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <div style={{ maxHeight: open === i ? "220px" : "0", overflow: "hidden", transition: "max-height .42s cubic-bezier(0.16,1,0.3,1)" }}>
                <p style={{ padding: "0 22px 18px", margin: 0, fontSize: "14px", lineHeight: 1.7, color: T.body, fontFamily: "var(--font-inter)" }}>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`.faq-card{transition:all .28s ease}.faq-card:hover{border-color:${T.cyan}!important;box-shadow:0 0 18px ${T.cyan}15,inset 2px 2px 0 rgba(255,255,255,.05)!important}`}</style>
    </Reveal>
  );
}

/* ── Reusable Section Header ─────────────────────────────── */
function SectionHeader({ eyebrow, title, sub, eyebrowColor = T.lava }: { eyebrow: string; title: string; sub?: string; eyebrowColor?: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: "52px", padding: "28px 24px", background: "rgba(6,2,8,.82)", backdropFilter: "blur(14px)", borderRadius: "3px", border: "2px solid rgba(80,60,65,.5)", boxShadow: "inset 2px 2px 0 rgba(255,255,255,.04)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "3.5px", color: eyebrowColor, marginBottom: "10px" }}>{eyebrow}</div>
      <h2 style={{ fontSize: "clamp(30px,4.5vw,46px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", letterSpacing: "-1.5px", margin: "0 0 12px", textShadow: "0 0 30px rgba(255,55,0,.2)" }}>{title}</h2>
      {sub && <p style={{ fontSize: "16px", color: T.body, maxWidth: "580px", margin: "0 auto", lineHeight: 1.65, fontFamily: "var(--font-inter)" }}>{sub}</p>}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function Page() {
  const { y: scrollY, pct: scrollPct } = useScroll();
  const navScrolled = scrollY > 60;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={`${spaceGrotesk.variable} ${jetMono.variable} ${inter.variable}`}
      style={{ position: "relative", minHeight: "100vh", background: T.obs, overflowX: "hidden", fontFamily: "var(--font-inter), sans-serif" }}>

      {/* ── Scroll Progress Rail ── */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "3px", zIndex: 1100, background: "rgba(255,40,0,.04)" }}>
        <div style={{ height: "100%", width: `${scrollPct * 100}%`, background: `linear-gradient(90deg,${T.lava},${T.magma},${T.gold})`, boxShadow: `0 0 12px ${T.lava}`, transition: "width .08s linear" }} />
      </div>

      {/* ── Animated Canvas ── */}
      <NetherCanvas />

      {/* ── Vignette ── */}
      <div style={{ position: "fixed", inset: 0, background: "radial-gradient(circle at 38% 32%, rgba(5,2,6,.55) 0%, rgba(4,1,4,.92) 100%)", zIndex: 0, pointerEvents: "none" }} />

      {/* ── Pixel-grid overlay ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: .04, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(255,42,0,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,42,0,.3) 1px,transparent 1px)",
        backgroundSize: "48px 48px" }} />

      {/* ══════════════════════════ NAV ══════════════════════════ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
        padding: navScrolled ? "12px 48px" : "20px 48px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: navScrolled ? "rgba(5,2,6,.95)" : "rgba(5,2,6,.55)",
        backdropFilter: "blur(24px)",
        borderBottom: `1px solid ${navScrolled ? "rgba(255,42,0,.35)" : "rgba(255,42,0,.12)"}`,
        boxShadow: navScrolled ? `0 0 30px rgba(255,42,0,.08)` : "none",
        transition: "all .35s cubic-bezier(.16,1,.3,1)",
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "11px" }}>
          <div style={{ width: "34px", height: "34px", borderRadius: "3px", background: `linear-gradient(135deg,${T.lava},${T.magma})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 18px ${T.lava}50`, flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" /></svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontWeight: 900, fontSize: "17px", letterSpacing: "3px", color: "#fff", textTransform: "uppercase", fontFamily: "var(--font-sg)" }}>BASTION</span>
            <span style={{ fontSize: "8.5px", letterSpacing: "2px", color: T.mute, fontFamily: "var(--font-mono)", marginTop: "1px" }}>MEMORY LEDGER</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div style={{ display: "flex", gap: "28px", alignItems: "center" }} className="desktop-nav">
          {[["Docs","/docs"],["Cockpit","/dashboard"],["Logs","/logs"],["Health","/health"]].map(([l,h])=>(
            <Link key={l} href={h} className="nav-lnk" style={{ color: T.body, fontSize: "14px", textDecoration: "none", fontWeight: 600, letterSpacing: ".4px" }}>{l}</Link>
          ))}
          {/* Version chip */}
          <span style={{ padding: "3px 9px", borderRadius: "2px", background: "rgba(255,42,0,.1)", border: `1px solid ${T.line}`, fontFamily: "var(--font-mono)", fontSize: "9px", color: T.lava, letterSpacing: "1px" }}>v0.16</span>
          <Link href="/dashboard" className="nav-cta" style={{ padding: "9px 20px", borderRadius: "3px", background: `linear-gradient(135deg,${T.lava},${T.magma})`, color: "#fff", fontSize: "12.5px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px", boxShadow: `0 0 16px ${T.lava}30` }}>
            Launch Cockpit
          </Link>
        </div>
      </nav>

      {/* ══════════════════════════ HERO ══════════════════════════ */}
      <section style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "160px 24px 80px", position: "relative", zIndex: 2 }}>
        <div style={{ width: "100%", maxWidth: "960px" }}>

          {/* Two-col hero grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: "50px", alignItems: "center" }} className="hero-grid">

            {/* Left */}
            <div>
              {/* Eyebrow badge */}
              <div className="hs1" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "5px 14px", borderRadius: "3px", background: "rgba(255,42,0,.08)", border: `1px solid ${T.line}`, marginBottom: "22px" }}>
                <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: T.gold, boxShadow: `0 0 7px ${T.gold}`, animation: "sparkBeat 1.5s infinite", display: "inline-block" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2.5px", color: T.gold }}>Bastion Ledger — Active</span>
              </div>

              {/* Title */}
              <h1 className="hs2" style={{ fontSize: "clamp(52px,7.2vw,100px)", fontWeight: 900, lineHeight: ".88", letterSpacing: "-3px", color: "#fff", margin: "0 0 22px", fontFamily: "var(--font-sg)", textShadow: "0 4px 20px rgba(0,0,0,.85)" }}>
                THE FORTRESS<br />OF AGENTIC<br />
                <span style={{ background: `linear-gradient(135deg,${T.lava},${T.magma},${T.gold},${T.lava})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", backgroundSize: "200% auto", animation: "gradShift 4s ease infinite" }}>MEMORY</span>
              </h1>

              {/* Sub */}
              <p className="hs3" style={{ fontSize: "18px", lineHeight: 1.7, color: "#fff", fontWeight: 600, marginBottom: "34px", textShadow: "0 2px 12px rgba(0,0,0,.98)", maxWidth: "480px" }}>
                Persistent, self-healing memory for autonomous AI agents. Crash-proof. Injection-resistant. Cryptographically sealed. Forged in CockroachDB.
              </p>

              {/* CTA row */}
              <div className="hs4" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <Link href="/dashboard" className="btn-lava" style={{ padding: "13px 28px", borderRadius: "3px", background: `linear-gradient(135deg,${T.lava},${T.magma})`, color: "#fff", fontSize: "13px", fontWeight: 800, textDecoration: "none", textTransform: "uppercase", letterSpacing: "1px", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  Try Demo Dashboard
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
                <Link href="/docs" style={{ padding: "13px 28px", borderRadius: "3px", border: `1px solid ${T.line}`, background: "rgba(20,8,14,.6)", color: "#fff", fontSize: "13px", fontWeight: 700, textDecoration: "none", backdropFilter: "blur(8px)" }}>
                  Read the Docs
                </Link>
              </div>

              {/* Stat counters */}
              <div className="hs5" style={{ display: "flex", gap: "30px", marginTop: "42px", paddingTop: "28px", borderTop: `1px solid ${T.line}` }}>
                {[
                  { end: 2800000, suf: "", label: "Memories / Day" },
                  { end: 16,      suf: "ms", label: "Avg Query Latency" },
                  { end: 6,       suf: "",   label: "Global Regions" },
                ].map(({ end, suf, label }) => (
                  <div key={label}>
                    <div style={{ fontSize: "clamp(22px,3vw,34px)", fontWeight: 900, color: "#fff", fontFamily: "var(--font-sg)", lineHeight: 1, letterSpacing: "-1px" }}>
                      <CountUp end={end} suffix={suf} />
                    </div>
                    <div style={{ fontSize: "11.5px", color: T.mute, fontFamily: "var(--font-mono)", marginTop: "4px", textTransform: "uppercase", letterSpacing: "1.5px" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Interactive Ledger Seal */}
            <div className="hs6" style={{ display: "flex", justifyContent: "center" }}>
              <LedgerSeal />
            </div>
          </div>

          {/* ── Tour Cards (below hero content) ── */}
          <div className="hs7" style={{ marginTop: "64px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: `1px solid ${T.line}`, paddingBottom: "12px", marginBottom: "24px" }}>
              <div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.lava, textTransform: "uppercase", letterSpacing: "2px", fontWeight: 700 }}>Quick Start</div>
                <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "4px 0 0", fontFamily: "var(--font-sg)" }}>Guided Onboarding Views</h2>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: T.mute }}>⭐ JUDGES_RECOMMENDED</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "14px" }}>
              {[
                { icon: "📊", t: "Command Center",     d: "Live KPIs, region telemetry, ingestion rates and event stream.", link: "/dashboard?tour=start", c: T.lava,   badge: "Tour 1" },
                { icon: "🌐", t: "Memory Graph",       d: "Interactive knowledge graph with AS OF time-travel slider.",     link: "/graph?tour=start",     c: T.gold,   badge: "Tour 2" },
                { icon: "🔗", t: "Ledger Registry",    d: "Browse and verify SHA-256 block chain hashes and signatures.",   link: "/logs?tour=start",      c: T.purple, badge: "Tour 3" },
                { icon: "🛡️", t: "MemoryGuard",        d: "Watch ASI06 guard filter live injection and PII attempts.",      link: "/dashboard?tour=start#memoryguard", c: T.cyan, badge: "Tour 4" },
              ].map((tour, i) => (
                <Link key={i} href={tour.link} style={{ textDecoration: "none" }}>
                  <Card accent={tour.c} style={{ minHeight: "200px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span style={{ padding: "2px 7px", borderRadius: "2px", background: `${tour.c}18`, color: tour.c, border: `1px solid ${tour.c}28`, fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 700, textTransform: "uppercase" }}>{tour.badge}</span>
                        <span style={{ fontSize: "18px" }}>{tour.icon}</span>
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "7px", fontFamily: "var(--font-sg)" }}>{tour.t}</div>
                      <div style={{ fontSize: "13px", color: T.body, lineHeight: 1.55, fontFamily: "var(--font-inter)" }}>{tour.d}</div>
                    </div>
                    <div style={{ height: "2px", background: `linear-gradient(90deg,${tour.c},transparent)`, marginTop: "16px", borderRadius: "1px" }} />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ SECTIONS ══════════════════════════ */}
      <div style={{ position: "relative", zIndex: 2 }}>
        <SectionWrapper><Features /></SectionWrapper>
        <SectionWrapper><Consolidation /></SectionWrapper>
        <SectionWrapper><Comparison /></SectionWrapper>
        <SectionWrapper><FAQ /></SectionWrapper>
      </div>

      {/* ══════════════════════════ FOOTER ══════════════════════════ */}
      <footer style={{ position: "relative", zIndex: 10, background: "rgba(6,2,8,.98)", borderTop: "3px solid rgba(80,60,65,.55)", boxShadow: "inset 2px 2px 0 rgba(255,255,255,.04)" }}>
        {/* Top footer body */}
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "72px 24px 48px", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: "40px" }} className="footer-grid">

          {/* Brand column */}
          <div>
            <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
              <div style={{ width: "30px", height: "30px", borderRadius: "3px", background: `linear-gradient(135deg,${T.lava},${T.magma})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 12px ${T.lava}30` }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/></svg>
              </div>
              <span style={{ fontWeight: 900, fontSize: "15px", letterSpacing: "2.5px", color: "#fff", textTransform: "uppercase", fontFamily: "var(--font-sg)" }}>BASTION</span>
            </Link>
            <p style={{ fontSize: "13.5px", color: T.mute, lineHeight: 1.65, maxWidth: "220px", fontFamily: "var(--font-inter)", margin: "0 0 20px" }}>
              Open-source cryptographic memory ledger for autonomous AI agents. MIT licensed.
            </p>
            {/* Mini stats */}
            <div style={{ display: "flex", gap: "16px" }}>
              {[["MIT","License"],["v0.16","Release"],["6","Regions"]].map(([n,l])=>(
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-sg)", fontSize: "16px", fontWeight: 900, color: T.gold }}>{n}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: T.mute, textTransform: "uppercase", letterSpacing: "1px" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", color: T.lava, marginBottom: "18px" }}>Product</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
              {[["Dashboard Cockpit","/dashboard"],["Memory Graph","/graph"],["Ledger Logs","/logs"],["Health Monitor","/health"],["Compliance","/compliance"]].map(([l,h])=>(
                <Link key={l} href={h} className="ft-lnk" style={{ color: T.body, fontSize: "13.5px", textDecoration: "none", fontFamily: "var(--font-inter)" }}>{l}</Link>
              ))}
            </div>
          </div>

          {/* Developer links */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", color: T.magma, marginBottom: "18px" }}>Developer</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
              {[["Documentation","/docs"],["Quick Start","/docs#quickstart"],["API Reference","/docs#api"],["Schema","/docs#schema"],["GitHub","https://github.com/dgboy-ai/Bastion"]].map(([l,h])=>(
                <a key={l} href={h} target={h.startsWith("http") ? "_blank" : "_self"} rel="noopener noreferrer" className="ft-lnk" style={{ color: T.body, fontSize: "13.5px", textDecoration: "none", fontFamily: "var(--font-inter)" }}>{l}</a>
              ))}
            </div>
          </div>

          {/* Security column */}
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "2px", color: T.cyan, marginBottom: "18px" }}>Security</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
              {[["OWASP ASI06 Guard",""],["SHA-256 Chain",""],["Ed25519 Signatures",""],["EU AI Act Art.12",""],["Zero-Trust Model",""]].map(([l])=>(
                <span key={l} style={{ color: T.mute, fontSize: "13px", fontFamily: "var(--font-inter)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: T.cyan, fontSize: "10px" }}>✓</span>{l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Divider with gold shimmer */}
        <div style={{ height: "1px", background: `linear-gradient(90deg,transparent 5%,rgba(80,60,65,.5) 30%,rgba(255,200,0,.25) 50%,rgba(80,60,65,.5) 70%,transparent 95%)`, margin: "0 24px" }} />

        {/* Bottom bar */}
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "22px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <span style={{ fontSize: "12px", color: T.mute, fontFamily: "var(--font-mono)" }}>
            © 2026 Bastion Contributors · MIT License · Secured in CockroachDB
          </span>
          <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
            <span style={{ padding: "2px 8px", background: "rgba(255,42,0,.1)", border: `1px solid ${T.line}`, borderRadius: "2px", fontFamily: "var(--font-mono)", fontSize: "9px", color: T.lava }}>LEDGER_ACTIVE</span>
            <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer" className="ft-lnk" style={{ color: T.mute, fontSize: "12px", textDecoration: "none", fontFamily: "var(--font-mono)" }}>GitHub ↗</a>
          </div>
        </div>

        {/* Gold bottom accent */}
        <div style={{ height: "2px", background: `linear-gradient(90deg,transparent,${T.gold}40,transparent)` }} />
      </footer>

      {/* ══════════════════════════ GLOBAL CSS ══════════════════════════ */}
      <style>{`
        html { scroll-behavior: smooth; }
        *, *::before, *::after { box-sizing: border-box; }

        @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes sparkBeat { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.35);opacity:1} }

        /* Spring entrance helpers */
        @keyframes springUp {
          0%   { opacity:0; transform:translateY(38px) scale(.97); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        .hs1{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .08s both}
        .hs2{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .2s  both}
        .hs3{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .32s both}
        .hs4{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .44s both}
        .hs5{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .56s both}
        .hs6{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .68s both}
        .hs7{animation:springUp 1.1s cubic-bezier(.16,1,.3,1) .82s both}

        /* Nav links */
        .nav-lnk { position:relative; padding-bottom:3px; transition:color .25s; }
        .nav-lnk::after { content:''; position:absolute; bottom:0; left:50%; width:0; height:2px; background:${T.lava}; transition:width .28s ease,left .28s ease; }
        .nav-lnk:hover::after { width:100%; left:0; }
        .nav-lnk:hover { color:#fff!important; }

        .nav-cta { position:relative; overflow:hidden; transition:all .3s cubic-bezier(.16,1,.3,1); }
        .nav-cta::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent); transform:translateX(-100%); transition:transform .45s ease; }
        .nav-cta:hover::after { transform:translateX(100%); }
        .nav-cta:hover { transform:translateY(-2px); box-shadow:0 8px 22px ${T.lava}45!important; }

        /* Lava CTA button */
        .btn-lava { position:relative; overflow:hidden; transition:all .3s cubic-bezier(.16,1,.3,1); box-shadow:0 0 18px ${T.lava}35; }
        .btn-lava::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent); transform:translateX(-100%); transition:transform .45s ease; }
        .btn-lava:hover::after { transform:translateX(100%); }
        .btn-lava:hover { transform:translateY(-3px); box-shadow:0 10px 30px ${T.lava}55!important; }
        .btn-lava:active { transform:scale(.97); }

        /* Footer links */
        .ft-lnk { transition:color .22s; }
        .ft-lnk:hover { color:#fff!important; }

        /* Responsive */
        @media(max-width:860px) {
          .hero-grid  { grid-template-columns:1fr!important; text-align:center; }
          .footer-grid{ grid-template-columns:1fr 1fr!important; }
          .two-col-grid{ grid-template-columns:1fr!important; }
          .desktop-nav{ display:none!important; }
        }
        @media(max-width:560px) {
          .footer-grid{ grid-template-columns:1fr!important; }
        }
      `}</style>
    </div>
  );
}

/* ── Section Wrapper with top divider ────────────────────── */
function SectionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${T.line}`, padding: "112px 24px" }}>
      {children}
    </div>
  );
}
