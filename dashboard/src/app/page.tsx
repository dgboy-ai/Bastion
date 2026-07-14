"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-sg" });
const jetMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter" });

/* ─── Volcanic Design Palette ────────────────────────────── */
const P = {
  lava:   "#ff2a00",
  ember:  "#ff5500",
  magma:  "#ff9000",
  gold:   "#ffc200",
  cyan:   "#00e5ff",
  purple: "#b026ff",
  body:   "#fceef0",
  mute:   "#d2abb0",
  line:   "rgba(255, 42, 0, 0.35)",
  lineB:  "rgba(255, 42, 0, 0.15)",
};

/* ─── Scroll Tracker ─────────────────────────────────────── */
function useScroll() {
  const [y, setY] = useState(0);
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

/* ─── InView Observer ────────────────────────────────────── */
function useInView(threshold = 0.05) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold });
    io.observe(el); return () => io.disconnect();
  }, [threshold]);
  return { ref, seen };
}

/* ─── Scroll Reveal ──────────────────────────────────────── */
function Reveal({ children, delay = 0, style = {} }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setSeen(true); }, { threshold: 0.04 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: seen ? 1 : 0,
      transform: seen ? "translateY(0)" : "translateY(40px)",
      transition: `opacity 0.8s cubic-bezier(.16,1,.3,1) ${delay}ms, transform 0.8s cubic-bezier(.16,1,.3,1) ${delay}ms`,
      ...style,
    }}>{children}</div>
  );
}

/* ─── CountUp Counter ────────────────────────────────────── */
function CountUp({ end, suffix = "", prefix = "", dur = 1800 }: { end: number; suffix?: string; prefix?: string; dur?: number }) {
  const [v, setV] = useState(0);
  const { ref, seen } = useInView(0.2);
  useEffect(() => {
    if (!seen) return;
    const s = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - s) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(e * end));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [seen, end, dur]);
  return <span ref={ref}>{prefix}{v.toLocaleString()}{suffix}</span>;
}

/* ─── Spotlight Card ─────────────────────────────────────── */
function Card({ children, accent = P.lava, style = {} }: { children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hot, setHot] = useState(false);
  return (
    <div ref={ref}
      onMouseMove={e => { const r = ref.current!.getBoundingClientRect(); setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        background: hot
          ? `radial-gradient(340px circle at ${pos.x}px ${pos.y}px, ${accent}25, transparent 65%), rgba(20,4,12,0.97)`
          : "rgba(14,2,8,0.92)",
        border: `2px solid ${hot ? accent : "rgba(125,60,70,0.6)"}`,
        boxShadow: hot
          ? `0 0 35px ${accent}30, inset 2px 2px 0 rgba(255,255,255,0.08), inset -2px -2px 0 rgba(0,0,0,0.6)`
          : "inset 2px 2px 0 rgba(255,255,255,0.04), inset -2px -2px 0 rgba(0,0,0,0.6), 0 4px 30px rgba(0,0,0,0.7)",
        borderRadius: "2px",
        padding: "26px",
        transition: "all 0.25s cubic-bezier(.16,1,.3,1)",
        transform: hot ? "translateY(-4px)" : "none",
        backdropFilter: "blur(16px)",
        ...style,
      }}>
      {children}
    </div>
  );
}

/* ─── Pixel Block Renderer ───────────────────────────────── */
type BT = "obs" | "black" | "gilded" | "crying" | "nether" | "soul";
function drawBlock(ctx: CanvasRenderingContext2D, bx: number, by: number, sz: number, type: BT, seed: number) {
  const px = sz / 5;
  const r = (i: number) => { const x = Math.sin(seed + i * 7.13) * 9999; return x - Math.floor(x); };
  for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 5; gy++) {
    const v = r(gx + gy * 5);
    let c = "#000";
    if (type === "obs")    c = v>.72?"#22103a":v>.45?"#130823":"#080312";
    if (type === "crying") c = v>.86?P.purple:v>.64?"#200e36":v>.35?"#110620":"#07030f";
    if (type === "black")  c = v>.78?"#302838":v>.42?"#1e1624":"#100e14";
    if (type === "gilded") c = v>.83?P.gold:v>.72?"#c89000":v>.48?"#22182a":v>.22?"#150e1c":"#0c090e";
    if (type === "nether") c = v>.80?"#8a2a2c":v>.52?"#601820":v>.28?"#3a0c10":"#1e0607";
    if (type === "soul")   c = v>.78?"#4a3228":v>.50?"#2e1e18":v>.28?"#1c110e":"#0d0806";
    ctx.fillStyle = c;
    ctx.fillRect(bx + gx * px, by + gy * px, px, px);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + .5, by + .5, sz - 1, sz - 1);
}

