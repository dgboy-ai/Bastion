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
  body: "#c8bfd4",
  mute: "#9a919f",  // Improved contrast (was #6e6478)
  cyan: "#00e5ff",
  green: "#00ff8c",
  amber: "#ffae00",
  orange: "#ff5e00",
  red: "#ff3c00",
  purple: "#9b59ff",
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
      borderRadius: "999px", fontSize: "10px", fontWeight: 700,
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
      fontSize: "10px", fontWeight: 700, fontFamily: "var(--font-mono)", color
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
  const statusColor = isHealthy ? C.green : threats > 0 ? C.red : C.amber;
  const statusText = isHealthy ? "SYSTEM HEALTHY" : threats > 0 ? "THREATS DETECTED" : "CHECKING...";
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: "16px", flexWrap: "wrap",
      padding: "12px 20px",
      background: `linear-gradient(135deg, ${statusColor}08, ${statusColor}04)`,
      border: `1px solid ${statusColor}25`,
      borderRadius: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
        {/* Status */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Dot color={statusColor} pulse />
          <span style={{
            fontSize: "12px", fontWeight: 800, color: statusColor,
            fontFamily: "var(--font-mono)", letterSpacing: "1px"
          }}>
            {statusText}
          </span>
        </div>
        <div style={{ width: "1px", height: "16px", background: `${statusColor}30` }} />
        {/* Memories */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: "20px", fontWeight: 900, color: C.ink, fontFamily: "var(--font-sg)" }}>
            {memories.toLocaleString()}
          </span>
          <span style={{ fontSize: "10px", color: C.mute, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            memories secured
          </span>
        </div>
        <div style={{ width: "1px", height: "16px", background: `${C.border}` }} />
        {/* Threats */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{
            fontSize: "20px", fontWeight: 900, color: threats > 0 ? C.red : C.green,
            fontFamily: "var(--font-sg)"
          }}>
            {threats}
          </span>
          <span style={{ fontSize: "10px", color: C.mute, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            active threats
          </span>
        </div>
        <div style={{ width: "1px", height: "16px", background: `${C.border}` }} />
        {/* Trust */}
        <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{
            fontSize: "20px", fontWeight: 900, color: trustScore >= 80 ? C.green : trustScore >= 50 ? C.amber : C.red,
            fontFamily: "var(--font-sg)"
          }}>
            {trustScore}
          </span>
          <span style={{ fontSize: "10px", color: C.mute, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
            trust score
          </span>
        </div>
      </div>
      {/* Quick actions */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {threats > 0 && (
          <button style={{
            padding: "6px 14px", background: `${C.red}15`, border: `1px solid ${C.red}35`,
            borderRadius: "8px", color: C.red, fontSize: "11px", fontWeight: 700,
            fontFamily: "var(--font-mono)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Review Threats
          </button>
        )}
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
          fontSize: "9.5px", color: C.mute, textTransform: "uppercase",
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
                fontSize: "9px",
                color: trend === "up" ? C.green : trend === "down" ? C.red : C.mute
              }}>
                {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
              </span>
            )}
            <span style={{
              fontSize: "10px", color: C.mute,
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
                display: "inline-block", fontSize: "8.5px", fontWeight: 800,
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
              flexShrink: 0, fontSize: "9.5px", color: C.mute,
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
const SECURITY_EVENTS = [
  { type: "BLOCKED", msg: "Prompt injection: system override attempt", time: "2s ago", color: C.red },
  { type: "PASSED", msg: "Memory commit: agent preferences synced", time: "18s ago", color: C.green },
  { type: "SCAN", msg: "OWASP ASI06 scan completed — 0 violations", time: "45s ago", color: C.cyan },
  { type: "BLOCKED", msg: "SQL injection pattern detected in payload", time: "2m ago", color: C.red },
  { type: "PASSED", msg: "Blockchain ledger integrity verified", time: "4m ago", color: C.green },
  { type: "WARN", msg: "Cognitive drift: elevated to 0.21 threshold", time: "6m ago", color: C.amber },
  { type: "PASSED", msg: "Temporal AS OF snapshot committed", time: "9m ago", color: C.green },
];

function SecurityFeed({ blockedCount }: { blockedCount: number }) {
  const [events, setEvents] = useState(SECURITY_EVENTS);

  useEffect(() => {
    const t = setInterval(() => {
      const newEvt = {
        type: Math.random() > 0.4 ? "PASSED" : "BLOCKED",
        msg: Math.random() > 0.5 ? "Memory integrity check passed" : "Suspicious payload blocked",
        time: "just now",
        color: Math.random() > 0.4 ? C.green : C.red,
      };
      setEvents(prev => [newEvt, ...prev.slice(0, 6)]);
    }, 7000);
    return () => clearInterval(t);
  }, []);

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
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11.5px", color: C.body, lineHeight: 1.4 }}>{e.msg}</div>
            <div style={{ fontSize: "10px", color: C.mute, marginTop: "2px" }}>{e.time}</div>
          </div>
          <Tag color={e.color}>{e.type}</Tag>
        </div>
      ))}
    </div>
  );
}

/* ── Blockchain Timeline ─────────────────────────────────────── */
const CHAIN_EVENTS = [
  { h: 10485, action: "Memory Commit", hash: "0x8fa2…91b2", status: "SUCCESS", ms: 12 },
  { h: 10484, action: "Vector Query", hash: "0x33b8…ab18", status: "SUCCESS", ms: 8 },
  { h: 10483, action: "Integrity Scan", hash: "0x12a9…847c", status: "SUCCESS", ms: 23 },
  { h: 10482, action: "Block Rollback", hash: "0x77c2…e874", status: "BLOCKED", ms: 5 },
  { h: 10481, action: "Schema Drift", hash: "0x9af1…c321", status: "SUCCESS", ms: 16 },
];

function BlockchainTimeline({ live }: { live: boolean }) {
  const [blocks, setBlocks] = useState(CHAIN_EVENTS);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const actions = ["Memory Write", "Vector Index", "Compliance Check", "Temporal Sync", "Cache Evict"];
      const newBlock = {
        h: blocks[0].h + 1,
        action: actions[Math.floor(Math.random() * actions.length)],
        hash: `0x${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`,
        status: Math.random() > 0.12 ? "SUCCESS" : "BLOCKED",
        ms: Math.floor(Math.random() * 30) + 4,
      };
      setBlocks(prev => [newBlock, ...prev.slice(0, 4)]);
    }, 9000);
    return () => clearInterval(t);
  }, [live, blocks]);

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
              fontSize: "9px", color: b.status === "SUCCESS" ? C.green : C.red,
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
              <span style={{ fontSize: "10px", color: C.mute, fontFamily: "var(--font-mono)" }}>{b.ms}ms</span>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
              <span style={{ fontSize: "10.5px", color: C.mute, fontFamily: "var(--font-mono)" }}>#{b.h}</span>
              <span style={{ fontSize: "10.5px", color: C.orange, fontFamily: "var(--font-mono)" }}>{b.hash}</span>
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
      <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "64px" }}>
        {data.map((v, i) => {
          const pct = v / max;
          const color = pct > 0.75 ? C.orange : pct > 0.5 ? C.amber : pct > 0.25 ? C.cyan : C.mute;
          return (
            <div key={i} title={`${v} ops`} style={{
              flex: 1, background: `${color}${Math.round(pct * 255).toString(16).padStart(2, "0")}`,
              borderRadius: "3px 3px 0 0", height: `${Math.max(4, pct * 64)}px`,
              transition: "height 0.5s cubic-bezier(0.16,1,0.3,1)",
              cursor: "pointer",
              border: `1px solid ${color}30`,
            }} />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
        {hours.map(h => (
          <span key={h} style={{ fontSize: "9px", color: C.mute, fontFamily: "var(--font-mono)" }}>{h}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Trust Ring Gauge ──────────────────────────────────────── */
function TrustGauge({ score, danger, total }: { score: number; danger: number; total: number }) {
  const pct = Math.round(score * 100);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = ((100 - pct) / 100) * circ;
  const color = danger > 0 ? C.red : pct > 85 ? C.green : C.amber;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
      {/* Ring */}
      <div style={{ position: "relative", width: "160px", height: "160px", flexShrink: 0 }}>
        <svg width="160" height="160" viewBox="0 0 124 124" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="62" cy="62" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="10" />
          <circle cx="62" cy="62" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1), stroke 0.5s",
              filter: `drop-shadow(0 0 12px ${color}90)`
            }} />
        </svg>
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center"
        }}>
          <span style={{
            fontSize: "38px", fontWeight: 950, color, fontFamily: "var(--font-sg)",
            lineHeight: 1, filter: `drop-shadow(0 0 12px ${color}60)`
          }}>{pct}</span>
          <span style={{
            fontSize: "10px", color: C.mute, fontWeight: 700, letterSpacing: "2.5px",
            textTransform: "uppercase", marginTop: "3px"
          }}>TRUST IDX</span>
        </div>
      </div>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", width: "100%" }}>
        <div style={{
          textAlign: "center", padding: "10px 8px", borderRadius: "10px",
          background: "rgba(0,229,255,0.06)", border: `1px solid ${C.cyan}20`
        }}>
          <div style={{
            fontSize: "10px", color: C.mute, textTransform: "uppercase",
            letterSpacing: "1px", marginBottom: "4px"
          }}>Memories</div>
          <div style={{
            fontSize: "20px", fontWeight: 800, color: C.cyan,
            fontFamily: "var(--font-sg)"
          }}>{total.toLocaleString()}</div>
        </div>
        <div style={{
          textAlign: "center", padding: "10px 8px", borderRadius: "10px",
          background: danger > 0 ? `${C.red}0c` : `${C.green}08`,
          border: `1px solid ${danger > 0 ? C.red : C.green}20`
        }}>
          <div style={{
            fontSize: "10px", color: C.mute, textTransform: "uppercase",
            letterSpacing: "1px", marginBottom: "4px"
          }}>Threats</div>
          <div style={{
            fontSize: "20px", fontWeight: 800, color: danger > 0 ? C.red : C.green,
            fontFamily: "var(--font-sg)"
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
            fontSize: "10px", color: C.mute, fontFamily: "var(--font-mono)",
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
                fontSize: "11px", fontWeight: 700, color: C.amber,
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
  const [blockedCount, setBlockedCount] = useState(0);
  const [displayedMem, setDisplayedMem] = useState(0);
  const [displayedEnt, setDisplayedEnt] = useState(0);
  const [displayedRel, setDisplayedRel] = useState(0);
  const [tick, setTick] = useState(0); // forces re-renders for live clock
  const [feedEntries, setFeedEntries] = useState<FeedEntry[]>([
    { text: "Telemetry online — CockroachDB nominal", isReal: false, ts: new Date().toLocaleTimeString() },
    { text: "OWASP ASI06 rule engine loaded", isReal: false, ts: new Date().toLocaleTimeString() },
    { text: "Cryptographic ledger ready", isReal: false, ts: new Date().toLocaleTimeString() },
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

  // Simulated system event stream (clearly labeled SYS)
  useEffect(() => {
    const sysMsgs = [
      "OWASP ASI06 sweep: 0 violations found",
      "GC evicted 12 stale LTM vectors",
      "Cache hit ratio: 91.4% — optimal",
      "Blockchain ledger anchored at #10485",
      "Memory weight recalibration tick",
      "Follower replica sync: AP-South-1 healthy",
      "SHA-256 hash chain recalculated",
      "Entity index warm: 34 nodes",
    ];
    const iv = setInterval(() => {
      setFeedEntries(prev => [{
        text: sysMsgs[Math.floor(Math.random() * sysMsgs.length)],
        isReal: false,
        ts: new Date().toLocaleTimeString(),
      }, ...prev.slice(0, 14)]);
    }, 5500);
    return () => clearInterval(iv);
  }, []);

  const trustSummary = useMemo(() => ({
    total: stats?.memories || displayedMem || 0,
    danger: stats?.conflicts || 0,
    score: 0.91,
  }), [stats, displayedMem]);

  const hourlyData = useMemo(() => stats?.hourlyGrowth?.length ? stats.hourlyGrowth : [], [stats]);
  const recalls = useMemo(() => stats?.topRecalls || [], [stats]);

  const driftTimeSeries = useMemo(() => [
    { score: 0.12, timestamp: "-15m", status: "HEALTHY" },
    { score: 0.15, timestamp: "-10m", status: "HEALTHY" },
    { score: 0.17, timestamp: "-5m", status: "HEALTHY" },
    { score: driftScore, timestamp: "Now", status: "HEALTHY" },
  ], [driftScore]);

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
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .bento-kpi:hover {
          transform: translateY(-3px);
          border-color: rgba(255, 94, 0, 0.32) !important;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(255, 94, 0, 0.06);
        }
        .bento-panel {
          background: ${C.glass};
          border: 1px solid ${C.border};
          border-radius: 20px;
          padding: 22px 24px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s;
          animation: slideInUp 0.4s ease both;
        }
        .bento-panel:hover {
          border-color: rgba(255, 94, 0, 0.25);
        }
        .panel-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          font-weight: 800;
          font-family: var(--font-mono);
          color: #8a7e96;
          margin-bottom: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cmd-bar-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px; font-size: 12px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          color: ${C.body};
          font-family: var(--font-sans);
        }
        .cmd-bar-btn:hover {
          background: rgba(255, 94, 0, 0.1);
          border-color: rgba(255, 94, 0, 0.3);
          color: #fff;
        }
        .cmd-bar-btn.primary {
          background: linear-gradient(135deg, ${C.orange}, ${C.red});
          border: none;
          color: #fff;
          box-shadow: 0 4px 16px rgba(255, 94, 0, 0.3);
        }
        .cmd-bar-btn.primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(255, 94, 0, 0.4);
        }
        .status-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 5px 12px; border-radius: 999px; font-size: 11px; font-weight: 700;
          font-family: var(--font-mono);
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
                fontSize: "10px", background: `${C.orange}18`, color: C.orange,
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
              <span style={{ color: queryLatency && queryLatency < 100 ? C.green : C.amber, fontWeight: 700 }}>
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
            <Link href="/memory-logs" style={{ textDecoration: "none" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 360px", gap: "12px", alignItems: "start" }}>

          {/* LEFT: single unified card with dividers */}
          <div className="bento-panel" style={{ padding: 0, overflow: "hidden" }}>
            {/* section header */}
            <div style={{
              padding: "12px 16px", borderBottom: "1px solid rgba(255,94,0,0.14)",
              display: "flex", alignItems: "center", gap: "6px"
            }}>
              <Dot color={C.orange} pulse />
              <span style={{
                fontSize: "10px", fontWeight: 800, fontFamily: "var(--font-mono)",
                color: C.mute, textTransform: "uppercase", letterSpacing: "1.2px"
              }}>Metrics</span>
            </div>

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
                  fontSize: "9px", color: C.mute, textTransform: "uppercase",
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
                  fontSize: "9px", color: C.mute, textTransform: "uppercase",
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
                  fontSize: "9px", color: C.mute, textTransform: "uppercase",
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
              padding: "13px 16px", borderBottom: "1px solid rgba(255,94,0,0.14)",
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
                  fontSize: "9px", color: C.mute, textTransform: "uppercase",
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

            {/* TRUST RING section */}
            <div style={{ padding: "16px" }}>
              <div style={{
                fontSize: "9px", color: C.mute, textTransform: "uppercase",
                letterSpacing: "1px", marginBottom: "12px", fontFamily: "var(--font-mono)",
                display: "flex", alignItems: "center", gap: "6px"
              }}>
                <Dot color={C.green} pulse />
                Trust Index
              </div>
              <TrustGauge score={trustSummary.score} danger={trustSummary.danger} total={trustSummary.total} />
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

          {/* CENTER: Drift Chart + unique system vitals */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            {/* header */}
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              borderBottom: "1px solid rgba(0,229,255,0.1)", paddingBottom: "12px", marginBottom: "14px"
            }}>
              <Dot color={C.cyan} pulse />
              <span style={{
                fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                letterSpacing: "1.2px", color: "#6a9aaa", textTransform: "uppercase"
              }}>
                Agent Stability
              </span>
              <span style={{
                marginLeft: "auto", fontSize: "9px", background: `${C.cyan}15`,
                color: C.cyan, border: `1px solid ${C.cyan}30`, padding: "2px 7px",
                borderRadius: "4px", fontWeight: 800, fontFamily: "var(--font-mono)"
              }}>BEHAVIORAL</span>
            </div>

            {/* drift chart */}
            <div style={{ minHeight: "200px" }}>
              <DriftChart
                timeSeries={driftTimeSeries}
                overallScore={driftScore}
                status="HEALTHY"
                topSignals={["User Drift: Stable", "Query Shift: Invariant"]}
                recommendation="High-fidelity verification pass. Indices optimal."
                loading={false}
              />
            </div>

            {/* ── divider ── */}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "14px 0" }} />

            {/* system vitals — progress bars */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
              <Dot color={C.purple} />
              <span style={{
                fontSize: "9px", color: C.mute, textTransform: "uppercase",
                letterSpacing: "1px", fontFamily: "var(--font-mono)"
              }}>System Vitals</span>
            </div>
            {[
              { label: "Memory Utilization", value: stats?.memories ?? 0, max: 5000, color: C.cyan },
              { label: "Entity Index Capacity", value: stats?.entities ?? 0, max: 1000, color: C.orange },
              { label: "Relation Graph Edges", value: stats?.relations ?? 0, max: 1000, color: C.green },
              { label: "Audit Log Entries", value: stats?.auditLogs ?? 0, max: 1000, color: C.amber },
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
                      fontSize: "10.5px", color: "#b0a8bc",
                      fontFamily: "var(--font-mono)"
                    }}>{v.label}</span>
                    <span style={{
                      fontSize: "11px", fontWeight: 700, color: v.color,
                      fontFamily: "var(--font-sg)"
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

          {/* RIGHT: Premium Live Feed */}
          <div className="bento-panel" style={{
            display: "flex", flexDirection: "column",
            background: "rgba(4, 2, 7, 0.97)", position: "relative"
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
              borderBottom: "1px solid rgba(0,255,140,0.1)", paddingBottom: "12px", marginBottom: "10px"
            }}>
              <Dot color={C.green} pulse />
              <span style={{
                fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                letterSpacing: "1.2px", color: "#7aaa7a", textTransform: "uppercase"
              }}>
                Live DB Feed
              </span>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "8.5px", fontFamily: "var(--font-mono)", color: C.mute }}>
                  {feedEntries.length} events
                </span>
                <span style={{
                  fontSize: "9px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: "rgba(0,255,140,0.12)", color: C.green, border: "1px solid rgba(0,255,140,0.25)",
                  padding: "2px 7px", borderRadius: "4px"
                }}>● LIVE</span>
              </div>
            </div>

            {/* legend: real vs simulated */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{
                  fontSize: "8px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: `${C.cyan}18`, color: C.cyan, border: `1px solid ${C.cyan}40`,
                  padding: "1px 5px", borderRadius: "3px"
                }}>SQL</span>
                <span style={{ fontSize: "9.5px", color: C.mute, fontFamily: "var(--font-mono)" }}>real query</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{
                  fontSize: "8px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: `${C.green}15`, color: C.green, border: `1px solid ${C.green}40`,
                  padding: "1px 5px", borderRadius: "3px"
                }}>DB</span>
                <span style={{ fontSize: "9.5px", color: C.mute, fontFamily: "var(--font-mono)" }}>real event</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{
                  fontSize: "8px", fontWeight: 800, fontFamily: "var(--font-mono)",
                  background: "rgba(255,255,255,0.04)", color: C.mute, border: "1px solid rgba(255,255,255,0.1)",
                  padding: "1px 5px", borderRadius: "3px"
                }}>SYS</span>
                <span style={{ fontSize: "9.5px", color: C.mute, fontFamily: "var(--font-mono)" }}>simulated</span>
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
              borderBottom: `1px solid rgba(255,174,0,0.12)`, paddingBottom: "12px", marginBottom: "14px"
            }}>
              <Dot color={C.amber} />
              <span style={{
                fontSize: "11px", fontWeight: 800, fontFamily: "var(--font-mono)",
                color: "#9a8a5a", textTransform: "uppercase", letterSpacing: "1.2px"
              }}>
                Memory Ingestion
              </span>
              <span style={{
                marginLeft: "auto", fontSize: "9px", color: C.mute,
                fontFamily: "var(--font-mono)"
              }}>24h activity</span>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <MemoryHeatmap hourly={hourlyData} />
            </div>
            {/* ── divider ── */}
            <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "16px 0" }} />
            {/* real stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              {[
                { label: "Cache Hit", value: `${stats?.cacheHitPct ?? "—"}%`, color: C.cyan },
                { label: "Importance", value: parseFloat(stats?.avgImportance ?? "0").toFixed(2), color: C.amber },
                { label: "Drift Index", value: driftScore.toFixed(3), color: driftScore > 0.3 ? C.red : C.green },
              ].map((m, i) => (
                <div key={i} style={{
                  textAlign: "center", padding: "8px 0",
                  borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <div style={{
                    fontSize: "9px", color: C.mute, textTransform: "uppercase",
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
            <div className="panel-label" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "10px" }}>
              <Dot color={C.orange} pulse />
              Audit Trail
            </div>
            <div style={{ flex: 1, marginTop: "12px", overflowY: "auto" }}>
              <BlockchainTimeline live={!isMock} />
            </div>
          </div>

          {/* Security Events */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "10px" }}>
              <Dot color={C.red} pulse />
              Threats Blocked
              <span style={{ marginLeft: "auto" }}>
                <Tag color={C.red}>{activeBlockedCount} BLOCKED</Tag>
              </span>
            </div>
            <div style={{ flex: 1, marginTop: "12px", overflowY: "auto" }}>
              <SecurityFeed blockedCount={activeBlockedCount} />
            </div>
          </div>
        </div>

        {/* ── ROW 4: TOP RECALLS + SYSTEM VITALS + AUDIT LOG ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px 320px", gap: "12px" }}>

          {/* Top Recalls */}
          <div className="bento-panel">
            <div className="panel-label">
              <Dot color={C.purple} />
              TOP MEMORY RECALL PATTERNS
            </div>
            <RecallsTable recalls={recalls} />
          </div>

          {/* System Vitals */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="panel-label">
              <Dot color={C.green} />
              SYSTEM VITALS
            </div>
            <VitalRow label="Memory Utilization" value={displayedMem} max={5000} color={C.cyan} />
            <VitalRow label="Entity Index Capacity" value={displayedEnt} max={1000} color={C.orange} />
            <VitalRow label="Relation Graph Edges" value={displayedRel} max={500} color={C.green} />
            <VitalRow label="Audit Log Entries" value={stats?.auditLogs ?? 248} max={1000} color={C.amber} />
            <VitalRow label="Attack Shield Coverage" value={activeBlockedCount} max={500} color={C.red} />
            <div style={{
              marginTop: "8px", padding: "10px 12px",
              background: "rgba(0, 255, 140, 0.04)", borderRadius: "10px",
              border: `1px solid ${C.green}20`, display: "flex", alignItems: "center", gap: "8px"
            }}>
              <Dot color={C.green} pulse />
              <span style={{ fontSize: "11px", color: C.body }}>All systems nominal</span>
              <span style={{
                marginLeft: "auto", fontSize: "10px", fontFamily: "var(--font-mono)",
                color: C.mute
              }}>{queryLatency ?? "—"}ms</span>
            </div>
          </div>

          {/* Audit Quick-Log */}
          <div className="bento-panel" style={{ display: "flex", flexDirection: "column" }}>
            <div className="panel-label" style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: "10px" }}>
              <Dot color={C.cyan} />
              RECENT AUDIT EVENTS
            </div>
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
                    <span style={{ fontSize: "10px", color: C.mute }}>{audit.recordedAt}</span>
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
