"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

/* ─── Nether Design Tokens ────────────────────── */

const N = {
  bg: "#0a0508", card: "#120a0e", elevated: "#1a1018",
  ink: "#ffffff", body: "#e2d9dc", mute: "#a69498", faint: "#6e5458",
  breeze: "#00e5ff", emerald: "#00ff66", sunset: "#ff5500",
  gold: "#ffc800", lava: "#ffaa00", magenta: "#ff00aa",
  hairline: "rgba(255,42,0,.18)", glass: "rgba(14,2,10,.85)",
  easeOut: "cubic-bezier(.16,1,.3,1)",
  easeSpring: "cubic-bezier(.34,1.56,.64,1)",
};

/* ─── Ambient Canvas ─────────────────────────── */

function NetherAmbient() {
  const cvs = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = cvs.current!;
    const ctx = canvas.getContext("2d")!;
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);

    const embers = Array.from({ length: 40 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .5, vy: -Math.random() * .6 - .15,
      sz: 1 + Math.random() * 2, life: 0, maxL: 80 + Math.random() * 120,
      hue: Math.random() > .5 ? 15 : 40,
    }));
    const glowSpots = Array.from({ length: 6 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: 80 + Math.random() * 160, hue: [190, 140, 15, 40, 300, 200][Math.floor(Math.random() * 6)],
      dx: (Math.random() - .5) * .15, dy: (Math.random() - .5) * .1,
    }));
    let frame: number;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (const g of glowSpots) {
        g.x += g.dx; g.y += g.dy;
        if (g.x < -100 || g.x > W + 100) g.dx *= -1;
        if (g.y < -100 || g.y > H + 100) g.dy *= -1;
        const grd = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
        grd.addColorStop(0, `hsla(${g.hue},80%,50%,.035)`);
        grd.addColorStop(.5, `hsla(${g.hue},80%,50%,.015)`);
        grd.addColorStop(1, `hsla(${g.hue},80%,50%,0)`);
        ctx.fillStyle = grd;
        ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
      }
      for (const e of embers) {
        e.x += e.vx; e.y += e.vy; e.life++;
        if (e.life > e.maxL || e.y < -10 || e.x < -10 || e.x > W + 10) {
          e.x = Math.random() * W; e.y = H + 10; e.life = 0; e.maxL = 80 + Math.random() * 120;
        }
        const a = 1 - e.life / e.maxL;
        ctx.fillStyle = `hsla(${e.hue},100%,60%,${a * .4})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.sz * (1 + e.life / e.maxL), 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={cvs} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, pointerEvents: "none" }} />;
}

/* ─── Primitives ─────────────────────────────── */

function PulseDot({ color }: { color: string }) {
  return (
    <span style={{
      display: "inline-block", width: "8px", height: "8px", borderRadius: "50%",
      background: color, marginRight: "8px",
      boxShadow: `0 0 12px ${color}60`,
      animation: "pulse-dot 2s ease-in-out infinite",
    }} />
  );
}

/* ─── Types ──────────────────────────────────── */

interface Attack { id: string; agentId: string; scenario: string; content: string; previousHash: string; cryptographicHash: string; detectedAt: string; trustBefore: number; trustAfter: number; trustDrop: string; risk: string; }
interface ChainBlock { step: number; label: string; hash: string; status: string; timestamp?: string; violation?: string; action?: string; }
interface VsResult { content: string; memoryType: string; agentId?: string; similarity: number; }
interface VectorSearch { results: VsResult[]; totalResults: number; latency: string; indexType: string; dimensions: number; distanceMetric?: string; tenantPartitioned?: boolean; }
interface HealProof { restoredHash: string; previousHash: string; chainVerified: boolean; verificationMethod: string; }
interface HealTrust { previousScore: number; restoredScore: number; improvement: string; }
interface HealTimeTravel { interval: string; mechanism: string; from: string; to: string; }
interface PoisonData { attack: Attack; chain: ChainBlock[]; detection: Record<string, unknown>; sql: string[]; crdbFeatures: string[]; }
interface HealData { memoryId: string; agentId: string; recoveredContent: string; poisonedContent: string; timeTravel: HealTimeTravel; trustRestored: HealTrust; cryptographicProof: HealProof; sql: string[]; crdbFeatures: string[]; }
interface ChatData { query: string; agentId: string; response: string; vectorSearch: VectorSearch; sql: string[]; crdbFeatures: string[]; }
type ApiData = PoisonData | HealData | ChatData | null;
type Scenario = "poison" | "heal" | "chat";
interface ScenarioState { loading: boolean; error: string | null; result: ApiData; }

/* ─── Tour Steps ─────────────────────────────── */

interface TourStep {
  id: string;
  tab: Scenario;
  title: string;
  body: string;
  highlight?: string;
  action?: "click_poison" | "click_heal" | "click_chat" | "wait_poison" | "wait_heal" | "wait_chat" | "next";
  _index?: number;
}

const TOUR: TourStep[] = [
  {
    id: "welcome",
    tab: "poison",
    title: "Welcome to Bastion",
    body: "Bastion turns CockroachDB into a persistent, self-healing memory layer for AI agents. This tour walks through three core capabilities: Poison Detection, Time-Travel Recovery, and Semantic Vector Search.",
    action: "next",
  },
  {
    id: "poison_intro",
    tab: "poison",
    title: "Step 1: Inject a Poisoned Memory",
    body: "Click 'Inject Poison' to simulate a prompt-injection attack. Bastion stores each memory in a SHA-256 hash chain — any tampering breaks the chain and drops the trust score. CockroachDB's SERIALIZABLE isolation ensures atomic detection.",
    highlight: "poison-btn",
    action: "click_poison",
  },
  {
    id: "poison_result",
    tab: "poison",
    title: "Step 2: Trust Score Collapse",
    body: "The hash chain detected the tamper. Trust dropped from 87% → 17%. The memory is quarantined (trust=0). CockroachDB's SERIALIZABLE isolation guarantees this check is atomic — no race conditions.",
    action: "next",
  },
  {
    id: "heal_intro",
    tab: "heal",
    title: "Step 3: Time-Travel Recovery",
    body: "Now we travel back in time using CockroachDB's MVCC — SELECT ... AS OF SYSTEM TIME '-5s' retrieves the pre-poison state. This is possible because CockroachDB never overwrites data; every write creates a new version.",
    highlight: "heal-btn",
    action: "click_heal",
  },
  {
    id: "heal_result",
    tab: "heal",
    title: "Step 4: Content Restored",
    body: "The original content is recovered, hash chain re-verified, and trust score restored to 100%. All within a SERIALIZABLE transaction — the recovery is cryptographically provable.",
    action: "next",
  },
  {
    id: "chat_intro",
    tab: "chat",
    title: "Step 5: Semantic Vector Search",
    body: "Finally, search all memories with real AI embeddings. Your query is encoded via sentence-transformers (all-MiniLM-L6-v2, 384-dim), compared against every memory using cosine similarity, and the top 5 are ranked.",
    highlight: "chat-btn",
    action: "click_chat",
  },
  {
    id: "chat_result",
    tab: "chat",
    title: "Step 6: Real Similarity Scores",
    body: "Each result shows a similarity percentage — real cosine similarity between your query and the memory's embedding. The similarity bars animate on load. Results are enriched by Groq (Llama 3.1) when enabled.",
    action: "next",
  },
  {
    id: "outro",
    tab: "chat",
    title: "Built on CockroachDB",
    body: "Bastion is the system of record for autonomous AI. Hash-chain integrity, AS OF SYSTEM TIME recovery, C-SPANN vector indexing, SERIALIZABLE isolation — all powered by CockroachDB. The tour is complete. Explore freely or visit other pages.",
    action: "next",
  },
];

/* ─── DemoTour ───────────────────────────────── */

function DemoTour({ step, total, onNext, onPrev, onSkip, onAction }: {
  step: TourStep; index: number; total: number;
  onNext: () => void; onPrev: () => void; onSkip: () => void; onAction: () => void;
}) {
  const isLast = step.id === "outro";
  const needsAction = step.action?.startsWith("click_");

  return (
    <div style={{
      background: N.glass, backdropFilter: "blur(12px)",
      border: "1px solid rgba(0,229,255,.15)",
      borderRadius: "14px", padding: "20px 24px",
      boxShadow: "0 8px 40px rgba(0,0,0,.6), 0 0 30px rgba(0,229,255,.05)",
      maxWidth: "520px", width: "100%",
    }}>
      {/* Progress dots */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", alignItems: "center" }}>
        {Array.from({ length: total - 1 }, (_, i) => (
          <div key={i} style={{
            flex: 1, height: "3px", borderRadius: "999px",
            background: i < (step._index ?? 0) ? N.breeze : "rgba(255,255,255,.08)",
            transition: "background .4s",
          }} />
        ))}
        <span style={{ fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", marginLeft: "8px" }}>
          {(step._index ?? 0) + 1}/{total}
        </span>
      </div>

      {/* Title */}
      <h3 style={{ fontSize: "16px", fontWeight: 700, color: N.ink, margin: "0 0 8px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
        {step.title}
      </h3>

      {/* Body */}
      <p style={{ fontSize: "13px", color: N.body, lineHeight: "1.7", margin: "0 0 18px 0" }}>
        {step.body}
      </p>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
        {needsAction ? (
          <button onClick={onAction} style={{
            padding: "10px 28px", borderRadius: "8px", border: "none",
            background: "linear-gradient(135deg, #00e5ff, #0098a8)",
            color: "#000", fontWeight: 700, fontSize: "13px", cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            boxShadow: "0 4px 20px rgba(0,229,255,.2)",
            transition: `all .3s ${N.easeOut}`,
            animation: "glow-pulse 2s ease-in-out infinite",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
            {step.action === "click_poison" ? "👉 Click Inject Poison" :
             step.action === "click_heal" ? "👉 Click Travel Back & Heal" :
             "👉 Click Search"}
          </button>
        ) : (
          <button onClick={onNext} style={{
            padding: "10px 28px", borderRadius: "8px", border: "none",
            background: isLast ? "linear-gradient(135deg, #ffc800, #ffaa00)" : "linear-gradient(135deg, #00e5ff, #0098a8)",
            color: isLast ? "#000" : "#000", fontWeight: 700, fontSize: "13px", cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            boxShadow: isLast ? "0 4px 20px rgba(255,200,0,.2)" : "0 4px 20px rgba(0,229,255,.2)",
            transition: `all .3s ${N.easeOut}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
            {isLast ? "✨ Finish Tour" : "Next →"}
          </button>
        )}
        {!needsAction && (step._index ?? 0) > 0 && (
          <button onClick={onPrev} style={{
            padding: "10px 20px", borderRadius: "8px", border: "1px solid rgba(255,255,255,.1)",
            background: "transparent", color: N.mute, fontWeight: 600, fontSize: "12px", cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            transition: `all .2s ${N.easeOut}`,
          }}
            onMouseEnter={e => { e.currentTarget.style.color = N.ink; e.currentTarget.style.borderColor = "rgba(255,255,255,.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = N.mute; e.currentTarget.style.borderColor = "rgba(255,255,255,.1)"; }}>
            ← Back
          </button>
        )}
        <button onClick={onSkip} style={{
          marginLeft: "auto", padding: "6px 14px", borderRadius: "6px", border: "none",
          background: "transparent", color: N.faint, fontSize: "11px", cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace",
          transition: `all .2s ${N.easeOut}`,
        }}
          onMouseEnter={e => { e.currentTarget.style.color = N.mute; }}
          onMouseLeave={e => { e.currentTarget.style.color = N.faint; }}>
          Skip tour
        </button>
      </div>
    </div>
  );
}