/* ─── Nether Canvas ──────────────────────────────────────── */
function NetherCanvas() {
  const cvs = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = cvs.current!;
    const ctx = canvas.getContext("2d")!;
    let W = canvas.width  = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const onResize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener("resize", onResize);

    const BS = 46;
    type WO = { type: "block"|"magma"|"lantern"; x: number; y: number; sz: number; bt?: BT };
    const world: WO[] = [];

    // Left columns – 3-wide
    for (let y = 0; y < 5600; y += BS) {
      const seg = y < 1300 ? 0 : y < 2600 ? 1 : 2;
      const pickL = (): BT => {
        const v = Math.random();
        if (seg===0) return v>.87?"crying":v>.68?"gilded":v>.42?"obs":"black";
        if (seg===1) return "nether";
        return "soul";
      };
      const pickR = (): BT => {
        const v = Math.random();
        if (seg===0) return v>.82?"gilded":"black";
        if (seg===1) return "nether";
        return "soul";
      };
      world.push({ type: "block", x: 0, y, sz: BS, bt: pickL() });
      world.push({ type: "block", x: BS, y, sz: BS, bt: pickL() });
      world.push({ type: "block", x: BS * 2, y, sz: BS, bt: pickL() });

      world.push({ type: "block", x: W - BS, y, sz: BS, bt: pickR() });
      world.push({ type: "block", x: W - BS * 2, y, sz: BS, bt: pickR() });
      world.push({ type: "block", x: W - BS * 3, y, sz: BS, bt: pickR() });
    }

    // Magma & lantern anchors
    for (let y = 180; y < 5200; y += 380) {
      const seg = y < 1300 ? 0 : y < 2600 ? 1 : 2;
      if (seg===0) world.push({ type:"magma",   x: 200 + Math.random() * 150, y, sz:50 });
      if (seg===2) world.push({ type:"lantern", x: 180 + Math.random() * 50,  y, sz:28 });
    }

    // Lava cracks
    const cracks = [
      { x: 300, y: 200, len:280, a: .7,  c:P.lava  },
      { x: 500, y: 620, len:260, a:-.55, c:P.magma },
      { x: 350, y:1550, len:380, a: .38, c:P.lava  },
      { x: 600, y:2100, len:290, a:-.42, c:P.magma },
      { x: 320, y:3000, len:420, a: .60, c:P.cyan  },
      { x: 550, y:3900, len:300, a:-.65, c:P.cyan  },
    ];

    // Particles lists
    const drips: { x:number; y:number; vy:number; sz:number; life:number; maxL:number }[] = [];
    const flowParticles: { x:number; y:number; vy:number; sz:number; color:string }[] = [];
    const splashes: { x:number; y:number; vx:number; vy:number; sz:number; life:number; color:string }[] = [];

    // Ambient embers
    const embers = Array.from({length:120}, () => ({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.55,
      vy: -(Math.random()*1.5+.5),
      sz: Math.random()*3+.8,
      life: Math.random(),
      decay: Math.random()*.0025+.001,
    }));

    let raf: number, T2 = 0, wfOff = 0;

    const draw = () => {
      ctx.clearRect(0,0,W,H);
      T2 += .030; wfOff += .20;
      const sy = window.scrollY;
      const soulZone = sy > 2200;
      const narrow = W < 1250; 

      // ─── DYNAMIC MULTI-BIOME SCROLL BACKGROUND GRADIENTS ───
      let bg1 = "#200408", bg2 = "#0a0103";
      let particleColor = P.lava;
      
      if (sy < 1300) {
        bg1 = "#220306"; bg2 = "#070001";
        particleColor = P.lava;
      } else if (sy >= 1300 && sy < 2600) {
        bg1 = "#2d0607"; bg2 = "#0c0102";
        particleColor = P.ember;
      } else if (sy >= 2600 && sy < 3900) {
        bg1 = "#041824"; bg2 = "#01070b";
        particleColor = P.cyan;
      } else {
        bg1 = "#031d17"; bg2 = "#010a08";
        particleColor = "#00ffcc";
      }

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, bg1);
      bg.addColorStop(1, bg2);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Center glowing atmospheric radial layer
      const radialGlow = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W*0.6);
      radialGlow.addColorStop(0, sy >= 2600 ? "rgba(0, 229, 255, 0.08)" : "rgba(255, 42, 0, 0.08)");
      radialGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, W, H);

      // Width coordinates for margins
      const cw = Math.min(W - 100, 960);
      const contentLeft = (W - cw) / 2;
      const contentRight = contentLeft + cw;
      
      // Dynamic opacity watermark on collapse
      ctx.globalAlpha = narrow ? 0.06 : 0.95;

      // Draw blocks
      world.forEach((o, idx) => {
        const dy = o.y - sy;
        if (dy < -120 || dy > H + 120) return;

        let dx = o.x;
        const isRightColumn = o.x > W / 2;
        if (isRightColumn) {
          dx = W - (W - o.x);
        }

        // Margin safety overlap checks
        if (!narrow) {
          if (!isRightColumn && dx + o.sz > contentLeft - 25) return;
          if (isRightColumn && dx < contentRight + 25) return;
        }

        if (o.type==="block" && o.bt) {
          drawBlock(ctx, dx, dy, o.sz, o.bt, idx);
          if (o.bt==="crying" && Math.random()>.982 && !narrow) {
            drips.push({ x:dx+Math.random()*o.sz, y:dy+o.sz, vy:Math.random()*.8+.6, sz:Math.random()*2.2+1, life:1, maxL:Math.random()*70+50 });
          }
          if (o.bt==="gilded" && !narrow) {
            ctx.shadowColor = P.gold;
            ctx.shadowBlur  = 6 + Math.sin(T2*2.2+o.y)*1.5;
            ctx.fillStyle   = "transparent";
            ctx.strokeStyle = `rgba(255,194,0,${0.35+Math.sin(T2*2.2+o.y)*.2})`;
            ctx.lineWidth   = 1.5;
            ctx.strokeRect(dx+1, dy+1, o.sz-2, o.sz-2);
            ctx.shadowBlur = 0;
          }
        } else if (o.type==="magma") {
          const g = .45+Math.sin(T2*2.3+o.y)*.35;
          ctx.fillStyle = "rgba(28,6,6,0.95)"; ctx.fillRect(dx,dy,o.sz,o.sz);
          ctx.shadowColor = P.lava; ctx.shadowBlur = g*18;
          ctx.strokeStyle = `rgba(255,80,0,${g})`; ctx.lineWidth = 3;
          ctx.strokeRect(dx+3,dy+3,o.sz-6,o.sz-6); ctx.shadowBlur=0;
        } else if (o.type==="lantern") {
          const g = .5+Math.sin(T2*2.8)*.28;
          ctx.fillStyle="#181a1c"; ctx.fillRect(dx,dy,13,18);
          ctx.shadowColor=P.cyan; ctx.shadowBlur=g*18;
          ctx.fillStyle=P.cyan; ctx.fillRect(dx-3,dy+16,20,20); ctx.shadowBlur=0;
        }
      });

      // Draw background cracks
      cracks.forEach(c => {
        const dy = c.y-sy; if (dy<-300||dy>H+300) return;
        if (!narrow && c.x > contentLeft - 40 && c.x < contentRight + 40) return;
        ctx.beginPath(); ctx.moveTo(c.x,dy); ctx.lineTo(c.x+Math.cos(c.a)*c.len, dy+Math.sin(c.a)*c.len);
        ctx.shadowColor=c.c; ctx.shadowBlur=10;
        ctx.strokeStyle=c.c; ctx.lineWidth=2.5; ctx.stroke(); ctx.shadowBlur=0;
      });

      // Crying tears
      if (!narrow) {
        for (let i=drips.length-1;i>=0;i--) {
          const d=drips[i]; d.y+=d.vy; d.life-= 1/d.maxL;
          if (d.life<=0||d.y>H) { drips.splice(i,1); continue; }
          ctx.fillStyle=`rgba(176,38,255,${d.life*.9})`;
          ctx.fillRect(d.x,d.y,d.sz,d.sz*1.7);
        }
      }

      // Waterfall Downward flow
      const wfW=90, wfX=W-wfW-108;
      const drawWaterfall = !narrow || W > 900;
      
      if (drawWaterfall) {
        const wfCen = sy > 2200 ? P.cyan : "#ffcc00";
        const wfEdge = sy > 2200 ? "rgba(0,110,230,.9)" : "rgba(255,42,0,.9)";
        const wg = ctx.createLinearGradient(wfX,0,wfX+wfW,0);
        wg.addColorStop(0,wfEdge); wg.addColorStop(.35,wfCen); wg.addColorStop(.65,wfCen); wg.addColorStop(1,wfEdge);
        
        ctx.globalAlpha = narrow ? 0.08 : 0.92;
        ctx.fillStyle=wg;
        for (let y=0;y<H;y+=38) {
          ctx.fillRect(wfX+Math.sin(y*.05+wfOff*.09)*5,y,wfW,40);
        }

        for (let off=13;off<wfW;off+=17) {
          ctx.beginPath(); ctx.moveTo(wfX+off,0); ctx.lineTo(wfX+off,H);
          ctx.strokeStyle=sy > 2200 ?"rgba(0,229,255,.22)":"rgba(255,210,0,.22)";
          ctx.setLineDash([26,84]); ctx.lineDashOffset=-wfOff*(4+off%3); ctx.lineWidth=2; ctx.stroke();
        }
        ctx.setLineDash([]); ctx.globalAlpha=1;

        // Spawn downward flow particles
        if (Math.random() > 0.4) {
          flowParticles.push({
            x: wfX + Math.random() * wfW,
            y: 0,
            vy: Math.random() * 4 + 3,
            sz: Math.random() * 3 + 2,
            color: sy > 2200 ? P.cyan : P.gold
          });
        }

        for (let i = flowParticles.length - 1; i >= 0; i--) {
          const f = flowParticles[i];
          f.y += f.vy;
          if (f.y > H) {
            splashes.push({
              x: f.x,
              y: H - 15,
              vx: (Math.random() - 0.5) * 5,
              vy: -(Math.random() * 3 + 1.5),
              sz: f.sz,
              life: 1.0,
              color: f.color
            });
            flowParticles.splice(i, 1);
            continue;
          }
          ctx.fillStyle = f.color;
          ctx.fillRect(f.x, f.y, f.sz, f.sz * 2);
        }

        for (let i=splashes.length-1;i>=0;i--) {
          const s=splashes[i]; s.x+=s.vx; s.y+=s.vy; s.vy+=.18; s.life-=.035;
          if (s.life<=0){splashes.splice(i,1);continue;}
          ctx.beginPath(); ctx.arc(s.x,s.y,s.sz,0,Math.PI*2);
          ctx.fillStyle=s.color; ctx.globalAlpha=s.life; ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      // Embers
      ctx.globalAlpha = narrow ? 0.05 : 0.85;
      for (const e of embers) {
        e.x+=e.vx+Math.sin(e.life*5.5)*.18; e.y+=e.vy; e.life-=e.decay;
        if (e.life<=0||e.y<-20) { e.x=Math.random()*W; e.y=H+60; e.life=1; }
        ctx.beginPath(); ctx.arc(e.x,e.y,e.sz,0,Math.PI*2);
        ctx.fillStyle=particleColor; ctx.shadowColor=particleColor; ctx.shadowBlur=6; ctx.fill(); ctx.shadowBlur=0;
      }
      ctx.globalAlpha=1;

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize",onResize); };
  }, []);

  return (
    <canvas ref={cvs} style={{position:"fixed",inset:0,zIndex:-1,pointerEvents:"none"}}/>
  );
}

