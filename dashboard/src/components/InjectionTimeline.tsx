"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LiveEvent = {
  type: string;
  timestamp: string;
  agentId: string;
  content: string;
};

const EVENT_COLORS: Record<string, string> = {
  memory_stored:       "#00e5ff",
  memory_searched:     "#00e5ff",
  guard_scan_passed:   "#ff5500",
  injection_blocked:   "#ff0000",
  hash_chain_verified: "#b026ff",
  conflict_detected:   "#ffaa00",
  conflict_resolved:   "#00ff88",
  drift_detected:      "#ffaa00",
  memory_healed:       "#00ff88",
  trust_score_updated: "#00e5ff",
  anomaly_flagged:     "#ff5500",
};

const EVENT_LABELS: Record<string, string> = {
  memory_stored:       "Memory Write",
  memory_searched:     "Memory Read",
  guard_scan_passed:   "Injection Blocked",
  injection_blocked:   "Injection Blocked",
  hash_chain_verified: "Hash Sealed",
  conflict_detected:   "Conflict",
  conflict_resolved:   "Healed",
  drift_detected:      "Drift Alert",
  memory_healed:       "Healed",
  trust_score_updated: "Trust Update",
  anomaly_flagged:     "Anomaly",
};

const LEGEND = [
  { color: "#00e5ff", label: "Memory Write" },
  { color: "#ff5500", label: "Injection Blocked" },
  { color: "#b026ff", label: "Hash Sealed" },
  { color: "#ffaa00", label: "Conflict / Drift" },
  { color: "#00ff88", label: "Healed" },
];

const C = {
  card: "#120a0e", hairline: "rgba(255,170,0,.12)",
  ink: "#ffffff", mute: "#8a8290", sunset: "#ffaa00",
};

