"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/fetch";

export default function PlaygroundContent({ initialStats }: { initialStats?: { memories: number; entities: number; relations: number; auditLogs: number; regions: number } }) {
  const [tourStep, setTourStep] = useState(0);
  const [contextResult, setContextResult] = useState<unknown>(null);
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

      const res = await fetchWithTimeout(`/api/mcp/${tool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
  const [stats, setStats] = useState(initialStats ? { ...initialStats, avgLatency: "—", clusterOnline: true } : null);
  const [statsError, setStatsError] = useState(false);
  const [statsLoading, setStatsLoading] = useState(!initialStats);
  const hasInitialStats = useRef(!!initialStats);

  // Fetch live stats on mount — only if no server data
  useEffect(() => {
    if (hasInitialStats.current) return;
    let mounted = true;
    const fetchStats = async () => {
      try {
        const [statsRes, regionRes] = await Promise.all([
          fetchWithTimeout("/api/stats"),
          fetchWithTimeout("/api/region-stats"),
        ]);
        const statsJson = await statsRes.json();
        const regionJson = await regionRes.json();
        if (!mounted) return;
        const s = statsJson?.data;
        const r = regionJson?.data;
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
      const res = await fetchWithTimeout(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal } as any);
      const json = await res.json();
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
  const runContext = useCallback(() => callApi("/api/demo/context", { agentId: "agent-demo" }, setContextResult, "context"), [callApi]);

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

  const pRes = poisonResult as Record<string, unknown> | null;
  const atk = pRes?.attack as Record<string, unknown> | undefined;
  const pBefore = pRes?.before as Record<string, unknown> | undefined;
  const pGuard = pRes?.guard as Record<string, unknown> | undefined;
  const pAfter = pRes?.after as Record<string, unknown> | undefined;
  const pChain = (pRes?.hashChain as Record<string, unknown>[]) || [];
  const pSqlObj = pRes?.sql as Record<string, string> | undefined;
  const pSql = pSqlObj ? Object.values(pSqlObj) : [];
  const hRes = healResult as Record<string, unknown> | null;
  const hd = hRes as Record<string, unknown> | undefined;
  const cRes = chatResult as Record<string, unknown> | null;
  const cd = cRes as Record<string, unknown> | undefined;

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
        
        {isWelcome ? (
          /* Welcome — full-width, no empty space */
          <div style={{ animation: "fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>

            {/* Hero: Headline + Features — 2 columns */}
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "28px", alignItems: "stretch", marginBottom: "16px" }}>
              {/* Left: Badge + Headline + CTA */}
              <div>
                {/* Welcome badge */}
                <div style={{ display: "inline-flex", padding: "4px 14px", borderRadius: "6px", fontSize: "11px", fontWeight: 800, background: "rgba(255,94,0,0.08)", color: "#ff5e00", border: `1px solid rgba(255,94,0,0.2)`, marginBottom: "14px", textTransform: "uppercase", letterSpacing: "1.5px" }}>
                  Welcome to Bastion
                </div>

                {/* Headline */}
                <h1 style={{ fontSize: "clamp(38px, 5vw, 54px)", fontWeight: 900, margin: "0 0 12px 0", lineHeight: "1.08", letterSpacing: "-2px", color: "#fff" }}>
                  Never let an AI trust <span style={{ background: "linear-gradient(135deg, #ff5e00, #ffea00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>poisoned memory</span>.
                </h1>

                <p style={{ fontSize: "15px", color: "#a0a0b0", margin: "0 0 18px 0", lineHeight: "1.5" }}>
                  Bastion detects, verifies, and recovers memories in real-time with cryptographic proof on live CockroachDB.
                </p>

                {/* CTA + Live badge */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <button onClick={() => goStep(1)} style={{ padding: "14px 36px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #ff5e00, #ff9100)", color: "#fff", fontWeight: 800, fontSize: "16px", cursor: "pointer", boxShadow: "0 0 30px rgba(255,94,0,0.3)", display: "inline-flex", alignItems: "center", gap: "8px", transition: "all 0.2s" }}>▶ Launch Live Attack</button>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#00ff88", animation: "pulse 1.5s infinite", boxShadow: "0 0 6px #00ff88" }} />
                    <span style={{ fontSize: "12px", color: "#888" }}>{stats ? `${stats.memories} memories` : "connecting..."}</span>
                  </div>
                </div>
              </div>

              {/* Right: Bastion Core Features — 2x2 grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { title: "SHA-256 Hash Chains", desc: "Every memory cryptographically linked to the previous — tamper-proof ledger", icon: "🔐", color: "#ff5e00" },
                  { title: "AS OF SYSTEM TIME", desc: "Time-travel to any past moment — CockroachDB MVCC", icon: "⏰", color: "#00e5ff" },
                  { title: "25 MCP + 25 A2A", desc: "Dual protocol — agents choose their interface", icon: "🔗", color: "#34d399" },
                  { title: "OWASP ASI06 Guard", desc: "Blocks 9 injection patterns before memory is stored", icon: "🛡️", color: "#ef4444" },
                ].map((f, i) => (
                  <div key={i} className="hover-lift" style={{ padding: "14px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: `1px solid ${f.color}20`, transition: "all 0.2s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "18px" }}>{f.icon}</span>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: f.color }}>{f.title}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#808090", lineHeight: "1.4" }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust + Stats — full width row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "14px" }}>
              {[
                { label: "Real & Live", value: `${stats?.memories || 0} memories`, icon: "⚡", color: "#34d399" },
                { label: "Secure", value: "SHA-256 hash chain", icon: "🔒", color: "#00e5ff" },
                { label: "Production", value: `${stats?.regions || 0} regions`, icon: "🌍", color: "#ff5e00" },
                { label: "Always On", value: stats?.avgLatency && stats.avgLatency !== "—" ? stats.avgLatency : "CockroachDB SQL", icon: "⏱️", color: "#a78bfa" },
              ].map((b, i) => (
                <div key={i} className="glass" style={{ padding: "12px", borderRadius: "10px", border: `1px solid ${b.color}15`, display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "18px" }}>{b.icon}</span>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: b.color }}>{b.label}</div>
                    <div style={{ fontSize: "11px", color: "#888" }}>{b.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Demo Flow — full width, 4 equal columns */}
            <div className="glass" style={{ borderRadius: "12px", padding: "20px", border: "1px solid rgba(255,94,0,0.15)", marginBottom: "16px", width: "100%" }}>
              <div style={{ fontSize: "13px", fontWeight: 800, color: "#ff5e00", textTransform: "uppercase" as const, letterSpacing: "2px", marginBottom: "16px", textAlign: "center" }}>What You&apos;ll See</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }}>
                {[
                  { num: "01", title: "Poison Memory", desc: "Attacker injects false memory into the system", color: "#ef4444" },
                  { num: "02", title: "Detect Attack", desc: "Bastion identifies the compromised memory in real-time", color: "#ff5e00" },
                  { num: "03", title: "Recover Memory", desc: "Time-travel restores agent to a known clean state", color: "#00e5ff" },
                  { num: "04", title: "Verify & Prove", desc: "Cryptographic proof validation with live SQL evidence", color: "#34d399" },
                ].map((s, i) => (
                  <div key={i} style={{ padding: "14px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: `${s.color}15`, border: `2px solid ${s.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: 800, color: s.color, boxShadow: `0 0 14px ${s.color}25`, margin: "0 auto 10px" }}>{s.num}</div>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>{s.title}</div>
                    <div style={{ fontSize: "12px", color: "#888", lineHeight: "1.4" }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          /* 2-Column Developer Playground Console layout when Demo starts */
          <div>
            {/* Back to Dashboard */}
            <div style={{ marginBottom: "16px" }}>
              <Link href="/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #2a2a35", background: "#12121a", color: "#a0a0b0", fontSize: "13px", textDecoration: "none", transition: "all 0.2s" }}>
                ← Back to Dashboard
              </Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "24px", alignItems: "start", animation: "fadeIn 0.4s ease-out" }}>
              
              {/* Active Demo steps — full width */}
              <div style={{ minHeight: "560px" }}>
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
                        <button onClick={() => { goStep(2); runContext(); runPoison(); }} style={{
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
                        <span style={{ fontSize: "11px", color: "#606070" }}>{String(pRes?.latency || "")}</span>
                      </div>
                      <div style={{ fontSize: "26px", fontWeight: 800, color: "#fff", marginBottom: "16px", fontFamily: "'Space Grotesk', sans-serif" }}>Trust Score Collapsed</div>

                      {/* Trust metrics */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
                        <Metric label="Before" value={String(pBefore?.avgTrust || "—")} color="#00ff88" />
                        <Metric label="After" value={String(pAfter?.avgTrust || "—")} color="#ff4444" />
                        <Metric label="Drop" value={String(pAfter?.dropPercent || "—")} color="#ff4444" />
                        <Metric label="Risk" value={String(atk.risk)} color="#ff4444" />
                      </div>

                      {/* Before state */}
                      {pBefore && (
                        <div style={{ background: "rgba(0,255,136,0.04)", borderRadius: "10px", padding: "14px", marginBottom: "12px", border: "1px solid rgba(0,255,136,0.12)" }}>
                          <div style={{ fontSize: "11px", color: "#00ff88", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "8px" }}>Agent State BEFORE Attack</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0", marginBottom: "6px" }}>{String(pBefore.narrative)}</div>
                          {Array.isArray(pBefore.memories) && pBefore.memories.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {(pBefore.memories as Record<string, unknown>[]).slice(0, 3).map((m, i) => (
                                <div key={i} style={{ fontSize: "11px", color: "#888", fontFamily: "monospace" }}>
                                  <span style={{ color: "#00ff88" }}>[trust:{String(m.trust)}]</span> {String(m.content).slice(0, 80)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attack details */}
                      <InfoRow label="Attack Type" value={String(atk.type).replace(/_/g, " ").toUpperCase()} />
                      <InfoRow label="Attacker Goal" value={String(atk.attackerGoal)} />
                      <div style={{ background: "rgba(255,68,68,0.08)", borderRadius: "10px", padding: "14px", marginBottom: "12px", borderLeft: "4px solid #ff4444" }}>
                        <div style={{ fontSize: "11px", color: "#ff6666", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Malicious Content Injected</div>
                        <div style={{ fontSize: "13px", color: "#e8e8ed", fontFamily: "'JetBrains Mono', monospace", lineHeight: "1.5" }}>{String(atk.content)}</div>
                      </div>

                      {/* Without Bastion comparison */}
                      <div style={{ background: "rgba(255,145,0,0.04)", borderRadius: "10px", padding: "14px", marginBottom: "12px", border: "1px solid rgba(255,145,0,0.12)" }}>
                        <div style={{ fontSize: "11px", color: "#ff9100", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Without Bastion</div>
                        <div style={{ fontSize: "12px", color: "#a0a0b0" }}>{String(atk.withoutBastion)}</div>
                      </div>

                      {/* Guard detection */}
                      {pGuard && (
                        <div style={{ background: "rgba(255,68,68,0.04)", borderRadius: "10px", padding: "14px", marginBottom: "12px", border: "1px solid rgba(255,68,68,0.12)" }}>
                          <div style={{ fontSize: "11px", color: "#ff4444", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "8px" }}>OWASP ASI06 Guard Detection</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0", marginBottom: "6px" }}>Method: {String(pGuard.method)}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {(pGuard.findings as string[] || []).map((f, i) => (
                              <span key={i} style={{ padding: "3px 8px", borderRadius: "4px", fontSize: "10px", background: "rgba(255,68,68,0.1)", color: "#ff6666", border: "1px solid rgba(255,68,68,0.2)" }}>{f}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* After state */}
                      {pAfter && (
                        <div style={{ background: "rgba(255,68,68,0.04)", borderRadius: "10px", padding: "14px", marginBottom: "12px", border: "1px solid rgba(255,68,68,0.12)" }}>
                          <div style={{ fontSize: "11px", color: "#ff4444", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "8px" }}>Agent State AFTER Attack</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0" }}>Trust: {String(pAfter.trustDrop)} — Poisoned memory stored with trust_level=0</div>
                        </div>
                      )}

                      {/* Hash chain */}
                      {pChain.length > 0 && (
                        <div style={{ background: "#12121a", borderRadius: "10px", padding: "14px", marginBottom: "12px", border: "1px solid #2a2a35" }}>
                          <div style={{ fontSize: "11px", color: "#00e5ff", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "8px" }}>Hash Chain Verification</div>
                          {pChain.slice(0, 4).map((link, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", fontSize: "11px", fontFamily: "monospace" }}>
                              <span style={{ color: link.isPoison ? "#ff4444" : "#00ff88", fontWeight: 700 }}>{link.isPoison ? "POISON" : "VALID"}</span>
                              <span style={{ color: "#606070" }}>{String(link.hash)}</span>
                              <span style={{ color: "#444" }}>← {String(link.prevHash)}</span>
                            </div>
                          ))}
                        </div>
                      )}

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
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "10px", marginBottom: "16px" }}>Memory Restored via Time Travel</div>

                      {/* Time travel proof */}
                      {hd.timeTravel && (
                        <div style={{ background: "rgba(0,229,255,0.04)", borderRadius: "10px", padding: "14px", marginBottom: "12px", border: "1px solid rgba(0,229,255,0.12)" }}>
                          <div style={{ fontSize: "11px", color: "#00e5ff", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "8px" }}>CockroachDB Time Travel Proof</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0" }}>Mechanism: {String(hd.timeTravel.mechanism)}</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0" }}>Query: {String(hd.timeTravel.queryTime)}</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0" }}>Rows found: {String(hd.timeTravel.rowsFound)}</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0" }}>Source: {String(hd.timeTravel.restoredFrom)}</div>
                        </div>
                      )}

                      {/* Poisoned vs Restored */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                        {hd.poisoned && (
                          <div style={{ background: "rgba(255,68,68,0.04)", borderRadius: "10px", padding: "14px", border: "1px solid rgba(255,68,68,0.12)" }}>
                            <div style={{ fontSize: "11px", color: "#ff4444", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Poisoned (Deleted)</div>
                            <div style={{ fontSize: "11px", color: "#a0a0b0", fontFamily: "monospace" }}>{String(hd.poisoned.content).slice(0, 80)}...</div>
                            <div style={{ fontSize: "10px", color: "#606070", marginTop: "4px" }}>trust_level: {String(hd.poisoned.trustLevel)}</div>
                          </div>
                        )}
                        {hd.restored && (
                          <div style={{ background: "rgba(0,255,136,0.04)", borderRadius: "10px", padding: "14px", border: "1px solid rgba(0,255,136,0.12)" }}>
                            <div style={{ fontSize: "11px", color: "#00ff88", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Restored (Healed)</div>
                            <div style={{ fontSize: "11px", color: "#a0a0b0", fontFamily: "monospace" }}>{String(hd.restored.content).slice(0, 80)}...</div>
                            <div style={{ fontSize: "10px", color: "#606070", marginTop: "4px" }}>trust_level: {String(hd.restored.trustLevel)} — provenance: system</div>
                          </div>
                        )}
                      </div>

                      {/* Trust recovery */}
                      {hd.trustRecovery && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "12px" }}>
                          <Metric label="Before Heal" value={String(hd.trustRecovery.beforeHeal)} color="#ff4444" />
                          <Metric label="After Heal" value={String(hd.trustRecovery.afterHeal)} color="#00ff88" />
                          <Metric label="Improvement" value={String(hd.trustRecovery.improvement)} color="#00ff88" />
                        </div>
                      )}

                      {/* Hash chain before vs after */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                        {Array.isArray(hd.chainBefore) && hd.chainBefore.length > 0 && (
                          <div style={{ background: "#12121a", borderRadius: "10px", padding: "12px", border: "1px solid #2a2a35" }}>
                            <div style={{ fontSize: "10px", color: "#ff4444", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Chain Before Heal</div>
                            {(hd.chainBefore as Record<string, unknown>[]).slice(0, 3).map((link, i) => (
                              <div key={i} style={{ fontSize: "10px", fontFamily: "monospace", padding: "2px 0", color: link.isPoison ? "#ff4444" : "#888" }}>
                                {String(link.type).slice(0, 8)} — {String(link.hash).slice(0, 12)}...
                              </div>
                            ))}
                          </div>
                        )}
                        {Array.isArray(hd.chainAfter) && hd.chainAfter.length > 0 && (
                          <div style={{ background: "#12121a", borderRadius: "10px", padding: "12px", border: "1px solid #2a2a35" }}>
                            <div style={{ fontSize: "10px", color: "#00ff88", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Chain After Heal</div>
                            {(hd.chainAfter as Record<string, unknown>[]).slice(0, 3).map((link, i) => (
                              <div key={i} style={{ fontSize: "10px", fontFamily: "monospace", padding: "2px 0", color: link.hashVerified ? "#00ff88" : "#ff4444" }}>
                                {String(link.type).slice(0, 8)} — {String(link.hash).slice(0, 12)}... {link.hashVerified ? "✓" : "✗"}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <SqlBlock sql={hd.sql ? Object.values(hd.sql as Record<string, string>) : []} />
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
                  {tourStep === 9 && cd && (
                    <div>
                      <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>Search Complete</span>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#fff", marginTop: "10px", marginBottom: "16px" }}>Semantic Vector Search Results</div>

                      {/* Search metadata */}
                      {cd.search && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
                          <Metric label="Memories Scanned" value={String(cd.search.memoriesScanned)} color="#00e5ff" />
                          <Metric label="Top K" value={String(cd.search.topK)} color="#00ff88" />
                          <Metric label="Latency" value={String(cd.search.latency)} color="#00e5ff" />
                          <Metric label="Model" value={String(cd.search.model).split("/").pop()} color="#b388ff" />
                        </div>
                      )}

                      {/* Ranked results with explanation */}
                      {((cd.results as Record<string, unknown>[]) || []).map((row: Record<string, unknown>, i: number) => {
                        const explanation = ((cd.explanation as Record<string, unknown>[]) || [])[i] as Record<string, unknown> | undefined;
                        return (
                          <div key={i} style={{ background: "#1a1a24", borderRadius: "10px", padding: "14px", marginBottom: "10px", border: "1px solid #2a2a35" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ fontSize: "16px", fontWeight: 800, color: "#00ff88", minWidth: "24px" }}>#{String(row.rank)}</span>
                                <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 600, background: row.isTrusted ? "#00ff8818" : "#ff444418", color: row.isTrusted ? "#00ff88" : "#ff4444" }}>{row.isTrusted ? "TRUSTED" : "UNTRUSTED"}</span>
                                <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "10px", background: row.type === "healed" ? "#00ff8818" : row.type === "poison_attempt" ? "#ff444418" : "#ff6b3518", color: row.type === "healed" ? "#00ff88" : row.type === "poison_attempt" ? "#ff4444" : "#ff6b35" }}>{String(row.type)}</span>
                              </div>
                              <span style={{ fontSize: "18px", fontWeight: 800, color: "#00ff88" }}>{String(row.similarityPercent)}</span>
                            </div>
                            <div style={{ fontSize: "13px", color: "#e8e8ed", marginBottom: "6px", lineHeight: "1.4" }}>{String(row.content).slice(0, 120)}</div>
                            {/* Similarity bar */}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                              <div style={{ flex: 1, height: "6px", borderRadius: "999px", background: "#22222e" }}>
                                <div style={{ height: "100%", borderRadius: "999px", width: `${Math.round((row.similarity as number) * 100)}%`, background: "linear-gradient(90deg, #00ff88, #00e5ff)", boxShadow: "0 0 8px rgba(0,255,136,0.3)" }} />
                              </div>
                            </div>
                            {/* Why it matched */}
                            {explanation && (
                              <div style={{ fontSize: "10px", color: "#606070", fontStyle: "italic" }}>
                                {String(explanation.reasoning)}
                                {(explanation.matchedTerms as string[] || []).length > 0 && (
                                  <span style={{ color: "#ff9100" }}> — terms: {(explanation.matchedTerms as string[]).join(", ")}</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Trust summary */}
                      {cd.trustSummary && (
                        <div style={{ background: "rgba(0,229,255,0.04)", borderRadius: "10px", padding: "14px", marginTop: "12px", border: "1px solid rgba(0,229,255,0.12)" }}>
                          <div style={{ fontSize: "11px", color: "#00e5ff", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "6px" }}>Trust Summary</div>
                          <div style={{ fontSize: "12px", color: "#a0a0b0" }}>
                            {String(cd.trustSummary.trustedCount)} trusted, {String(cd.trustSummary.untrustedCount)} untrusted — avg trust: {String(cd.trustSummary.avgTrust)}
                          </div>
                        </div>
                      )}

                      <SqlBlock sql={cd.sql ? (cd.sql as string[]) : []} />
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