/* ─── Typewriter Rotating Text ───────────────────────────── */
const HERO_LINES = [
  "MEMORY",
  "INTELLIGENCE",
  "PERSISTENCE",
  "INVINCIBILITY",
];
function TypewriterWord() {
  const [idx,  setIdx]  = useState(0);
  const [text, setText] = useState("");
  const [del,  setDel]  = useState(false);

  useEffect(() => {
    const target = HERO_LINES[idx];
    if (!del) {
      if (text.length < target.length) {
        const t = setTimeout(() => setText(target.slice(0, text.length + 1)), 60);
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => setDel(true), 2200);
        return () => clearTimeout(t);
      }
    } else {
      if (text.length > 0) {
        const t = setTimeout(() => setText(text.slice(0, -1)), 35);
        return () => clearTimeout(t);
      } else {
        setDel(false);
        setIdx(i => (i + 1) % HERO_LINES.length);
      }
    }
  }, [text, del, idx]);

  return (
    <span style={{
      background: `linear-gradient(135deg, ${P.lava}, ${P.magma}, ${P.gold}, ${P.lava})`,
      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      backgroundClip: "text", backgroundSize: "220% auto",
      animation: "gradShift 3.5s ease infinite",
      display: "inline-block",
      minWidth: "2ch",
    }}>
      {text}<span style={{
        display: "inline-block", width: "4px", height: "0.85em",
        background: P.lava, marginLeft: "4px", verticalAlign: "text-bottom",
        animation: "blink 0.7s step-end infinite",
      }}/>
    </span>
  );
}