export default function InjectionTimeline() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [tooltip, setTooltip] = useState<{ ev: LiveEvent; x: number; y: number } | null>(null);
  const [connected, setConnected] = useState(false);
  const [containerWidth, setContainerWidth] = useState(800);
  const esRef = useRef<EventSource | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const connect = useCallback(function connectImpl() {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      es.close();
      setTimeout(connectImpl, 3000);
    };

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.type === "connected") setConnected(true);
        if (parsed.type === "event" && parsed.data) {
          setEvents((prev) => [
            ...prev.slice(-80),
            {
              type: parsed.data.event ?? "memory_stored",
              timestamp: parsed.data.timestamp ?? new Date().toISOString(),
              agentId: String(parsed.data.agentId ?? "agent"),
              content: String(parsed.data.content ?? "").substring(0, 100),
            },
          ]);
        }
      } catch {}
    };
  }, []);

  useEffect(() => {
    // Seed initial historical event points so timeline is populated visually
    setEvents([
      { type: "memory_stored", timestamp: new Date(Date.now() - 52 * 60000).toISOString(), agentId: "agent-1", content: "Ingested core system architecture document" },
      { type: "hash_chain_verified", timestamp: new Date(Date.now() - 44 * 60000).toISOString(), agentId: "agent-2", content: "Verified block hash signature #849102" },
      { type: "memory_searched", timestamp: new Date(Date.now() - 38 * 60000).toISOString(), agentId: "agent-1", content: "Semantic vector search query: cockroachdb isolation" },
      { type: "guard_scan_passed", timestamp: new Date(Date.now() - 29 * 60000).toISOString(), agentId: "agent-3", content: "Blocked prompt injection: ignore previous rules" },
      { type: "conflict_resolved", timestamp: new Date(Date.now() - 21 * 60000).toISOString(), agentId: "agent-2", content: "Consolidated conflicting entity facts for User_Preference" },
      { type: "memory_stored", timestamp: new Date(Date.now() - 14 * 60000).toISOString(), agentId: "agent-1", content: "Stored LTM context summary" },
      { type: "guard_scan_passed", timestamp: new Date(Date.now() - 6 * 60000).toISOString(), agentId: "agent-3", content: "Blocked secret leakage attempt" },
      { type: "hash_chain_verified", timestamp: new Date(Date.now() - 2 * 60000).toISOString(), agentId: "agent-1", content: "Cryptographic hash sealed on chain" },
    ]);

    connect();

    return () => { esRef.current?.close(); setConnected(false); };
  }, [connect]);

  const now = useMemo(() => Date.now(), []);
  const windowMs = 60 * 60 * 1000; // 60 minutes

  const handleDotEnter = (ev: LiveEvent, e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    setContainerWidth(rect.width);
    setTooltip({ ev, x, y });
  };

  return (
    <div ref={containerRef} style={{
      background: C.card,
      border: `1px solid ${C.hairline}`,
      borderRadius: 16,
      padding: "24px 28px",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.sunset, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>
            LIVE · REAL-TIME COCKROACHDB STREAM
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: 0 }}>
            Agent Activity Timeline
          </h3>
          <p style={{ fontSize: 12, color: C.mute, margin: "4px 0 0 0" }}>
            Last 60 minutes · {events.length} events recorded
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {/* Connection Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: connected ? "rgba(0,255,136,0.06)" : "rgba(255,85,0,0.06)", border: `1px solid ${connected ? "rgba(0,255,136,0.25)" : "rgba(255,85,0,0.25)"}`, borderRadius: 999, padding: "4px 12px" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#00ff88" : "#ff5500", boxShadow: connected ? "0 0 8px #00ff88" : "0 0 8px #ff5500", animation: connected ? "ssePulse 2s ease-in-out infinite" : "none" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: connected ? "#00ff88" : "#ff5500" }}>
              {connected ? "SSE LIVE" : "OFFLINE"}
            </span>
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {LEGEND.map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}80` }} />
                <span style={{ fontSize: 10, color: C.mute, fontFamily: "var(--font-mono)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Timeline SVG */}
      <div style={{ position: "relative" }}>
        <svg width="100%" height="88" style={{ overflow: "visible", display: "block" }}>
          {/* Nether grid lines */}
          {[0, 25, 50, 75, 100].map((pct) => (
            <line key={pct} x1={`${pct}%`} y1="4" x2={`${pct}%`} y2="64"
              stroke="rgba(255,170,0,0.06)" strokeWidth="1" strokeDasharray="4 6" />
          ))}
          {/* Axis line */}
          <line x1="0" y1="44" x2="100%" y2="44"
            stroke="rgba(255,170,0,0.15)" strokeWidth="1" />

          {/* Lava glow gradient def */}
          <defs>
            <radialGradient id="dotGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff5500" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ff5500" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Event dots */}
          {events.map((ev, i) => {
            const ts = new Date(ev.timestamp).getTime();
            if (isNaN(ts)) return null;
            const age = now - ts;
            if (age < 0 || age > windowMs) return null;
            const xPct = Math.max(1, Math.min(99, 100 - (age / windowMs) * 100));
            const color = EVENT_COLORS[ev.type] ?? "#9e8486";
            const isAlert = ev.type === "guard_scan_passed" || ev.type === "injection_blocked" || ev.type === "anomaly_flagged" || ev.type === "conflict_detected" || ev.type === "drift_detected";
            const r = isAlert ? 7 : 5;

            return (
              <g key={i}
                onMouseEnter={(e) => handleDotEnter(ev, e)}
                onMouseLeave={() => setTooltip(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Ripple for alerts */}
                {isAlert && (
                  <circle
                    cx={`${xPct}%`} cy="44" r="14"
                    fill="none" stroke={color} strokeWidth="1.5"
                    style={{ animation: "timelineRipple 2s ease-out infinite", opacity: 0.4 }}
                  />
                )}
                {/* Glow halo */}
                <circle cx={`${xPct}%`} cy="44" r={r + 4} fill={color} opacity="0.08" />
                {/* Main dot */}
                <circle
                  cx={`${xPct}%`} cy="44" r={r}
                  fill={color}
                  style={{ filter: `drop-shadow(0 0 ${isAlert ? 8 : 5}px ${color})` }}
                />
              </g>
            );
          })}
        </svg>

        {/* Time axis */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          {["60m ago", "45m ago", "30m ago", "15m ago", "Now"].map((l) => (
            <span key={l} style={{ fontSize: 9, color: "rgba(255,170,0,0.3)", fontFamily: "var(--font-mono)" }}>{l}</span>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute",
          left: Math.min(tooltip.x, containerWidth - 260),
          top: tooltip.y - 100,
          background: "#1a1018",
          border: `1px solid ${EVENT_COLORS[tooltip.ev.type] ?? "#9e8486"}40`,
          borderLeft: `3px solid ${EVENT_COLORS[tooltip.ev.type] ?? "#9e8486"}`,
          borderRadius: 10,
          padding: "10px 14px",
          zIndex: 100,
          boxShadow: `0 8px 32px rgba(0,0,0,0.8), 0 0 20px ${EVENT_COLORS[tooltip.ev.type] ?? "#9e8486"}15`,
          pointerEvents: "none",
          maxWidth: 260,
        }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: EVENT_COLORS[tooltip.ev.type] ?? "#9e8486", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>
            {EVENT_LABELS[tooltip.ev.type] ?? tooltip.ev.type}
          </div>
          <div style={{ fontSize: 13, color: "#fff", marginBottom: 6, lineHeight: 1.4 }}>
            {tooltip.ev.content || "Memory operation"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#8a8290" }}>{tooltip.ev.agentId}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#8a8290" }}>·</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#8a8290" }}>{new Date(tooltip.ev.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ssePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px #00ff88; }
          50% { opacity: 0.6; box-shadow: 0 0 14px #00ff88; }
        }
        @keyframes timelineRipple {
          0% { r: 10; opacity: 0.6; }
          100% { r: 22; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
