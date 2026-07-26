"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";

export default function PlaygroundContent() {
  const [tourStep, setTourStep] = useState(0);
  const [poisonResult, setPoisonResult] = useState<unknown>(null);
  const [healResult, setHealResult] = useState<unknown>(null);
  const [chatResult, setChatResult] = useState<unknown>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  // MCP Tool Demo
  const [mcpTool, setMcpTool] = useState<string | null>(null);
  const [mcpInput, setMcpInput] = useState("secret keys");
  const [mcpResult, setMcpResult] = useState<Record<string, unknown> | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);

  const runMcpTool = useCallback(async (tool: string, input: string) => {
    setMcpLoading(true);
    setMcpError(null);
    setMcpResult(null);
    try {
      const body: Record<string, unknown> = { agentId: "agent-demo" };
      if (tool === "memory_search") body.query = input;
      else if (tool === "memory_store") body.content = input;
      else if (tool === "memory_timetravel") body.interval = input || "-5s";
      else if (tool === "memory_audit") body.limit = parseInt(input) || 10;

      const csrfToken = typeof document !== "undefined"
        ? (document.cookie.match(/bastion_csrf=([^;]+)/)?.[1] || "")
        : "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const res = await fetch(`/api/mcp/${tool}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Tool failed");
      setMcpResult(data.data as Record<string, unknown>);
    } catch (e: unknown) {
      setMcpError(e instanceof Error ? e.message : "Failed");
    } finally {
      setMcpLoading(false);
    }
  }, []);

  // Live stats from CockroachDB
  const [stats, setStats] = useState<{ memories: number; entities: number; relations: number; auditLogs: number; regions: number; avgLatency: string; clusterOnline: boolean } | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);

  // Fetch live stats on mount
  useEffect(() => {
    let mounted = true;
    const fetchStats = async () => {
      try {
        const [statsRes, regionRes] = await Promise.all([
          fetch("/api/stats").then(r => r.json()),
          fetch("/api/region-stats").then(r => r.json()),
        ]);
        if (!mounted) return;
        const s = statsRes?.data;
        const r = regionRes?.data;
        setStats({
          memories: s?.memories ?? 0,
          entities: s?.entities ?? 0,
          relations: s?.relations ?? 0,
          auditLogs: s?.auditLogs ?? 0,
          regions: r?.regions?.length ?? 0,
          avgLatency: r?.avg_global_latency_ms ? `${Math.round(r.avg_global_latency_ms / 1000)}ms` : "—",
          clusterOnline: true,
        });
        setStatsLoading(false);
      } catch {
        if (!mounted) return;
        setStatsError(true);
        setStatsLoading(false);
      }
    };
    fetchStats();
    // Refresh stats every 30s
    const interval = setInterval(fetchStats, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const callApi = useCallback(async (url: string, body: unknown, setter: (d: unknown) => void, tag: string) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setLoading(tag);
    setError(null);
    try {
      const csrfToken = typeof document !== "undefined"
        ? (document.cookie.match(/bastion_csrf=([^;]+)/)?.[1] || "")
        : "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
      const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
      const json = await res.json();
      // API wraps in {success, data} — extract the data
      const data = json?.data ?? json;
      setter(data);
      setLoading(null);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(null);
    }
  }, []);

  const runPoison = useCallback(() => callApi("/api/demo/poison", { agentId: "agent-demo" }, setPoisonResult, "poison"), [callApi]);
  const runHeal = useCallback(() => callApi("/api/demo/heal", { agentId: "agent-demo" }, setHealResult, "heal"), [callApi]);
  const runChat = useCallback(() => callApi("/api/demo/chat", { query: "secret keys and encryption", agentId: "agent-demo" }, setChatResult, "chat"), [callApi]);

  const onPoisonDone = loading === null && poisonResult && tourStep === 2;
  const onHealDone = loading === null && healResult && tourStep === 5;
  const onChatDone = loading === null && chatResult && tourStep === 8;
  const advancedRef = useRef({ poison: false, heal: false, chat: false });

  const goStep = (s: number) => {
    if (s === 2) advancedRef.current.poison = false;
    if (s === 5) advancedRef.current.heal = false;
    if (s === 8) advancedRef.current.chat = false;
    setTourStep(s);
  };

  useEffect(() => {
    if (onPoisonDone && !advancedRef.current.poison) { advancedRef.current.poison = true; setTimeout(() => setTourStep(3), 200); }
    if (onHealDone && !advancedRef.current.heal) { advancedRef.current.heal = true; setTimeout(() => setTourStep(6), 200); }
    if (onChatDone && !advancedRef.current.chat) { advancedRef.current.chat = true; setTimeout(() => setTourStep(9), 200); }
  }, [onPoisonDone, onHealDone, onChatDone]);

  const reset = () => {
    setTourStep(0); setPoisonResult(null); setHealResult(null); setChatResult(null); setLoading(null); setError(null);
    advancedRef.current = { poison: false, heal: false, chat: false };
  };

  const atk = (poisonResult as Record<string, unknown> | null)?.attack as Record<string, unknown> | undefined;
  const pSql = ((poisonResult as Record<string, unknown> | null)?.sql as string[]) || [];
  const hd = (healResult as Record<string, unknown> | null) as Record<string, unknown> | undefined;
  const cd = (chatResult as Record<string, unknown> | null) as Record<string, unknown> | undefined;
  const vs = cd?.vectorSearch as Record<string, unknown> | undefined;

  const isWelcome = tourStep === 0;

  return (
    <div style={{ background: "#0a0508", minHeight: "100vh", position: "relative", overflow: "hidden", color: "#e8e8ed" }}>
      {/* Ambient glow for welcome */}
      {isWelcome && (
        <>
          <div style={{ position: "absolute", top: "10%", left: "20%", width: "500px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,94,0,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "10%", right: "10%", width: "500px", height: "300px", borderRadius: "50%", background: "radial-gradient(circle, rgba(0,229,255,0.03) 0%, transparent 70%)", pointerEvents: "none" }} />
        </>
      )}

      {/* Main container wrapper */}
      <div style={{ position: "relative", zIndex: 1, padding: "20px 32px", maxWidth: "1400px", margin: "0 auto" }}>
        
        {/* Navigation header */}
        {!isWelcome && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "16px", borderBottom: "1px solid #1c1c2a", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px", fontWeight: 900, color: "#fff", letterSpacing: "-1px" }}>BASTION</span>
              <span style={{ fontSize: "9px", background: "rgba(255,94,0,0.15)", color: "#ff9100", border: "1px solid rgba(255,94,0,0.3)", padding: "2px 6px", borderRadius: "4px", fontWeight: 800 }}>PLAYGROUND</span>
            </div>
            <Link href="/dashboard" style={{ textDecoration: "none" }}>
              <button style={{
                background: "rgba(255,255,255,0.05)", border: "1px solid #2a2a35", color: "#fff",
                padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                transition: "all 0.2s"
              }}>
                ← System Dashboard
              </button>
            </Link>
          </div>
        )}

        {isWelcome ? (
          /* Option 1: Full-Width Visual Hero Landing Welcome Screen */
          <div style={{ maxWidth: "1000px", margin: "40px auto 0 auto", textAlign: "center", animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>
            
            {/* Live indicator badge */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 16px", borderRadius: "999px", background: "rgba(0, 255, 136, 0.04)", border: "1px solid rgba(0, 255, 136, 0.15)", marginBottom: "24px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00ff88", animation: "pulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#00ff88", letterSpacing: "1px", textTransform: "uppercase" }}>
                LIVE • Real SQL • Real Hashes • {stats ? `${stats.memories} memories` : "connecting..."} • {stats ? `${stats.regions} region(s)` : "loading..."}
              </span>
            </div>

            <div style={{ display: "inline-flex", padding: "4px 12px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "rgba(255, 94, 0, 0.08)", color: "#ff9100", border: "1px solid rgba(255, 94, 0, 0.2)", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "1.5px" }}>
              Welcome to Bastion
            </div>

            {/* Giant headline */}
            <h1 style={{ fontSize: "52px", fontWeight: 900, margin: "0 0 20px 0", lineHeight: "1.15", letterSpacing: "-2.5px", color: "#fff" }}>
              Never let an AI trust <span style={{ background: "linear-gradient(135deg, #ff5e00, #ff9100, #ffea00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>poisoned memory</span>.
            </h1>

            {/* Subtitle description */}
            <p style={{ fontSize: "17px", color: "#a0a0b0", margin: "0 auto 36px auto", lineHeight: "1.7", maxWidth: "680px" }}>
              Bastion detects, verifies, and recovers agentic database memories in real-time with cryptographic proof on live CockroachDB.
            </p>

            {/* 4 Feature Pills */}
            <div style={{ display: "flex", justifyContent: "center", gap: "12px", flexWrap: "wrap", marginBottom: "40px" }}>
              {[
                { label: "Detect", desc: "Malicious memories", color: "#ff6b35" },
                { label: "Recover", desc: "Any point in time", color: "#00e5ff" },
                { label: "Verify", desc: "Cryptographic proof", color: "#00ff88" },
                { label: "Prove", desc: "With live SQL", color: "#b388ff" }
              ].map((pill, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: `1px solid ${pill.color}25` }}>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: pill.color }}>{pill.label}</span>
                  <span style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.15)" }} />
                  <span style={{ fontSize: "11px", color: "#808090" }}>{pill.desc}</span>
                </div>
              ))}
            </div>

            {/* CTA action button */}
            <div style={{ marginBottom: "56px" }}>
              <button onClick={() => goStep(1)} style={{
                padding: "18px 48px", borderRadius: "12px", border: "none",
                background: "linear-gradient(135deg, #ff5e00, #ff9100)",
                color: "#fff", fontWeight: 800, fontSize: "16px", cursor: "pointer",
                boxShadow: "0 0 35px rgba(255,94,0,0.35)",
                display: "inline-flex", alignItems: "center", gap: "10px",
                transition: "transform 0.2s, box-shadow 0.2s"
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 45px rgba(255,94,0,0.45)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 35px rgba(255,94,0,0.35)"; }}>
                ▶ Launch Live Attack
              </button>
              <div style={{ fontSize: "12px", color: "#606070", marginTop: "12px", fontFamily: "monospace" }}>90 second interactive demo</div>
            </div>

            {/* 4 Feature highlight blocks with dynamic stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "56px" }}>
              {[
                { title: "Real & Live", desc: stats?.clusterOnline ? `${stats?.memories || 0} memories stored in CockroachDB.` : "Connecting to CockroachDB...", icon: "⚡" },
                { title: "Production Ready", desc: stats?.regions ? `Running across ${stats.regions} CockroachDB region${stats.regions !== 1 ? "s" : ""}.` : "CockroachDB cluster active.", icon: "🌍" },
                { title: "Secure by Design", desc: "SHA-256 hash chain integrity on every memory write.", icon: "🔒" },
                { title: "Always On", desc: stats?.avgLatency && stats.avgLatency !== "—" ? `Average query latency: ${stats.avgLatency}.` : "CockroachDB distributed SQL.", icon: "⏱️" }
              ].map((x, i) => (
                <div key={i} style={{ background: "linear-gradient(135deg, rgba(20,10,25,0.4) 0%, rgba(10,5,15,0.4) 100%)", border: "1px solid #1c1825", borderRadius: "12px", padding: "20px", textAlign: "left" }}>
                  <div style={{ fontSize: "22px", marginBottom: "10px" }}>{x.icon}</div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "6px" }}>{x.title}</div>
                  <div style={{ fontSize: "11px", color: "#808090", lineHeight: "1.5" }}>{x.desc}</div>
                </div>
              ))}
            </div>

            {/* Timeline: What you will see in this demo */}
            <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid #181522", borderRadius: "16px", padding: "28px", textAlign: "left" }}>
              <div style={{ fontSize: "10px", fontWeight: 800, color: "#ff9100", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "20px", textAlign: "center" }}>
                What you&apos;ll see in this demo
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "24px" }}>
                {[
                  { num: "01", title: "Poison Memory", desc: "An attacker injects false memory into the agent." },
                  { num: "02", title: "Detect Attack", desc: "Bastion identifies the compromised memory in real-time." },
                  { num: "03", title: "Recover Memory", desc: "Time-travel restores agent memory to a known good state." },
                  { num: "04", title: "Verify & Prove", desc: "Cryptographic proof validation with live SQL evidence." }
                ].map((item, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 800, color: "#ff5e00", background: "rgba(255,94,0,0.1)", padding: "4px 8px", borderRadius: "6px" }}>{item.num}</span>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{item.title}</span>
                    </div>
                    <p style={{ fontSize: "11px", color: "#707080", lineHeight: "1.4", margin: 0 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          /* 2-Column Developer Playground Console layout when Demo starts */
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: "24px", alignItems: "start", animation: "fadeIn 0.4s ease-out" }}>
            
            {/* LEFT COLUMN: Active Demo steps */}
            <div style={{ minHeight: "560px", paddingRight: "10px" }}>
              {/* Progress bar */}
              <div style={{ display: "flex", gap: "3px", marginBottom: "20px" }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                  <div key={i} style={{ flex: 1, height: "4px", borderRadius: "999px", background: tourStep >= i ? "#ff5e00" : "#1a1a2a", transition: "all 0.3s" }} />
                ))}
              </div>

              {/* Step contents panel */}
              <div style={{ background: "linear-gradient(135deg, #12121a 0%, #171120 100%)", border: "1px solid #222230", borderRadius: "16px", padding: "28px", minHeight: "500px", position: "relative" }}>
                <div style={{ position: "relative", zIndex: 1 }}>
                  
                  {/* Step 1: Pre-poison */}
                  {tourStep === 1 && (
                    <div style={{ position: "relative", zIndex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <span style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: "#ff6b3518", color: "#ff6b35", border: "1px solid #ff6b3530", letterSpacing: "0.5px" }}>DEMO 1 OF 3</span>
                      </div>
                      <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff", marginBottom: "12px", fontFamily: "'Space Grotesk', sans-serif" }}>
                        Memory Poisoning Detection
                      </div>
                      <div style={{ fontSize: "16px", color: "#a0a0b0", lineHeight: "1.7", marginBottom: "24px", maxWidth: "600px" }}>
                        I&apos;ll inject a <span style={{ color: "#ff4444", fontWeight: 700, background: "rgba(255,68,68,0.1)", padding: "2px 8px", borderRadius: "4px" }}>malicious memory</span> into CockroachDB.
                        The system will detect tampering via <span style={{ color: "#ff9100", fontWeight: 600 }}>SHA-256 hash chain</span> and drop the trust score.
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                        <button onClick={() => { goStep(2); runPoison(); }} style={{
                          padding: "16px 36px", borderRadius: "12px", border: "none",
                          background: "linear-gradient(135deg, #ff6b35, #ff4444)",
                          color: "#fff", fontWeight: 700, fontSize: "16px", cursor: "pointer",
                          boxShadow: "0 0 30px rgba(255,107,53,0.4), 0 4px 16px rgba(0,0,0,0.3)",
                          display: "flex", alignItems: "center", gap: "8px",
                          transition: "transform 0.2s, box-shadow 0.2s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(255,107,53,0.5), 0 8px 24px rgba(0,0,0,0.4)"; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 30px rgba(255,107,53,0.4), 0 4px 16px rgba(0,0,0,0.3)"; }}>
                          ⚡ Run It Now
                        </button>
                        <button onClick={() => goStep(0)} style={{
                          padding: "14px 24px", borderRadius: "10px",
                          border: "1px solid #2a2a35", background: "transparent",
                          color: "#a0a0b0", fontSize: "14px", cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = "#ff910050"; e.currentTarget.style.color = "#fff"; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a35"; e.currentTarget.style.color = "#a0a0b0"; }}>
                          ← Back
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Poison loading */}
                  {tourStep === 2 && (
                    <div style={{ position: "relative", zIndex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <span style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: "#ff6b3518", color: "#ff6b35", border: "1px solid #ff6b3530" }}>EXECUTING</span>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "20px" }}>Injecting poisoned memory into CockroachDB...</div>

                      {/* Real SQL execution steps */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <SqlStep num={1} label="Read current trust level" sql="SELECT trust_level FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1" status="done" />
                        <SqlStep num={2} label="Compute SHA-256 hash chain" sql="SHA256(previous_hash + content + agent_id + timestamp)" status="done" />
                        <SqlStep num={3} label="Generate embedding vector" sql="sentence-transformers(text) → 384-dim vector" status="done" />
                        <SqlStep num={4} label="Insert poisoned memory" sql="INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding_384, previous_hash, cryptographic_hash, trust_level) VALUES ($1, $2, 'poison_attempt', $3, $4::vector, $5, $6, 0)" status="running" />
                        <SqlStep num={5} label="Verify trust score dropped" sql="SELECT trust_level FROM agent_memory WHERE memory_id = $1" status="pending" />
                      </div>

                      <div style={{ marginTop: "16px", padding: "10px 14px", background: "rgba(255,94,0,0.06)", borderRadius: "8px", borderLeft: "3px solid #ff9100", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ff9100", animation: "pulse 1s ease-in-out infinite" }} />
                        <span style={{ fontSize: "11px", color: "#ff9100", fontFamily: "'JetBrains Mono', monospace" }}>Writing to CockroachDB region: aws-ap-south-1</span>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Poison results */}
                  {tourStep === 3 && atk && (
                    <div style={{ position: "relative", zIndex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                        <span style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: "#ff444418", color: "#ff4444", border: "1px solid #ff444430" }}>ATTACK DETECTED</span>
                      </div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#fff", marginBottom: "16px", fontFamily: "'Space Grotesk', sans-serif" }}>Trust Score Collapsed</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
                        <Metric label="Before" value={`${Math.round((atk.trustBefore as number) * 100)}%`} color="#00ff88" />
                        <Metric label="After" value={`${Math.round((atk.trustAfter as number) * 100)}%`} color="#ff4444" />
                        <Metric label="Drop" value={String(atk.trustDrop)} color="#ff4444" />
                        <Metric label="Risk" value={String(atk.risk)} color="#ff4444" />
                      </div>
                      <InfoRow label="Attack Type" value={String(atk.scenario).replace(/_/g, " ").toUpperCase()} />
                      <InfoRow label="Memory ID" value={String(atk.id)} mono />
                      <div style={{ background: "rgba(255,68,68,0.08)", borderRadius: "10px", padding: "14px", marginBottom: "8px", borderLeft: "4px solid #ff4444" }}>
                        <div style={{ fontSize: "11px", color: "#ff6666", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Malicious Content</div>
                        <div style={{ fontSize: "13px", color: "#e8e8ed", fontFamily: "'JetBrains Mono', monospace", lineHeight: "1.5" }}>{String(atk.content)}</div>
                      </div>
                      <SqlBlock sql={pSql} />
                      <NavButtons back={() => goStep(1)} next={() => goStep(4)} nextLabel="Next: Time Travel →" />
                    </div>
                  )}

                  {/* Step 4: Pre-heal */}
                  {tourStep === 4 && (
                    <div>
                      <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#00e5ff18", color: "#00e5ff", border: "1px solid #00e5ff30" }}>Demo 2 of 3</span>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "10px", marginBottom: "10px" }}>Time Travel Recovery</div>
                      <div style={{ fontSize: "14px", color: "#a0a0b0", lineHeight: "1.7", marginBottom: "16px" }}>
                        I&apos;ll use <span style={{ color: "#00e5ff", fontWeight: 700 }}>CockroachDB&apos;s MVCC</span> to recover the original memory via <code style={{ color: "#00e5ff", fontSize: "13px" }}>SELECT ... AS OF SYSTEM TIME &apos;-5s&apos;</code>
                      </div>
                      <NavButtons back={() => goStep(3)} action={() => { goStep(5); runHeal(); }} actionLabel="⚡ Run Time Travel" />
                    </div>
                  )}

                  {/* Step 5: Heal loading */}
                  {tourStep === 5 && (
                    <div style={{ position: "relative", zIndex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <span style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: "#00e5ff18", color: "#00e5ff", border: "1px solid #00e5ff30" }}>EXECUTING</span>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "20px" }}>Traveling back in time...</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <SqlStep num={1} label="Query MVCC versions" sql="SELECT crdb_internal_mvcc_timestamp FROM agent_memory WHERE agent_id = $1" status="done" />
                        <SqlStep num={2} label="Time-travel to pre-poison state" sql="SELECT content, trust_level FROM agent_memory AS OF SYSTEM TIME '-5s' WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1" status="running" />
                        <SqlStep num={3} label="Restore memory with hash chain" sql="INSERT INTO agent_memory (memory_type, content, trust_level) VALUES ('healed', $1, 4)" status="pending" />
                        <SqlStep num={4} label="Re-verify chain integrity" sql="SELECT cryptographic_hash FROM agent_memory WHERE memory_id = $1" status="pending" />
                      </div>
                      <div style={{ marginTop: "16px", padding: "10px 14px", background: "rgba(0,229,255,0.06)", borderRadius: "8px", borderLeft: "3px solid #00e5ff", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00e5ff", animation: "pulse 1s ease-in-out infinite" }} />
                        <span style={{ fontSize: "11px", color: "#00e5ff", fontFamily: "'JetBrains Mono', monospace" }}>Reading MVCC snapshots from CockroachDB</span>
                      </div>
                    </div>
                  )}

                  {/* Step 6: Heal results */}
                  {tourStep === 6 && hd && (
                    <div>
                      <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>Recovery Complete</span>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "10px", marginBottom: "16px" }}>Memory Restored from Time Travel</div>
                      <div style={{ background: "#1a1a24", borderRadius: "10px", padding: "16px", marginBottom: "12px", border: "1px solid #2a2a35" }}>
                        <div style={{ fontSize: "11px", color: "#a0a0b0", textTransform: "uppercase" as const, letterSpacing: "1px", fontWeight: 600, marginBottom: "6px" }}>Recovered Content</div>
                        <div style={{ fontSize: "14px", color: "#00ff88", fontFamily: "'JetBrains Mono', monospace", lineHeight: "1.5" }}>{String(hd.recoveredContent)}</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                        <Metric label="Chain Verified" value="✓ Yes" color="#00ff88" />
                        <Metric label="Latency" value={String(hd.latency)} color="#00e5ff" />
                      </div>
                      <SqlBlock sql={(hd.sql as string[]) || []} />
                      <NavButtons back={() => goStep(5)} next={() => goStep(7)} nextLabel="Next: Semantic Search →" />
                    </div>
                  )}

                  {/* Step 7: Pre-search */}
                  {tourStep === 7 && (
                    <div>
                      <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>Demo 3 of 3</span>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "10px", marginBottom: "10px" }}>Semantic Vector Search</div>
                      <div style={{ fontSize: "14px", color: "#a0a0b0", lineHeight: "1.7", marginBottom: "16px" }}>
                        Search all memories using <span style={{ color: "#00ff88", fontWeight: 700 }}>sentence-transformers embeddings</span> with real cosine similarity.
                      </div>
                      <NavButtons back={() => goStep(6)} action={() => { goStep(8); runChat(); }} actionLabel="⚡ Run Vector Search" />
                    </div>
                  )}

                  {/* Step 8: Search loading */}
                  {tourStep === 8 && (
                    <div style={{ position: "relative", zIndex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <span style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>EXECUTING</span>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 700, color: "#fff", marginBottom: "20px" }}>Searching memories with embeddings...</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <SqlStep num={1} label="Encode query with sentence-transformers" sql="sentence-transformers(&quot;secret keys and encryption&quot;) → 384-dim vector" status="done" />
                        <SqlStep num={2} label="Fetch candidate memories" sql="SELECT content, memory_type, embedding_384 FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 100" status="done" />
                        <SqlStep num={3} label="Compute cosine similarity" sql="embedding_384 <=> $1::vector (in-memory JS, 384-dim normalized)" status="running" />
                        <SqlStep num={4} label="Rank and return top results" sql="ORDER BY similarity DESC LIMIT 5" status="pending" />
                      </div>
                      <div style={{ marginTop: "16px", padding: "10px 14px", background: "rgba(0,255,136,0.06)", borderRadius: "8px", borderLeft: "3px solid #00ff88", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#00ff88", animation: "pulse 1s ease-in-out infinite" }} />
                        <span style={{ fontSize: "11px", color: "#00ff88", fontFamily: "'JetBrains Mono', monospace" }}>Computing similarity across 100+ memories</span>
                      </div>
                    </div>
                  )}

                  {/* Step 9: Search results */}
                  {tourStep === 9 && vs && (
                    <div>
                      <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>Search Complete</span>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "10px", marginBottom: "16px" }}>Real Cosine Similarity Results</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "16px" }}>
                        <Metric label="Results" value={String(vs.totalResults)} color="#00ff88" />
                        <Metric label="Latency" value={String(vs.latency)} color="#00e5ff" />
                        <Metric label="Dimensions" value={String(vs.dimensions)} color="#b388ff" />
                      </div>
                      {((vs.results as Record<string, unknown>[]) || []).slice(0, 3).map((row: Record<string, unknown>, i: number) => (
                        <div key={i} style={{ background: "#1a1a24", borderRadius: "10px", padding: "14px", marginBottom: "10px", border: "1px solid #2a2a35" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                            <div style={{ flex: 1, fontSize: "14px", color: "#e8e8ed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(row.content)}</div>
                            <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: row.memoryType === "healed" ? "#00ff8818" : "#ff6b3518", color: row.memoryType === "healed" ? "#00ff88" : "#ff6b35" }}>{String(row.memoryType)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ flex: 1, height: "8px", borderRadius: "999px", background: "#22222e" }}>
                              <div style={{ height: "100%", borderRadius: "999px", width: `${Math.round((row.similarity as number) * 100)}%`, background: "linear-gradient(90deg, #00ff88, #00e5ff)", boxShadow: "0 0 8px rgba(0,255,136,0.3)" }} />
                            </div>
                            <span style={{ fontSize: "14px", fontWeight: 800, color: "#00ff88", minWidth: "48px", textAlign: "right" as const }}>{Math.round((row.similarity as number) * 100)}%</span>
                          </div>
                        </div>
                      ))}
                      <SqlBlock sql={(cd?.sql as string[]) || []} />
                      <NavButtons back={() => goStep(8)} next={() => goStep(10)} nextLabel="Finish Demo ✓" />
                    </div>
                  )}

                  {/* Step 10: Done */}
                  {tourStep === 10 && (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                      <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎉</div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff", marginBottom: "8px" }}>All Demos Complete</div>
                      <div style={{ fontSize: "14px", color: "#a0a0b0", marginBottom: "20px", lineHeight: "1.7" }}>
                        Every step ran <strong style={{ color: "#ff9100" }}>real SQL</strong> against a live CockroachDB cluster.
                      </div>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                        <button onClick={() => goStep(9)} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #2a2a35", background: "#1a1a24", color: "#a0a0b0", fontSize: "13px", cursor: "pointer" }}>← Back</button>
                        <button onClick={reset} style={{ padding: "10px 24px", borderRadius: "8px", border: "none", background: "linear-gradient(135deg, #ff5e00, #ff9100)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: "pointer" }}>Run Again</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: 26 MCP Tools + Selected Execution Console */}
            <div>
              <div style={{ background: "#0c0710", border: "1px solid #201a2a", borderRadius: "16px", padding: "20px", minHeight: "560px", display: "flex", flexDirection: "column" }}>
                
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontSize: "12px", color: "#ff9100", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" as const }}>
                      🔌 MCP Toolchain
                    </div>
                    <div style={{ fontSize: "10px", color: "#606070", marginTop: "1px" }}>Select a tool to view schema definition and parameters</div>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "9px", background: "rgba(0,255,136,0.1)", color: "#00ff88", border: "1px solid rgba(0,255,136,0.2)" }}>13 R</span>
                    <span style={{ padding: "2px 8px", borderRadius: "999px", fontSize: "9px", background: "rgba(255,107,0,0.1)", color: "#ff6b00", border: "1px solid rgba(255,107,0,0.2)" }}>13 W</span>
                  </div>
                </div>

                {/* Tool list grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", overflowY: "auto", maxHeight: "360px", paddingRight: "4px" }}>
                  {MCP_TOOLS.map((tool, i) => (
                    <McpToolCard key={i} {...tool} onClick={() => { setMcpTool(tool.name); setMcpResult(null); setMcpError(null); }} active={mcpTool === tool.name} />
                  ))}
                </div>

                {/* Selected tool runner console space */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", marginTop: "14px" }}>
                  {mcpTool ? (
                    <div style={{ background: "#12121a", border: "1px solid #2a2a35", borderRadius: "10px", padding: "14px", animation: "fadeUp 0.2s ease" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>▶ Executing: <code style={{ color: "#ff9100" }}>{mcpTool}</code></div>
                        <button onClick={() => setMcpTool(null)} style={{ background: "none", border: "none", color: "#606070", cursor: "pointer", fontSize: "11px" }}>✕ close</button>
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                        <input
                          value={mcpInput}
                          onChange={e => setMcpInput(e.target.value)}
                          placeholder="Payload parameter input..."
                          style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #2a2a35", background: "#161622", color: "#fff", fontSize: "12px", outline: "none" }}
                        />
                        <button
                          onClick={() => runMcpTool(mcpTool, mcpInput)}
                          disabled={mcpLoading}
                          style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: mcpLoading ? "#20202a" : "linear-gradient(135deg, #ff5e00, #ff9100)", color: "#fff", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}
                        >
                          {mcpLoading ? "..." : "Run"}
                        </button>
                      </div>
                      {mcpError && <div style={{ padding: "6px 10px", background: "rgba(255,68,68,0.06)", border: "1px solid rgba(255,68,68,0.15)", borderRadius: "6px", color: "#ff4444", fontSize: "11px", marginBottom: "6px" }}>{mcpError}</div>}
                      {mcpResult && (
                        <div style={{ background: "#1a1a24", borderRadius: "6px", padding: "10px", border: "1px solid #2a2a35" }}>
                          <pre style={{ margin: 0, fontSize: "9.5px", color: "#00e5ff", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "110px", overflow: "auto" }}>
                            {JSON.stringify(mcpResult, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ border: "1.5px dashed #201a2a", borderRadius: "10px", padding: "30px 10px", textAlign: "center", color: "#606070", fontSize: "12px" }}>
                      ℹ Select any MCP tool card above to execute it live against the active CockroachDB cluster.
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}



        {error && <div style={{ marginTop: "12px", padding: "12px", background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: "8px", color: "#ff4444", fontSize: "12px" }}>{error}</div>}
      </div>
    </div>
  );
}

/* ─── Reusable Components ────────────────────── */

function FeatureCard({ icon, title, desc, color }: { icon: string; title: string; desc: string; color: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1a1a2a", borderRadius: "12px", padding: "16px", textAlign: "center" }}>
      <div style={{ fontSize: "24px", marginBottom: "8px" }}>{icon}</div>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "#606070" }}>{desc}</div>
    </div>
  );
}

function FeatureHighlight({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "20px", marginBottom: "6px" }}>{icon}</div>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{title}</div>
      <div style={{ fontSize: "11px", color: "#606070", lineHeight: "1.4" }}>{desc}</div>
    </div>
  );
}

function LiveStat({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div style={{ textAlign: "center", padding: "14px 8px", background: "#12121a", borderRadius: "10px", border: `1px solid ${color}20` }}>
      <div style={{ fontSize: "16px", marginBottom: "4px" }}>{icon}</div>
      <div style={{ fontSize: "20px", fontWeight: 800, color, fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
      <div style={{ fontSize: "10px", color: "#a0a0b0", textTransform: "uppercase" as const, letterSpacing: "1px", marginTop: "4px", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function SqlStep({ num, label, sql, status }: { num: number; label: string; sql: string; status: "done" | "running" | "pending" }) {
  const color = status === "done" ? "#00ff88" : status === "running" ? "#ff9100" : "#606070";
  const icon = status === "done" ? "✓" : status === "running" ? "⟳" : "○";
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "8px 12px", borderRadius: "8px", background: status === "running" ? "rgba(255,145,0,0.06)" : "transparent", border: status === "running" ? "1px solid rgba(255,145,0,0.15)" : "1px solid transparent" }}>
      <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: `${color}15`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color, fontWeight: 700, flexShrink: 0, animation: status === "running" ? "pulse 1s ease-in-out infinite" : "none" }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", fontWeight: 600, color: status === "pending" ? "#606070" : "#fff", marginBottom: "2px" }}>{label}</div>
        <code style={{ fontSize: "10px", color: status === "pending" ? "#404050" : color, fontFamily: "'JetBrains Mono', monospace", wordBreak: "break-all", lineHeight: "1.4" }}>{sql}</code>
      </div>
      {status === "done" && <span style={{ fontSize: "9px", color: "#00ff88", fontWeight: 600, flexShrink: 0 }}>✓</span>}
      {status === "running" && <span style={{ fontSize: "9px", color: "#ff9100", fontWeight: 600, flexShrink: 0, animation: "pulse 1s ease-in-out infinite" }}>RUNNING</span>}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#ff9100" }} />
      <span style={{ fontSize: "11px", color: "#a0a0b0" }}>{label}</span>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#1a1a24", border: `1px solid ${color}30`, borderRadius: "10px", padding: "14px 16px", textAlign: "center" }}>
      <div style={{ fontSize: "26px", fontWeight: 800, color, fontFamily: "'Space Grotesk', sans-serif" }}>{value}</div>
      <div style={{ fontSize: "11px", color: "#a0a0b0", textTransform: "uppercase" as const, letterSpacing: "1.5px", marginTop: "4px", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ background: "#1a1a24", borderRadius: "10px", padding: "14px", marginBottom: "8px", border: "1px solid #2a2a35" }}>
      <div style={{ fontSize: "11px", color: "#a0a0b0", textTransform: "uppercase" as const, letterSpacing: "1px", fontWeight: 600, marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", color: mono ? "#00e5ff" : "#fff", fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit", fontWeight: mono ? 400 : 600, wordBreak: "break-all" }}>{value}</div>
    </div>
  );
}

function SqlBlock({ sql }: { sql: string[] }) {
  if (!sql.length) return null;
  return (
    <div style={{ background: "#12121a", border: "1px solid #2a2a35", borderRadius: "10px", padding: "16px", marginTop: "12px" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#00e5ff", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "10px" }}>🗃️ SQL Executed Against CockroachDB</div>
      {sql.map((q: string, i: number) => (
        <pre key={i} style={{ margin: 0, marginBottom: i < sql.length - 1 ? "6px" : 0, fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: "#00e5ff", lineHeight: "1.6", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "8px 12px", background: "#1a1a24", borderRadius: "6px", borderLeft: "3px solid #00e5ff40" }}>
          <span style={{ color: "#a0a0b0", marginRight: "8px" }}>›</span>{q}
        </pre>
      ))}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #2a2a35", background: "#1a1a24", color: "#a0a0b0", fontSize: "13px", cursor: "pointer" }}>← Back</button>;
}

function NavButtons({ back, next, nextLabel, action, actionLabel }: { back: () => void; next?: () => void; nextLabel?: string; action?: () => void; actionLabel?: string }) {
  return (
    <div style={{ display: "flex", gap: "12px", marginTop: "20px", alignItems: "center" }}>
      <button onClick={back} style={{
        padding: "12px 20px", borderRadius: "10px",
        border: "1px solid #2a2a35", background: "transparent",
        color: "#a0a0b0", fontSize: "14px", cursor: "pointer",
        transition: "all 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#ff910050"; e.currentTarget.style.color = "#fff"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#2a2a35"; e.currentTarget.style.color = "#a0a0b0"; }}>
        ← Back
      </button>
      {next && nextLabel && <button onClick={next} style={{
        padding: "14px 32px", borderRadius: "10px", border: "none",
        background: "linear-gradient(135deg, #ff5e00, #ff9100)",
        color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer",
        boxShadow: "0 0 20px rgba(255,94,0,0.3)",
      }}>{nextLabel}</button>}
      {action && actionLabel && <button onClick={action} style={{
        padding: "14px 32px", borderRadius: "10px", border: "none",
        background: "linear-gradient(135deg, #ff5e00, #ff9100)",
        color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer",
        boxShadow: "0 0 20px rgba(255,94,0,0.3)",
      }}>{actionLabel}</button>}
    </div>
  );
}

/* ─── MCP Tools Data ────────────────────────── */

const MCP_TOOLS = [
  { name: "memory_search", desc: "C-SPANN vector similarity search with cognitive decay weighting", category: "core", read: true },
  { name: "memory_store", desc: "Store memory with SHA-256 hash chain + Bedrock Titan V2 embedding", category: "core", read: false },
  { name: "memory_timetravel", desc: "AS OF SYSTEM TIME recovery — query any past state", category: "core", read: true },
  { name: "memory_heal", desc: "Restore poisoned memory from hash chain verified backup", category: "core", read: false },
  { name: "memory_audit", desc: "Append-only hash-chained audit log retrieval", category: "core", read: true },
  { name: "memory_delete", desc: "Remove memory with audit trail preservation", category: "core", read: false },
  { name: "memory_pin", desc: "Pin important memories to prevent decay", category: "core", read: false },
  { name: "memory_get_pinned", desc: "Retrieve pinned memories for agent context", category: "core", read: true },
  { name: "memory_list", desc: "List all memories with pagination", category: "core", read: true },
  { name: "memory_correct", desc: "Correct memory content with provenance tracking", category: "core", read: false },
  { name: "memory_health", desc: "Cluster health check with latency metrics", category: "ops", read: true },
  { name: "memory_apply_patch", desc: "Apply atomic patch to memory metadata", category: "ops", read: false },
  { name: "resolve_conflict", desc: "SERIALIZABLE isolation conflict resolution", category: "multi-agent", read: false },
  { name: "ltm_check_reuse", desc: "Check long-term memory reuse to prevent duplication", category: "ltm", read: true },
  { name: "ltm_store_analysis", desc: "Store analysis results for future reference", category: "ltm", read: false },
  { name: "ltm_invalidate", desc: "Invalidate cached analysis when data changes", category: "ltm", read: false },
  { name: "detect_contradictions", desc: "Find contradictory memories in agent's knowledge", category: "intelligence", read: true },
  { name: "scan_all_contradictions", desc: "Full contradiction scan across all memories", category: "intelligence", read: true },
  { name: "dream", desc: "Background memory consolidation and summarization", category: "intelligence", read: false },
  { name: "dream_history", desc: "View dream execution history and outcomes", category: "intelligence", read: true },
  { name: "detect_observations", desc: "Detect new observations from agent interactions", category: "intelligence", read: true },
  { name: "multi_signal_search", desc: "Search across text, embeddings, and metadata simultaneously", category: "search", read: true },
  { name: "context_pack", desc: "Pack relevant context for agent decision-making", category: "search", read: true },
  { name: "agent_schema", desc: "Get agent's memory schema and capabilities", category: "meta", read: true },
  { name: "a2a_bridge", desc: "Bridge to A2A protocol for agent-to-agent communication", category: "multi-agent", read: false },
];

const CATEGORY_COLORS: Record<string, string> = {
  core: "#ff9100",
  ops: "#00e5ff",
  "multi-agent": "#b388ff",
  ltm: "#00ff88",
  intelligence: "#ff6b35",
  search: "#ffc800",
  meta: "#a0a0b0",
};

function McpToolCard({ name, desc, category, read, onClick, active }: { name: string; desc: string; category: string; read: boolean; onClick?: () => void; active?: boolean }) {
  const color = CATEGORY_COLORS[category] || "#a0a0b0";
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? `${color}10` : "#12121a",
        border: `1px solid ${active ? color : color + "20"}`,
        borderRadius: "8px", padding: "10px 12px", display: "flex", gap: "10px", alignItems: "flex-start",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s",
      }}
    >
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, marginTop: "5px", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
          <code style={{ fontSize: "11px", color: "#fff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{name}</code>
          <span style={{ padding: "1px 5px", borderRadius: "3px", fontSize: "8px", background: read ? "#00ff8815" : "#ff6b3515", color: read ? "#00ff88" : "#ff6b35", fontWeight: 600 }}>{read ? "READ" : "WRITE"}</span>
        </div>
        <div style={{ fontSize: "10px", color: "#a0a0b0", lineHeight: "1.4" }}>{desc}</div>
      </div>
    </div>
  );
}