/* ─── Ledger Seal Widget ─────────────────────────────────── */
function LedgerSeal() {
  const [busy,  setBusy]  = useState(false);
  const [stat,  setStat]  = useState("SECURED");
  const [log,   setLog]   = useState("SYSTEM_IDLE");
  const [pct,   setPct]   = useState(100);

  const verify = useCallback((e: React.MouseEvent) => {
    if (busy) return;
    setBusy(true); setStat("VERIFYING…"); setPct(0);
    const ripple = document.createElement("div");
    ripple.className = "ripple-ring";
    ripple.style.cssText = `left:${e.clientX}px;top:${e.clientY}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 1300);
    [[200,"SCANNING_SHA256",22],[550,"VERIFY_ED25519",55],[950,"MERKLE_ROOTS_OK",80],[1300,"CHAIN_COMPLETE",100]].forEach(
      ([ms,msg,p]) => setTimeout(()=>{setLog(msg as string);setPct(p as number);},ms as number)
    );
    setTimeout(()=>{setBusy(false);setStat("100% VERIFIED");},1500);
  }, [busy]);

  return (
    <div onClick={verify} style={{
      width:"292px", height:"385px",
      background:"rgba(10,2,14,0.98)",
      border:"10px solid #1a0a26",
      borderRadius:"2px",
      boxShadow: busy
        ? `0 0 65px ${P.cyan}, 0 0 130px ${P.cyan}40, inset 0 0 35px ${P.cyan}25`
        : `0 0 45px ${P.purple}40, 0 0 90px ${P.purple}15, inset 0 0 30px ${P.purple}55`,
      cursor:"pointer",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"space-between",
      padding:"22px 18px",
      transition:"all 0.4s ease",
      transform: busy?"scale(1.04)":"scale(1)",
    }}>
      <div style={{textAlign:"center",width:"100%"}}>
        <div style={{fontSize:"8.5px",fontFamily:"var(--font-mono)",letterSpacing:"2.5px",color:P.mute,textTransform:"uppercase"}}>
          BASTION // MEMORY INTEGRITY SEAL
        </div>
        <div style={{height:"1px",background:`linear-gradient(90deg,transparent,${P.purple}80,transparent)`,margin:"8px 0"}}/>
      </div>

      <div style={{position:"relative",width:"120px",height:"120px",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {[["SHA-256","oa"],["Ed25519","ob"],["pgvec","oc"]].map(([label,cls])=>(
          <span key={label} className={`orbit-tag ${cls}`} style={{
            position:"absolute",padding:"2px 7px",background:"rgba(12,4,18,.96)",
            border:"1px solid rgba(255,255,255,.07)",borderRadius:"2px",
            fontSize:"8px",fontFamily:"var(--font-mono)",color:P.body,
            whiteSpace:"nowrap",pointerEvents:"none",
          }}>{label}</span>
        ))}
        <div className={busy?"seal-spin":"seal-float"} style={{
          width:"86px",height:"86px",borderRadius:"50%",
          background:`radial-gradient(circle,#060110 0%,#18083a 70%,${P.purple} 100%)`,
          border:`3px solid ${busy?P.cyan:P.purple}`,
          boxShadow: busy?`0 0 32px ${P.cyan}`:`0 0 18px ${P.purple}60`,
          display:"flex",alignItems:"center",justifyContent:"center",
          transition:"all 0.3s",
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={busy?P.cyan:"#fff"} strokeWidth="2.4">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        {busy && <div className="scanline"/>}
      </div>

      <div style={{width:"100%",background:"rgba(0,0,0,.55)",borderRadius:"2px",padding:"10px 12px",border:"1px solid rgba(255,255,255,.04)"}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
          <span style={{fontSize:"9px",fontFamily:"var(--font-mono)",color:P.mute}}>CHAIN_STATUS</span>
          <span style={{fontSize:"9px",fontFamily:"var(--font-mono)",fontWeight:700,color:busy?P.cyan:P.gold}}>{stat}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:"10px"}}>
          <span style={{fontSize:"9px",fontFamily:"var(--font-mono)",color:P.mute}}>VERIFY_LOG</span>
          <span style={{fontSize:"9px",fontFamily:"var(--font-mono)",color:P.body,maxWidth:"120px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{log}</span>
        </div>
        <div style={{height:"3px",background:"rgba(255,255,255,.06)",borderRadius:"2px",overflow:"hidden"}}>
          <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${P.lava},${P.cyan})`,transition:"width 0.3s ease",boxShadow:`0 0 6px ${P.cyan}`}}/>
        </div>
      </div>

      <div style={{fontSize:"9.5px",fontFamily:"var(--font-mono)",color:busy?P.cyan:P.ember,letterSpacing:"1px",textTransform:"uppercase",animation:busy?"none":"sealPulse 1.6s infinite"}}>
        {busy?"Verifying ledger chain…":"⚡ Click to Verify Chain"}
      </div>

      <style>{`
        .seal-float{animation:sealFloat 4s ease-in-out infinite}
        .seal-spin{animation:sealSpin .65s linear infinite!important}
        @keyframes sealFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-9px) rotate(6deg)}}
        @keyframes sealSpin{to{transform:rotate(360deg)} }
        @keyframes sealPulse{0%,100%{opacity:.55}50%{opacity:1;text-shadow:0 0 10px ${P.lava}}}
        .orbit-tag{animation-timing-function:linear;animation-iteration-count:infinite}
        .oa{animation-name:orbitA;animation-duration:8s}
        .ob{animation-name:orbitB;animation-duration:10.5s}
        .oc{animation-name:orbitC;animation-duration:9.5s}
        @keyframes orbitA{from{transform:rotate(0deg) translateX(66px) rotate(0deg)}to{transform:rotate(360deg) translateX(66px) rotate(-360deg)}}
        @keyframes orbitB{from{transform:rotate(120deg) translateX(66px) rotate(-120deg)}to{transform:rotate(480deg) translateX(66px) rotate(-480deg)}}
        @keyframes orbitC{from{transform:rotate(240deg) translateX(66px) rotate(-240deg)}to{transform:rotate(600deg) translateX(66px) rotate(-600deg)}}
        .scanline{position:absolute;top:0;left:0;right:0;height:3px;background:${P.cyan};box-shadow:0 0 10px ${P.cyan};animation:scanDown 1.5s linear infinite}
        @keyframes scanDown{0%{top:0}100%{top:100%}}
        .ripple-ring{position:fixed;pointer-events:none;z-index:9999;width:72px;height:72px;border-radius:50%;border:4px solid ${P.cyan};box-shadow:0 0 22px ${P.cyan};transform:translate(-50%,-50%) scale(.1);opacity:1;animation:rippleOut 1.2s cubic-bezier(.1,.85,.25,1) forwards}
        @keyframes rippleOut{from{transform:translate(-50%,-50%) scale(.1);opacity:1}to{transform:translate(-50%,-50%) scale(25);opacity:0;filter:blur(14px)}}
      `}</style>
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────────── */
function SH({ eyebrow, title, sub, ec = P.lava }: { eyebrow:string; title:string; sub?:string; ec?:string }) {
  return (
    <div style={{
      textAlign:"center",marginBottom:"50px",padding:"36px 30px",
      background:"rgba(14,2,8,0.92)",backdropFilter:"blur(20px)",
      borderRadius:"2px",
      border:`2px solid ${P.line}`,
      boxShadow:`0 0 45px rgba(255,42,0,0.12), inset 2px 2px 0 rgba(255,255,255,.05), inset -2px -2px 0 rgba(0,0,0,.5)`,
      position:"relative",overflow:"hidden",
    }}>
      {/* top glow line */}
      <div style={{position:"absolute",top:0,left:"5%",right:"5%",height:"2.5px",background:`linear-gradient(90deg,transparent 0%,${ec} 50%,transparent 100%)`}}/>
      <div style={{fontFamily:"var(--font-mono)",fontSize:"11px",fontWeight:700,textTransform:"uppercase",letterSpacing:"3.5px",color:ec,marginBottom:"12px"}}>{eyebrow}</div>
      <h2 style={{fontSize:"clamp(30px,4.5vw,48px)",fontWeight:900,color:"#fff",fontFamily:"var(--font-sg)",letterSpacing:"-1.5px",margin:"0 0 12px",textShadow:`0 0 40px ${ec}60`}}>{title}</h2>
      {sub&&<p style={{fontSize:"16px",color:P.body,maxWidth:"580px",margin:"0 auto",lineHeight:1.65,fontFamily:"var(--font-inter)"}}>{sub}</p>}
    </div>
  );
}

/* ─── Section Wrapper ─────────────────────────────────────── */
function SW({ children, glow = P.lava }: { children:React.ReactNode; glow?:string }) {
  return (
    <div style={{
      position:"relative",padding:"120px 24px",
      borderTop:`1px solid ${P.line}`,
      background:`linear-gradient(180deg, rgba(14,1,8,0) 0%, rgba(18,2,10,0.7) 100%)`,
    }}>
      {/* Left/Right glow indicators */}
      <div style={{position:"absolute",left:0,top:"10%",bottom:"10%",width:"2.5px",background:`linear-gradient(180deg,transparent,${glow}60,transparent)`}}/>
      <div style={{position:"absolute",right:0,top:"10%",bottom:"10%",width:"2.5px",background:`linear-gradient(180deg,transparent,${glow}40,transparent)`}}/>
      {children}
    </div>
  );
}

/* ─── Features Section ───────────────────────────────────── */
function Features() {
  const items = [
    { icon:"🔐", t:"SHA-256 Ledger Chain",        d:"Every memory block cryptographically links to the previous — creating a tamper-evident chain. Corruption is caught instantly.",     c:P.lava   },
    { icon:"⏳", t:"AS OF SYSTEM TIME Queries",   d:"Full MVCC time-travel. Query exactly what your agent knew at any millisecond in history — native CockroachDB feature.",            c:P.gold   },
    { icon:"🛡️", t:"OWASP ASI06 MemoryGuard",     d:"Semantic classifier blocks prompt injection, API key leakage, and PII from ever being written to the memory store.",             c:P.cyan   },
    { icon:"🌍", t:"6-Region Global Sync",         d:"Serializable isolation across US, EU, and APAC. Sub-50ms reads. Automatic zero-downtime regional failover.",                     c:P.magma  },
    { icon:"🧠", t:"Sleep-Time Consolidation",     d:"Background daemon deduplicates, merges contradictions, and reseals the ledger — zero overhead during agent operation.",          c:P.purple },
    { icon:"📋", t:"A2A Ed25519 Memory Cards",     d:"Agents transfer signed memory bundles with provenance proofs. Receiving agents verify card integrity cryptographically.",        c:P.gold   },
  ];
  return (
    <Reveal>
      <div style={{maxWidth:"960px",margin:"0 auto",position:"relative",zIndex:3}}>
        <SH eyebrow="Core Capabilities" title="What Makes Bastion Unbreakable" sub="Every feature forged for durability, auditability, and injection-proof AI memory."/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"16px"}}>
          {items.map((f,i)=>(
            <Reveal key={i} delay={i*70}>
              <Card accent={f.c} style={{display:"flex",flexDirection:"column",gap:"14px"}}>
                <div style={{fontSize:"30px",lineHeight:1}}>{f.icon}</div>
                <div style={{fontSize:"15.5px",fontWeight:700,color:"#fff",fontFamily:"var(--font-sg)"}}>{f.t}</div>
                <div style={{fontSize:"13.5px",color:P.body,lineHeight:1.6,fontFamily:"var(--font-inter)",flexGrow:1}}>{f.d}</div>
                <div style={{height:"2px",background:`linear-gradient(90deg,${f.c},transparent)`,borderRadius:"1px",marginTop:"4px"}}/>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ─── Consolidation Visualizer ───────────────────────────── */
function Consolidation() {
  const [stage, setStage] = useState(0);
  useEffect(()=>{ const iv=setInterval(()=>setStage(s=>(s+1)%4),4500); return()=>clearInterval(iv); },[]);
  const steps = [
    {t:"Stage 1 — Scan & Fetch",       d:"Daemon wakes on inactivity. Scans recent agent_memory on CockroachDB.",                       c:P.lava},
    {t:"Stage 2 — Semantic Cluster",   d:"Groups entries by AWS Titan v2 cosine distance to identify near-duplicates.",                   c:P.magma},
    {t:"Stage 3 — Conflict Resolution",d:"Detects logical negations and timestamp ordering to canonicalise memory state.",                c:P.gold},
    {t:"Stage 4 — Ledger Commit",      d:"SHA-256 links the new block and signs with the agent's Ed25519 private key.",                   c:P.cyan},
  ];
  return (
    <Reveal>
      <div style={{maxWidth:"960px",margin:"0 auto",position:"relative",zIndex:3}}>
        <SH eyebrow="Consolidation Engine" title="Sleep-Time Memory Fusion" sub="The background daemon compresses, deduplicates, and cryptographically seals AI memory."/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1.1fr",gap:"34px",alignItems:"center"}} className="two-col">
          <div style={{display:"flex",flexDirection:"column",gap:"13px"}}>
            {steps.map((s,i)=>(
              <div key={i} style={{padding:"18px 20px",background:stage===i?"rgba(255,55,0,.07)":"rgba(12,3,8,.88)",
                border:`2px solid ${stage===i?s.c:"rgba(95,55,62,.5)"}`,borderRadius:"2px",
                transition:"all .4s ease",opacity:stage===i?1:.6,
                boxShadow:stage===i?`0 0 20px ${s.c}20,inset 2px 2px 0 rgba(255,255,255,.05)`:"none"}}>
                <div style={{fontSize:"15px",fontWeight:700,color:"#fff",marginBottom:"5px",fontFamily:"var(--font-sg)"}}>{s.t}</div>
                <div style={{fontSize:"13.5px",color:P.body,lineHeight:1.55,fontFamily:"var(--font-inter)"}}>{s.d}</div>
              </div>
            ))}
          </div>
          <Card style={{minHeight:"320px",display:"flex",flexDirection:"column",justifyContent:"center",gap:"18px"}}>
            <div style={{fontFamily:"var(--font-mono)",fontSize:"10px",color:P.mute,letterSpacing:"1.5px",textAlign:"center"}}>
              DAEMON_STATE // {["SCANNING","CLUSTERING","RESOLVING","COMMITTING"][stage]}
            </div>
            <div style={{minHeight:"120px",display:"flex",justifyContent:"center",alignItems:"center",gap:"14px"}}>
              {stage===0&&<>{["Memory A","Memory B"].map(l=><div key={l} className="mn pa">{l}</div>)}</>}
              {stage===1&&<div style={{display:"flex",flexDirection:"column",gap:"10px",alignItems:"center"}}>
                <div className="mn pl">Group A — dist: 0.08</div>
                <div style={{width:"2px",height:"22px",background:P.lava+"60"}}/>
                <div className="mn pl">Reference Centroid</div>
              </div>}
              {stage===2&&<>{[{l:"Stale Memory",c:"#f44"},{l:"→",c:P.mute},{l:"New Fact",c:"#4f4"}].map(({l,c},i)=><span key={i} style={{color:c,fontWeight:700,fontFamily:"var(--font-sg)",fontSize:"14px"}}>{l}</span>)}</>}
              {stage===3&&<div style={{display:"flex",alignItems:"center",gap:"13px"}}>
                <div className="mn" style={{borderColor:"#4f4",color:"#4f4"}}>Block #n</div>
                <span style={{fontSize:"20px"}}>⛓️</span>
                <div className="mn" style={{borderColor:P.cyan,color:P.cyan,boxShadow:`0 0 12px ${P.cyan}30`}}>Block #n+1</div>
              </div>}
            </div>
            <div style={{height:"4px",background:"rgba(255,255,255,.06)",borderRadius:"2px",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${(stage+1)*25}%`,background:`linear-gradient(90deg,${P.lava},${P.magma},${P.cyan})`,boxShadow:`0 0 8px ${P.lava}`,transition:"width .5s ease"}}/>
            </div>
          </Card>
        </div>
      </div>
      <style>{`.mn{padding:10px 16px;border-radius:2px;background:rgba(14,4,18,.97);border:2px solid rgba(90,60,68,.6);color:#fff;font-size:13px;font-weight:700;font-family:var(--font-sg);text-align:center}.pa{animation:pA 1.6s infinite}.pl{animation:pL 1.6s infinite}@keyframes pA{0%,100%{border-color:rgba(255,183,0,.35)}50%{border-color:rgba(255,183,0,.95)}}@keyframes pL{0%,100%{border-color:rgba(255,42,0,.35)}50%{border-color:rgba(255,42,0,.95)}}`}</style>
    </Reveal>
  );
}

