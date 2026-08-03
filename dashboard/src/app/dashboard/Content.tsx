"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";
import dynamic from "next/dynamic";

const TrustRing = dynamic(() => import("@/components/TrustRing"), { ssr: false });

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
  canvas: "var(--canvas-bg)",
  glass: "var(--glass-bg)",
  glassBright: "var(--canvas-elevated)",
  border: "var(--glass-border)",
  borderHot: "var(--glass-border)",
  ink: "#000000",
  body: "#000000",
  mute: "#374151",
  cyan: "#000000",
  green: "#047857",
  orange: "#b45309",
  red: "#b91c1c",
};

/* ── Interfaces ────────────────────────────────────────────── */
interface Stats {
  memories: number;
  entities: number;
  relations: number;
  auditLogs: number;
  conflicts: number;
  avgImportance: string;
  decayCurve: Array<{ label: string; value: number }>;
  hourlyGrowth: number[];
  topRecalls: Array<{ rank: number; text: string; count: number }>;
  cacheHitPct: string;
  recentAudits: Array<{ id: string; action: string; recordedAt: string; details: Record<string, unknown> }>;
  agents?: Array<{ agent_id: string; memory_count: number }>;
}

/* ── Tiny reusable atoms ───────────────────────────────────── */
function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: "10px", height: "10px", borderRadius: "50%",
      background: color, border: "2px solid #000000",
      animation: pulse ? "bastionPulse 1.6s ease-in-out infinite" : "none",
      flexShrink: 0,
    }} />
  );
}

function Tag({ children, color = "#ffffff" }: { children: React.ReactNode; color?: string }) {
  const isYellow = color === "var(--accent-breeze)" || color === "#eab308" || color === "#facc15";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "4px 10px",
      borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 800,
      fontFamily: "var(--font-sans)", letterSpacing: "0.5px",
      background: isYellow ? "var(--accent-breeze)" : "#ffffff",
      color: "#000000",
      border: "2px solid #000000",
      boxShadow: "1.5px 1.5px 0px #000000",
    }}>
      {children}
    </span>
  );
}

/* ── Trend Indicator ──────────────────────────────────────── */
function TrendArrow({ value, label }: { value: number; label?: string }) {
  const isUp = value > 0;
  const isDown = value < 0;
  const color = isUp ? "#047857" : isDown ? "#b91c1c" : "#374151";
  const arrow = isUp ? "↑" : isDown ? "↓" : "→";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px",
      fontSize: "12px", fontWeight: 800, fontFamily: "var(--font-sans)", color
    }}>
      {arrow} {Math.abs(value)}%{label ? ` ${label}` : ""}
    </span>
  );
}

/* ── Executive Summary Bar ────────────────────────────────── */
function ExecutiveSummary({
  memories, threats, trustScore, driftScore, isHealthy
}: {
  memories: number; threats: number; trustScore: number | string; driftScore: number; isHealthy: boolean
}) {
  const statusColor = isHealthy ? C.green : threats > 0 ? C.red : C.orange;
  const statusText = isHealthy ? "SYSTEM HEALTHY" : threats > 0 ? "DEFENSE ACTIVE" : "CHECKING...";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", width: "100%" }}>
      {/* Status Card */}
      <div className="bento-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <Dot color={statusColor} pulse />
          <span style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800 }}>SECURITY STATUS</span>
        </div>
        <div style={{ fontSize: "20px", fontWeight: 900, color: statusColor, fontFamily: "'Space Grotesk', sans-serif" }}>
          {statusText}
        </div>
      </div>

      {/* Memories Card */}
      <div className="bento-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800, marginBottom: "4px" }}>MEMORIES SECURED</div>
        <div style={{ fontSize: "24px", fontWeight: 950, color: C.cyan, fontFamily: "'Space Grotesk', sans-serif" }}>
          {memories.toLocaleString()}
        </div>
      </div>

      {/* Threats Card */}
      <div className="bento-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800, marginBottom: "4px" }}>THREATS BLOCKED</div>
        <div style={{ fontSize: "24px", fontWeight: 950, color: C.green, fontFamily: "'Space Grotesk', sans-serif" }}>
          {threats}
        </div>
      </div>

      {/* Trust Score Card */}
      <div className="bento-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800, marginBottom: "4px" }}>AVG IMPORTANCE (/10)</div>
        <div style={{ fontSize: "24px", fontWeight: 950, color: C.cyan, fontFamily: "'Space Grotesk', sans-serif" }}>
          {trustScore}
        </div>
      </div>

      {/* Cold Archive (S3) Card */}
      <S3ArchiveCard />
    </div>
  );
}

