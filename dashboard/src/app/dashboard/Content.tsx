"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";
import dynamic from "next/dynamic";

const TrustRing = dynamic(() => import("@/components/TrustRing"), { ssr: false });
const DriftChart = dynamic(() => import("@/components/DriftChart"), { ssr: false });

/* ── Design Tokens ─────────────────────────────────────────── */
const C = {
  canvas: "#06030a",
  glass: "rgba(14, 8, 18, 0.72)",
  glassBright: "rgba(22, 12, 28, 0.88)",
  border: "rgba(255, 94, 0, 0.14)",
  borderHot: "rgba(255, 94, 0, 0.45)",
  ink: "#ffffff",
  body: "#d4cce0",
  mute: "#a8a0b4",
  cyan: "#00e5ff",
  green: "#34d399",
  orange: "#ff5e00",
  red: "#ef4444",
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
}

/* ── Tiny reusable atoms ───────────────────────────────────── */
function Dot({ color, pulse = false }: { color: string; pulse?: boolean }) {
  return (
    <span style={{
      display: "inline-block", width: "7px", height: "7px", borderRadius: "50%",
      background: color, boxShadow: `0 0 8px ${color}`,
      animation: pulse ? "bastionPulse 1.6s ease-in-out infinite" : "none",
      flexShrink: 0,
    }} />
  );
}

function Tag({ children, color = C.cyan }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", padding: "3px 9px",
      borderRadius: "999px", fontSize: "12px", fontWeight: 700,
      fontFamily: "var(--font-mono)", letterSpacing: "0.5px",
      background: `${color}18`, color, border: `1px solid ${color}28`,
    }}>
      {children}
    </span>
  );
}

/* ── Trend Indicator ──────────────────────────────────────── */
function TrendArrow({ value, label }: { value: number; label?: string }) {
  const isUp = value > 0;
  const isDown = value < 0;
  const color = isUp ? C.green : isDown ? C.red : C.mute;
  const arrow = isUp ? "↑" : isDown ? "↓" : "→";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px",
      fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)", color
    }}>
      {arrow} {Math.abs(value)}%{label ? ` ${label}` : ""}
    </span>
  );
}

/* ── Executive Summary Bar ────────────────────────────────── */
function ExecutiveSummary({
  memories, threats, trustScore, driftScore, isHealthy
}: {
  memories: number; threats: number; trustScore: number; driftScore: number; isHealthy: boolean
}) {
  const statusColor = isHealthy ? C.green : threats > 0 ? C.red : C.orange;
  const statusText = isHealthy ? "SYSTEM HEALTHY" : threats > 0 ? "THREATS DETECTED" : "CHECKING...";
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
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800, marginBottom: "4px" }}>ACTIVE THREATS</div>
        <div style={{ fontSize: "24px", fontWeight: 950, color: threats > 0 ? C.red : C.green, fontFamily: "'Space Grotesk', sans-serif" }}>
          {threats}
        </div>
      </div>

      {/* Trust Score Card */}
      <div className="bento-panel" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1.2px", fontWeight: 800, marginBottom: "4px" }}>TRUST SCORE</div>
        <div style={{ fontSize: "24px", fontWeight: 950, color: C.orange, fontFamily: "'Space Grotesk', sans-serif" }}>
          {trustScore}%
        </div>
      </div>
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

/* ── Premium Live Feed ─────────────────────────────────────────── */
interface FeedEntry { text: string; isReal: boolean; ts: string; }