/* ─── Comparison ─────────────────────────────────────────── */
function Comparison() {
  const rows = [
    {f:"Cryptographic Tamper-Evidence",b:"SHA-256 Chain (0.16ms)",m:"None (Raw DB)",  z:"None (Raw DB)",  h:true},
    {f:"Time-Travel Query (MVCC)",      b:"AS OF SYSTEM TIME",     m:"Manual logs",    z:"Snapshots only", h:false},
    {f:"EU AI Act Art.12 Compliance",   b:"Built-in Audit Trail",  m:"Custom build",   z:"Custom build",   h:false},
    {f:"Prompt Poisoning Guard (ASI06)",b:"OWASP MemoryGuard",     m:"Unprotected",    z:"PII filter only",h:true},
    {f:"Multi-Region Sync",             b:"6 Regions (CockroachDB)",m:"Single node",   z:"Manual repl.",   h:false},
    {f:"Developer Cost",                b:"MIT — Free / OSS",      m:"$249/mo Cloud",  z:"$125/mo Cloud",  h:true},
  ];
  return (
    <Reveal>
      <div style={{maxWidth:"960px",margin:"0 auto",position:"relative",zIndex:3}}>
        <SH eyebrow="Comparison Matrix" title="Rivaling the Alternatives" sub="Why enterprise teams reach for Bastion over proprietary memory services."/>
        <div style={{background:"rgba(10,3,12,.92)",border:`2px solid ${P.line}`,borderRadius:"2px",overflow:"hidden",backdropFilter:"blur(18px)",boxShadow:`0 20px 60px rgba(0,0,0,.8),0 0 40px rgba(255,42,0,.06)`}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"14px",minWidth:"580px"}}>
              <thead>
                <tr style={{background:"rgba(24,6,12,.8)",borderBottom:`2px solid ${P.line}`}}>
                  {["Feature","Bastion ✦","Mem0","Zep"].map((h,i)=>(
                    <th key={h} style={{padding:"18px 20px",textAlign:"left",fontFamily:"var(--font-mono)",fontSize:"10.5px",textTransform:"uppercase",letterSpacing:"1.8px",color:i===1?P.gold:P.mute,fontWeight:700}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} className="cr" style={{borderBottom:i<rows.length-1?`1px solid rgba(95,55,62,.3)`:"none",background:r.h?"rgba(255,42,0,.04)":"transparent"}}>
                    <td style={{padding:"15px 20px",color:"#fff",fontWeight:600,fontFamily:"var(--font-sg)",fontSize:"13.5px"}}>{r.f}</td>
                    <td style={{padding:"15px 20px",color:r.h?P.gold:P.cyan,fontWeight:700,fontFamily:"var(--font-mono)",fontSize:"12px"}}>{r.b}</td>
                    <td style={{padding:"15px 20px",color:P.body,fontSize:"13px"}}>{r.m}</td>
                    <td style={{padding:"15px 20px",color:P.body,fontSize:"13px"}}>{r.z}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <style>{`.cr{transition:background .2s}.cr:hover{background:rgba(255,42,0,.07)!important}`}</style>
    </Reveal>
  );
}

/* ─── FAQ ────────────────────────────────────────────────── */
function FAQ() {
  const [open,setOpen] = useState<number|null>(null);
  const qs = [
    {q:"What does Bastion store?",                       a:"Structured agent observations, user facts, and world-state deltas — timestamped, vectorized, and cryptographically sealed into a PGVector-indexed ledger on CockroachDB."},
    {q:"How does the SHA-256 ledger chain work?",         a:"Each block stores SHA-256(prev_hash ‖ content ‖ timestamp). Tampering breaks the chain — instantly detectable via the /logs inspector."},
    {q:"Does Bastion protect against prompt injection?",  a:"Yes. Every memory write passes through the OWASP ASI06 semantic guard — blocking injection patterns, PII, and credential leakage before committing."},
    {q:"How do dynamic database connections work?",       a:"Paste your CockroachDB string in the Cockpit modal. The frontend appends it as 'x-bastion-conn' on every API call — no restart needed."},
    {q:"Is this fully open source?",                      a:"Yes, MIT licensed. Clone, self-host freely. The full stack — API, schema, consolidation daemon, MemoryGuard — is in the repo."},
  ];
  return (
    <Reveal>
      <div style={{maxWidth:"820px",margin:"0 auto",position:"relative",zIndex:3}}>
        <SH eyebrow="Questions & Answers" title="Frequently Asked" sub="Everything you need to evaluate Bastion." ec={P.cyan}/>
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          {qs.map((faq,i)=>(
            <div key={i} className="fq" style={{
              background:"rgba(10,3,14,.94)",
              border:`2px solid ${open===i?P.cyan:"rgba(95,55,62,.5)"}`,
              borderRadius:"2px",overflow:"hidden",
              boxShadow:open===i?`0 0 24px ${P.cyan}20,inset 2px 2px 0 rgba(255,255,255,.05)`:"inset 2px 2px 0 rgba(255,255,255,.04)",
              transition:"all .3s ease",
            }}>
              <button onClick={()=>setOpen(open===i?null:i)} style={{width:"100%",padding:"18px 22px",background:"transparent",border:"none",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:"15px",fontWeight:700,color:"#fff",textAlign:"left",fontFamily:"var(--font-sg)"}}>{faq.q}</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={P.mute} strokeWidth="2" style={{flexShrink:0,transform:open===i?"rotate(180deg)":"none",transition:"transform .3s ease"}}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div style={{maxHeight:open===i?"200px":"0",overflow:"hidden",transition:"max-height .42s cubic-bezier(0.16,1,0.3,1)"}}>
                <p style={{padding:"0 22px 18px",margin:0,fontSize:"14px",lineHeight:1.7,color:P.body,fontFamily:"var(--font-inter)"}}>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

/* ─── MAIN PAGE ──────────────────────────────────────────── */
export default function Page() {
  const {y:sy, pct} = useScroll();
  const scrolled = sy > 55;

  return (
    <div className={`${spaceGrotesk.variable} ${jetMono.variable} ${inter.variable}`}
      style={{position:"relative",minHeight:"100vh",overflowX:"hidden",fontFamily:"var(--font-inter), sans-serif",
        // Root container is transparent so fixed backgrounds and canvas layers stack correctly
        background:"transparent",
      }}>

      {/* Dynamic multi-biome fallback background gradient layer */}
      <div style={{
        position:"fixed",inset:0,pointerEvents:"none",zIndex:-10,
        // Multi-biome gradient starting at rich red netherrack
        background:`linear-gradient(160deg, #2b0409 0%, #120104 35%, #050001 100%)`,
      }}/>

      {/* Dynamic secondary glowing red layer behind FAQ/Comparison sections */}
      <div style={{
        position:"absolute",bottom:"15%",left:"50%",transform:"translateX(-50%)",
        width:"100%",height:"1200px",
        background:"radial-gradient(circle, rgba(255, 42, 0, 0.08) 0%, transparent 70%)",
        zIndex: 0, pointerEvents: "none"
      }}/>

      {/* Scroll rail */}
      <div style={{position:"fixed",top:0,left:0,right:0,height:"3px",zIndex:1100,background:"rgba(255,40,0,.04)"}}>
        <div style={{height:"100%",width:`${pct*100}%`,background:`linear-gradient(90deg,${P.lava},${P.magma},${P.gold})`,boxShadow:`0 0 14px ${P.lava}`,transition:"width .08s linear"}}/>
      </div>

      {/* Canvas background for block structures */}
      <NetherCanvas/>

      {/* Atmospheric vignette – lightened so canvas shows through */}
      <div style={{
        position:"fixed",inset:0,pointerEvents:"none",zIndex:0,
        background:"radial-gradient(ellipse at 40% 35%, rgba(12,2,10,0.3) 0%, rgba(6,1,5,0.6) 100%)",
      }}/>

      {/* Pixel grid */}
      <div style={{position:"absolute",inset:0,zIndex:0,opacity:.038,pointerEvents:"none",
        backgroundImage:`linear-gradient(rgba(255,42,0,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,42,0,.35) 1px,transparent 1px)`,
        backgroundSize:"48px 48px"}}/>

      {/* ── NAV ───────────────────────────────────────────── */}
      <nav style={{
        position:"fixed",top:0,left:0,right:0,zIndex:1000,
        padding:scrolled?"10px 48px":"18px 48px",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        background:scrolled?"rgba(12,1,6,.98)":"rgba(12,1,6,.45)",
        backdropFilter:"blur(28px)",
        borderBottom:`1px solid ${scrolled?P.line:P.lineB}`,
        boxShadow:scrolled?`0 0 32px rgba(255,42,0,0.12)`:"none",
        transition:"all .35s cubic-bezier(.16,1,.3,1)",
      }}>
        <Link href="/" style={{textDecoration:"none",display:"flex",alignItems:"center",gap:"11px"}}>
          <div style={{width:"34px",height:"34px",borderRadius:"3px",background:`linear-gradient(135deg,${P.lava},${P.magma})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 18px ${P.lava}55`,flexShrink:0}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/></svg>
          </div>
          <div style={{lineHeight:1}}>
            <div style={{fontWeight:900,fontSize:"17px",letterSpacing:"3px",color:"#fff",textTransform:"uppercase",fontFamily:"var(--font-sg)"}}>BASTION</div>
            <div style={{fontSize:"8px",letterSpacing:"2px",color:P.mute,fontFamily:"var(--font-mono)"}}>MEMORY LEDGER</div>
          </div>
        </Link>
        <div style={{display:"flex",gap:"26px",alignItems:"center"}} className="dnav">
          {([["Docs","/docs"],["Cockpit","/dashboard"],["Logs","/logs"],["Health","/health"]] as const).map(([l,h])=>(
            <Link key={l} href={h} className="nl" style={{color:P.body,fontSize:"13.5px",textDecoration:"none",fontWeight:600}}>{l}</Link>
          ))}
          <span style={{padding:"2px 8px",borderRadius:"2px",background:"rgba(255,42,0,.15)",border:`1px solid ${P.line}`,fontFamily:"var(--font-mono)",fontSize:"8.5px",color:P.lava,letterSpacing:"1px"}}>v0.16</span>
          <Link href="/dashboard" className="cta-btn" style={{padding:"9px 20px",borderRadius:"3px",background:`linear-gradient(135deg,${P.lava},${P.magma})`,color:"#fff",fontSize:"12.5px",fontWeight:800,textDecoration:"none",textTransform:"uppercase",letterSpacing:"1px"}}>
            Launch Cockpit
          </Link>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section style={{
        minHeight:"100vh",
        display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",
        padding:"220px 48px 140px",
        position:"relative",zIndex:2,
      }}>
        {/* Giant volcanic core glow behind hero */}
        <div style={{
          position:"absolute",top:"35%",left:"50%",transform:"translate(-50%,-50%)",
          width:"800px",height:"600px",
          background:`radial-gradient(ellipse, rgba(255,42,0,0.18) 0%, rgba(180,20,0,0.08) 50%, transparent 80%)`,
          pointerEvents:"none",
        }}/>

        <div style={{width:"100%",maxWidth:"980px",position:"relative"}}>

          {/* Two-col hero */}
          <div style={{display:"grid",gridTemplateColumns:"1.3fr .7fr",gap:"55px",alignItems:"center"}} className="hgrid">

            {/* Left */}
            <div>
              {/* Badge */}
              <div className="hs1" style={{display:"inline-flex",alignItems:"center",gap:"8px",padding:"5px 14px",borderRadius:"3px",background:"rgba(255,42,0,.08)",border:`1px solid ${P.line}`,marginBottom:"24px"}}>
                <span style={{width:"5px",height:"5px",borderRadius:"50%",background:P.gold,boxShadow:`0 0 8px ${P.gold}`,animation:"sparkBeat 1.4s infinite",display:"inline-block"}}/>
                <span style={{fontFamily:"var(--font-mono)",fontSize:"10.5px",fontWeight:700,textTransform:"uppercase",letterSpacing:"2.5px",color:P.gold}}>Bastion Ledger — Active</span>
              </div>

              {/* Giant title */}
              <h1 className="hs2" style={{
                fontSize:"clamp(62px,8.5vw,118px)",
                fontWeight:900,lineHeight:.86,
                letterSpacing:"-4px",
                color:"#fff",
                margin:"0 0 26px",
                fontFamily:"var(--font-sg)",
                textShadow:"0 4px 30px rgba(0,0,0,.9)",
              }}>
                THE<br/>FORTRESS<br/>OF AGENTIC<br/>
                <TypewriterWord/>
              </h1>

              {/* Sub */}
              <p className="hs3" style={{fontSize:"18.5px",lineHeight:1.7,color:"#fff",fontWeight:600,marginBottom:"36px",textShadow:"0 2px 16px rgba(0,0,0,.98)",maxWidth:"500px"}}>
                Persistent, self-healing memory for autonomous AI agents. Crash-proof. Injection-resistant. Cryptographically sealed. Forged in CockroachDB.
              </p>

              {/* CTAs */}
              <div className="hs4" style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>
                <Link href="/dashboard" className="cta-btn" style={{padding:"14px 30px",borderRadius:"3px",background:`linear-gradient(135deg,${P.lava},${P.magma})`,color:"#fff",fontSize:"13.5px",fontWeight:800,textDecoration:"none",textTransform:"uppercase",letterSpacing:"1px",display:"inline-flex",alignItems:"center",gap:"9px"}}>
                  Try Demo Dashboard
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
                <Link href="/docs" style={{padding:"14px 28px",borderRadius:"3px",border:`1px solid ${P.line}`,background:"rgba(18,5,12,.65)",color:"#fff",fontSize:"13.5px",fontWeight:700,textDecoration:"none",backdropFilter:"blur(8px)"}}>
                  Read the Docs
                </Link>
              </div>

              {/* Stats row */}
              <div className="hs5" style={{display:"flex",gap:"32px",marginTop:"46px",paddingTop:"28px",borderTop:`1px solid ${P.line}`,flexWrap:"wrap"}}>
                {[{e:2800000,s:"",l:"Memories / Day"},{e:16,s:"ms",l:"Query Latency"},{e:6,s:"",l:"Global Regions"}].map(({e,s,l})=>(
                  <div key={l}>
                    <div style={{fontSize:"clamp(24px,3.2vw,38px)",fontWeight:900,color:"#fff",fontFamily:"var(--font-sg)",lineHeight:1,letterSpacing:"-1.5px",textShadow:`0 0 20px ${P.lava}40`}}>
                      <CountUp end={e} suffix={s}/>
                    </div>
                    <div style={{fontSize:"11px",color:P.mute,fontFamily:"var(--font-mono)",marginTop:"5px",textTransform:"uppercase",letterSpacing:"1.8px"}}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right – Ledger Seal */}
            <div className="hs6" style={{display:"flex",justifyContent:"center",alignItems:"center"}}>
              <LedgerSeal/>
            </div>
          </div>

          {/* Tour cards */}
          <div className="hs7" style={{marginTop:"70px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",borderBottom:`1px solid ${P.line}`,paddingBottom:"13px",marginBottom:"24px"}}>
              <div>
                <div style={{fontFamily:"var(--font-mono)",fontSize:"10px",color:P.lava,textTransform:"uppercase",letterSpacing:"2.2px",fontWeight:700}}>Quick Start</div>
                <h2 style={{fontSize:"22px",fontWeight:800,color:"#fff",margin:"4px 0 0",fontFamily:"var(--font-sg)"}}>Guided Onboarding Views</h2>
              </div>
              <span style={{fontFamily:"var(--font-mono)",fontSize:"10px",color:P.mute}}>⭐ JUDGES_RECOMMENDED</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:"14px"}}>
              {[
                {icon:"📊",t:"Command Center",   d:"Live KPIs, region telemetry, ingestion rates and event stream.",   h:"/dashboard?tour=start",             c:P.lava,   b:"Tour 1"},
                {icon:"🌐",t:"Memory Graph",     d:"Interactive knowledge graph with AS OF time-travel slider.",         h:"/graph?tour=start",                 c:P.gold,   b:"Tour 2"},
                {icon:"🔗",t:"Ledger Registry",  d:"Browse and verify SHA-256 block chain hashes and signatures.",       h:"/logs?tour=start",                  c:P.purple, b:"Tour 3"},
                {icon:"🛡️",t:"MemoryGuard",      d:"Watch ASI06 guard filter live injection and PII attempts.",          h:"/dashboard?tour=start#memoryguard", c:P.cyan,   b:"Tour 4"},
              ].map((tour,i)=>(
                <Link key={i} href={tour.h} style={{textDecoration:"none"}}>
                  <Card accent={tour.c} style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{padding:"2px 7px",borderRadius:"2px",background:`${tour.c}18`,color:tour.c,border:`1px solid ${tour.c}28`,fontFamily:"var(--font-mono)",fontSize:"9px",fontWeight:700,textTransform:"uppercase"}}>{tour.b}</span>
                      <span style={{fontSize:"18px"}}>{tour.icon}</span>
                    </div>
                    <div style={{fontSize:"14.5px",fontWeight:700,color:"#fff",fontFamily:"var(--font-sg)"}}>{tour.t}</div>
                    <div style={{fontSize:"13px",color:P.body,lineHeight:1.55,fontFamily:"var(--font-inter)"}}>{tour.d}</div>
                    <div style={{height:"2px",background:`linear-gradient(90deg,${tour.c},transparent)`,marginTop:"4px",borderRadius:"1px"}}/>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTENT SECTIONS ─────────────────────────────── */}
      <div style={{position:"relative",zIndex:2}}>
        <SW glow={P.lava}><Features/></SW>
        <SW glow={P.magma}><Consolidation/></SW>
        <SW glow={P.gold}><Comparison/></SW>
        <SW glow={P.cyan}><FAQ/></SW>
      </div>

      {/* ── FOOTER ───────────────────────────────────────── */}
      <footer style={{
        position:"relative",zIndex:10,
        background:"rgba(10,2,8,0.99)",
        borderTop:`3px solid ${P.line}`,
        boxShadow:`0 0 50px rgba(255,42,0,0.15), inset 2px 2px 0 rgba(255,255,255,.04)`,
      }}>
        {/* Top glow accent */}
        <div style={{height:"1.5px",background:`linear-gradient(90deg,transparent 5%,${P.lava} 30%,rgba(255,194,0,.5) 50%,${P.lava} 70%,transparent 95%)`}}/>

        <div style={{maxWidth:"960px",margin:"0 auto",padding:"68px 24px 48px",display:"grid",gridTemplateColumns:"1.7fr 1fr 1fr 1fr",gap:"40px"}  } className="ftgrid">
          {/* Brand */}
          <div>
            <Link href="/" style={{textDecoration:"none",display:"inline-flex",alignItems:"center",gap:"10px",marginBottom:"14px"}}>
              <div style={{width:"30px",height:"30px",borderRadius:"3px",background:`linear-gradient(135deg,${P.lava},${P.magma})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 12px ${P.lava}40`}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/></svg>
              </div>
              <span style={{fontWeight:900,fontSize:"15px",letterSpacing:"2.5px",color:"#fff",textTransform:"uppercase",fontFamily:"var(--font-sg)"}}>BASTION</span>
            </Link>
            <p style={{fontSize:"13.5px",color:P.mute,lineHeight:1.65,maxWidth:"210px",fontFamily:"var(--font-inter)",margin:"0 0 20px"}}>
              Open-source cryptographic memory ledger for autonomous AI agents. MIT licensed.
            </p>
            <div style={{display:"flex",gap:"14px",flexWrap:"wrap"}}>
              {[["MIT","License"],["v0.16","Release"],["6","Regions"]].map(([n,l])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontFamily:"var(--font-sg)",fontSize:"15px",fontWeight:900,color:P.gold}}>{n}</div>
                  <div style={{fontFamily:"var(--font-mono)",fontSize:"8px",color:P.mute,textTransform:"uppercase",letterSpacing:"1px"}}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Product */}
          <div>
            <div style={{fontFamily:"var(--font-mono)",fontSize:"10px",fontWeight:700,textTransform:"uppercase",letterSpacing:"2px",color:P.lava,marginBottom:"16px"}}>Product</div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              {[["Dashboard","/dashboard"],["Memory Graph","/graph"],["Ledger Logs","/logs"],["Health","/health"],["Compliance","/compliance"]].map(([l,h])=>(
                <Link key={l} href={h} className="fl" style={{color:P.body,fontSize:"13.5px",textDecoration:"none",fontFamily:"var(--font-inter)"}}>{l}</Link>
              ))}
            </div>
          </div>

          {/* Dev */}
          <div>
            <div style={{fontFamily:"var(--font-mono)",fontSize:"10px",fontWeight:700,textTransform:"uppercase",letterSpacing:"2px",color:P.magma,marginBottom:"16px"}}>Developer</div>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              {[["Documentation","/docs"],["Quick Start","/docs#quickstart"],["API Reference","/docs#api"],["Schema","/docs#schema"],["GitHub","https://github.com/dgboy-ai/Bastion"]].map(([l,h])=>(
                <a key={l} href={h} target={h.startsWith("http")?"_blank":"_self"} rel="noopener noreferrer" className="fl" style={{color:P.body,fontSize:"13.5px",textDecoration:"none",fontFamily:"var(--font-inter)"}}>{l}</a>
              ))}
            </div>
          </div>

          {/* Security */}
          <div>
            <div style={{fontFamily:"var(--font-mono)",fontSize:"10px",fontWeight:700,textTransform:"uppercase",letterSpacing:"2px",color:P.cyan,marginBottom:"16px"}}>Security</div>
            <div style={{display:"flex",flexDirection:"column",gap:"9px"}}>
              {["OWASP ASI06 Guard","SHA-256 Chain","Ed25519 Signatures","EU AI Act Art.12","Zero-Trust Model"].map(l=>(
                <span key={l} style={{color:P.mute,fontSize:"13px",fontFamily:"var(--font-inter)",display:"flex",alignItems:"center",gap:"6px"}}>
                  <span style={{color:P.cyan,fontSize:"10px",fontWeight:700}}>✓</span>{l}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{height:"1px",background:`linear-gradient(90deg,transparent 5%,rgba(95,55,62,.5) 30%,rgba(255,200,0,.2) 50%,rgba(95,55,62,.5) 70%,transparent 95%)`,margin:"0 24px"}}/>

        {/* Bottom bar */}
        <div style={{maxWidth:"960px",margin:"0 auto",padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"14px"}}>
          <span style={{fontSize:"11.5px",color:P.mute,fontFamily:"var(--font-mono)"}}>© 2026 Bastion Contributors · MIT License · Secured in CockroachDB</span>
          <div style={{display:"flex",gap:"18px",alignItems:"center"}}>
            <span style={{padding:"2px 8px",background:"rgba(255,42,0,.15)",border:`1px solid ${P.line}`,borderRadius:"2px",fontFamily:"var(--font-mono)",fontSize:"9px",color:P.lava,animation:"sparkBeat 2s infinite"}}>LEDGER_ACTIVE</span>
            <a href="https://github.com/dgboy-ai/Bastion" target="_blank" rel="noopener noreferrer" className="fl" style={{color:P.mute,fontSize:"12px",textDecoration:"none",fontFamily:"var(--font-mono)"}}>GitHub ↗</a>
          </div>
        </div>
        {/* Gold bottom line */}
        <div style={{height:"2px",background:`linear-gradient(90deg,transparent,${P.gold}45,transparent)`}}/>
      </footer>

      {/* ── GLOBAL STYLES ────────────────────────────────── */}
      <style>{`
        html{scroll-behavior:smooth}
        *,*::before,*::after{box-sizing:border-box}

        @keyframes gradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes sparkBeat{0%,100%{transform:scale(1);opacity:.75}50%{transform:scale(1.35);opacity:1}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}

        /* Hero spring entrances */
        @keyframes su{from{opacity:0;transform:translateY(42px)}to{opacity:1;transform:translateY(0)}}
        .hs1{animation:su 1.05s cubic-bezier(.16,1,.3,1) .05s both}
        .hs2{animation:su 1.05s cubic-bezier(.16,1,.3,1) .18s both}
        .hs3{animation:su 1.05s cubic-bezier(.16,1,.3,1) .30s both}
        .hs4{animation:su 1.05s cubic-bezier(.16,1,.3,1) .42s both}
        .hs5{animation:su 1.05s cubic-bezier(.16,1,.3,1) .55s both}
        .hs6{animation:su 1.05s cubic-bezier(.16,1,.3,1) .68s both}
        .hs7{animation:su 1.05s cubic-bezier(.16,1,.3,1) .82s both}

        /* Nav links */
        .nl{position:relative;padding-bottom:3px;transition:color .22s}
        .nl::after{content:'';position:absolute;bottom:0;left:50%;width:0;height:2px;background:${P.lava};transition:width .28s,left .28s}
        .nl:hover::after{width:100%;left:0}
        .nl:hover{color:#fff!important}

        /* CTA button */
        .cta-btn{position:relative;overflow:hidden;transition:all .3s cubic-bezier(.16,1,.3,1);box-shadow:0 0 20px ${P.lava}35}
        .cta-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.18),transparent);transform:translateX(-100%);transition:transform .45s ease}
        .cta-btn:hover::after{transform:translateX(100%)}
        .cta-btn:hover{transform:translateY(-3px);box-shadow:0 10px 30px ${P.lava}55!important}
        .cta-btn:active{transform:scale(.97)}

        /* Footer links */
        .fl{transition:color .2s}
        .fl:hover{color:#fff!important}

        /* Responsive */
        @media(max-width:860px){
          .hgrid{grid-template-columns:1fr!important}
          .dnav{display:none!important}
          .ftgrid{grid-template-columns:1fr 1fr!important}
          .two-col{grid-template-columns:1fr!important}
        }
        @media(max-width:560px){
          .ftgrid{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  );
}
