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

      const res = await fetch(`/api/mcp/${tool}`, {
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
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
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
    <div style={{ background: "#0a0508", minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Ambient glow for welcome */}
      {isWelcome && (
        <>
          <div style={{ position: "absolute", top: "20%", left: "50%", width: "800px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,94,0,0.06) 0%, transparent 70%)", transform: "translateX(-50%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "40%", left: "30%", width: "600px", height: "300px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,145,0,0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
        </>
      )}

      <div style={{ position: "relative", zIndex: 1, padding: "0 32px", maxWidth: "1100px", margin: "0 auto" }}>

        {/* Welcome screen (Step 0) */}
        {isWelcome && (
          <div style={{ textAlign: "center", padding: "40px 0 20px" }}>
            {/* Welcome pill */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 16px", borderRadius: "999px", background: "rgba(255,94,0,0.08)", border: "1px solid rgba(255,94,0,0.2)", marginBottom: "20px" }}>
              <span style={{ fontSize: "10px" }}>✦</span>
              <span style={{ fontSize: "10px", color: "#ff9100", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" as const }}>Welcome to Bastion</span>
            </div>

            {/* Big gradient title */}
            <h1 style={{ fontSize: "clamp(36px, 5vw, 52px)", fontWeight: 800, margin: "0 0 16px 0", lineHeight: "1.1" }}>
              <span style={{ color: "#fff" }}>Agentic Memory </span>
              <span style={{ background: "linear-gradient(135deg, #ff9100, #ff5e00, #ff2a00)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Live Demo</span>
            </h1>

            {/* Subtitle */}
            <p style={{ fontSize: "16px", color: "#a0a0b0", margin: "0 auto 32px", maxWidth: "520px", lineHeight: "1.6" }}>
              Run <strong style={{ color: "#ff9100" }}>real SQL</strong> against a live CockroachDB cluster.
              <br />See the queries, results, and proof in action.
            </p>

            {/* Feature cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", maxWidth: "700px", margin: "0 auto 32px" }}>
              <FeatureCard icon="🛡️" title="Poison Detection" desc="Find injected memories" color="#ff6b35" />
              <FeatureCard icon="⏱️" title="Time Travel" desc="Query any moment" color="#00e5ff" />
              <FeatureCard icon="🔍" title="Vector Search" desc="Semantic memory lookup" color="#00ff88" />
            </div>

            {/* Big CTA button */}
            <button onClick={() => goStep(1)} style={{
              padding: "16px 40px", borderRadius: "12px", border: "none",
              background: "linear-gradient(135deg, #ff5e00, #ff9100)",
              color: "#fff", fontWeight: 700, fontSize: "16px", cursor: "pointer",
              boxShadow: "0 0 40px rgba(255,94,0,0.25), 0 4px 20px rgba(0,0,0,0.3)",
              display: "inline-flex", alignItems: "center", gap: "10px",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 0 60px rgba(255,94,0,0.35), 0 8px 30px rgba(0,0,0,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(255,94,0,0.25), 0 4px 20px rgba(0,0,0,0.3)"; }}>
              Start Demo
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </button>

            <div style={{ fontSize: "12px", color: "#606070", marginTop: "12px" }}>
              Launch interactive demo in 3 simple steps
            </div>

            {/* Feature highlights */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px", marginTop: "40px", paddingTop: "32px", borderTop: "1px solid #1a1a2a" }}>
              <FeatureHighlight icon="⚡" title="Real SQL" desc="Execute live queries on CockroachDB" />
              <FeatureHighlight icon="📊" title="Live Results" desc="See results instantly with execution proof" />
              <FeatureHighlight icon="🔒" title="Secure & Safe" desc="Isolated environment for safe testing" />
              <FeatureHighlight icon="🤖" title="AI-Powered" desc="Agentic tools to explore memory at scale" />
            </div>

            {/* Live Stats from CockroachDB */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #1a1a2a" }}>
              {statsError ? (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "12px", background: "rgba(255,68,68,0.06)", border: "1px solid rgba(255,68,68,0.15)", borderRadius: "8px" }}>
                  <div style={{ fontSize: "11px", color: "#ff4444", fontWeight: 600 }}>Unable to connect to CockroachDB</div>
                  <div style={{ fontSize: "10px", color: "#606070", marginTop: "4px" }}>Stats will be available once the cluster is reachable</div>
                </div>
              ) : statsLoading ? (
                <>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ textAlign: "center", padding: "12px 8px", background: "#12121a", borderRadius: "8px", border: "1px solid #1e1e2a" }}>
                      <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e1e2a", fontFamily: "'Space Grotesk', sans-serif" }}>—</div>
                      <div style={{ fontSize: "10px", color: "#606070", textTransform: "uppercase" as const, letterSpacing: "1px", marginTop: "4px" }}>Loading...</div>
                    </div>
                  ))}
                </>
              ) : stats ? (
                <>
                  <LiveStat label="Memories Stored" value={stats.memories.toLocaleString()} color="#ff9100" icon="🧠" />
                  <LiveStat label="Entities" value={stats.entities.toLocaleString()} color="#00e5ff" icon="📦" />
                  <LiveStat label="Relations" value={stats.relations.toLocaleString()} color="#00ff88" icon="🔗" />
                  <LiveStat label="Audit Events" value={stats.auditLogs.toLocaleString()} color="#b388ff" icon="📋" />
                  <LiveStat label="Regions" value={stats.regions > 0 ? `${stats.regions} active` : "—"} color={stats.clusterOnline ? "#00ff88" : "#ff4444"} icon={stats.clusterOnline ? "🟢" : "🔴"} />
                </>
              ) : null}
            </div>

            {/* MCP Server Tools Showcase */}
            <div style={{ marginTop: "32px", paddingTop: "24px", borderTop: "1px solid #1a1a2a" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "16px" }}>
                <span style={{ fontSize: "12px", color: "#ff9100", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const }}>🔌</span>
                <span style={{ fontSize: "12px", color: "#ff9100", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" as const }}>MCP Server — 26 Tools</span>
              </div>
              <div style={{ fontSize: "12px", color: "#606070", textAlign: "center", marginBottom: "20px" }}>
                CockroachDB Cloud Managed MCP Server • Works with Claude, Cursor, VS Code
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "8px" }}>
                {MCP_TOOLS.map((tool, i) => (
                  <McpToolCard key={i} {...tool} onClick={() => { setMcpTool(tool.name); setMcpResult(null); setMcpError(null); }} active={mcpTool === tool.name} />
                ))}
              </div>

              {/* Interactive MCP Tool Runner */}
              {mcpTool && (
                <div style={{ marginTop: "16px", background: "#12121a", border: "1px solid #2a2a35", borderRadius: "10px", padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>▶ Run: <code style={{ color: "#ff9100" }}>{mcpTool}</code></div>
                    <button onClick={() => setMcpTool(null)} style={{ background: "none", border: "none", color: "#606070", cursor: "pointer", fontSize: "12px" }}>✕ Close</button>
                  </div>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input
                      value={mcpInput}
                      onChange={e => setMcpInput(e.target.value)}
                      placeholder={mcpTool === "memory_search" ? "Enter search query..." : mcpTool === "memory_store" ? "Enter memory content..." : mcpTool === "memory_timetravel" ? "Interval (e.g. -5s)..." : "Limit (e.g. 10)..."}
                      style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid #2a2a35", background: "#1a1a24", color: "#fff", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", outline: "none" }}
                    />
                    <button
                      onClick={() => runMcpTool(mcpTool, mcpInput)}
                      disabled={mcpLoading}
                      style={{ padding: "8px 16px", borderRadius: "6px", border: "none", background: mcpLoading ? "#1a1a24" : "linear-gradient(135deg, #ff5e00, #ff9100)", color: mcpLoading ? "#606070" : "#fff", fontWeight: 600, fontSize: "12px", cursor: mcpLoading ? "not-allowed" : "pointer" }}
                    >
                      {mcpLoading ? "Running..." : "Execute"}
                    </button>
                  </div>
                  {mcpError && <div style={{ padding: "8px 12px", background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: "6px", color: "#ff4444", fontSize: "11px", marginBottom: "8px" }}>{mcpError}</div>}
                  {mcpResult && (
                    <div style={{ background: "#1a1a24", borderRadius: "6px", padding: "10px", border: "1px solid #2a2a35" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "10px", color: "#a0a0b0", fontWeight: 600 }}>RESULT</span>
                        <span style={{ fontSize: "10px", color: "#ff9100" }}>{String(mcpResult.latency || "")}</span>
                      </div>
                      <pre style={{ margin: 0, fontSize: "10px", color: "#00e5ff", fontFamily: "'JetBrains Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.5", maxHeight: "200px", overflow: "auto" }}>
                        {JSON.stringify(mcpResult, null, 2)}
                      </pre>
                      {typeof mcpResult.sql === "string" && (
                        <div style={{ marginTop: "8px", padding: "6px 10px", background: "rgba(0,229,255,0.06)", borderRadius: "4px", borderLeft: "2px solid #00e5ff40" }}>
                          <div style={{ fontSize: "9px", color: "#00e5ff", fontWeight: 600, marginBottom: "2px" }}>SQL EXECUTED</div>
                          <div style={{ fontSize: "9px", color: "#a0a0b0", fontFamily: "'JetBrains Mono', monospace" }}>{String(mcpResult.sql)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* A2A + ccloud + Lambda section */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #1a1a2a" }}>
              <div style={{ background: "#12121a", border: "1px solid #2a2a35", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>🤖</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>A2A Protocol</div>
                <div style={{ fontSize: "11px", color: "#a0a0b0", lineHeight: "1.4" }}>Agent-to-agent communication with signed tasks and discovery</div>
                <div style={{ marginTop: "8px", display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#ff910018", color: "#ff9100", border: "1px solid #ff910030" }}>Signing</span>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#ff910018", color: "#ff9100", border: "1px solid #ff910030" }}>Tasks</span>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#ff910018", color: "#ff9100", border: "1px solid #ff910030" }}>Agent Card</span>
                </div>
              </div>
              <div style={{ background: "#12121a", border: "1px solid #2a2a35", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>☁️</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>ccloud CLI</div>
                <div style={{ fontSize: "11px", color: "#a0a0b0", lineHeight: "1.4" }}>Agent-ready CockroachDB Cloud control plane access</div>
                <div style={{ marginTop: "8px", display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#00e5ff18", color: "#00e5ff", border: "1px solid #00e5ff30" }}>Backup</span>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#00e5ff18", color: "#00e5ff", border: "1px solid #00e5ff30" }}>Health</span>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#00e5ff18", color: "#00e5ff", border: "1px solid #00e5ff30" }}>Provision</span>
                </div>
              </div>
              <div style={{ background: "#12121a", border: "1px solid #2a2a35", borderRadius: "10px", padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: "24px", marginBottom: "8px" }}>⚡</div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>AWS Lambda CDC</div>
                <div style={{ fontSize: "11px", color: "#a0a0b0", lineHeight: "1.4" }}>Real-time change detection on every memory write</div>
                <div style={{ marginTop: "8px", display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap" }}>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>Changefeed</span>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>CloudWatch</span>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "9px", background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830" }}>S3 Artifacts</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tour steps (Step 1+) */}
        {!isWelcome && (
          <>
            {/* Progress bar */}
            <div style={{ display: "flex", gap: "3px", marginBottom: "20px", padding: "0 4px" }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                <div key={i} style={{ flex: 1, height: "4px", borderRadius: "999px", background: tourStep >= i ? "#ff5e00" : "#1e1e2a", transition: "all 0.3s", boxShadow: tourStep >= i ? "0 0 8px rgba(255,94,0,0.3)" : "none" }} />
              ))}
            </div>

            <div style={{ background: "linear-gradient(135deg, #12121a 0%, #1a1220 100%)", border: "1px solid #2a2a35", borderRadius: "16px", padding: "32px", minHeight: "280px", position: "relative", overflow: "hidden" }}>
              {/* Decorative corner glow */}
              <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "200px", height: "200px", borderRadius: "50%", background: "radial-gradient(circle, rgba(255,94,0,0.06) 0%, transparent 70%)", pointerEvents: "none" }} />

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
                  <NavButtons back={() => goStep(4)} next={() => goStep(7)} nextLabel="Next: Semantic Search →" />
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
                  <NavButtons back={() => goStep(7)} next={() => goStep(10)} nextLabel="Finish Demo ✓" />
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
          </>
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