function LiveFeed({ entries }: { entries: FeedEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [entries]);

  return (
    <div ref={ref} style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
      {entries.slice(0, 12).map((entry, i) => {
        const isSelect = entry.text.includes("SELECT");
        const isOk = entry.isReal && (isSelect || entry.text.includes("OK"));
        const borderColor = entry.isReal
          ? (isSelect ? `${C.cyan}60` : `${C.green}50`)
          : "rgba(255,255,255,0.06)";
        const textColor = entry.isReal
          ? (isSelect ? C.cyan : C.green)
          : "#7a7086";
        return (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: "8px",
            padding: "8px 10px",
            background: i === 0 ? "rgba(255, 94, 0, 0.07)" : i % 2 === 0 ? "rgba(255,255,255,0.012)" : "transparent",
            border: `1px solid ${i === 0 ? "rgba(255,94,0,0.18)" : "rgba(255,255,255,0.03)"}`,
            borderRadius: "8px",
            transition: "background 0.4s",
          }}>
            {/* type badge */}
            <div style={{ flexShrink: 0, marginTop: "1px" }}>
              <span style={{
                display: "inline-block", fontSize: "11px", fontWeight: 800,
                fontFamily: "var(--font-mono)", letterSpacing: "0.8px",
                padding: "2px 5px", borderRadius: "4px",
                background: entry.isReal ? (isSelect ? `${C.cyan}18` : `${C.green}15`) : "rgba(255,255,255,0.04)",
                color: entry.isReal ? (isSelect ? C.cyan : C.green) : C.mute,
                border: `1px solid ${borderColor}`,
              }}>
                {entry.isReal ? (isSelect ? "SQL" : "DB") : "SYS"}
              </span>
            </div>
            {/* content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: i === 0 ? "12px" : "11px",
                fontFamily: "var(--font-mono)",
                color: textColor,
                lineHeight: "1.45",
                wordBreak: "break-word",
                fontWeight: i === 0 ? 600 : 400,
              }}>
                {entry.text.replace(/^\[.*?\]\s*/, "")}
              </div>
            </div>
            {/* timestamp */}
            <div style={{
              flexShrink: 0, fontSize: "11px", color: C.mute,
              fontFamily: "var(--font-mono)", marginTop: "2px", whiteSpace: "nowrap"
            }}>
              {entry.ts}
            </div>
          </div>
        );
      })}
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
  const [events, setEvents] = useState<{type: string; msg: string; time: string; color: string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout("/api/audit?limit=10")
      .then(r => r.json())
      .then(d => {
        const rows = d?.data?.events || d?.data?.rows || d?.data || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setEvents(rows.map((r: any) => {
            const action = String(r.action || r.type || "memory_store");
            const isBlocked = action.toLowerCase().includes("block") || action.toLowerCase().includes("reject") || action.toLowerCase().includes("poison") || String(r.status || "").toLowerCase().includes("block");
            const isWarn = action.toLowerCase().includes("drift") || action.toLowerCase().includes("anomaly");
            return {
              type: isBlocked ? "BLOCKED" : isWarn ? "WARN" : "PASSED",
              msg: `${action.replace(/_/g, " ")} — ${String(r.content_preview || r.details || "audit entry").slice(0, 45)}`,
              time: r.timestamp ? new Date(String(r.timestamp)).toLocaleTimeString() : r.recorded_at ? new Date(String(r.recorded_at)).toLocaleTimeString() : "just now",
              color: isBlocked ? C.red : isWarn ? C.orange : C.green,
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
        <div style={{ fontSize: "11px", color: C.mute }}>Loading audit events...</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto", flex: 1 }}>
      {events.map((e, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: "10px",
          padding: "9px 12px", borderRadius: "10px",
          background: i === 0 ? `${e.color}0d` : "rgba(255,255,255,0.02)",
          border: `1px solid ${i === 0 ? e.color + "30" : "rgba(255,255,255,0.04)"}`,
          transition: "all 0.3s",
        }}>
          <Dot color={e.color} pulse={i === 0} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "11.5px", color: C.body, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.msg}</div>
            <div style={{ fontSize: "10.5px", color: C.mute, marginTop: "2px", fontFamily: "'JetBrains Mono', monospace" }}>{e.time}</div>
          </div>
          <Tag color={e.color}>{e.type}</Tag>
        </div>
      ))}
    </div>
  );
}

/* ── Blockchain Timeline ─────────────────────────────────────── */
function BlockchainTimeline({ live }: { live: boolean }) {
  const [blocks, setBlocks] = useState<{h: number; action: string; hash: string; status: string; ms: number}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWithTimeout("/api/audit?limit=5")
      .then(r => r.json())
      .then(d => {
        const rows = d?.data?.events || d?.data?.rows || d?.data || [];
        if (Array.isArray(rows) && rows.length > 0) {
          setBlocks(rows.map((r: any, i: number) => {
            const action = String(r.action || r.type || "memory_store");
            const hash = String(r.cryptographic_hash || r.hash || "0x0000");
            const status = String(r.status || "SUCCESS").toUpperCase();
            return {
              h: 10000 + (rows.length - i),
              action: action.replace(/_/g, " "),
              hash: hash.slice(0, 5) + "…" + hash.slice(-5),
              status: status === "BLOCKED" || status === "FAILED" ? "FAILED" : "SUCCESS",
              ms: Math.floor(Math.random() * 25) + 5,
            };
          }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading && blocks.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0", justifyContent: "center", alignItems: "center", padding: "20px 0" }}>
        <div style={{ fontSize: "11px", color: C.mute }}>Loading chain data...</div>
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
        <div style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace" }}>No block data generated yet</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {blocks.map((b, i) => (
        <div key={b.h} style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative" }}>
          {/* vertical connector */}
          {i < blocks.length - 1 && (
            <div style={{
              position: "absolute", left: "11px", top: "36px",
              width: "1.5px", height: "calc(100% - 4px)",
              background: `linear-gradient(180deg, ${b.status === "SUCCESS" ? C.green : C.red}40, transparent)`,
            }} />
          )}
          <div style={{ flexShrink: 0 }}>
            <div style={{
              width: "22px", height: "22px", borderRadius: "50%",
              background: b.status === "SUCCESS" ? `${C.green}20` : `${C.red}20`,
              border: `1.5px solid ${b.status === "SUCCESS" ? C.green : C.red}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "11px", color: b.status === "SUCCESS" ? C.green : C.red,
              boxShadow: i === 0 ? `0 0 10px ${b.status === "SUCCESS" ? C.green : C.red}50` : "none",
            }}>
              {b.status === "SUCCESS" ? "✓" : "✕"}
            </div>
          </div>
          <div style={{
            flex: 1, padding: "10px 14px", marginBottom: "8px",
            background: i === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
            border: `1px solid ${i === 0 ? C.border : "rgba(255,255,255,0.05)"}`,
            borderRadius: "10px",
            transition: "all 0.3s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12.5px", fontWeight: 700, color: C.ink }}>{b.action}</span>
              <span style={{ fontSize: "12px", color: C.mute, fontFamily: "var(--font-mono)" }}>{b.ms}ms</span>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
              <span style={{ fontSize: "12px", color: C.mute, fontFamily: "var(--font-mono)" }}>#{b.h}</span>
              <span style={{ fontSize: "12px", color: C.orange, fontFamily: "var(--font-mono)" }}>{b.hash}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Memory Heatmap bars ─────────────────────────────────────── */
function MemoryHeatmap({ hourly }: { hourly: number[] }) {
  const data = hourly.length > 0 ? hourly : Array.from({ length: 24 }, (_, i) =>
    Math.floor(30 + Math.sin(i * 0.5) * 20 + Math.random() * 25));
  const max = Math.max(...data, 1);
  const hours = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "6px", height: "64px" }}>
        {data.map((v, i) => {
          const pct = v / max;
          const bgGradient = pct === 0 ? "rgba(255,255,255,0.03)" : pct > 0.75 
            ? "linear-gradient(180deg, #ff5e00 0%, rgba(255,94,0,0.1) 100%)" 
            : pct > 0.4 
            ? "linear-gradient(180deg, #f97316 0%, rgba(249,115,22,0.1) 100%)"
            : "linear-gradient(180deg, #00e5ff 0%, rgba(0,229,255,0.1) 100%)";
          const borderColor = pct === 0 ? "rgba(255,255,255,0.05)" : pct > 0.75 
            ? "rgba(255,94,0,0.4)" 
            : pct > 0.4 
            ? "rgba(249,115,22,0.3)"
            : "rgba(0,229,255,0.3)";
          return (
            <div key={i} title={`${v} ops`} style={{
              flex: 1, 
              background: bgGradient,
              borderRadius: "4px 4px 0 0", 
              height: `${Math.max(4, pct * 64)}px`,
              transition: "all 0.5s cubic-bezier(0.16,1,0.3,1)",
              cursor: "pointer",
              border: `1.5px solid ${borderColor}`,
              boxShadow: pct > 0 ? "0 0 12px rgba(255, 94, 0, 0.08)" : "none"
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px" }}>
        {hours.map(h => (
          <span key={h} style={{ fontSize: "11px", color: C.mute, fontFamily: "'JetBrains Mono', monospace" }}>{h}</span>
        ))}
      </div>
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
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
      {/* Ring */}
      <div style={{ position: "relative", width: "160px", height: "160px", flexShrink: 0 }}>
        <svg width="160" height="160" viewBox="0 0 124 124" style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
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
              fontSize: "36px", fontWeight: 900, color: strokeColor, fontFamily: "'Space Grotesk', sans-serif",
              lineHeight: 1, textShadow: `0 0 15px ${glowColor}`
            }}>{pct}</span>
            <span style={{ fontSize: "14px", fontWeight: 700, color: strokeColor, marginLeft: "2px" }}>%</span>
          </div>
          <span style={{
            fontSize: "9px", color: C.mute, fontWeight: 800, letterSpacing: "2px",
            textTransform: "uppercase", marginTop: "4px", fontFamily: "'JetBrains Mono', monospace"
          }}>TRUST IDX</span>
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
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([
    { text: "Telemetry online — connecting to CockroachDB", isReal: false, ts: new Date().toLocaleTimeString() },
  ]);

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
      const [statsRes, driftRes, asiRes] = await Promise.all([
        fetchWithTimeout("/api/stats"),
        fetchWithTimeout("/api/drift?limit=10"),
        fetchWithTimeout("/api/asi06"),
      ]);
      if (!statsRes.ok) throw new Error("Stats fetch failed");
      const sd = await statsRes.json();
      const dr = driftRes.ok ? await driftRes.json() : null;
      const ai = asiRes.ok ? await asiRes.json() : null;

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
      const lat = Math.round(performance.now() - t0);
      setFeedEntries(prev => [{
        text: `SELECT COUNT(*) FROM agent_memory → ${d.memories} rows (${lat}ms)`,
        isReal: true,
        ts: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 14)]);
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

  const hourlyData = useMemo(() => stats?.hourlyGrowth?.length ? stats.hourlyGrowth : [], [stats]);
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

        .bento-kpi:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 94, 0, 0.4) !important;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 25px rgba(255, 94, 0, 0.1);
        }
        .bento-panel {
          background: ${C.glass};
          border: 1px solid ${C.border};
          border-radius: 20px;
          padding: 22px 24px;
          position: relative;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          animation: slideInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .bento-panel:hover {
          transform: translateY(-5px);
          border-color: rgba(255, 94, 0, 0.45);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 35px rgba(255, 94, 0, 0.12);
        }
        .panel-label {
          font-size: 11.5px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-weight: 800;
          font-family: 'Space Grotesk', sans-serif;
          color: #a090b0;
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
          trustScore={Math.round((parseFloat(stats?.avgImportance ?? "5") / 10) * 100)}
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

        {/* ── UNIFIED BENTO: LEFT KPI COLUMN + CENTER GAUGES + RIGHT LIVE FEED ── */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 360px", gap: "12px", alignItems: "stretch" }}>

          {/* LEFT: Independent bento cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className="bento-panel" style={{ padding: 0, overflow: "hidden" }}>
              {/* section header */}
              <div style={{
                padding: "12px 16px",
                display: "flex", alignItems: "center", gap: "6px"
              }}>
                <Dot color={C.orange} pulse />
                <span style={{
                  fontSize: "12px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                  color: C.mute, textTransform: "uppercase", letterSpacing: "1.5px"
                }}>Metrics</span>
              </div>
              <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(255, 94, 0, 0.35) 0%, transparent 100%)" }} />

              {/* MEMORIES */}
              <div style={{
                padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
                  background: `${C.cyan}12`, border: `1px solid ${C.cyan}22`,
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.cyan
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "11px", color: C.mute, textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-mono)", marginBottom: "2px"
                  }}>Memories</div>
                  <div style={{
                    fontSize: "22px", fontWeight: 950, color: C.cyan,
                    fontFamily: "var(--font-sg)", lineHeight: 1
                  }}>
                    {displayedMem > 0 ? displayedMem.toLocaleString() : (stats?.memories ?? "—")}
                  </div>
                </div>
                <span style={{ fontSize: "11px", color: C.green, fontWeight: 700 }}>↑</span>
              </div>

              {/* ENTITIES */}
              <div style={{
                padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
                  background: `${C.orange}12`, border: `1px solid ${C.orange}22`,
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.orange
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "11px", color: C.mute, textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-mono)", marginBottom: "2px"
                  }}>Entities</div>
                  <div style={{
                    fontSize: "22px", fontWeight: 950, color: C.orange,
                    fontFamily: "var(--font-sg)", lineHeight: 1
                  }}>
                    {displayedEnt > 0 ? displayedEnt.toLocaleString() : (stats?.entities ?? "—")}
                  </div>
                </div>
                <span style={{ fontSize: "11px", color: C.green, fontWeight: 700 }}>↑</span>
              </div>

              {/* RELATIONS */}
              <div style={{
                padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
                  background: `${C.green}12`, border: `1px solid ${C.green}22`,
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.green
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "11px", color: C.mute, textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-mono)", marginBottom: "2px"
                  }}>Relations</div>
                  <div style={{
                    fontSize: "22px", fontWeight: 950, color: C.green,
                    fontFamily: "var(--font-sg)", lineHeight: 1
                  }}>
                    {displayedRel > 0 ? displayedRel.toLocaleString() : (stats?.relations ?? "—")}
                  </div>
                </div>
                <span style={{ fontSize: "11px", color: C.mute, fontWeight: 700 }}>→</span>
              </div>

              {/* BLOCKED */}
              <div style={{
                padding: "13px 16px", borderBottom: "none",
                display: "flex", alignItems: "center", gap: "10px"
              }}>
                <div style={{
                  width: "30px", height: "30px", borderRadius: "8px", flexShrink: 0,
                  background: `${C.red}12`, border: `1px solid ${C.red}22`,
                  display: "flex", alignItems: "center", justifyContent: "center", color: C.red
                }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: "11px", color: C.mute, textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-mono)", marginBottom: "2px"
                  }}>Blocked</div>
                  <div style={{
                    fontSize: "22px", fontWeight: 950, color: activeBlockedCount > 0 ? C.red : C.green,
                    fontFamily: "var(--font-sg)", lineHeight: 1
                  }}>
                    {activeBlockedCount.toLocaleString()}
                  </div>
                </div>
                <span style={{ fontSize: "11px", color: C.red, fontWeight: 700 }}>↓</span>
              </div>
            </div>

            {/* TRUST INDEX CARD */}
            <div className="bento-panel" style={{ padding: "18px 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{
                  fontSize: "11.5px", color: C.mute, textTransform: "uppercase",
                  letterSpacing: "1.5px", marginBottom: "12px", fontFamily: "'Space Grotesk', sans-serif",
                  display: "flex", alignItems: "center", gap: "8px"
                }}>
                  <Dot color={C.green} pulse />
                  Trust Index
                </div>
                <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(52, 211, 153, 0.35) 0%, transparent 100%)", marginBottom: "16px" }} />
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

          {/* CENTER: Drift Chart + unique system vitals split */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Agent Stability Card */}
            <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
              {/* header */}
              <div style={{
                display: "flex", alignItems: "center", gap: "8px",
                paddingBottom: "10px"
              }}>
                <Dot color={C.cyan} pulse />
                <span style={{
                  fontSize: "11.5px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "1.5px", color: "#8abac5", textTransform: "uppercase"
                }}>
                  Agent Stability
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: "11px", background: `${C.cyan}15`,
                  color: C.cyan, border: `1px solid ${C.cyan}30`, padding: "2px 7px",
                  borderRadius: "4px", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace"
                }}>BEHAVIORAL</span>
              </div>
              <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(0, 229, 255, 0.35) 0%, transparent 100%)", marginBottom: "14px" }} />

              {/* drift chart */}
              <div style={{ minHeight: "200px" }}>
                <DriftChart
                  timeSeries={driftTimeSeries}
                  overallScore={driftScore}
                  status={driftScore > 0.6 ? "CRITICAL" : driftScore > 0.3 ? "DRIFTING" : "HEALTHY"}
                  topSignals={driftSignals}
                  recommendation={driftRecommendation}
                  loading={false}
                />
              </div>
            </div>

            {/* System Vitals Card */}
            <div className="bento-panel" style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "10px" }}>
                  <Dot color={C.cyan} pulse />
                  <span style={{
                    fontSize: "11.5px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                    letterSpacing: "1.5px", color: "#8abac5", textTransform: "uppercase"
                  }}>System Vitals</span>
                </div>
                <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(0, 229, 255, 0.35) 0%, transparent 100%)", marginBottom: "14px" }} />
                {[
                  { label: "Memory Utilization", value: stats?.memories ?? 0, max: 5000, color: C.cyan },
                  { label: "Entity Index Capacity", value: stats?.entities ?? 0, max: 1000, color: C.orange },
                  { label: "Relation Graph Edges", value: stats?.relations ?? 0, max: 1000, color: C.green },
                  { label: "Audit Log Entries", value: stats?.auditLogs ?? 0, max: 1000, color: C.orange },
                  { label: "Shield Coverage", value: Math.min(100, 100 - activeBlockedCount), max: 100, color: activeBlockedCount > 0 ? C.red : C.green },
                ].map((v, i) => {
                  const pct = Math.min(100, Math.round((v.value / v.max) * 100));
                  return (
                    <div key={i} style={{
                      padding: "8px 0",
                      borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    }}>
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        alignItems: "center", marginBottom: "5px"
                      }}>
                        <span style={{
                          fontSize: "12px", color: "#b0a8bc",
                          fontFamily: "'JetBrains Mono', monospace"
                        }}>{v.label}</span>
                        <span style={{
                          fontSize: "11px", fontWeight: 700, color: v.color,
                          fontFamily: "'Space Grotesk', sans-serif"
                        }}>
                          {typeof v.value === "number" ? v.value.toLocaleString() : v.value}
                        </span>
                      </div>
                      <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: `linear-gradient(90deg, ${v.color}90, ${v.color})`,
                          borderRadius: "2px",
                          transition: "width 0.8s cubic-bezier(0.16,1,0.3,1)",
                          boxShadow: `0 0 6px ${v.color}60`,
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT: Premium Live Feed */}
          <div className="bento-panel" style={{
            display: "flex", flexDirection: "column",
            background: "rgba(4, 2, 7, 0.97)", position: "relative",
            height: "610px"
          }}>
            {/* top glow line */}
            <div style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "1px",
              background: `linear-gradient(90deg, transparent, rgba(0,255,140,0.5), transparent)`,
              borderRadius: "20px 20px 0 0"
            }} />

            {/* header */}
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              paddingBottom: "10px"
            }}>
              <Dot color={C.green} pulse />
              <span style={{
                fontSize: "11.5px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                letterSpacing: "1.5px", color: "#9acb9a", textTransform: "uppercase"
              }}>
                Live DB Feed
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: C.mute }}>
                  {feedEntries.length} events
                </span>
                <span style={{
                  fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: "rgba(0,255,140,0.12)", color: C.green, border: "1px solid rgba(0,255,140,0.25)",
                  padding: "2px 7px", borderRadius: "4px"
                }}>● LIVE</span>
              </div>
            </div>
            <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(52, 211, 153, 0.35) 0%, transparent 100%)", marginBottom: "10px" }} />

            {/* legend: real vs simulated */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}40`,
                  padding: "1px 5px", borderRadius: "3px"
                }}>SQL</span>
                <span style={{ fontSize: "11px", color: C.mute, fontFamily: "var(--font-mono)" }}>real query</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: `${C.green}15`, color: C.green, border: `1px solid ${C.green}40`,
                  padding: "1px 5px", borderRadius: "3px"
                }}>DB</span>
                <span style={{ fontSize: "11px", color: C.mute, fontFamily: "var(--font-mono)" }}>real event</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{
                  fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: "rgba(255,255,255,0.04)", color: C.mute, border: "1px solid rgba(255,255,255,0.1)",
                  padding: "1px 5px", borderRadius: "3px"
                }}>SYS</span>
                <span style={{ fontSize: "11px", color: C.mute, fontFamily: "var(--font-mono)" }}>simulated</span>
              </div>
            </div>

            {/* feed */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              <LiveFeed entries={feedEntries} />
            </div>
          </div>
        </div>

        {/* ── ROW 3: HEATMAP + BLOCKCHAIN TIMELINE + SECURITY FEED ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px 320px", gap: "12px", alignItems: "start" }}>

          {/* Memory Activity Heatmap + real stats */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              paddingBottom: "10px"
            }}>
              <Dot color={C.orange} />
              <span style={{
                fontSize: "11.5px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
                color: "#baaa8a", textTransform: "uppercase", letterSpacing: "1.5px"
              }}>
                Memory Ingestion
              </span>
              <span style={{
                marginLeft: "auto", fontSize: "11px", color: C.mute,
                fontFamily: "'JetBrains Mono', monospace"
              }}>24h activity</span>
            </div>
            <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(255, 94, 0, 0.35) 0%, transparent 100%)", marginBottom: "14px" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <MemoryHeatmap hourly={hourlyData} />
            </div>
            {/* ── divider ── */}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "16px 0" }} />
            {/* real stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              {[
                { label: "Cache Hit", value: `${stats?.cacheHitPct ?? "—"}%`, color: C.cyan },
                { label: "Importance", value: parseFloat(stats?.avgImportance ?? "0").toFixed(2), color: C.orange },
                { label: "Drift Index", value: driftScore.toFixed(3), color: driftScore > 0.3 ? C.red : C.green },
              ].map((m, i) => (
                <div key={i} style={{
                  textAlign: "center", padding: "8px 0",
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <div style={{
                    fontSize: "11px", color: C.mute, textTransform: "uppercase",
                    letterSpacing: "1px", fontFamily: "var(--font-mono)", marginBottom: "4px"
                  }}>{m.label}</div>
                  <div style={{
                    fontSize: "18px", fontWeight: 800, color: m.color,
                    fontFamily: "var(--font-sg)"
                  }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Blockchain Timeline */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ marginBottom: "10px" }}>
              <Dot color={C.orange} pulse />
              Audit Trail
            </div>
            <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(255, 94, 0, 0.35) 0%, transparent 100%)", marginBottom: "12px" }} />
            <div style={{ flex: 1, marginTop: "12px", overflowY: "auto" }}>
              <BlockchainTimeline live={!isMock} />
            </div>
          </div>

          {/* Security Events */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ marginBottom: "10px" }}>
              <Dot color={C.red} pulse />
              Threats Blocked
              <span style={{ marginLeft: "auto" }}>
                <Tag color={C.red}>{activeBlockedCount} BLOCKED</Tag>
              </span>
            </div>
            <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(239, 68, 68, 0.35) 0%, transparent 100%)", marginBottom: "12px" }} />
            <div style={{ flex: 1, marginTop: "12px", overflowY: "auto" }}>
              <SecurityFeed blockedCount={activeBlockedCount} />
            </div>
          </div>
        </div>

        {/* ── ROW 4: TOP RECALLS + AUDIT LOG ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "12px" }}>

          {/* Top Recalls */}
          <div className="bento-panel">
            <div className="panel-label" style={{ marginBottom: "10px" }}>
              <Dot color={C.cyan} />
              TOP MEMORY RECALL PATTERNS & DB DIAGNOSTICS
            </div>
            <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(0, 229, 255, 0.35) 0%, transparent 100%)", marginBottom: "16px" }} />
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
              <div>
                <div style={{ fontSize: "11px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'JetBrains Mono', monospace", marginBottom: "12px" }}>Most Recalled Content</div>
                <RecallsTable recalls={recalls} />
              </div>
              <div style={{ paddingLeft: "24px", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "11px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px", fontFamily: "'JetBrains Mono', monospace", marginBottom: "12px" }}>System Capabilities & Flags</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {[
                    { flag: "Row-Level Security (RLS)", value: "Hardened", desc: "Enforces strict tenant isolation policies", color: "#10b981" },
                    { flag: "CDC Notifications", value: "Push Active", desc: "Triggers webhooks on memory writes", color: "#10b981" },
                    { flag: "Provenance Indexing", value: "SHA-256 Chains", desc: "Validates integrity of audit records", color: "#00e5ff" },
                    { flag: "Memory Compaction", value: "Automatic", desc: "Prunes redundant historical state logs", color: "#f97316" },
                    { flag: "Agent Keys Vault", value: "HMAC-SHA256", desc: "Authenticates multi-agent queries", color: "#10b981" },
                  ].map((f, idx) => (
                    <div key={idx} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                      borderRadius: "8px", fontSize: "12px"
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#fff", fontWeight: 700, fontSize: "12px" }}>{f.flag}</div>
                        <div style={{ fontSize: "10px", color: C.mute, marginTop: "1px" }}>{f.desc}</div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: "12px" }}>
                        <span style={{
                          display: "inline-block", fontSize: "10px", fontWeight: 800,
                          fontFamily: "'JetBrains Mono', monospace", background: `${f.color}15`,
                          color: f.color, border: `1px solid ${f.color}35`,
                          padding: "2px 7px", borderRadius: "5px", whiteSpace: "nowrap"
                        }}>
                          {f.value}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Audit Quick-Log */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ marginBottom: "10px" }}>
              <Dot color={C.cyan} />
              RECENT AUDIT EVENTS
            </div>
            <div style={{ height: "1px", background: "linear-gradient(90deg, rgba(0, 229, 255, 0.35) 0%, transparent 100%)", marginBottom: "12px" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
              {(stats?.recentAudits?.slice(0, 5) ?? [
                { id: "a1", action: "MEMORY_WRITE", recordedAt: "2m ago", details: {} },
                { id: "a2", action: "TRUST_SCAN", recordedAt: "5m ago", details: {} },
                { id: "a3", action: "ENTITY_INDEX", recordedAt: "8m ago", details: {} },
                { id: "a4", action: "DRIFT_CHECK", recordedAt: "12m ago", details: {} },
                { id: "a5", action: "CACHE_EVICT", recordedAt: "18m ago", details: {} },
              ]).map((audit: { id: string; action: string; recordedAt: string; details: Record<string, unknown> }, i: number) => {
                const col = audit.action.includes("BLOCK") || audit.action.includes("THREAT") ? C.red
                  : audit.action.includes("WRITE") || audit.action.includes("INDEX") ? C.green : C.cyan;
                return (
                  <div key={audit.id} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 12px", borderRadius: "8px",
                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)"
                  }}>
                    <Dot color={col} />
                    <span style={{
                      fontSize: "11.5px", color: C.body, flex: 1,
                      fontFamily: "var(--font-mono)"
                    }}>{audit.action}</span>
                    <span style={{ fontSize: "12px", color: C.mute }}>{audit.recordedAt}</span>
                  </div>
                );
              })}
            </div>
            <Link href="/compliance" style={{ textDecoration: "none", marginTop: "12px" }}>
              <button className="cmd-bar-btn" style={{ width: "100%", justifyContent: "center" }}>
                View Full Audit Log →
              </button>
            </Link>
          </div>
        </div>

      </div>
    </>
  );
}