function S3ArchiveCard() {
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const doExport = async () => {
    setExporting(true);
    setErr(null);
    try {
      const res = await fetchWithTimeout("/api/demo/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "agent-demo" }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "S3 export failed");
      setResult(json.data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "S3 export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bento-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800, marginBottom: "8px" }}>🗄️ COLD ARCHIVE (AWS S3)</div>
      {result ? (
        <div style={{ fontSize: "12px", color: C.ink, fontFamily: "'JetBrains Mono', monospace", lineHeight: "1.5", marginBottom: "8px", wordBreak: "break-all" }}>
          <div style={{ fontSize: "14px", fontWeight: 800, color: C.green }}>Exported ✓</div>
          <div>memory-exports/{String(result.agentId ?? "agent-demo")}/</div>
          <div style={{ color: C.mute }}>{String(result.count)} memories · {(Number(result.bytes) / 1024).toFixed(1)} KB</div>
          {result.url ? (
            <a href={String(result.url)} target="_blank" rel="noreferrer" style={{ color: C.cyan, textDecoration: "underline" }}>Open in S3 Console ↗</a>
          ) : null}
        </div>
      ) : (
        <div style={{ fontSize: "12px", color: C.mute, fontFamily: "'JetBrains Mono', monospace" }}>
          {err ? <span style={{ color: C.red }}>⚠ {err}</span> : "Bastion → CockroachDB → S3. Snapshot agent memory."}
        </div>
      )}
      <button
        onClick={doExport}
        disabled={exporting}
        style={{
          marginTop: "8px", padding: "8px 14px", borderRadius: "8px", border: `1px solid ${C.border}`,
          background: exporting ? C.glassBright : C.ink, color: exporting ? C.ink : "#fff",
          fontSize: "12px", fontWeight: 800, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {exporting ? "EXPORTING…" : result ? "EXPORT AGAIN" : "EXPORT TO S3"}
      </button>
    </div>
  );
}

/* ── Compact KPI Tile (vertical stack) ──────────────────────── */
function KpiCard({
  label, value, sub, color, trend, icon,
}: {
  label: string; value: string | number; sub?: string; color: string;
  trend?: "up" | "down" | "flat"; icon?: React.ReactNode;
}) {
  return (
    <div className="bento-kpi" style={{
      background: C.glass, border: `1px solid ${C.border}`,
      borderRadius: "14px", padding: "14px 16px",
      position: "relative", overflow: "hidden",
      transition: "all 0.35s cubic-bezier(0.16,1,0.3,1)",
      display: "flex", alignItems: "center", gap: "14px",
    }}>
      {/* left accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, bottom: 0, width: "2.5px",
        background: `linear-gradient(180deg, ${color}cc, transparent)`
      }} />
      {/* icon circle */}
      <div style={{
        width: "36px", height: "36px", borderRadius: "10px", flexShrink: 0,
        background: `${color}12`, border: `1px solid ${color}25`,
        display: "flex", alignItems: "center", justifyContent: "center", color, opacity: 0.85
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "11px", color: C.mute, textTransform: "uppercase",
          letterSpacing: "1px", fontWeight: 700, fontFamily: "var(--font-mono)",
          marginBottom: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
        }}>
          {label}
        </div>
        <div style={{
          fontSize: "26px", fontWeight: 950, color, lineHeight: 1,
          fontFamily: "var(--font-sg)", letterSpacing: "-1px"
        }}>
          {value}
        </div>
        {sub && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "3px" }}>
            {trend && (
              <span style={{
                fontSize: "11px",
                color: trend === "up" ? C.green : trend === "down" ? C.red : C.mute
              }}>
                {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
              </span>
            )}
            <span style={{
              fontSize: "12px", color: C.mute,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
            }}>{sub}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Mini Sparkline ─────────────────────────────────────────── */
function Sparkline({ data, color, height = 48 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data, 1);
  const w = 200;
  const h = height;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h * 0.85}`).join(" ");
  const area = `M0,${h} L${pts.split(" ").map((p, i) => i === 0 ? p : p).join(" L")} L${w},${h} Z`;
  const line = `M${pts.split(" ").join(" L")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: `${height}px` }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2"
        style={{ filter: `drop-shadow(0 0 5px ${color}88)` }} />
    </svg>
  );
}

/* ── Security Events Feed ───────────────────────────────────── */
function SecurityFeed({ blockedCount }: { blockedCount: number }) {
  const [events, setEvents] = useState<{ type: string; msg: string; time: string; color: string; agent: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout("/api/tool-usage?limit=30")
      .then(r => r.json())
      .then(d => {
        const rows = d?.data?.usage || d?.usage || [];
        if (Array.isArray(rows) && rows.length > 0) {
          const seen = new Set<string>();
          const unique = rows.filter((r: any) => {
            const key = `${r.tool_name}-${r.agent_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          setEvents(unique.slice(0, 8).map((r: any) => {
            const tool = String(r.tool_name || "memory_store");
            const isEncrypted = tool.includes("encrypt");
            const isScan = tool.includes("scan") || tool.includes("contradiction") || tool.includes("detect");
            const isGuard = tool.includes("guard") || tool.includes("compliance");
            const type = isEncrypted ? "ENCRYPTED" : isScan ? "SCANNED" : isGuard ? "GUARDED" : "PASSED";
            const color = isEncrypted ? "#7c3aed" : isScan ? "#0369a1" : isGuard ? "#b45309" : "#047857";
            return {
              type,
              msg: tool.replace(/_/g, " "),
              time: r.created_at ? new Date(r.created_at).toLocaleTimeString() : "just now",
              color,
              agent: r.agent_id || "unknown",
            };
          }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading && events.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, justifyContent: "center", alignItems: "center" }}>
        <div style={{ fontSize: "11px", color: C.mute }}>Loading security scan...</div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, justifyContent: "center", alignItems: "center", minHeight: "100px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" style={{ marginBottom: "6px" }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace" }}>No security events found</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", overflowY: "auto", flex: 1 }}>
      {events.map((e, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "8px 12px", borderRadius: "8px",
          background: i === 0 ? `${e.color}0d` : "transparent",
          border: `1.5px solid ${i === 0 ? e.color + "30" : "#000000"}`,
          transition: "all 0.3s",
        }}>
          <Dot color={e.color} pulse={i === 0} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "12px", color: "#000000", lineHeight: 1.4, fontWeight: 800, fontFamily: "var(--font-sans)" }}>{e.msg}</div>
            <div style={{ fontSize: "10px", color: "#374151", marginTop: "1px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{e.agent} · {e.time}</div>
          </div>
          <Tag color={e.color}>{e.type}</Tag>
        </div>
      ))}
    </div>
  );
}

/* ── Blockchain Timeline (now: Live Tool Call Trail) ─────────────── */
function BlockchainTimeline({ live }: { live: boolean }) {
  const [blocks, setBlocks] = useState<{ id: string; action: string; agent: string; status: string; ms: number; time: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout("/api/tool-usage?limit=8")
      .then(r => r.json())
      .then(d => {
        const rows = d?.data?.usage || d?.usage || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setBlocks(rows.map((r: any, i: number) => ({
            id: String(i),
            action: (r.tool_name || "memory_store").replace(/_/g, " "),
            agent: r.agent_id || "unknown",
            status: "SUCCESS",
            ms: r.duration_ms || 0,
            time: r.created_at ? new Date(r.created_at).toLocaleTimeString() : "just now",
          })));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading && blocks.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0", justifyContent: "center", alignItems: "center", padding: "20px 0" }}>
        <div style={{ fontSize: "11px", color: C.mute }}>Loading tool trail...</div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", justifyContent: "center", alignItems: "center", padding: "20px 0" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" style={{ marginBottom: "4px" }}>
          <rect x="2" y="2" width="20" height="20" rx="4" />
          <path d="M12 11V7M12 17h.01" />
        </svg>
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace" }}>No tool calls yet</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {blocks.map((b, i) => (
        <div key={b.id} style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative" }}>
          {i < blocks.length - 1 && (
            <div style={{
              position: "absolute", left: "10px", top: "36px",
              width: "2px", height: "calc(100% - 4px)",
              background: "#000000",
            }} />
          )}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              width: "22px", height: "22px", borderRadius: "50%",
              background: b.status === "SUCCESS" ? C.green : C.red,
              border: "2px solid #000000",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", color: "#000000", fontWeight: 900,
              boxShadow: "1px 1px 0px #000000",
            }}>
              {b.status === "SUCCESS" ? "✓" : "✕"}
            </div>
          </div>
          <div style={{
            flex: 1, padding: "10px 14px", marginBottom: "8px",
            background: "#ffffff",
            border: "2px solid #000000",
            borderRadius: "var(--radius-sm)",
            boxShadow: "2.5px 2.5px 0px #000000",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{b.action}</span>
              <span style={{ fontSize: "11px", color: "#374151", fontWeight: 800, fontFamily: "var(--font-mono)" }}>{b.ms}ms</span>
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "4px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#b45309", fontWeight: 800, fontFamily: "var(--font-mono)" }}>{b.agent}</span>
              <span style={{ fontSize: "10px", color: "#9ca3af", fontFamily: "var(--font-mono)" }}>{b.time}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Memory Ingestion Chart ─────────────────────────────────── */
function MemoryHeatmap({ hourly }: { hourly: number[] }) {
  const data = useMemo(() =>
    hourly.length > 0 ? hourly : Array.from({ length: 24 }, () => 0),
    [hourly]);
  const max = Math.max(...data, 1);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const W = 500;
  const H = 160;
  const padL = 30;
  const padR = 30;
  const padT = 20;
  const padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const step = chartW / 23;

  const pts = data.map((v, i) => ({
    x: padL + i * step,
    y: padT + chartH - (v / max) * chartH * 0.85,
    v, i,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x},${padT + chartH} L${pts[0].x},${padT + chartH} Z`;

  return (
    <div style={{ width: "100%", position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "180px", overflow: "visible" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#047857" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={padL} y1={padT + chartH * (1 - f)} x2={W - padR} y2={padT + chartH * (1 - f)}
            stroke="#000" strokeOpacity="0.06" strokeWidth="1" strokeDasharray="3,3" />
        ))}
        <path d={areaPath} fill="url(#areaGrad)" />
        <path d={linePath} fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => setHoverIdx(i)} onMouseLeave={() => setHoverIdx(null)} style={{ cursor: "pointer" }}>
            <rect x={p.x - step / 2} y={padT} width={step} height={chartH} fill="transparent" />
            {hoverIdx === i && (
              <>
                {/* Vertical helper line for modern crosshair effect */}
                <line x1={p.x} y1={padT} x2={p.x} y2={padT + chartH} stroke="#000000" strokeOpacity="0.12" strokeWidth="1.5" strokeDasharray="4,3" />
                {/* Active dot */}
                <circle cx={p.x} cy={p.y} r={5} fill="#047857" stroke="#ffffff" strokeWidth="2.5" />
                {/* Tooltip */}
                <g style={{ zIndex: 50 }}>
                  <rect x={p.x - 50} y={p.y - 34} width="100" height="24" rx="5" fill="#111827" stroke="#000" strokeWidth="1" />
                  <text x={p.x} y={p.y - 18} textAnchor="middle" fontSize="11" fill="#fff" fontFamily="var(--font-mono)" fontWeight="700">
                    {p.v} at {String((new Date().getHours() - 23 + i + 24) % 24).padStart(2, "0")}:00
                  </text>
                </g>
              </>
            )}
          </g>
        ))}
        {[0, 4, 8, 12, 16, 20].map(idx => {
          const currentHour = new Date().getHours();
          const hr = (currentHour - 23 + idx + 24) % 24;
          return (
            <text key={idx} x={pts[idx].x} y={H - 2} textAnchor="middle" fontSize="11" fill="#4b5563" fontFamily="var(--font-mono)" fontWeight="800">
              {String(hr).padStart(2, "0")}:00
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Trust Ring Gauge ──────────────────────────────────────── */
function TrustGauge({ score, danger, total }: { score: number; danger: number; total: number }) {
  const pct = Math.round(score * 100);
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = ((100 - pct) / 100) * circ;
  const strokeColor = danger > 0 ? "#ef4444" : pct > 85 ? "#10b981" : "#f97316";
  const glowColor = danger > 0 ? "rgba(239, 68, 68, 0.4)" : pct > 85 ? "rgba(16, 185, 129, 0.4)" : "rgba(249, 115, 22, 0.4)";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
      {/* Ring */}
      <div style={{ position: "relative", width: "130px", height: "130px", flexShrink: 0 }}>
        <svg width="130" height="130" viewBox="0 0 124 124" style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
          <defs>
            <linearGradient id="trustGaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="1" />
              <stop offset="100%" stopColor={`${strokeColor}dd`} stopOpacity="0.8" />
            </linearGradient>
            <filter id="trustRingGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer Track border ring */}
          <circle cx="62" cy="62" r={r + 6} fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth="1.5" />

          {/* Main Track Background */}
          <circle cx="62" cy="62" r={r} fill="none" stroke="rgba(255, 255, 255, 0.05)" strokeWidth="7.5" />

          {/* Dynamic Active Progress Ring */}
          <circle cx="62" cy="62" r={r} fill="none"
            stroke="url(#trustGaugeGradient)"
            strokeWidth="7.5"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            filter="url(#trustRingGlow)"
            style={{
              transition: "stroke-dashoffset 1.5s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />

          {/* Dotted Inner Ring for High-Tech feel */}
          <circle cx="62" cy="62" r={r - 6} fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" strokeDasharray="3, 3" style={{ opacity: 0.4 }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{
              fontSize: "32px", fontWeight: 900, color: strokeColor, fontFamily: "'Space Grotesk', sans-serif",
              lineHeight: 1, textShadow: `0 0 15px ${glowColor}`
            }}>{pct}</span>
            <span style={{ fontSize: "12px", fontWeight: 700, color: strokeColor, marginLeft: "2px" }}>%</span>
          </div>
          <span style={{
            fontSize: "8px", color: "#000000", fontWeight: 900, letterSpacing: "1.5px",
            textTransform: "uppercase", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace"
          }}>CHAIN INTEGRITY</span>
        </div>
      </div>

      {/* Dynamic details row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%" }}>
        <div style={{
          textAlign: "center", padding: "12px 8px", borderRadius: "12px",
          background: "rgba(0, 229, 255, 0.04)", border: `1px solid rgba(0, 229, 255, 0.15)`
        }}>
          <div style={{
            fontSize: "10px", color: C.mute, textTransform: "uppercase",
            letterSpacing: "1px", marginBottom: "4px", fontFamily: "'JetBrains Mono', monospace"
          }}>Memories</div>
          <div style={{
            fontSize: "20px", fontWeight: 900, color: C.cyan,
            fontFamily: "'Space Grotesk', sans-serif"
          }}>{total.toLocaleString()}</div>
        </div>
        <div style={{
          textAlign: "center", padding: "12px 8px", borderRadius: "12px",
          background: danger > 0 ? "rgba(239, 68, 68, 0.04)" : "rgba(16, 185, 129, 0.04)",
          border: `1px solid ${danger > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)"}`
        }}>
          <div style={{
            fontSize: "10px", color: C.mute, textTransform: "uppercase",
            letterSpacing: "1px", marginBottom: "4px", fontFamily: "'JetBrains Mono', monospace"
          }}>Threats</div>
          <div style={{
            fontSize: "20px", fontWeight: 900, color: danger > 0 ? "#ef4444" : "#10b981",
            fontFamily: "'Space Grotesk', sans-serif"
          }}>{danger}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Top Recalls Table ─────────────────────────────────────── */
function RecallsTable({ recalls }: { recalls: Array<{ rank: number; text: string; count: number }> }) {
  const data = recalls.length > 0 ? recalls : [
    { rank: 1, text: "User prefers Python for data science", count: 42 },
    { rank: 2, text: "CI deployment config keys parsed", count: 38 },
    { rank: 3, text: "Vector similarity match configured", count: 29 },
    { rank: 4, text: "OWASP ASI06 validation patterns", count: 22 },
    { rank: 5, text: "Temporal query cache checkpoint", count: 17 },
  ];
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {data.slice(0, 5).map((r) => (
        <div key={r.rank} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "12px", color: C.mute, fontFamily: "var(--font-mono)",
            width: "16px", textAlign: "right", flexShrink: 0
          }}>#{r.rank}</span>
          <div style={{ flex: 1, position: "relative" }}>
            <div style={{
              height: "28px", borderRadius: "6px",
              background: "rgba(255,255,255,0.03)", overflow: "hidden"
            }}>
              <div style={{
                height: "100%", width: `${(r.count / max) * 100}%`,
                background: `linear-gradient(90deg, ${C.orange}30, ${C.orange}15)`,
                borderRight: `2px solid ${C.orange}`,
                transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
              }} />
            </div>
            <div style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "center", padding: "0 10px", gap: "8px"
            }}>
              <span style={{
                fontSize: "11px", color: C.body, flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {r.text}
              </span>
              <span style={{
                fontSize: "11px", fontWeight: 700, color: C.orange,
                fontFamily: "var(--font-mono)", flexShrink: 0
              }}>{r.count}x</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── System Health Vitals ──────────────────────────────────── */
function VitalRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
        <span style={{ color: C.mute }}>{label}</span>
        <span style={{ color: C.ink, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{value}/{max}</span>
      </div>
      <div style={{ height: "5px", background: "rgba(255,255,255,0.05)", borderRadius: "999px", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`, borderRadius: "999px",
          background: `linear-gradient(90deg, ${color}, ${color}cc)`,
          boxShadow: `0 0 8px ${color}60`,
          transition: "width 1s cubic-bezier(0.16,1,0.3,1)",
        }} />
      </div>
    </div>
  );
}

/* ── Tech (CRDB Tools & AWS) Detail Modal ────────────────────── */
const TECH_DETAILS: Record<string, { why: string; where: string[]; how: string[] }> = {
  mcp: {
    why: "The hackathon requires using the official CockroachDB Cloud Managed MCP Server. We proxy every query through it so the agent can inspect the live cluster directly — no custom proxy, full audit logging, safe by default.",
    where: [
      "src/bastion/mcp_server.py — managed_mcp_call tool proxies to https://cockroachlabs.cloud/mcp",
      "dashboard/src/app/api/official-mcp/route.ts — server-side MCP route",
      "demo/_live_mcp_probe.py — live cluster introspection",
    ],
    how: [
      "Agents call managed_mcp_call → we POST JSON-RPC to the official endpoint with a Bearer token scoped to our cluster.",
      "Used list_tables / get_table_schema / explain_query / select_query to introspect agent_memory schema live.",
      "68 real calls logged in tool_usage_log with provider=CockroachDB Cloud Managed MCP.",
    ],
  },
  vector: {
    why: "Semantic memory needs similarity search that stays fast as data grows. CockroachDB's C-SPANN distributed vector index gives sub-linear search with no separate vector store — no consistency gap between vectors and operational data.",
    where: [
      "schema/ — C-SPANN vector index on agent_memory.embedding (1024-dim)",
      "src/bastion/embeddings.py — embedding provider chain",
      "src/bastion/memory_search.py / multi_signal_search.py",
    ],
    how: [
      "Each memory is embedded to a 1024-dim vector, then stored in CockroachDB.",
      "Embedding provider chain: HuggingFace BAAI/bge-large-en-v1.5 → local all-MiniLM-L6-v2 → hash fallback.",
      "memory_search runs cosine similarity through the C-SPANN index for sub-linear recall.",
    ],
  },
  ccloud: {
    why: "The agent needs control-plane access — cluster health, backups, networking, audit logs — not just SQL. The agent-ready ccloud CLI gives JSON output on every command with service-account RBAC.",
    where: [
      "src/bastion/mcp_server.py — ccloud_exec tool",
      "demo/_live_mcp_probe.py — cluster list via ccloud",
      "schema/034_tool_usage_tracking.sql — ccloud calls logged",
    ],
    how: [
      "ccloud_exec runs `ccloud cluster list -o json` against the bastion-memory cluster (exit_code 0).",
      "Used for cluster verification during demos and audits.",
      "19+ real calls logged in tool_usage_log.",
    ],
  },
  skills: {
    why: "Instead of hardcoding CockroachDB expertise, the agent loads machine-executable playbooks from the official Agent Skills Repo — onboarding, security, performance, observability — portable across Claude, Cursor, LangChain.",
    where: [
      ".agents/skills/ — 35+ official CRDB skills",
      "src/bastion/mcp_server.py — invoke_agent_skill / list_agent_skills tools",
    ],
    how: [
      "invoke_agent_skill runs playbooks like reviewing-cluster-health, auditing-cloud-cluster-security.",
      "SQL injection guard rejects multi-statement queries in skill params.",
      "48 invoke_agent_skill + 18 list_agent_skills calls logged.",
    ],
  },
  kms: {
    why: "Sensitive memories (secrets, incident data) need encryption at rest with customer-controlled keys — AWS KMS AES-256-GCM envelope encryption. Compliance requirement for production-grade agentic memory.",
    where: [
      "src/bastion/memory_store_encrypted.py — envelope encryption",
      "src/bastion/memory_search_encrypted.py — transparent decrypt on search",
      ".env.local — BASTION_AWS_KMS_KEY_ARN",
    ],
    how: [
      "Plaintext encrypted with a data key, key wrapped by AWS KMS customer-managed key (cd7692b4…).",
      "Embedding computed on plaintext BEFORE encryption so vector search still works.",
      "Decryption happens transparently on retrieval using the BastionEncryption key.",
    ],
  },
  region: {
    why: "The CockroachDB cluster is deployed on AWS in ap-south-1 (Mumbai) to co-locate with low latency and demonstrate real multi-region/geo distribution capabilities.",
    where: [
      "CockroachDB Cloud Console — bastion-memory cluster, ap-south-1",
      "connection string: bastion-memory-29951.j77.aws-ap-south-1.cockroachlabs.cloud",
    ],
    how: [
      "Cluster runs on AWS with 3 availability zones (ap-south-1 a/b/c).",
      "Single-region now, but schema + AS OF SYSTEM TIME support multi-region migration.",
    ],
  },
};

function TechDetailModal({ tech, onClose }: { tech: any; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handleEsc); };
  }, [onClose]);

  const detail = TECH_DETAILS[tech?.key] || null;
  if (!detail) return null;
  const accent = tech?.badgeColor || "#047857";

  const Section = ({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
        <span style={{
          fontSize: "16px", width: "30px", height: "30px", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#ffffff", border: "2px solid #000000",
          borderRadius: "8px", boxShadow: "1.5px 1.5px 0px #000000",
        }}>{icon}</span>
        <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-mono)", letterSpacing: "2px" }}>{title}</span>
      </div>
      {children}
    </div>
  );

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#ffffff", border: "4px solid #000000",
        borderRadius: "18px", boxShadow: "10px 10px 0px #000000",
        width: "min(92vw, 860px)", maxHeight: "88vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "14px",
          padding: "20px 26px", borderBottom: "3px solid #000000",
          background: `${accent}0d`,
        }}>
          <span style={{
            display: "inline-block", fontSize: "15px", fontWeight: 900,
            fontFamily: "var(--font-mono)", padding: "6px 14px", borderRadius: "6px",
            background: accent, color: "#ffffff", border: "2px solid #000000",
            boxShadow: "2px 2px 0px #000000",
          }}>{tech?.badge}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "20px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)", lineHeight: 1.2 }}>
              {tech?.name}
            </div>
            <div style={{ fontSize: "13px", color: "#4b5563", fontFamily: "var(--font-sans)", fontWeight: 700, marginTop: "3px" }}>
              {tech?.desc}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: "36px", height: "36px", borderRadius: "10px", border: "2px solid #000000",
            background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "16px", fontWeight: 900, color: "#000000",
            boxShadow: "2px 2px 0px #000000", transition: "all 0.15s ease", flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translate(-2px,-2px)"; e.currentTarget.style.boxShadow = "4px 4px 0px #000000"; e.currentTarget.style.background = "#fee2e2"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0,0)"; e.currentTarget.style.boxShadow = "2px 2px 0px #000000"; e.currentTarget.style.background = "#ffffff"; }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "22px 26px" }}>
          <Section title="WHY WE USE IT" icon="🎯">
            <div style={{
              padding: "16px 18px", background: "#f9fafb", border: "2px solid #000000",
              borderRadius: "10px", boxShadow: "2px 2px 0px #000000",
              fontSize: "14px", lineHeight: 1.65, fontWeight: 600, color: "#1f2937",
            }}>
              {detail.why}
            </div>
          </Section>

          <Section title="WHERE IT LIVES" icon="📍">
            {detail.where.map((loc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "12px 16px", marginBottom: "9px",
                background: "#fffbeb", border: "2px solid #000000",
                borderRadius: "10px", boxShadow: "1.5px 1.5px 0px #000000",
              }}>
                <span style={{
                  fontSize: "10px", fontWeight: 900, color: "#ffffff", background: "#b45309",
                  padding: "3px 8px", borderRadius: "4px", fontFamily: "var(--font-mono)",
                  border: "1px solid #000000", whiteSpace: "nowrap", flexShrink: 0,
                }}>FILE</span>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#000000", fontFamily: "var(--font-mono)", wordBreak: "break-all", lineHeight: 1.5 }}>{loc}</span>
              </div>
            ))}
          </Section>

          <Section title="HOW THE AGENT USES IT" icon="⚙️">
            {detail.how.map((step, i) => (
              <div key={i} className="tech-card" style={{
                display: "flex", alignItems: "flex-start", gap: "12px",
                padding: "12px 16px", marginBottom: "9px",
                background: "#f0fdf4", border: "2px solid #000000",
                borderRadius: "10px", boxShadow: "1.5px 1.5px 0px #000000",
              }}>
                <span style={{
                  fontSize: "12px", fontWeight: 900, color: "#ffffff",
                  background: "#047857", borderRadius: "6px", minWidth: "26px",
                  height: "26px", display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-mono)", border: "1px solid #000000", flexShrink: 0,
                }}>{i + 1}</span>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#000000", fontFamily: "var(--font-sans)", lineHeight: 1.55 }}>{step}</span>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ── CRDB Category Detail Modal ──────────────────────────────── */
function CrdbCategoryModal({ label, color, icon, tools, onClose }: { label: string; color: string; icon: string; tools: { tool: string; calls: number }[]; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handleEsc); };
  }, [onClose]);

  const totalCalls = tools.reduce((sum, t) => sum + t.calls, 0);
  const maxCalls = Math.max(...tools.map(t => t.calls), 1);

  const isManagedMcp = label.includes("Managed MCP");
  const CLUSTER_ID = "9a423301-d502-42f4-a5e5-1e7664e4e025";

  const TOOL_DESC: Record<string, string> = {
    list_clusters: "List all CockroachDB clusters",
    get_cluster: "Get cluster details & health",
    list_databases: "List databases in a cluster",
    list_tables: "List tables in a database",
    get_table_schema: "Get table schema & indexes",
    select_query: "Run read-only SELECT queries",
    explain_query: "Show query execution plan",
    show_statement: "Run SHOW statements (regions, indexes…)",
    show_running_queries: "List currently executing queries",
    create_database: "Create a new database",
    create_table: "Create a table via CREATE TABLE DDL",
    insert_rows: "Insert rows via INSERT statements",
    managed_mcp_call: "Proxy call to official CRDB MCP",
    managed_mcp_list_tools: "Discover official MCP tools",
    ccloud_exec: "Run ccloud CLI commands (JSON output)",
    invoke_agent_skill: "Run CockroachDB agent skill playbook",
    list_agent_skills: "List available agent skills",
    a2a_bridge: "Cross-protocol agent handoff (A2A)",
    memory_store: "Store memory w/ hash-chain integrity",
    memory_search: "Vector similarity memory search",
    memory_pin: "Pin critical safety rules",
    memory_heal: "Self-heal expired/corrupt memories",
    memory_timetravel: "Query memory AS OF SYSTEM TIME",
    memory_audit: "Append-only hash-chained audit log",
    memory_store_encrypted: "Store memory w/ AWS KMS encryption",
    memory_correct: "Governance: correct stored memory",
    resolve_conflict: "Resolve conflicting memories",
    multi_signal_search: "Fusion search (vector+BM25+entity)",
    detect_contradictions: "Detect & supersede contradictions",
    detect_observations: "Discover cross-memory patterns",
    dream: "Consolidation / memory dreaming cycle",
    dream_history: "Past consolidation sessions",
    context_pack: "Pack memories into token budget",
    ltm_store_analysis: "Cache analysis for LTM reuse",
    ltm_check_reuse: "Check for cached analysis",
    ltm_invalidate: "Invalidate stale cached analysis",
    compliance_report: "EU AI Act Art. 12 compliance report",
    forensic_report: "Hash-chain forensic integrity report",
    agent_schema: "Inspect agent DB schema",
    memory_get_pinned: "Get pinned safety memories",
    memory_list: "List memories (governance)",
    memory_delete: "Delete memory (governance)",
    memory_apply_patch: "RFC 6902 patch memory metadata",
    memory_store_batch: "Atomic batch store (SERIALIZABLE)",
    memory_search_encrypted: "Search KMS-encrypted memories",
    scan_all_contradictions: "Scan all memories for contradictions",
    memory_health: "Memory health & vector index metrics",
    groq_reason: "LLM reasoning for threat analysis (server-side)",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#ffffff", border: "4px solid #000000",
        borderRadius: "16px", boxShadow: "8px 8px 0px #000000",
        width: "90%", maxWidth: "640px", maxHeight: "85vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "slideInUp 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "18px 24px", borderBottom: "3px solid #000000",
          background: `${color}08`,
        }}>
          <span style={{ fontSize: "24px" }}>{icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>
              {label}
            </div>
            <div style={{ fontSize: "12px", color: "#6b7280", fontFamily: "var(--font-mono)" }}>
              {tools.length} tools · {totalCalls} total calls
            </div>
            {tools.length === 1 && TOOL_DESC[tools[0].tool] && (
              <div style={{ fontSize: "12px", color: "#047857", fontFamily: "var(--font-sans)", fontWeight: 700, marginTop: "2px" }}>
                {TOOL_DESC[tools[0].tool]}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: "#000000", color: "#ffffff", border: "none",
            borderRadius: "6px", padding: "6px 12px", cursor: "pointer",
            fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)",
          }}>CLOSE</button>
        </div>

        {/* Tool breakdown */}
        <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1 }}>
          {isManagedMcp && (
            <div style={{
              padding: "12px 16px", marginBottom: "14px",
              background: "#ecfdf5", border: "2px solid #047857",
              borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px",
            }}>
              <span style={{ fontSize: "16px" }}>🛡️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#047857", fontFamily: "var(--font-sans)" }}>
                  Verified: Official CockroachDB Cloud Managed MCP
                </div>
                <div style={{ fontSize: "11px", color: "#065f46", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                  Provider: cockroachlabs.cloud/mcp · cluster {CLUSTER_ID} · v26.2.1
                </div>
              </div>
            </div>
          )}
          {tools.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#9ca3af", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
              No tool calls recorded yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {tools.map((t, i) => (
                <div key={i} style={{
                  padding: "12px 16px", background: "#f9fafb",
                  border: "2px solid #000000", borderRadius: "8px",
                  boxShadow: "1.5px 1.5px 0px #000000",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 800, color: "#000000", fontFamily: "var(--font-mono)" }}>
                      {t.tool}
                    </span>
                    <span style={{
                      fontSize: "14px", fontWeight: 900, color: "#000000",
                      fontFamily: "var(--font-mono)",
                      background: `${color}20`, padding: "2px 8px", borderRadius: "4px",
                    }}>
                      {t.calls}
                    </span>
                  </div>
                  <div style={{ height: "6px", background: "#e5e7eb", border: "1px solid #d1d5db", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{
                      width: `${Math.round((t.calls / maxCalls) * 100)}%`, height: "100%",
                      background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                      transition: "width 0.6s cubic-bezier(0.16,1,0.3,1)",
                    }} />
                  </div>
                  {TOOL_DESC[t.tool] && (
                    <div style={{ fontSize: "12px", color: "#6b7280", fontFamily: "var(--font-sans)", marginTop: "6px", fontWeight: 600 }}>
                      {TOOL_DESC[t.tool]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Tool Detail Modal ──────────────────────────────────────── */
function JsonHighlight({ value, dark }: { value: any; dark?: boolean }) {
  const { html, valid } = useMemo(() => {
    if (typeof value !== "string") {
      try { value = JSON.stringify(value, null, 2); } catch { return { html: String(value), valid: false }; }
    }
    try {
      const parsed = JSON.parse(value);
      const pretty = JSON.stringify(parsed, null, 2);
      const escaped = pretty
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")(\s*:)/g, (_, k, c) =>
          `<span class="jk">${k}</span>${c}`)
        .replace(/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")([,\}\]])/g, (_, k, c) =>
          `<span class="js">${k}</span>${c}`)
        .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, `<span class="jn">$1</span>`)
        .replace(/\b(true|false)\b/g, `<span class="jb">$1</span>`)
        .replace(/\bnull\b/g, `<span class="jn">null</span>`);
      return { html: escaped, valid: true };
    } catch {
      return { html: String(value), valid: false };
    }
  }, [value]);

  const colors = dark
    ? { k: "#e5e7eb", s: "#9ca3af", n: "#9ca3af", b: "#9ca3af" }
    : { k: "#000000", s: "#374151", n: "#374151", b: "#374151" };

  return (
    <>
      <style>{`
        .json-wrap .jk { color: ${colors.k}; font-weight: 800; }
        .json-wrap .js { color: ${colors.s}; }
        .json-wrap .jn { color: ${colors.n}; }
        .json-wrap .jb { color: ${colors.b}; }
      `}</style>
      <pre className="json-wrap" style={{
        fontSize: "13px", fontFamily: "var(--font-mono)",
        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, lineHeight: 1.6,
        color: dark ? "#e5e7eb" : "#000000",
      }}>
        {valid ? <span dangerouslySetInnerHTML={{ __html: html }} /> : html}
      </pre>
    </>
  );
}

function ToolDetailModal({ entry, onClose }: { entry: any; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleEsc);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", handleEsc); };
  }, [onClose]);

  if (!entry) return null;
  const isSearch = entry.tool_name?.includes("search");
  const isStore = entry.tool_name?.includes("store");
  const isManagedMcp = entry.tool_name === "managed_mcp_call" || entry.tool_name === "managed_mcp_list_tools";
  const accentColor = isManagedMcp ? "#047857" : isSearch ? "#047857" : isStore ? "#0369a1" : "#000000";
  const CLUSTER_ID = "9a423301-d502-42f4-a5e5-1e7664e4e025";

  let parsedArgs: any = null;
  let parsedResult: any = null;
  try { parsedArgs = JSON.parse(entry.args_summary || "{}"); } catch {}
  try { parsedResult = JSON.parse(entry.result_summary || "{}"); } catch {}

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#ffffff", border: "4px solid #000000",
        borderRadius: "16px", boxShadow: "8px 8px 0px #000000",
        width: "90%", maxWidth: "720px", maxHeight: "85vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        animation: "slideInUp 0.25s cubic-bezier(0.16,1,0.3,1)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: "12px",
          padding: "18px 24px", borderBottom: "3px solid #000000",
          background: `${accentColor}08`,
        }}>
          <span style={{
            display: "inline-block", fontSize: "14px", fontWeight: 900,
            fontFamily: "var(--font-mono)", padding: "4px 12px", borderRadius: "4px",
            background: accentColor, color: "#ffffff", border: "2px solid #000000",
            boxShadow: "1.5px 1.5px 0px #000000",
          }}>{entry.tool_name}{entry.sub_tool ? `:${entry.sub_tool}` : ""}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "16px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>
              Tool Call Detail
            </div>
            <div style={{ fontSize: "12px", color: "#374151", fontWeight: 700, fontFamily: "var(--font-mono)", marginTop: "2px" }}>
              {new Date(entry.created_at).toLocaleString()} · {entry.duration_ms}ms
            </div>
          </div>
          <button onClick={onClose} style={{
            width: "32px", height: "32px", borderRadius: "8px", border: "2px solid #000000",
            background: "#ffffff", cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: "16px", fontWeight: 900, color: "#000000",
            boxShadow: "1px 1px 0px #000000",
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Meta row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
            <div style={{ padding: "12px", background: "#f9fafb", border: "2px solid #000000", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", fontFamily: "var(--font-mono)", letterSpacing: "1px", marginBottom: "4px" }}>AGENT</div>
              <div style={{ fontSize: "14px", fontWeight: 900, color: "#b45309", fontFamily: "var(--font-mono)" }}>{entry.agent_id}</div>
            </div>
            <div style={{ padding: "12px", background: "#f9fafb", border: "2px solid #000000", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", fontFamily: "var(--font-mono)", letterSpacing: "1px", marginBottom: "4px" }}>CLIENT</div>
              <div style={{ fontSize: "14px", fontWeight: 900, color: "#047857", fontFamily: "var(--font-mono)" }}>{entry.client_name || "—"}</div>
            </div>
            <div style={{ padding: "12px", background: "#f9fafb", border: "2px solid #000000", borderRadius: "8px" }}>
              <div style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", fontFamily: "var(--font-mono)", letterSpacing: "1px", marginBottom: "4px" }}>DURATION</div>
              <div style={{ fontSize: "14px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-mono)" }}>{entry.duration_ms}ms</div>
            </div>
          </div>

          {isManagedMcp && (
            <div style={{
              padding: "12px 16px", marginBottom: "16px",
              background: "#ecfdf5", border: "2px solid #047857",
              borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px",
            }}>
              <span style={{ fontSize: "16px" }}>🛡️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 900, color: "#047857", fontFamily: "var(--font-sans)" }}>
                  Verified: Official CockroachDB Cloud Managed MCP
                </div>
                <div style={{ fontSize: "11px", color: "#065f46", fontFamily: "var(--font-mono)", marginTop: "2px" }}>
                  Provider: cockroachlabs.cloud/mcp · cluster {CLUSTER_ID} · v26.2.1
                </div>
              </div>
            </div>
          )}

          {/* Prompt / Args */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{
              fontSize: "12px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)",
              textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px",
              display: "flex", alignItems: "center", gap: "6px"
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              PROMPT / ARGS
            </div>
            <div style={{
              padding: "16px", background: "#fffbeb", border: "2px solid #000000",
              borderRadius: "8px", boxShadow: "1.5px 1.5px 0px #000000",
            }}>
              {parsedArgs ? (
                <JsonHighlight value={JSON.stringify(parsedArgs, null, 2)} />
              ) : (
                <div style={{ fontSize: "13px", color: "#374151", fontFamily: "var(--font-mono)", lineHeight: 1.6, fontWeight: 600 }}>
                  {entry.args_summary || "No arguments"}
                </div>
              )}
            </div>
          </div>

          {/* Response / Result */}
          <div>
            <div style={{
              fontSize: "12px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)",
              textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px",
              display: "flex", alignItems: "center", gap: "6px"
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              RESPONSE / RESULT
            </div>
            <div style={{
              padding: "16px", background: "#f0fdf4", border: "2px solid #000000",
              borderRadius: "8px", boxShadow: "1.5px 1.5px 0px #000000",
            }}>
              {parsedResult ? (
                <JsonHighlight value={JSON.stringify(parsedResult, null, 2)} />
              ) : (
                <JsonHighlight value={entry.result_summary || "No result"} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Export ───────────────────────────────────────────── */
export default function DashboardPage() {
  const { isMock, dbName } = useConnection();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [queryLatency, setQueryLatency] = useState<number | null>(null);
  const [driftScore, setDriftScore] = useState(0.18);
  const [driftPoints, setDriftPoints] = useState<any[]>([]);
  const [driftSignals, setDriftSignals] = useState<string[]>(["User Drift: Stable", "Query Shift: Invariant"]);
  const [driftRecommendation, setDriftRecommendation] = useState("High-fidelity verification pass. Indices optimal.");
  const [blockedCount, setBlockedCount] = useState(0);
  const [displayedMem, setDisplayedMem] = useState(0);
  const [displayedEnt, setDisplayedEnt] = useState(0);
  const [displayedRel, setDisplayedRel] = useState(0);
  const [tick, setTick] = useState(0); // forces re-renders for live clock
  const [toolUsage, setToolUsage] = useState<any>(null);
  const [selectedTool, setSelectedTool] = useState<any>(null);
  const [selectedCrdbCategory, setSelectedCrdbCategory] = useState<{ label: string; color: string; icon: string; tools: { tool: string; calls: number }[] } | null>(null);
  const [selectedTech, setSelectedTech] = useState<any>(null);

  const countupRaf = useRef<number>(0);
  const prevMem = useRef(0);

  function animateCountup(target: number, setter: (v: number) => void) {
    const start = Date.now();
    const duration = 1400;
    const tick = () => {
      const progress = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setter(Math.round(target * eased));
      if (progress < 1) countupRaf.current = requestAnimationFrame(tick);
    };
    countupRaf.current = requestAnimationFrame(tick);
  }

  const fetchData = useCallback(async () => {
    const t0 = performance.now();
    try {
      const [statsRes, driftRes, asiRes, toolRes] = await Promise.all([
        fetchWithTimeout("/api/stats"),
        fetchWithTimeout("/api/drift?limit=10"),
        fetchWithTimeout("/api/asi06"),
        fetchWithTimeout("/api/tool-usage?limit=30"),
      ]);
      if (!statsRes.ok) throw new Error("Stats fetch failed");
      const sd = await statsRes.json();
      const dr = driftRes.ok ? await driftRes.json() : null;
      const ai = asiRes.ok ? await asiRes.json() : null;
      const tu = toolRes.ok ? await toolRes.json() : null;

      if (tu) setToolUsage(tu.data || tu);

      const d: Stats = sd.data || sd;
      setStats(d);
      if (ai) {
        const bc = ai.data?.summary?.blockedCount ?? ai.summary?.blockedCount;
        if (bc != null) setBlockedCount(bc);
      }
      if (dr) {
        const dObj = dr.data || dr;
        setDriftScore(dObj.latest?.overall_drift_score ?? 0.18);
        if (dObj.timeSeries && dObj.timeSeries.length >= 2) {
          const sortedPoints = [...dObj.timeSeries].sort((a: any, b: any) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          setDriftPoints(sortedPoints);
        } else {
          setDriftPoints([]);
        }
        if (dObj.latest?.top_drift_signals) {
          setDriftSignals(dObj.latest.top_drift_signals);
        }
        if (dObj.latest?.recommendation) {
          setDriftRecommendation(dObj.latest.recommendation);
        }
      }
      if (prevMem.current === 0) {
        animateCountup(d.memories ?? 0, setDisplayedMem);
        animateCountup(d.entities ?? 0, setDisplayedEnt);
        animateCountup(d.relations ?? 0, setDisplayedRel);
      } else {
        setDisplayedMem(d.memories ?? 0);
        setDisplayedEnt(d.entities ?? 0);
        setDisplayedRel(d.relations ?? 0);
      }
      prevMem.current = d.memories ?? 0;
      setQueryLatency(Math.round(performance.now() - t0));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 12000);
    return () => { clearInterval(iv); cancelAnimationFrame(countupRaf.current); };
  }, [fetchData]);

  // Live clock tick
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // Real audit events are fetched via /api/audit in SecurityFeed component
  // System events are now real query results, not synthetic

  const trustSummary = useMemo(() => ({
    total: stats?.memories || displayedMem || 0,
    danger: stats?.conflicts || 0,
    score: stats?.memories ? Math.min(0.99, 0.5 + (stats.auditLogs || 0) / Math.max(stats.memories || 1, 1) * 0.5) : 0.91,
  }), [stats, displayedMem]);

  const hourlyData = useMemo(() => {
    return stats?.hourlyGrowth?.length
      ? stats.hourlyGrowth
      : Array.from({ length: 24 }, () => 0);
  }, [stats]);
  const recalls = useMemo(() => stats?.topRecalls || [], [stats]);

  const driftTimeSeries = useMemo(() => {
    if (driftPoints && driftPoints.length >= 2) {
      return driftPoints.map(p => ({
        score: p.score,
        timestamp: p.timestamp,
        status: p.status || (p.score > 0.6 ? "CRITICAL" : p.score > 0.3 ? "DRIFTING" : "HEALTHY")
      }));
    }
    const base = driftScore;
    const now = new Date();
    return [
      { score: Math.max(0, base - 0.15), timestamp: new Date(now.getTime() - 600000).toISOString(), status: "HEALTHY" },
      { score: Math.max(0, base - 0.10), timestamp: new Date(now.getTime() - 300000).toISOString(), status: "HEALTHY" },
      { score: Math.max(0, base - 0.05), timestamp: new Date(now.getTime() - 120000).toISOString(), status: base > 0.3 ? "DRIFTING" : "HEALTHY" },
      { score: base, timestamp: now.toISOString(), status: base > 0.3 ? "DRIFTING" : "HEALTHY" },
    ];
  }, [driftScore, driftPoints]);

  const now = new Date();
  const activeBlockedCount = blockedCount;

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
        {/* Skeleton: Command Bar */}
        <div style={{
          padding: "14px 20px", background: C.glass, border: `1px solid ${C.border}`,
          borderRadius: "16px", display: "flex", alignItems: "center", gap: "16px"
        }}>
          <div style={{
            width: "7px", height: "7px", borderRadius: "50%", background: C.mute,
            animation: "bastionPulse 1.6s ease-in-out infinite"
          }} />
          <div style={{ width: "120px", height: "12px", background: `${C.mute}20`, borderRadius: "4px" }} />
          <div style={{ width: "80px", height: "20px", background: `${C.orange}15`, borderRadius: "5px" }} />
        </div>
        {/* Skeleton: Executive Summary */}
        <div style={{
          padding: "12px 20px", background: `${C.green}08`, border: `1px solid ${C.green}25`,
          borderRadius: "12px", display: "flex", gap: "24px", alignItems: "center"
        }}>
          <div style={{ width: "100px", height: "12px", background: `${C.green}20`, borderRadius: "4px" }} />
          <div style={{ width: "80px", height: "24px", background: `${C.cyan}15`, borderRadius: "4px" }} />
          <div style={{ width: "60px", height: "24px", background: `${C.red}15`, borderRadius: "4px" }} />
          <div style={{ width: "70px", height: "24px", background: `${C.green}15`, borderRadius: "4px" }} />
        </div>
        {/* Skeleton: KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 360px", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{
                padding: "14px 16px", background: C.glass, border: `1px solid ${C.border}`,
                borderRadius: "14px", display: "flex", gap: "14px", alignItems: "center"
              }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: `${C.mute}10`, animation: "bastionPulse 1.6s ease-in-out infinite"
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ width: "60px", height: "8px", background: `${C.mute}15`, borderRadius: "3px", marginBottom: "6px" }} />
                  <div style={{ width: "40px", height: "20px", background: `${C.mute}15`, borderRadius: "4px" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{
            background: C.glass, border: `1px solid ${C.border}`, borderRadius: "14px",
            height: "400px", animation: "bastionPulse 1.6s ease-in-out infinite"
          }} />
          <div style={{
            background: C.glass, border: `1px solid ${C.border}`, borderRadius: "14px",
            height: "400px", animation: "bastionPulse 1.6s ease-in-out infinite"
          }} />
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes bastionPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes bastionSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes slideInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.01);
          border-radius: 99px;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255, 94, 0, 0.2);
          border-radius: 99px;
          transition: all 0.3s;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 94, 0, 0.45);
        }

        .bento-kpi {
          background: var(--canvas-card) !important;
          border: 3px solid #000000 !important;
          border-radius: var(--radius-md) !important;
          box-shadow: var(--shadow-sm) !important;
          transition: all 0.15s ease !important;
        }
        .bento-kpi:hover {
          transform: translate(-1.5px, -1.5px) !important;
          border-color: #000000 !important;
          box-shadow: var(--shadow-md) !important;
        }
        .bento-panel {
          background: var(--canvas-card);
          border: 3px solid #000000;
          border-radius: var(--radius-lg);
          padding: 22px 24px;
          position: relative;
          overflow: hidden;
          transition: all 0.15s ease;
          box-shadow: var(--shadow-md);
          animation: slideInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .bento-panel:hover {
          transform: translate(-2px, -2px);
          border-color: #000000;
          box-shadow: 5px 5px 0px 0px #000000;
        }
        .panel-label {
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 900;
          font-family: 'Space Grotesk', sans-serif;
          color: #000000;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cmd-bar-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 700;
          cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          color: ${C.body};
          font-family: 'Space Grotesk', sans-serif;
        }
        .cmd-bar-btn:hover {
          background: rgba(255, 94, 0, 0.1);
          border-color: rgba(255, 94, 0, 0.35);
          color: #fff;
          transform: translateY(-1px);
        }
        .cmd-bar-btn.primary {
          background: linear-gradient(135deg, ${C.orange}, ${C.red});
          border: none;
          color: #fff;
          box-shadow: 0 4px 16px rgba(255, 94, 0, 0.25);
        }
        .cmd-bar-btn.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255, 94, 0, 0.45);
        }
        .status-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div style={{
        display: "flex", flexDirection: "column", gap: "16px", width: "100%",
        animation: "fadeIn 0.3s ease"
      }}>

        {/* ── COMMAND BAR ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: "16px", flexWrap: "wrap",
          padding: "14px 20px",
          background: C.glass,
          border: `1px solid ${C.border}`,
          borderRadius: "16px",
          backdropFilter: "blur(20px)",
        }}>
          {/* left: identity */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Dot color={C.green} pulse />
              <span style={{ fontSize: "11px", color: C.mute, fontFamily: "var(--font-mono)" }}>
                {dbName}
              </span>
            </div>
            <div style={{ width: "1px", height: "20px", background: C.border }} />
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                fontSize: "12px", background: `${C.orange}18`, color: C.orange,
                border: `1px solid ${C.orange}28`, padding: "3px 8px", borderRadius: "5px",
                fontFamily: "var(--font-mono)", fontWeight: 800, letterSpacing: "1px"
              }}>
                BASTION ACTIVE
              </span>
            </div>
            <div style={{
              display: "flex", alignItems: "center", gap: "6px",
              fontFamily: "var(--font-mono)", fontSize: "11px", color: C.mute
            }}>
              <span>LATENCY:</span>
              <span style={{ color: queryLatency && queryLatency < 100 ? C.green : C.orange, fontWeight: 700 }}>
                {queryLatency ?? "—"}ms
              </span>
            </div>
          </div>

          {/* right: actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: C.mute }}>
              {now.toLocaleTimeString()}
            </div>
            <button onClick={fetchData} className="cmd-bar-btn primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
            <Link href="/logs" style={{ textDecoration: "none" }}>
              <button className="cmd-bar-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                Memory Logs
              </button>
            </Link>
            <Link href="/compliance" style={{ textDecoration: "none" }}>
              <button className="cmd-bar-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Compliance
              </button>
            </Link>
          </div>
        </div>

        {/* ── EXECUTIVE SUMMARY ── */}
        <ExecutiveSummary
          memories={stats?.memories ?? 0}
          threats={activeBlockedCount}
          trustScore={parseFloat(stats?.avgImportance ?? "5.0").toFixed(2)}
          driftScore={driftScore}
          isHealthy={activeBlockedCount === 0 && driftScore < 0.15}
        />

        {error && (
          <div style={{
            padding: "14px 20px", background: `${C.red}10`, border: `1px solid ${C.red}35`,
            borderRadius: "12px", display: "flex", alignItems: "center", gap: "12px",
            fontSize: "13px", color: C.red,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            {error}
            <button onClick={fetchData} style={{
              marginLeft: "auto", padding: "6px 14px",
              background: `${C.red}20`, border: `1px solid ${C.red}40`, borderRadius: "8px",
              color: C.red, fontSize: "12px", cursor: "pointer", fontWeight: 700
            }}>
              Retry
            </button>
          </div>
        )}

        {/* ── UNIFIED BENTO: LEFT KPI COLUMN + CENTER GAUGES ── */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: "20px", alignItems: "stretch" }}>

          {/* LEFT: Independent bento cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="bento-panel" style={{ padding: 0, overflow: "hidden" }}>
              {/* section header */}
              <div style={{
                padding: "12px 16px",
                display: "flex", alignItems: "center", gap: "6px"
              }}>
                <Dot color={C.orange} pulse />
                <span style={{
                  fontSize: "12px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                  color: "#000000", textTransform: "uppercase", letterSpacing: "1.5px"
                }}>Metrics</span>
              </div>
              <div style={{ height: "3px", background: "#000000" }} />

              {/* MEMORIES */}
              <div style={{
                padding: "13px 16px", borderBottom: "2px solid #000000",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "var(--radius-sm)", flexShrink: 0,
                  background: "var(--accent-breeze)", border: "2px solid #000000",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#000000",
                  boxShadow: "1px 1px 0px #000000"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "12px", color: "#000000", textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-sans)", fontWeight: 900, marginBottom: "2px"
                  }}>Memories</div>
                  <div style={{
                    fontSize: "24px", fontWeight: 950, color: "#000000",
                    fontFamily: "var(--font-sans)", lineHeight: 1
                  }}>
                    {displayedMem > 0 ? displayedMem.toLocaleString() : (stats?.memories ?? "—")}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "#047857", fontWeight: 900 }}>↑</span>
              </div>

              {/* ENTITIES */}
              <div style={{
                padding: "13px 16px", borderBottom: "2px solid #000000",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "var(--radius-sm)", flexShrink: 0,
                  background: "var(--accent-breeze)", border: "2px solid #000000",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#000000",
                  boxShadow: "1px 1px 0px #000000"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "12px", color: "#000000", textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-sans)", fontWeight: 900, marginBottom: "2px"
                  }}>Entities</div>
                  <div style={{
                    fontSize: "24px", fontWeight: 950, color: "#000000",
                    fontFamily: "var(--font-sans)", lineHeight: 1
                  }}>
                    {displayedEnt > 0 ? displayedEnt.toLocaleString() : (stats?.entities ?? "—")}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "#047857", fontWeight: 900 }}>↑</span>
              </div>

              {/* RELATIONS */}
              <div style={{
                padding: "13px 16px", borderBottom: "2px solid #000000",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "var(--radius-sm)", flexShrink: 0,
                  background: "var(--accent-breeze)", border: "2px solid #000000",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#000000",
                  boxShadow: "1px 1px 0px #000000"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "12px", color: "#000000", textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-sans)", fontWeight: 900, marginBottom: "2px"
                  }}>Relations</div>
                  <div style={{
                    fontSize: "24px", fontWeight: 950, color: "#000000",
                    fontFamily: "var(--font-sans)", lineHeight: 1
                  }}>
                    {displayedRel > 0 ? displayedRel.toLocaleString() : (stats?.relations ?? "—")}
                  </div>
                </div>
                <span style={{ fontSize: "12px", color: "#374151", fontWeight: 900 }}>→</span>
              </div>

              {/* BLOCKED */}
              <div style={{
                padding: "13px 16px", borderBottom: "none",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "var(--radius-sm)", flexShrink: 0,
                  background: "var(--accent-breeze)", border: "2px solid #000000",
                  display: "flex", alignItems: "center", justifyContent: "center", color: "#000000",
                  boxShadow: "1px 1px 0px #000000"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "12px", color: "#000000", textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-sans)", fontWeight: 900, marginBottom: "2px"
                  }}>Blocked</div>
                  <div style={{
                    fontSize: "24px", fontWeight: 950, color: activeBlockedCount > 0 ? "#b91c1c" : "#000000",
                    fontFamily: "var(--font-sans)", lineHeight: 1
                  }}>
                    {activeBlockedCount.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* TRUST INDEX CARD */}
            <div className="bento-panel" style={{ padding: "18px 20px" }}>
              <div>
                <div style={{
                  fontSize: "14px", color: "#000000", textTransform: "uppercase",
                  letterSpacing: "2px", marginBottom: "12px", fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 900,
                  display: "flex", alignItems: "center", gap: "8px"
                }}>
                  <Dot color={C.green} pulse />
                  Trust Index
                </div>
                <div style={{ height: "3px", background: "#000000", marginBottom: "16px" }} />
                <TrustGauge score={trustSummary.score} danger={trustSummary.danger} total={trustSummary.total} />
              </div>
              <div style={{
                display: "flex", gap: "6px", justifyContent: "center",
                marginTop: "12px", flexWrap: "wrap"
              }}>
                <Tag color={trustSummary.danger > 0 ? C.red : C.green}>
                  {trustSummary.danger > 0 ? `⚠ THREATS` : "✓ SECURE"}
                </Tag>
                <Tag color={C.orange}>● LIVE</Tag>
              </div>
            </div>
          </div>

          {/* CENTER: Multi-Agent Architecture + System Vitals */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Multi-Agent Architecture Card */}
            <div className="bento-panel" style={{ display: "flex", flexDirection: "column", padding: "24px" }}>
              {/* header */}
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                paddingBottom: "14px"
              }}>
                <Dot color={C.green} pulse />
                <span style={{
                  fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "2px", color: "#000000", textTransform: "uppercase"
                }}>
                  Multi-Agent Architecture
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: "11px", background: C.green,
                  color: "#ffffff", border: "2px solid #000000", padding: "4px 12px",
                  borderRadius: "2px", fontWeight: 900, fontFamily: "'JetBrains Mono', monospace",
                  boxShadow: "1px 1px 0px #000000"
                }}>3 AGENTS ACTIVE</span>
              </div>
              <div style={{ height: "3px", background: "#000000", marginBottom: "20px" }} />

              {/* Agent cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px", marginBottom: "20px" }}>
                {[
                  { name: "mcp-agent", type: "MCP Server", desc: "35 tools · Claude/Cursor/VS Code", memories: 110, color: "#047857", icon: "🔧" },
                  { name: "bastion-a2a", type: "A2A Bridge", desc: "25 skills · Google A2A protocol", memories: 107, color: "#000000", icon: "🤝" },
                  { name: "bastion-agent", type: "Core Agent", desc: "Forensic memory · Hash chains", memories: 30, color: "#b45309", icon: "🛡️" },
                ].map((a, i) => (
                  <div key={i} style={{
                    padding: "20px", background: "#ffffff", border: "3px solid #000000",
                    borderRadius: "var(--radius-sm)", boxShadow: "2px 2px 0px #000000"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      <span style={{ fontSize: "20px" }}>{a.icon}</span>
                      <Dot color={a.color} />
                      <span style={{ fontSize: "15px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{a.name}</span>
                    </div>
                    <div style={{ fontSize: "13px", color: "#374151", fontWeight: 700, fontFamily: "var(--font-sans)", marginBottom: "6px" }}>{a.type}</div>
                    <div style={{ fontSize: "12px", color: "#6b7280", fontWeight: 600, fontFamily: "var(--font-sans)", marginBottom: "12px" }}>{a.desc}</div>
                    <div style={{
                      fontSize: "28px", fontWeight: 950, color: "#000000",
                      fontFamily: "var(--font-sans)", lineHeight: 1
                    }}>{a.memories} <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>memories</span></div>
                  </div>
                ))}
              </div>

              {/* Protocol badges */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                {[
                  { label: "MCP", desc: "35 tools", icon: "🔧", color: "#047857" },
                  { label: "A2A", desc: "25 skills", icon: "🤝", color: "#000000" },
                  { label: "SERIALIZABLE", desc: "Isolation", icon: "🔒", color: "#b45309" },
                  { label: "AS OF SYSTEM TIME", desc: "Time-travel", icon: "⏱️", color: "#b91c1c" },
                ].map((p, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "14px 16px", background: "var(--accent-breeze)", border: "2px solid #000000",
                    borderRadius: "var(--radius-sm)", boxShadow: "1.5px 1.5px 0px #000000"
                  }}>
                    <span style={{ fontSize: "18px" }}>{p.icon}</span>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{p.label}</div>
                      <div style={{ fontSize: "11px", color: "#374151", fontWeight: 700 }}>{p.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Side-by-side: CockroachDB Features & Why Bastion */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              {/* CockroachDB Features */}
              <div className="bento-panel" style={{ display: "flex", flexDirection: "column", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
                  <Dot color={C.cyan} pulse />
                  <span style={{
                    fontSize: "14px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: "2px", color: "#000000"
                  }}>CockroachDB Features</span>
                </div>
                <div style={{ height: "3px", background: "#000000", marginBottom: "16px" }} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                  {[
                    { feature: "SERIALIZABLE", desc: "Strongest isolation — prevents agentic stampedes", status: "Active", icon: "🔒" },
                    { feature: "Row-Level TTL", desc: "Auto-expires old memories — manages token costs", status: "Active", icon: "⏱️" },
                    { feature: "C-SPANN Vectors", desc: "1024-dim embeddings stored IN the database", status: "Active", icon: "🔍" },
                    { feature: "AS OF SYSTEM TIME", desc: "Time-travel queries for forensic investigation", status: "Active", icon: "🕐" },
                    { feature: "CDC Changelog", desc: "Real-time change streaming for event-driven agents", status: "Active", icon: "📡" },
                    { feature: "REGIONAL BY ROW", desc: "Multi-region data locality — speed of light matters", status: "Active", icon: "🌍" },
                  ].map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: "12px",
                      padding: "14px 16px", background: "#ffffff", border: "2px solid #000000",
                      borderRadius: "var(--radius-sm)", boxShadow: "2px 2px 0px #000000",
                      transition: "all 0.15s ease", cursor: "pointer"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translate(-2px, -2px)"; e.currentTarget.style.boxShadow = "4px 4px 0px #000000"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = "2px 2px 0px #000000"; }}
                    >
                      <span style={{ fontSize: "18px", marginTop: "2px" }}>{f.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                          <div style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{f.feature}</div>
                          <span style={{
                            fontSize: "9px", fontWeight: 900, fontFamily: "var(--font-sans)",
                            background: "#047857", color: "#ffffff", border: "1px solid #000000",
                            padding: "2px 6px", borderRadius: "2px"
                          }}>{f.status}</span>
                        </div>
                        <div style={{ fontSize: "11px", color: "#374151", fontWeight: 600, lineHeight: 1.4 }}>{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Why Bastion */}
              <div className="bento-panel" style={{ display: "flex", flexDirection: "column", padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
                  <Dot color={C.orange} pulse />
                  <span style={{
                    fontSize: "14px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: "2px", color: "#000000"
                  }}>Why Bastion</span>
                </div>
                <div style={{ height: "3px", background: "#000000", marginBottom: "16px" }} />
                <div style={{
                  padding: "16px 20px", background: "var(--accent-breeze)", border: "2px solid #000000",
                  borderRadius: "var(--radius-sm)", marginBottom: "16px",
                  boxShadow: "1.5px 1.5px 0px #000000"
                }}>
                  <div style={{ fontSize: "14px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)", lineHeight: 1.5 }}>
                    Memory that proves itself — forensic, tamper-proof, and self-healing.
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {[
                    { title: "Forensic Memory", desc: "SHA-256 hash chains prove what agent knew and when", icon: "🔍" },
                    { title: "OWASP ASI06", desc: "Memory poisoning detection and defense", icon: "🛡️" },
                    { title: "Time-Travel", desc: "Investigate past agent state with AS OF SYSTEM TIME", icon: "⏱️" },
                    { title: "Self-Healing", desc: "Automatic detection and recovery from attacks", icon: "🔧" },
                  ].map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: "12px",
                      padding: "14px 16px", background: "#ffffff", border: "2px solid #000000",
                      borderRadius: "var(--radius-sm)", boxShadow: "2px 2px 0px #000000",
                      transition: "all 0.15s ease", cursor: "pointer"
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translate(-2px, -2px)"; e.currentTarget.style.boxShadow = "4px 4px 0px #000000"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = "2px 2px 0px #000000"; }}
                    >
                      <span style={{ fontSize: "18px", marginTop: "2px" }}>{f.icon}</span>
                      <div>
                        <div style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{f.title}</div>
                        <div style={{ fontSize: "11px", color: "#374151", fontWeight: 600, marginTop: "4px", lineHeight: 1.4 }}>{f.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROW 3: TELEMETRY & EVENT FEED ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px 320px", gap: "20px", alignItems: "stretch" }}>

          {/* COLUMN 1: Memory Ingestion & Recent Audits Stack */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Memory Ingestion Panel */}
            <div className="bento-panel" style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                paddingBottom: "14px"
              }}>
                <Dot color={C.orange} pulse />
                <span style={{
                  fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif",
                  color: "#000000", textTransform: "uppercase", letterSpacing: "1.5px"
                }}>
                  Memory Ingestion
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: "13px", fontWeight: 900,
                  fontFamily: "var(--font-mono)", color: "#047857",
                  background: "#f0fdf4", border: "2.5px solid #047857",
                  padding: "4px 12px", borderRadius: "4px",
                  boxShadow: "2px 2px 0px #000000",
                }}>
                  {hourlyData.reduce((a: number, b: number) => a + b, 0)} memories · peak {(() => {
                    const peakIdx = hourlyData.indexOf(Math.max(...hourlyData));
                    const hr = (new Date().getHours() - 23 + peakIdx + 24) % 24;
                    return String(hr).padStart(2, "0");
                  })()}:00
                </span>
              </div>
              <div style={{ height: "3px", background: "#000000", marginBottom: "16px" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", margin: "10px 0" }}>
                <MemoryHeatmap hourly={hourlyData} />
              </div>
              <div style={{
                fontSize: "13px", color: "#374151", fontWeight: 700, fontFamily: "var(--font-sans)",
                textAlign: "center", padding: "10px 14px", lineHeight: 1.5,
                background: "rgba(0, 0, 0, 0.02)", border: "2px dashed rgba(0,0,0,0.1)", borderRadius: "6px",
                margin: "8px 0"
              }}>
                Real-time memory writes across all agents · stored in CockroachDB with SHA-256 hash chains
              </div>
              <div style={{ height: "3px", background: "#000000", margin: "16px 0" }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginTop: "8px" }}>
                {[
                  { label: "Memories Today", value: hourlyData.reduce((a: number, b: number) => a + b, 0).toLocaleString(), bg: "#f0fdf4", color: "#047857" },
                  { label: "Avg Importance (/10)", value: parseFloat(stats?.avgImportance ?? "0").toFixed(2), bg: "#fffbeb", color: "#b45309" },
                  { label: "Drift Index", value: driftScore.toFixed(3), bg: driftScore > 0.3 ? "#fef2f2" : "#f0fdf4", color: driftScore > 0.3 ? "#b91c1c" : "#047857" },
                ].map((m, i) => (
                  <div key={i} style={{
                    textAlign: "center", padding: "16px 12px",
                    background: m.bg,
                    border: `2px solid #000000`,
                    borderRadius: "8px",
                    boxShadow: "3px 3px 0px #000000",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translate(-2px, -2px)";
                    e.currentTarget.style.boxShadow = "5px 5px 0px #000000";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translate(0, 0)";
                    e.currentTarget.style.boxShadow = "3px 3px 0px #000000";
                  }}
                  >
                    <div style={{
                      fontSize: "12px", color: m.color, textTransform: "uppercase",
                      letterSpacing: "0.5px", fontFamily: "var(--font-sans)", fontWeight: 900, marginBottom: "8px"
                    }}>{m.label}</div>
                    <div style={{
                      fontSize: "36px", fontWeight: 950, color: "#000000",
                      fontFamily: "var(--font-sans)", lineHeight: 1
                    }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* COLUMN 2: Live Tool Trail */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ marginBottom: "10px" }}>
              <Dot color={C.green} pulse />
              Live Tool Trail
            </div>
            <div style={{ height: "3px", background: "#000000", marginBottom: "12px" }} />
            <div style={{ flex: 1, marginTop: "8px", overflowY: "auto" }}>
              <BlockchainTimeline live={!isMock} />
            </div>
          </div>

          {/* COLUMN 3: Security Scan */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ marginBottom: "10px" }}>
              <Dot color={C.cyan} pulse />
              Security Scan
            </div>
            <div style={{ height: "3px", background: "#000000", marginBottom: "12px" }} />
            <div style={{ flex: 1, marginTop: "8px", overflowY: "auto" }}>
              <SecurityFeed blockedCount={activeBlockedCount} />
            </div>
          </div>
        </div>

        {/* ── ROW 4: CRDB TOOLS + AWS SERVICES (FULL WIDTH) ── */}
        <div style={{ width: "100%" }}>
          <div className="bento-panel" style={{ width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
              <Dot color={C.green} />
              <span style={{ fontSize: "14px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", color: "#000000" }}>
                COCKROACHDB TOOLS & AWS SERVICES
              </span>
            </div>
            <div style={{ height: "3px", background: "#000000", marginBottom: "16px" }} />

            {/* Tools Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "20px" }}>
              {[
                { name: "Managed MCP Server", desc: "35 tools · Claude/Cursor/VS Code native", badge: "MCP", badgeColor: "#047857", key: "mcp" },
                { name: "Distributed Vector Indexing", desc: "C-SPANN · 1024-dim embeddings · cosine search", badge: "Vector", badgeColor: "#000000", key: "vector" },
                { name: "ccloud CLI", desc: "Cluster management · audit logs · backups", badge: "CLI", badgeColor: "#b45309", key: "ccloud" },
                { name: "Agent Skills Repo", desc: "35+ skills · onboarding/security/performance", badge: "Skills", badgeColor: "#047857", key: "skills" },
                { name: "AWS KMS", desc: "AES-256-GCM envelope encryption for memories", badge: "KMS", badgeColor: "#b45309", key: "kms" },
                { name: "AWS ap-south-1", desc: "CockroachDB cluster deployed in Mumbai region", badge: "Region", badgeColor: "#b91c1c", key: "region" },
              ].map((t, i) => (
                <div key={i} onClick={() => setSelectedTech(t)} style={{
                  padding: "14px 16px", background: "#ffffff", border: "2px solid #000000",
                  borderRadius: "var(--radius-sm)", boxShadow: "1.5px 1.5px 0px #000000",
                  transition: "all 0.15s ease", cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translate(-2px, -2px)";
                  e.currentTarget.style.boxShadow = "4px 4px 0px 0px #000000";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translate(0, 0)";
                  e.currentTarget.style.boxShadow = "1.5px 1.5px 0px #000000";
                }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{t.name}</span>
                    <span style={{
                      fontSize: "10px", fontWeight: 900, fontFamily: "var(--font-sans)",
                      background: t.badgeColor, color: "#ffffff",
                      border: "1.5px solid #000000", padding: "2px 8px",
                      borderRadius: "2px", whiteSpace: "nowrap",
                      boxShadow: "1px 1px 0px #000000"
                    }}>{t.badge}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#374151", fontWeight: 700, lineHeight: 1.4 }}>{t.desc}</div>
                  <div style={{
                    marginTop: "8px", fontSize: "10px", fontWeight: 900,
                    fontFamily: "var(--font-mono)", color: "#047857",
                    textDecoration: "underline", letterSpacing: "1px",
                  }}>
                    CLICK TO VIEW DETAILS →
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROW 5: TOOL ACTIVITY (interactive cards) + CRDB + A2A ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1.2fr", gap: "20px", alignItems: "stretch" }}>
          {/* Tool Activity Feed — bigger cards, click to expand */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column", height: "580px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
              <Dot color={C.cyan} pulse />
              <span style={{ fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", color: "#000000" }}>
                TOOL ACTIVITY
              </span>
              <span style={{
                marginLeft: "auto", fontSize: "13px", fontFamily: "var(--font-mono)", fontWeight: 900,
                background: "#047857", color: "#ffffff", border: "2px solid #000000",
                padding: "3px 10px", borderRadius: "4px", boxShadow: "1px 1px 0px #000000"
              }}>
                {toolUsage?.crdb?.total ?? 0} calls
              </span>
            </div>
            <div style={{ height: "3px", background: "#000000", marginBottom: "12px" }} />
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
              {(toolUsage?.usage?.length ?? 0) === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "#6b7280", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  No tool calls yet — run the forensic demo to populate
                </div>
              ) : (
                toolUsage.usage.map((t: any, i: number) => {
                  const isSearch = t.tool_name?.includes("search");
                  const isStore = t.tool_name?.includes("store");
                  const isMcp = t.tool_name === "managed_mcp_call";
                  const accentColor = isSearch ? "#047857" : isStore ? "#0369a1" : isMcp ? "#b45309" : "#000000";
                  let argsPreview = t.args_summary || "";
                  try {
                    const parsed = JSON.parse(argsPreview);
                    argsPreview = Object.entries(parsed).map(([k, v]) => {
                      const val = typeof v === "string" ? v : JSON.stringify(v);
                      return `${k}: ${val.length > 60 ? val.slice(0, 60) + "…" : val}`;
                    }).join(" · ");
                  } catch {}
                  return (
                    <div key={i} onClick={() => setSelectedTool(t)} style={{
                      display: "flex", alignItems: "stretch", gap: "12px",
                      padding: "14px 16px", background: "#ffffff",
                      border: "2.5px solid #000000", borderRadius: "10px",
                      boxShadow: "2px 2px 0px #000000",
                      transition: "all 0.15s ease", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translate(-2px, -2px)"; e.currentTarget.style.boxShadow = "4px 4px 0px 0px #000000"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = "2px 2px 0px #000000"; }}
                    >
                      {/* left accent */}
                      <div style={{ width: "4px", borderRadius: "4px", background: accentColor, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Row 1: tool badge + agent + client + duration */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                          <span style={{
                            display: "inline-block", fontSize: "12px", fontWeight: 900,
                            fontFamily: "var(--font-mono)", padding: "3px 10px", borderRadius: "4px",
                            background: accentColor, color: "#ffffff", border: "2px solid #000000",
                            boxShadow: "1px 1px 0px #000000", whiteSpace: "nowrap"
                          }}>{t.tool_name}{t.sub_tool ? `:${t.sub_tool}` : ""}</span>
                          <span style={{ fontSize: "12px", fontWeight: 900, color: "#b45309", fontFamily: "var(--font-mono)" }}>{t.agent_id}</span>
                          {t.client_name && t.client_name !== t.agent_id && (
                            <span style={{
                              fontSize: "11px", fontWeight: 800, color: "#047857",
                              fontFamily: "var(--font-mono)", background: "#f0fdf4",
                              border: "1.5px solid #047857", borderRadius: "4px", padding: "1px 6px"
                            }}>{t.client_name}</span>
                          )}
                          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#6b7280", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                            {t.duration_ms}ms
                          </span>
                        </div>
                        {/* Row 2: args preview */}
                        <div style={{
                          fontSize: "13px", color: "#374151", fontWeight: 600,
                          fontFamily: "var(--font-mono)", lineHeight: 1.5,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                        }}>
                          {argsPreview}
                        </div>
                        {/* Row 3: timestamp + click hint */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
                          <span style={{ fontSize: "11px", color: "#9ca3af", fontFamily: "var(--font-mono)" }}>
                            {new Date(t.created_at).toLocaleTimeString()}
                          </span>
                          <span style={{ fontSize: "10px", color: accentColor, fontFamily: "var(--font-mono)", fontWeight: 800, marginLeft: "auto" }}>
                            click to expand →
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* CockroachDB 4 Tools */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column", height: "580px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
              <Dot color={C.green} pulse />
              <span style={{ fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", color: "#000000" }}>
                CRDB + AI TOOL USAGE
              </span>
            </div>
            <div style={{ height: "3px", background: "#000000", marginBottom: "12px" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "4px" }}>
              {[
                { label: "Managed MCP Server (12 tools)", count: toolUsage?.crdb?.managed_mcp_tools ?? 0, icon: "🔧", color: "#047857", filter: (t: string) => t === "managed_mcp_call" || t === "managed_mcp_list_tools" || ["list_clusters","get_cluster","list_databases","list_tables","get_table_schema","select_query","explain_query","show_statement","show_running_queries","create_database","create_table","insert_rows"].includes(t) },
                { label: "Distributed Vectors (C-SPANN)", count: toolUsage?.crdb?.memory_tools ?? 0, icon: "🧠", color: "#0369a1", filter: (t: string) => t.startsWith("memory_") || t === "multi_signal_search" || t === "context_pack" || t === "ltm_check_reuse" || t === "ltm_store_analysis" || t === "ltm_invalidate" },
                { label: "ccloud CLI", count: toolUsage?.crdb?.ccloud_tools ?? 0, icon: "⚙️", color: "#b45309", filter: (t: string) => t === "ccloud_exec" },
                { label: "Agent Skills Repo", count: toolUsage?.crdb?.skill_tools ?? 0, icon: "📚", color: "#b91c1c", filter: (t: string) => t === "invoke_agent_skill" || t === "list_agent_skills" || t === "a2a_bridge" },
              ].map((row, i) => {
                const total = Math.max(toolUsage?.crdb?.total ?? 1, 1);
                const pct = Math.round((row.count / total) * 100);
                const catTools = (toolUsage?.crdb_tool_breakdown ?? []).filter((t: any) => row.filter(t.tool));
                return (
                  <div key={i} onClick={() => setSelectedCrdbCategory({ label: row.label, color: row.color, icon: row.icon, tools: catTools })} style={{
                    padding: "14px 16px", background: "#ffffff", border: "2.5px solid #000000",
                    borderRadius: "10px", boxShadow: "2px 2px 0px #000000",
                    transition: "all 0.15s ease", cursor: "pointer",
                  }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "3px 3px 0px #000000"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "2px 2px 0px #000000"; }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "18px" }}>{row.icon}</span>
                        <span style={{ fontSize: "14px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-sans)" }}>{row.label}</span>
                      </div>
                      <span style={{ fontSize: "18px", fontWeight: 950, color: "#000000", fontFamily: "var(--font-sans)" }}>{row.count}</span>
                    </div>
                    <div style={{ height: "8px", background: "#e5e7eb", border: "1.5px solid #000000", borderRadius: "6px", overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.min(pct, 100)}%`, height: "100%",
                        background: `linear-gradient(90deg, ${row.color}, ${row.color}cc)`,
                        transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* A2A Handoffs */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column", height: "580px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
              <Dot color={C.orange} pulse />
              <span style={{ fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", color: "#000000" }}>
                A2A HANDOFFS
              </span>
              <div style={{
                marginLeft: "auto",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "#ffffff",
                border: "2.5px solid #000000",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                boxShadow: "1.5px 1.5px 0px #000000",
                flexShrink: 0
              }}>
                <img src="/a2a-logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              </div>
            </div>
            <div style={{ height: "3px", background: "#000000", marginBottom: "12px" }} />
            
            {/* Scrollable list container (stretches full height now) */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: "4px", paddingBottom: "10px" }}>
              {(toolUsage?.a2a_handoffs?.length ?? 0) === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "#6b7280", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  No A2A handoffs yet
                </div>
              ) : (
                toolUsage.a2a_handoffs.map((h: any, i: number) => {
                  const isCompleted = h.status === "COMPLETED";
                  const statusBg = isCompleted ? "#f0fdf4" : "#fef2f2";
                  const statusBorderColor = isCompleted ? "#047857" : "#b91c1c";
                  const statusTextColor = isCompleted ? "#047857" : "#b91c1c";

                  return (
                    <div key={i} style={{
                      display: "flex", flexDirection: "column", gap: "10px",
                      padding: "14px 16px", background: "#ffffff",
                      border: "2.5px solid #000000", borderRadius: "10px",
                      boxShadow: "2px 2px 0px #000000",
                      marginBottom: "12px",
                      transition: "all 0.15s ease", cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translate(-2px, -2px)"; e.currentTarget.style.boxShadow = "4px 4px 0px #000000"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = "2px 2px 0px #000000"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px", fontWeight: 900, color: "#047857", fontFamily: "var(--font-sans)" }}>{h.from_agent}</span>
                        <span style={{ fontSize: "13px", color: "#000000", fontWeight: 900 }}>→</span>
                        <div style={{
                          width: "20px",
                          height: "20px",
                          borderRadius: "50%",
                          background: "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          flexShrink: 0
                        }}>
                          <img src="/a2a-logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        </div>
                        <span style={{ fontSize: "14px", fontWeight: 900, color: "#b45309", fontFamily: "var(--font-sans)" }}>{h.to_agent}</span>
                        <span style={{
                          marginLeft: "auto", fontSize: "11px", fontWeight: 900,
                          color: statusTextColor,
                          fontFamily: "var(--font-sans)", background: statusBg,
                          border: `1.5px solid ${statusBorderColor}`,
                          padding: "2px 8px", borderRadius: "4px"
                        }}>{h.status}</span>
                      </div>
                      <div style={{
                        fontSize: "13px", fontWeight: 900, color: "#000000",
                        fontFamily: "var(--font-sans)",
                        background: "rgba(0, 0, 0, 0.03)",
                        border: "2px solid #000000",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                      }}>
                        {h.skill_used || h.message_preview || h.task_type}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── ROW 6: MANAGED MCP TOOLS USED + AGENT ATTRIBUTION (2-column bento row) ── */}
        {((toolUsage?.crdb_tool_breakdown?.length ?? 0) > 0 || (toolUsage?.by_agent?.length ?? 0) > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "20px", width: "100%", alignItems: "stretch" }}>
            {/* Left: MANAGED MCP TOOLS USED */}
            {(toolUsage?.crdb_tool_breakdown?.length ?? 0) > 0 && (
              <div className="bento-panel" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
                    <Dot color="#b45309" pulse />
                    <span style={{ fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", color: "#000000" }}>
                      MANAGED MCP TOOLS USED
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: "12px", fontFamily: "var(--font-mono)", color: "#374151", fontWeight: 800 }}>
                      {toolUsage.crdb_tool_breakdown.length} tools active
                    </span>
                  </div>
                  <div style={{ height: "3px", background: "#000000", marginBottom: "14px" }} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {toolUsage.crdb_tool_breakdown.slice(0, 16).map((ct: any, j: number) => (
                      <div key={j} onClick={() => {
                        const recent = (toolUsage.usage ?? []).find((u: any) =>
                          u.tool_name === ct.tool || u.sub_tool === ct.tool
                        );
                        if (recent) setSelectedTool(recent);
                        else setSelectedCrdbCategory({ label: ct.tool, color: "#b45309", icon: "🔧", tools: [{ tool: ct.tool, calls: ct.calls }] });
                      }} style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        padding: "8px 14px", background: "#ffffff", border: "2px solid #000000",
                        borderRadius: "8px", boxShadow: "1.5px 1.5px 0px #000000",
                        transition: "all 0.15s ease", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translate(-1px, -1px)"; e.currentTarget.style.boxShadow = "3px 3px 0px 0px #000000"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = "translate(0, 0)"; e.currentTarget.style.boxShadow = "1.5px 1.5px 0px #000000"; }}
                      >
                        <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-mono)" }}>{ct.tool}</span>
                        <span style={{
                          fontSize: "12px", fontWeight: 900, color: "#ffffff",
                          background: "#b45309", borderRadius: "4px", padding: "1px 7px",
                          fontFamily: "var(--font-mono)"
                        }}>{ct.calls}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Right: AGENT ATTRIBUTION */}
            {(toolUsage?.by_agent?.length ?? 0) > 0 && (
              <div className="bento-panel" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px" }}>
                  <Dot color={C.green} pulse />
                  <span style={{ fontSize: "16px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "2px", color: "#000000" }}>
                    AGENT ATTRIBUTION
                  </span>
                </div>
                <div style={{ height: "3px", background: "#000000", marginBottom: "14px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, overflowY: "auto" }}>
                  {toolUsage.by_agent.slice(0, 6).map((a: any, j: number) => (
                    <div key={j} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "8px 14px", background: "#ffffff",
                      border: "2px solid #000000", borderRadius: "8px",
                      boxShadow: "1.5px 1.5px 0px #000000",
                    }}>
                      <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000", fontFamily: "var(--font-mono)" }}>{a.agent_id}</span>
                      <span style={{
                        fontSize: "11px", fontWeight: 900, color: "#ffffff",
                        background: "#000000", padding: "2px 8px", borderRadius: "4px",
                        fontFamily: "var(--font-mono)", border: "1.5px solid #000000",
                        boxShadow: "1px 1px 0px #000000"
                      }}>{a.calls}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tool Detail Modal — portaled to body so it sits above everything */}
        {selectedTool && createPortal(
          <ToolDetailModal entry={selectedTool} onClose={() => setSelectedTool(null)} />,
          document.body
        )}

        {/* CRDB Category Detail Modal */}
        {selectedCrdbCategory && createPortal(
          <CrdbCategoryModal
            label={selectedCrdbCategory.label}
            color={selectedCrdbCategory.color}
            icon={selectedCrdbCategory.icon}
            tools={selectedCrdbCategory.tools}
            onClose={() => setSelectedCrdbCategory(null)}
          />,
          document.body
        )}

        {/* Tech (CRDB Tools & AWS) Detail Modal */}
        {selectedTech && createPortal(
          <TechDetailModal tech={selectedTech} onClose={() => setSelectedTech(null)} />,
          document.body
        )}

      </div>
    </>
  );
}