/* ─── useFetchAbort ─────────────────────────── */

function useFetchAbort() {
  const ref = useRef<AbortController | null>(null);
  const fetchJson = useCallback(async (url: string, body: unknown): Promise<ApiData> => {
    ref.current?.abort();
    const ctrl = new AbortController();
    ref.current = ctrl;
    const apiKey = typeof document !== 'undefined' ? document.documentElement.getAttribute('data-api-key') : '';
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const res = await fetch(url, {
      method: "POST", headers,
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(text ? `HTTP ${res.status}: ${text.slice(0, 200)}` : `HTTP ${res.status}`);
    }
    const json = await res.json();
    if (!json.success) throw new Error(json.error || "Request failed");
    return json.data as ApiData;
  }, []);
  useEffect(() => () => ref.current?.abort(), []);
  return fetchJson;
}

/* ─── Main Playground ───────────────────────── */

export default function PlaygroundContent() {
  const [state, setState] = useState<Record<Scenario, ScenarioState>>({
    poison: { loading: false, error: null, result: null },
    heal: { loading: false, error: null, result: null },
    chat: { loading: false, error: null, result: null },
  });
  const [chatQuery, setChatQuery] = useState("What do I know about secret keys and encryption?");
  const [activeTab, setActiveTab] = useState<Scenario>("poison");
  const [tourActive, setTourActive] = useState(true);
  const [tourIdx, setTourIdx] = useState(0);
  const fetchJson = useFetchAbort();

  const run = useCallback(async (scenario: Scenario, url: string, body: unknown) => {
    setState(p => ({ ...p, [scenario]: { loading: true, error: null, result: null } }));
    try {
      const data = await fetchJson(url, body);
      if (!data) throw new Error("Empty response");
      setState(p => ({ ...p, [scenario]: { loading: false, result: data, error: null } }));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState(p => ({ ...p, [scenario]: { loading: false, error: err instanceof Error ? err.message : "Request failed", result: null } }));
    }
  }, [fetchJson]);

  const runPoison = useCallback(() => run("poison", "/api/demo/poison", { agentId: "agent-demo", scenario: "injection" }), [run]);
  const runHeal = useCallback(() => run("heal", "/api/demo/heal", { agentId: "agent-demo" }), [run]);
  const runChat = useCallback(() => { if (chatQuery.trim()) run("chat", "/api/demo/chat", { query: chatQuery.trim(), agentId: "agent-demo" }); }, [run, chatQuery]);

  const currentStep = TOUR[tourIdx];
  const isPoisonRun = !!state.poison.result;
  const isHealRun = !!state.heal.result;
  const isChatRun = !!state.chat.result;

  // Auto-advance tour when action completes
  useEffect(() => {
    if (!tourActive) return;
    const s = TOUR[tourIdx];
    if (s.action === "wait_poison" && isPoisonRun) setTourIdx(i => Math.min(i + 1, TOUR.length - 1));
    if (s.action === "wait_heal" && isHealRun) setTourIdx(i => Math.min(i + 1, TOUR.length - 1));
    if (s.action === "wait_chat" && isChatRun) setTourIdx(i => Math.min(i + 1, TOUR.length - 1));
  }, [tourActive, tourIdx, isPoisonRun, isHealRun, isChatRun]);

  // Auto-switch tabs in tour
  useEffect(() => {
    if (!tourActive) return;
    setActiveTab(currentStep.tab);
  }, [tourActive, tourIdx]);

  // Find which step we're at for progress
  const stepIndex = TOUR.findIndex(s => s.id === currentStep.id);

  const handleTourAction = useCallback(() => {
    const s = TOUR[tourIdx];
    if (s.action === "click_poison") { runPoison(); setTourIdx(i => Math.min(i + 1, TOUR.length - 1)); }
    if (s.action === "click_heal") { runHeal(); setTourIdx(i => Math.min(i + 1, TOUR.length - 1)); }
    if (s.action === "click_chat") { runChat(); setTourIdx(i => Math.min(i + 1, TOUR.length - 1)); }
  }, [tourIdx, runPoison, runHeal, runChat]);

  const handleNext = useCallback(() => setTourIdx(i => Math.min(i + 1, TOUR.length - 1)), []);
  const handlePrev = useCallback(() => setTourIdx(i => Math.max(i - 1, 0)), []);
  const handleSkip = useCallback(() => setTourActive(false), []);

  const tabMeta = [
    { key: "poison" as Scenario, label: "Poison Detection", icon: "\u2620\uFE0F", desc: "Hash chain + trust scoring", accent: N.sunset },
    { key: "heal" as Scenario, label: "Time Travel Heal", icon: "\u23F0", desc: "AS OF SYSTEM TIME recovery", accent: N.breeze },
    { key: "chat" as Scenario, label: "Semantic Chat", icon: "\uD83D\uDCAC", desc: "Vector similarity search", accent: N.emerald },
  ];

  return (
    <div style={{ background: N.bg, minHeight: "100vh", padding: "clamp(14px,3vw,36px) clamp(10px,2.5vw,24px)", position: "relative" }}>
      <NetherAmbient />

      <div style={{ maxWidth: "1040px", margin: "0 auto", position: "relative", zIndex: 1 }}>
        {/* Header */}
        <div style={{ marginBottom: "clamp(20px,3vw,36px)", textAlign: "center" }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "3px",
            color: N.breeze, marginBottom: "10px", display: "block",
            textShadow: "0 0 12px rgba(0,229,255,.3)",
          }}>
            <Link href="/" style={{ color: "inherit", textDecoration: "none" }}>Bastion</Link> Interactive Demo Suite
          </div>
          <h1 style={{
            fontSize: "clamp(28px,4vw,40px)", fontWeight: 700, margin: "0 0 10px 0",
            fontFamily: "'Space Grotesk', sans-serif",
            background: "linear-gradient(135deg, #fff 30%, #00e5ff 70%, #ffc800)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "-.5px",
          }}>
            Agentic Memory Playground
          </h1>
          {!tourActive && (
            <p style={{ fontSize: "clamp(13px,1.8vw,15px)", color: N.mute, margin: "0 auto", lineHeight: "1.8", maxWidth: "620px" }}>
              Three demos showing CockroachDB as an agentic memory layer — real SQL, real vectors, real time-travel.
            </p>
          )}
          {!tourActive && (
            <button onClick={() => { setTourActive(true); setTourIdx(0); }}
              style={{
                marginTop: "12px", padding: "8px 20px", borderRadius: "8px",
                border: "1px solid rgba(0,229,255,.2)", background: "rgba(0,229,255,.06)",
                color: N.breeze, fontSize: "12px", fontWeight: 600, cursor: "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                transition: `all .2s ${N.easeOut}`,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(0,229,255,.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,229,255,.06)"; }}>
              Start guided tour
            </button>
          )}
        </div>

        {/* Tour panel */}
        {tourActive && (
          <div style={{
            marginBottom: "clamp(16px,2.5vw,24px)",
            display: "flex", justifyContent: "center",
            animation: "slideDown .4s ease-out",
          }}>
            <DemoTour
              step={{ ...currentStep, _index: stepIndex }}
              index={stepIndex}
              total={TOUR.length}
              onNext={handleNext}
              onPrev={handlePrev}
              onSkip={handleSkip}
              onAction={handleTourAction}
            />
          </div>
        )}

        {/* Tabs */}
        <nav role="tablist" aria-label="Demo scenarios"
          style={{
            display: "flex", gap: "4px", marginBottom: "clamp(16px,2.5vw,28px)",
            background: N.card, borderRadius: "14px", padding: "4px",
            border: "1px solid rgba(255,42,0,.12)",
            position: "relative", overflow: "hidden",
          }}>
          <div style={{
            position: "absolute", bottom: "4px", left: 0, height: "2px",
            width: `${100 / 3}%`,
            transform: `translateX(${tabMeta.findIndex(t => t.key === activeTab) * 100}%)`,
            background: "linear-gradient(90deg, #00e5ff, #ffc800, #00ff66)",
            transition: `transform .45s ${N.easeOut}`,
            borderRadius: "2px",
          }} />
          {tabMeta.map(tab => (
            <button key={tab.key} role="tab" aria-selected={activeTab === tab.key}
              onClick={() => { if (!tourActive) setActiveTab(tab.key); }}
              tabIndex={activeTab === tab.key ? 0 : -1}
              style={{
                flex: 1, padding: "clamp(10px,1.5vw,14px) clamp(12px,2vw,20px)",
                cursor: tourActive ? "default" : "pointer", textAlign: "left", minWidth: 0,
                background: activeTab === tab.key
                  ? `linear-gradient(180deg, ${tab.accent}10, transparent 80%)`
                  : "transparent",
                border: "none", borderRadius: "10px",
                color: activeTab === tab.key ? N.ink : N.mute,
                transition: `all .35s ${N.easeOut}`,
                fontFamily: "'Space Grotesk', sans-serif", position: "relative",
                opacity: tourActive && activeTab !== tab.key ? .5 : 1,
              }}>
              <div style={{ fontSize: "clamp(13px,1.4vw,15px)", fontWeight: 600, marginBottom: "2px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span aria-hidden="true" style={{ fontSize: "16px" }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {activeTab === tab.key && <PulseDot color={tab.accent} />}
              </div>
              <div style={{ fontSize: "clamp(10px,1.1vw,11px)", fontWeight: 400, color: activeTab === tab.key ? N.mute : N.faint }}>
                {tab.desc}
              </div>
            </button>
          ))}
        </nav>

        {/* Panels */}
        <div style={{ position: "relative" }}>
          {(["poison", "heal", "chat"] as Scenario[]).map(scenario => (
            <div key={scenario} style={{
              display: activeTab === scenario ? "flex" : "none",
              flexDirection: "column", gap: "clamp(14px,2.5vw,24px)",
              animation: activeTab === scenario ? "fadeIn .45s ease-out" : "none",
            }}>
              {scenario === "poison" && <PoisonPanel state={state.poison} onRun={runPoison} tourHighlight={tourActive && currentStep.highlight === "poison-btn"} />}
              {scenario === "heal" && <HealPanel state={state.heal} onRun={runHeal} tourHighlight={tourActive && currentStep.highlight === "heal-btn"} />}
              {scenario === "chat" && <ChatPanel state={state.chat} onRun={runChat} query={chatQuery} onQueryChange={setChatQuery} tourHighlight={tourActive && currentStep.highlight === "chat-btn"} />}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: "clamp(32px,5vw,48px)", textAlign: "center", borderTop: "1px solid rgba(255,42,0,.08)", paddingTop: "20px" }}>
          <div style={{ fontSize: "10px", color: N.faint, fontFamily: "'JetBrains Mono', monospace" }}>
            Built on CockroachDB · sentence-transformers (all-MiniLM-L6-v2) · Groq · Next.js
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot { 0%,100% { opacity:.4; transform:scale(.8); } 50% { opacity:1; transform:scale(1.1); } }
        @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-14px); } to { opacity:1; transform:translateX(0); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes glow-pulse { 0%,100% { box-shadow:0 0 20px rgba(0,229,255,.2); } 50% { box-shadow:0 0 40px rgba(0,229,255,.4); } }
        @keyframes tour-highlight { 0%,100% { outline-color:rgba(0,229,255,.2); } 50% { outline-color:rgba(0,229,255,.6); } }
      `}</style>
    </div>
  );
}

/* ─── Shared widgets ───────────────────────── */

function SectionLabel({ children, color = N.mute }: { children: string; color?: string }) {
  return <div style={{ fontSize: "10px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "14px", fontFamily: "'JetBrains Mono', monospace" }}>{children}</div>;
}

function CrdbBadge({ features }: { features: string[] }) {
  if (!features?.length) return null;
  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }} role="list" aria-label="CockroachDB features">
      {features.map((f, i) => (
        <span key={i} role="listitem" style={{
          padding: "3px 10px", borderRadius: "999px", fontSize: "10px", fontWeight: 600,
          background: "rgba(0,229,255,.08)", border: "1px solid rgba(0,229,255,.2)", color: N.breeze,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: ".3px",
        }}>
          {f}
        </span>
      ))}
    </div>
  );
}

function Skeleton({ height = "80px" }: { height?: string }) {
  return (
    <div style={{
      borderRadius: "12px", padding: "20px",
      background: "linear-gradient(90deg, #120a0e 25%, #1a1018 50%, #120a0e 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.5s ease-in-out infinite",
      border: "1px solid rgba(255,42,0,.12)",
    }}>
      <div style={{ width: "40%", height: "10px", borderRadius: "4px", background: "rgba(255,255,255,.04)", marginBottom: "12px" }} />
      <div style={{ width: "100%", height, borderRadius: "4px", background: "rgba(255,255,255,.02)" }} />
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" style={{
      background: "rgba(255,85,0,.08)", border: "1px solid rgba(255,85,0,.3)",
      borderRadius: "12px", padding: "16px", color: N.sunset, fontSize: "13px",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap",
    }}>
      <span style={{ flex: 1, lineHeight: "1.5" }}>{message}</span>
      {onRetry && (
        <button onClick={onRetry} style={{
          padding: "8px 20px", borderRadius: "8px", border: "1px solid rgba(255,85,0,.3)",
          background: "rgba(255,85,0,.1)", color: N.sunset, cursor: "pointer", fontSize: "12px", fontWeight: 600,
          fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap",
          transition: `all .2s ${N.easeOut}`,
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,85,0,.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,85,0,.1)"; }}>
          Retry
        </button>
      )}
    </div>
  );
}

/* ─── Poison Panel ─────────────────────────── */

function PoisonPanel({ state, onRun, tourHighlight }: { state: ScenarioState; onRun: () => void; tourHighlight?: boolean }) {
  const r = state.result as PoisonData | null;
  const a = r?.attack;
  const chain = r?.chain;
  const [animKey, setAnimKey] = useState(0);
  const handleRun = useCallback(() => { setAnimKey(k => k + 1); onRun(); }, [onRun]);

  return (
    <section id="panel-poison" role="tabpanel" aria-label="Poison Detection">
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, rgba(255,85,0,.1), rgba(255,42,0,.04))",
        border: "1px solid rgba(255,85,0,.2)", borderRadius: "16px",
        padding: "clamp(16px,2.5vw,24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,.5), 0 0 30px rgba(255,85,0,.06)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "160px", height: "160px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,85,0,.08), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: N.sunset, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>
              <PulseDot color={N.sunset} /> Active Demo
            </div>
            <h3 style={{ fontSize: "clamp(18px,2.5vw,22px)", fontWeight: 700, color: N.ink, margin: "0 0 8px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
              Memory Poisoning Detection
            </h3>
            <p style={{ fontSize: "13px", color: N.body, margin: 0, lineHeight: "1.7", maxWidth: "500px" }}>
              Simulates a prompt injection attack. Bastion detects tampering via SHA-256 hash chain mismatch, blocks the poisoned memory, and recalculates the trust score. Powered by CockroachDB&apos;s SERIALIZABLE isolation.
            </p>
          </div>
          <button onClick={handleRun} disabled={state.loading} aria-busy={state.loading}
            style={{
              padding: "14px 32px", borderRadius: "10px", border: "none",
              cursor: state.loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              background: state.loading ? "rgba(255,85,0,.3)" : "linear-gradient(135deg, #ff5500, #ff2a00)",
              color: "#fff", fontWeight: 700, fontSize: "14px", fontFamily: "'Space Grotesk', sans-serif",
              boxShadow: state.loading ? "none" : "0 4px 24px rgba(255,85,0,.35)",
              transition: `all .3s ${N.easeOut}`, opacity: state.loading ? .6 : 1,
              outline: tourHighlight ? "2px solid rgba(0,229,255,.5)" : "none",
              outlineOffset: "3px",
              animation: tourHighlight ? "tour-highlight 1.5s ease-in-out infinite" : "none",
            }}
            onMouseEnter={e => { if (!state.loading) { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = "0 6px 30px rgba(255,85,0,.45)"; } }}
            onMouseLeave={e => { if (!state.loading) { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(255,85,0,.35)"; } }}>
            {state.loading ? "Detecting..." : "Inject Poison"}
          </button>
        </div>
        {r?.crdbFeatures && <div style={{ marginTop: "16px" }}><CrdbBadge features={r.crdbFeatures} /></div>}
      </div>

      {state.loading && <div style={{ marginTop: "16px" }}><Skeleton height="140px" /></div>}
      {state.error && <div style={{ marginTop: "16px" }}><ErrorBox message={state.error} onRetry={handleRun} /></div>}
      {!state.loading && r && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
          {a && <AttackCard attack={a} animKey={animKey} />}
          {a && <TrustGauge before={a.trustBefore} after={a.trustAfter} drop={a.trustDrop} risk={a.risk} animKey={animKey} />}
          {chain && chain.length > 0 && <HashChain chain={chain} />}
          {r.detection && <DetectionCard detection={r.detection} />}
          {r.sql && r.sql.length > 0 && <SqlPanel sql={r.sql} />}
        </div>
      )}
    </section>
  );
}

function AttackCard({ attack, animKey }: { attack: Attack; animKey: number }) {
  return (
    <div style={{
      background: N.card, border: "1px solid rgba(255,85,0,.15)", borderRadius: "14px", padding: "18px",
      animation: "slideIn .4s ease-out",
    }}>
      <SectionLabel color={N.sunset}>Attack Details</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", fontSize: "13px" }}>
        <span style={{ color: N.mute }}>Scenario</span>
        <span style={{ color: N.ink }}>{attack.scenario || "injection"}</span>
        <span style={{ color: N.mute }}>Memory ID</span>
        <code style={{ color: N.breeze, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", wordBreak: "break-all" }}>{attack.id}</code>
        <span style={{ color: N.mute }}>Detected At</span>
        <span style={{ color: N.ink }}>{new Date(attack.detectedAt).toLocaleTimeString()}</span>
        <span style={{ color: N.mute }}>Content</span>
        <code style={{ color: N.sunset, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", wordBreak: "break-all", background: "rgba(255,85,0,.08)", padding: "6px 10px", borderRadius: "6px", borderLeft: "2px solid #ff5500" }}>
          {attack.content?.slice(0, 100)}...
        </code>
        <span style={{ color: N.mute }}>Previous Hash</span>
        <code style={{ color: N.mute, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>{attack.previousHash}</code>
        <span style={{ color: N.mute }}>Current Hash</span>
        <code style={{ color: N.emerald, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}>{attack.cryptographicHash}</code>
      </div>
    </div>
  );
}

function TrustGauge({ before, after, drop, risk, animKey }: { before: number; after: number; drop: string; risk: string; animKey: number }) {
  const beforePct = Math.round(before * 100);
  const afterPct = Math.round(after * 100);
  const r = 48;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{
      background: N.card, border: "1px solid rgba(255,200,0,.15)", borderRadius: "14px", padding: "18px",
      animation: "slideIn .4s ease-out .1s both",
    }}>
      <SectionLabel color={N.gold}>Trust Score Impact</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(16px,3vw,28px)", alignItems: "center" }}>
        {/* SVG ring gauge */}
        <div style={{ position: "relative", width: "120px", height: "120px", flexShrink: 0 }}>
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth="10" transform="rotate(-90 60 60)" />
            <circle cx="60" cy="60" r={r} fill="none" stroke="#00ff66" strokeWidth="10"
              strokeDasharray={`${circ * .87} ${circ}`} strokeLinecap="round" transform="rotate(-90 60 60)"
              style={{ opacity: .4 }} />
            <circle cx="60" cy="60" r={r} fill="none" stroke="#ff5500" strokeWidth="10"
              strokeDasharray={`${circ * .20} ${circ}`}
              strokeDashoffset={-circ * .87}
              strokeLinecap="round" transform="rotate(-90 60 60)"
              style={{ filter: "drop-shadow(0 0 8px rgba(255,85,0,.4))", transition: "stroke-dasharray 1.2s cubic-bezier(.16,1,.3,1)" }} />
          </svg>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, color: N.sunset, fontFamily: "'Space Grotesk', sans-serif" }}>{afterPct}%</div>
            <div style={{ fontSize: "9px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>after</div>
          </div>
        </div>
        {/* Bar chart */}
        <div style={{ flex: 1, minWidth: "180px" }}>
          <div style={{ marginBottom: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", marginBottom: "4px" }}>
              <span style={{ color: N.mute }}>Before</span>
              <span style={{ color: N.emerald, fontWeight: 700 }}>{beforePct}%</span>
            </div>
            <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: "999px", width: "100%", background: "linear-gradient(90deg, #00ff66, #00cc88)", opacity: .4 }} />
            </div>
          </div>
          <div style={{ marginBottom: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", marginBottom: "4px" }}>
              <span style={{ color: N.mute }}>After</span>
              <span style={{ color: N.sunset, fontWeight: 700 }}>{afterPct}%</span>
            </div>
            <div style={{ height: "8px", borderRadius: "999px", background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: "999px", width: `${afterPct}%`,
                background: "linear-gradient(90deg, #ff5500, #ff2a00)",
                boxShadow: "0 0 12px rgba(255,85,0,.3)",
                transition: "width 1.2s cubic-bezier(.16,1,.3,1)",
              }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "20px", fontSize: "11px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", padding: "8px 12px", background: "rgba(255,85,0,.06)", borderRadius: "8px", borderLeft: "2px solid #ff5500", marginTop: "14px" }}>
            <span>Drop: <strong style={{ color: N.sunset }}>{drop}</strong></span>
            <span>Risk: <strong style={{ color: risk === "CRITICAL" ? N.sunset : N.lava }}>{risk}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HashChain({ chain }: { chain: ChainBlock[] }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,229,255,.12)", borderRadius: "14px", padding: "18px" }}>
      <SectionLabel>Hash Chain (SHA-256)</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {chain.map((block, i) => (
          <div key={i} style={{
            display: "flex", gap: "14px", padding: "10px 0",
            borderBottom: i < chain.length - 1 ? "1px solid rgba(255,42,0,.08)" : "none",
            opacity: block.status === "tampered" || block.status === "blocked" ? 1 : .65,
            animation: `slideIn .3s ease-out ${i * .06}s both`,
          }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "20px", flexShrink: 0 }}>
              <div style={{
                width: "12px", height: "12px", borderRadius: "50%",
                background: block.status === "tampered" ? N.sunset : block.status === "blocked" ? N.lava : N.emerald,
                boxShadow: block.status === "tampered" ? `0 0 14px ${N.sunset}60` : block.status === "blocked" ? `0 0 14px ${N.lava}60` : `0 0 8px ${N.emerald}40`,
              }} />
              {i < chain.length - 1 && <div style={{ width: "2px", flex: 1, background: "rgba(255,42,0,.08)", margin: "2px 0" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: N.ink }}>{block.label}</div>
              <code style={{ fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all", display: "block", marginTop: "3px" }}>
                {block.hash}
              </code>
              {block.violation && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: N.sunset, background: "rgba(255,85,0,.08)", padding: "4px 10px", borderRadius: "6px", display: "inline-block", borderLeft: "2px solid #ff5500" }}>
                  {block.violation}
                </div>
              )}
              {block.action && (
                <div style={{ marginTop: "6px", fontSize: "11px", color: N.lava, background: "rgba(255,170,0,.08)", padding: "4px 10px", borderRadius: "6px", display: "inline-block", borderLeft: "2px solid #ffaa00" }}>
                  {block.action}
                </div>
              )}
            </div>
            {block.timestamp && (
              <div style={{ fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap", flexShrink: 0, paddingTop: "2px" }}>
                {new Date(block.timestamp).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetectionCard({ detection }: { detection: Record<string, unknown> }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(255,85,0,.12)", borderRadius: "14px", padding: "18px" }}>
      <SectionLabel color={N.sunset}>Detection</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
        <div style={{ textAlign: "center", minWidth: "80px" }}>
          <div style={{ fontSize: "14px", fontWeight: 700, color: N.emerald, fontFamily: "'JetBrains Mono', monospace" }}>{(Number(detection.confidence) * 100).toFixed(0)}%</div>
          <div style={{ fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>Confidence</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "12px", color: N.body }}>Method: <strong style={{ color: N.breeze }}>{String(detection.method)}</strong></div>
          <div style={{ fontSize: "11px", color: N.mute, marginTop: "4px" }}>Latency: {String(detection.latency)}</div>
        </div>
        {Array.isArray(detection.patternsBlocked) && (
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
            {(detection.patternsBlocked as string[]).map((p: string, i: number) => (
              <span key={i} style={{ padding: "2px 8px", borderRadius: "6px", fontSize: "9px", background: "rgba(255,85,0,.1)", color: N.sunset, fontFamily: "'JetBrains Mono', monospace", border: "1px solid rgba(255,85,0,.15)" }}>{p}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SqlPanel({ sql }: { sql: string[] }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,229,255,.1)", borderRadius: "14px", padding: "18px" }}>
      <SectionLabel>SQL Executed</SectionLabel>
      <div style={{ overflowX: "auto" }}>
        {sql.map((q, i) => (
          <pre key={i} style={{
            margin: 0, marginBottom: i < sql.length - 1 ? "8px" : 0,
            fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: N.breeze, lineHeight: "1.7",
            whiteSpace: "pre-wrap", wordBreak: "break-word",
            background: "rgba(0,0,0,.3)", padding: "8px 12px", borderRadius: "6px",
            borderLeft: "2px solid rgba(0,229,255,.2)",
          }}>
            <span style={{ color: N.mute, marginRight: "10px", userSelect: "none", fontSize: "10px" }}>{`>`}</span>
            {q}
          </pre>
        ))}
      </div>
    </div>
  );
}

/* ─── Heal Panel ───────────────────────────── */

function HealPanel({ state, onRun, tourHighlight }: { state: ScenarioState; onRun: () => void; tourHighlight?: boolean }) {
  const r = state.result as HealData | null;
  const [animKey, setAnimKey] = useState(0);
  const handleRun = useCallback(() => { setAnimKey(k => k + 1); onRun(); }, [onRun]);

  return (
    <section id="panel-heal" role="tabpanel" aria-label="Time Travel Heal">
      <div style={{
        background: "linear-gradient(135deg, rgba(0,229,255,.1), rgba(0,100,200,.04))",
        border: "1px solid rgba(0,229,255,.2)", borderRadius: "16px",
        padding: "clamp(16px,2.5vw,24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,.5), 0 0 30px rgba(0,229,255,.06)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "160px", height: "160px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,229,255,.08), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: N.breeze, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>
              <PulseDot color={N.breeze} /> AS OF SYSTEM TIME
            </div>
            <h3 style={{ fontSize: "clamp(18px,2.5vw,22px)", fontWeight: 700, color: N.ink, margin: "0 0 8px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
              Time Travel Memory Recovery
            </h3>
            <p style={{ fontSize: "13px", color: N.body, margin: 0, lineHeight: "1.7", maxWidth: "500px" }}>
              Uses CockroachDB&apos;s MVCC architecture — SELECT ... AS OF SYSTEM TIME &apos;-5s&apos; retrieves the pre-poison state. CockroachDB never overwrites data; every write creates a new version.
            </p>
          </div>
          <button onClick={handleRun} disabled={state.loading} aria-busy={state.loading}
            style={{
              padding: "14px 32px", borderRadius: "10px", border: "none",
              cursor: state.loading ? "not-allowed" : "pointer", whiteSpace: "nowrap",
              background: state.loading ? "rgba(0,229,255,.15)" : "linear-gradient(135deg, #0098a8, #00e5ff)",
              color: "#fff", fontWeight: 700, fontSize: "14px", fontFamily: "'Space Grotesk', sans-serif",
              boxShadow: state.loading ? "none" : "0 4px 24px rgba(0,229,255,.25)",
              transition: `all .3s ${N.easeOut}`, opacity: state.loading ? .6 : 1,
              outline: tourHighlight ? "2px solid rgba(0,229,255,.5)" : "none",
              outlineOffset: "3px",
              animation: tourHighlight ? "tour-highlight 1.5s ease-in-out infinite" : "none",
            }}
            onMouseEnter={e => { if (!state.loading) { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = "0 6px 30px rgba(0,229,255,.35)"; } }}
            onMouseLeave={e => { if (!state.loading) { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,229,255,.25)"; } }}>
            {state.loading ? "Recovering..." : "Travel Back & Heal"}
          </button>
        </div>
        {r?.crdbFeatures && <div style={{ marginTop: "16px" }}><CrdbBadge features={r.crdbFeatures} /></div>}
      </div>

      {state.loading && <div style={{ marginTop: "16px" }}><Skeleton height="120px" /></div>}
      {state.error && <div style={{ marginTop: "16px" }}><ErrorBox message={state.error} onRetry={handleRun} /></div>}
      {!state.loading && r && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
          {r.timeTravel && <TimeTravelCard tt={r.timeTravel} animKey={animKey} />}
          <ContentComparison poisoned={r.poisonedContent} recovered={r.recoveredContent} animKey={animKey} />
          {r.cryptographicProof && <ProofCard proof={r.cryptographicProof} animKey={animKey} />}
          {r.trustRestored && <RestoreCard trust={r.trustRestored} animKey={animKey} />}
          {r.sql && r.sql.length > 0 && <SqlPanel sql={r.sql} />}
        </div>
      )}
    </section>
  );
}

function TimeTravelCard({ tt, animKey }: { tt: HealTimeTravel; animKey: number }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,229,255,.12)", borderRadius: "14px", padding: "18px", animation: "slideIn .4s ease-out" }}>
      <SectionLabel>Time Travel Window</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
        <div style={{ textAlign: "center", minWidth: "90px" }}>
          <div style={{ fontSize: "11px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", marginBottom: "6px" }}>Poisoned</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: N.sunset }}>{tt.from ? new Date(tt.from).toLocaleTimeString() : "—"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 12px" }}>
          <div style={{ fontSize: "clamp(18px,2.5vw,24px)", fontWeight: 700, color: N.breeze, fontFamily: "'Space Grotesk', sans-serif" }}>{tt.interval}</div>
          <div style={{ fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1px" }}>AS OF SYSTEM TIME</div>
        </div>
        <div style={{ textAlign: "center", minWidth: "90px" }}>
          <div style={{ fontSize: "11px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", marginBottom: "6px" }}>Healthy</div>
          <div style={{ fontSize: "14px", fontWeight: 600, color: N.emerald }}>{tt.to ? new Date(tt.to).toLocaleTimeString() : "—"}</div>
        </div>
      </div>
    </div>
  );
}

function ContentComparison({ poisoned, recovered, animKey }: { poisoned: string; recovered: string; animKey: number }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,229,255,.12)", borderRadius: "14px", padding: "18px", animation: "slideIn .4s ease-out .05s both" }}>
      <SectionLabel>Memory Content</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div style={{ background: "rgba(255,85,0,.06)", border: "1px solid rgba(255,85,0,.2)", borderRadius: "10px", padding: "14px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: "4px 10px", background: "rgba(255,85,0,.15)", borderRadius: "0 10px 0 8px", fontSize: "9px", color: N.sunset, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>CORRUPTED</div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: N.sunset, marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "1px" }}>Poisoned</div>
          <div style={{ fontSize: "12px", color: N.body, lineHeight: "1.6", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-word" }}>{poisoned || "N/A"}</div>
        </div>
        <div style={{ background: "rgba(0,255,102,.06)", border: "1px solid rgba(0,255,102,.2)", borderRadius: "10px", padding: "14px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, right: 0, padding: "4px 10px", background: "rgba(0,255,102,.12)", borderRadius: "0 10px 0 8px", fontSize: "9px", color: N.emerald, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>RESTORED</div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: N.emerald, marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: "1px" }}>Recovered</div>
          <div style={{ fontSize: "12px", color: N.body, lineHeight: "1.6", fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-word" }}>{recovered || "N/A"}</div>
        </div>
      </div>
    </div>
  );
}

function ProofCard({ proof, animKey }: { proof: HealProof; animKey: number }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,255,102,.12)", borderRadius: "14px", padding: "18px", animation: "slideIn .4s ease-out .1s both" }}>
      <SectionLabel color={N.emerald}>Cryptographic Verification</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px", fontSize: "13px" }}>
        <span style={{ color: N.mute }}>Restored Hash</span><code style={{ color: N.emerald, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", wordBreak: "break-all" }}>{proof.restoredHash}</code>
        <span style={{ color: N.mute }}>Previous Hash</span><code style={{ color: N.mute, fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", wordBreak: "break-all" }}>{proof.previousHash}</code>
        <span style={{ color: N.mute }}>Chain Integrity</span>
        <span style={{ color: proof.chainVerified ? N.emerald : N.sunset, fontWeight: 600 }}>
          {proof.chainVerified ? "Verified" : "Failed"}
          {proof.chainVerified && <span style={{ marginLeft: "8px", fontSize: "14px" }}>&#10003;</span>}
        </span>
        <span style={{ color: N.mute }}>Method</span><span style={{ color: N.body, fontSize: "12px" }}>{proof.verificationMethod}</span>
      </div>
    </div>
  );
}

function RestoreCard({ trust, animKey }: { trust: HealTrust; animKey: number }) {
  const beforePct = Math.round((trust.previousScore ?? 0) * 100);
  const afterPct = Math.round((trust.restoredScore ?? 0) * 100);
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,255,102,.12)", borderRadius: "14px", padding: "18px", animation: "slideIn .4s ease-out .15s both" }}>
      <SectionLabel color={N.emerald}>Trust Score Restoration</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(16px,3vw,28px)", alignItems: "center" }}>
        <div style={{ textAlign: "center", minWidth: "70px" }}>
          <div style={{ fontSize: "clamp(22px,2.5vw,26px)", fontWeight: 700, color: N.sunset }}>{beforePct}%</div>
          <div style={{ fontSize: "11px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>Before</div>
        </div>
        <div style={{ fontSize: "16px", color: N.emerald, fontWeight: 700 }}>→</div>
        <div style={{ textAlign: "center", minWidth: "70px" }}>
          <div style={{ fontSize: "clamp(22px,2.5vw,26px)", fontWeight: 700, color: N.emerald }}>{afterPct}%</div>
          <div style={{ fontSize: "11px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>After</div>
        </div>
        <div style={{ textAlign: "center", padding: "10px 20px", background: "rgba(0,255,102,.08)", borderRadius: "10px", border: "1px solid rgba(0,255,102,.2)" }}>
          <div style={{ fontSize: "clamp(16px,2vw,18px)", fontWeight: 700, color: N.emerald }}>+{trust.improvement}</div>
          <div style={{ fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>Improvement</div>
        </div>
      </div>
    </div>
  );
}

/* ─── Chat Panel ───────────────────────────── */

function ChatPanel({ state, onRun, query, onQueryChange, tourHighlight }: {
  state: ScenarioState; onRun: () => void; query: string; onQueryChange: (q: string) => void; tourHighlight?: boolean;
}) {
  const r = state.result as ChatData | null;
  const vs = r?.vectorSearch;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <section id="panel-chat" role="tabpanel" aria-label="Semantic Chat">
      <div style={{
        background: "linear-gradient(135deg, rgba(0,255,102,.1), rgba(0,200,100,.04))",
        border: "1px solid rgba(0,255,102,.2)", borderRadius: "16px",
        padding: "clamp(16px,2.5vw,24px)",
        boxShadow: "0 8px 32px rgba(0,0,0,.5), 0 0 30px rgba(0,255,102,.06)",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "160px", height: "160px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,255,102,.08), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ fontSize: "10px", fontWeight: 700, color: N.emerald, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px", fontFamily: "'JetBrains Mono', monospace" }}>
          <PulseDot color={N.emerald} /> Vector Similarity Search
        </div>
        <h3 style={{ fontSize: "clamp(18px,2.5vw,22px)", fontWeight: 700, color: N.ink, margin: "0 0 8px 0", fontFamily: "'Space Grotesk', sans-serif" }}>
          Semantic Memory Chat
        </h3>
        <p style={{ fontSize: "13px", color: N.body, margin: 0, lineHeight: "1.7", maxWidth: "500px" }}>
          Queries agent memory via sentence-transformers (all-MiniLM-L6-v2, 384-dim). Real cosine similarity ranking — every score is a genuine semantic distance, not mock data.
        </p>
        {r?.crdbFeatures && <div style={{ marginTop: "12px" }}><CrdbBadge features={r.crdbFeatures} /></div>}
      </div>

      {/* Input */}
      <div style={{ display: "flex", gap: "12px", marginTop: "16px", alignItems: "stretch" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input ref={inputRef}
            value={query} onChange={e => onQueryChange(e.target.value.slice(0, 500))}
            onKeyDown={e => { if (e.key === "Enter" && !state.loading && query.trim()) onRun(); }}
            placeholder="Ask something about agent memory..."
            maxLength={500} disabled={state.loading} aria-label="Search query"
            style={{
              width: "100%", height: "100%", padding: "14px 18px", paddingRight: "50px",
              borderRadius: "10px", border: "1px solid rgba(255,42,0,.18)",
              background: N.card, color: N.ink, fontSize: "14px", fontFamily: "'Inter', sans-serif",
              outline: "none", boxSizing: "border-box", transition: "border-color .3s",
            }}
            onFocus={e => { e.currentTarget.style.borderColor = N.emerald + "60"; e.currentTarget.style.boxShadow = "0 0 12px rgba(0,255,102,.08)"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,42,0,.18)"; e.currentTarget.style.boxShadow = "none"; }} />
          <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>
            {query.length}/500
          </span>
        </div>
        <button onClick={onRun} disabled={state.loading || !query.trim()} aria-busy={state.loading}
          style={{
            padding: "14px 32px", borderRadius: "10px", border: "none",
            cursor: state.loading || !query.trim() ? "not-allowed" : "pointer",
            background: state.loading ? "rgba(0,255,102,.15)" : "linear-gradient(135deg, #008855, #00ff66)",
            color: "#fff", fontWeight: 700, fontSize: "14px", fontFamily: "'Space Grotesk', sans-serif",
            boxShadow: state.loading ? "none" : "0 4px 24px rgba(0,255,102,.2)",
            opacity: query.trim() ? 1 : .5, whiteSpace: "nowrap",
            transition: `all .3s ${N.easeOut}`,
            outline: tourHighlight ? "2px solid rgba(0,229,255,.5)" : "none",
            outlineOffset: "3px",
            animation: tourHighlight ? "tour-highlight 1.5s ease-in-out infinite" : "none",
          }}
          onMouseEnter={e => { if (!state.loading && query.trim()) { e.currentTarget.style.transform = "scale(1.03)"; e.currentTarget.style.boxShadow = "0 6px 30px rgba(0,255,102,.3)"; } }}
          onMouseLeave={e => { if (!state.loading && query.trim()) { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,255,102,.2)"; } }}>
          {state.loading ? "Searching..." : "Search"}
        </button>
      </div>

      {state.loading && <div style={{ marginTop: "16px" }}><Skeleton height="160px" /></div>}
      {state.error && <div style={{ marginTop: "16px" }}><ErrorBox message={state.error} onRetry={onRun} /></div>}
      {!state.loading && r && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
          <ResponseCard response={r.response} />
          {vs && <VectorResults vs={vs} />}
          {r.sql && r.sql.length > 0 && <SqlPanel sql={r.sql} />}
        </div>
      )}
    </section>
  );
}

function ResponseCard({ response }: { response: string }) {
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,255,102,.12)", borderRadius: "14px", padding: "18px", animation: "slideIn .4s ease-out" }}>
      <SectionLabel color={N.emerald}>Response</SectionLabel>
      <div style={{ fontSize: "14px", color: N.body, lineHeight: "1.8", whiteSpace: "pre-wrap", fontFamily: "'Inter', sans-serif", wordBreak: "break-word" }}>
        {response || "No response generated."}
      </div>
    </div>
  );
}

function VectorResults({ vs }: { vs: VectorSearch }) {
  const results = vs.results || [];
  return (
    <div style={{ background: N.card, border: "1px solid rgba(0,255,102,.12)", borderRadius: "14px", padding: "18px", animation: "slideIn .4s ease-out .05s both" }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "8px" }}>
        <SectionLabel color={N.emerald}>Vector Search Results</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontSize: "11px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>
          {vs.latency && <span>Latency: <strong style={{ color: N.breeze }}>{vs.latency}</strong></span>}
          {vs.dimensions && <span>Dim: <strong style={{ color: N.lava }}>{vs.dimensions}</strong></span>}
          {vs.totalResults !== undefined && <span>Hits: <strong style={{ color: N.emerald }}>{vs.totalResults}</strong></span>}
        </div>
      </div>
      {results.length > 0 ? (
        <div>
          {/* Similarity distribution bar */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "14px", alignItems: "flex-end", height: "32px" }}>
            {(() => {
              const maxSim = Math.max(...results.map(r => r.similarity ?? 0), 0.01);
              return results.map((row, i) => {
                const pct = Math.max(8, ((row.similarity ?? 0) / maxSim) * 100);
                const color = row.similarity >= 0.7 ? "#00ff66" : row.similarity >= 0.4 ? "#ffc800" : "#6e5458";
                return (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "8px", color: N.mute, fontFamily: "'JetBrains Mono', monospace" }}>{Math.round((row.similarity ?? 0) * 100)}%</span>
                    <div style={{
                      width: "100%", height: `${pct}%`, borderRadius: "4px 4px 0 0",
                      background: `linear-gradient(180deg, ${color}, ${color}60)`,
                      transition: "height 1s cubic-bezier(.16,1,.3,1)",
                      animation: `slideIn .3s ease-out ${i * .08}s both`,
                    }} />
                  </div>
                );
              });
            })()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {results.map((row, i) => (
            <div key={i} style={{
              background: "rgba(0,0,0,.25)", borderRadius: "10px", padding: "12px 14px",
              border: "1px solid rgba(255,42,0,.08)",
              animation: `slideIn .3s ease-out ${i * .05}s both`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                <div style={{ flex: 1, fontSize: "12px", color: N.body, fontFamily: "'Inter', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.content}>
                  {row.content || "—"}
                </div>
                <div style={{ fontSize: "10px", color: N.breeze, fontFamily: "'JetBrains Mono', monospace", whiteSpace: "nowrap" }}>
                  {row.memoryType || "—"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ flex: 1, height: "6px", borderRadius: "999px", background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: "999px",
                    width: `${Math.max(2, Math.min(100, (row.similarity ?? 0) * 100))}%`,
                    background: row.similarity >= 0.7 ? "linear-gradient(90deg, #00ff66, #00cc88)" : row.similarity >= 0.4 ? "linear-gradient(90deg, #ffaa00, #ffc800)" : "linear-gradient(90deg, #6e5458, #a69498)",
                    boxShadow: row.similarity >= 0.7 ? "0 0 8px rgba(0,255,102,.3)" : "none",
                    transition: "width 1s cubic-bezier(.16,1,.3,1)",
                  }} />
                </div>
                <span style={{
                  fontSize: "11px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", minWidth: "36px", textAlign: "right",
                  color: row.similarity >= 0.7 ? N.emerald : row.similarity >= 0.4 ? N.gold : N.mute,
                }}>
                  {(row.similarity ?? 0) >= 0 ? Math.round((row.similarity ?? 0) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
          </div>
        </div>
      ) : (
        <div style={{ padding: "24px", textAlign: "center", color: N.mute, fontSize: "13px", fontFamily: "'JetBrains Mono', monospace" }}>No results found.</div>
      )}
      {vs.distanceMetric && (
        <div style={{ marginTop: "12px", fontSize: "10px", color: N.mute, fontFamily: "'JetBrains Mono', monospace", borderTop: "1px solid rgba(255,42,0,.08)", paddingTop: "12px" }}>
          {vs.distanceMetric} · {vs.tenantPartitioned ? "Tenant-partitioned" : "Global index"} · Model: {vs.indexType}
        </div>
      )}
    </div>
  );
}
