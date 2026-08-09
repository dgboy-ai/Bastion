"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";

interface Health {
  total_memories: number;
  pinned_memories: number;
  memories_last_7_days: number;
  memories_last_30_days: number;
  freshness_ratio: number;
  avg_access_count: number;
  avg_importance_score: number;
}

const C = {
  ink: "#000000",
  mute: "#6b7280",
  green: "#047857",
  red: "#b91c1c",
  orange: "#b45309",
  cyan: "#0369a1",
  purple: "#7c3aed"
};

export default function HealthPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const { isMock } = useConnection();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchWithTimeout("/api/health");
      const json = await res.json();
      setHealth(json.data || json);
      setLastRefresh(new Date().toLocaleTimeString());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const connected = !isMock;
  const fresh = health ? (health.freshness_ratio * 100).toFixed(1) : "0.0";
  const stale = health ? (100 - health.freshness_ratio * 100).toFixed(1) : "0.0";
  const score = health ? Math.round(Math.min(100, (health.freshness_ratio * 50) + Math.min(health.avg_importance_score / 10, 1) * 30 + Math.min(health.avg_access_count / 5, 1) * 20)) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="welcome-title" style={{ margin: 0 }}>Memory Health</div>
          <div style={{ fontSize: "14px", color: C.mute, marginTop: "2px", fontWeight: 600 }}>Real-time metrics for your CockroachDB memory store</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "6px",
            background: connected ? "#f0fdf4" : "#fff7ed",
            border: `2.5px solid #000000`,
            boxShadow: "1.5px 1.5px 0px #000000"
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: connected ? C.green : C.orange }} />
            <span style={{ fontSize: "12px", fontWeight: 900, color: connected ? C.green : C.orange, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
              {connected ? "LIVE" : "DEMO MODE"}
            </span>
          </div>
          {lastRefresh && <span style={{ fontSize: "11px", color: C.mute, fontFamily: "monospace", fontWeight: 700 }}>Updated {lastRefresh}</span>}
        </div>
      </div>

      {/* Row 1: Score + All Metrics + Freshness */}
      <div style={{ display: "grid", gridTemplateColumns: "240px 1.5fr 1fr", gap: "20px" }}>
        {/* Health Score */}
        <div className="bento-panel" style={{ padding: "24px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: "11px", color: C.mute, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 800 }}>Health Score</div>
          <div style={{ fontSize: "64px", fontWeight: 950, fontFamily: "var(--font-sans)", color: score >= 80 ? C.green : score >= 50 ? C.orange : C.red, margin: "8px 0" }}>{score}</div>
          <div style={{ fontSize: "12px", color: C.mute, fontWeight: 700, marginTop: "-4px" }}>/100</div>
          <div style={{ marginTop: "14px", padding: "6px 16px", borderRadius: "6px", border: "2.5px solid #000000", background: score >= 80 ? "#f0fdf4" : score >= 50 ? "#fffbeb" : "#fef2f2", fontSize: "13px", fontWeight: 900, color: score >= 80 ? C.green : score >= 50 ? C.orange : C.red, fontFamily: "var(--font-sans)" }}>
            {score >= 80 ? "✓ Healthy" : score >= 50 ? "⚠ Review" : "✗ Critical"}
          </div>
        </div>

        {/* All 6 Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
          {[
            { l: "Total Memories", v: health?.total_memories ?? 0, c: C.ink },
            { l: "Pinned Safety", v: health?.pinned_memories ?? 0, c: C.red },
            { l: "Fresh", v: `${fresh}%`, c: C.green },
            { l: "7-Day Growth", v: `+${health?.memories_last_7_days ?? 0}`, c: C.green },
            { l: "Avg Importance", v: (health?.avg_importance_score ?? 0).toFixed(1), c: C.cyan },
            { l: "Avg Access", v: (health?.avg_access_count ?? 0).toFixed(1), c: C.purple },
          ].map((m, i) => (
            <div key={i} className="bento-panel" style={{ padding: "16px 20px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: "11px", color: C.mute, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 800 }}>{m.l}</div>
              <div style={{ fontSize: "28px", fontWeight: 950, color: m.c, fontFamily: "var(--font-sans)", marginTop: "4px" }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Freshness Bar + Growth */}
        <div className="bento-panel" style={{ padding: "20px", background: "#ffffff", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 900, color: C.ink, marginBottom: "12px", fontFamily: "var(--font-sans)" }}>Freshness</div>
            <div style={{ display: "flex", height: "32px", borderRadius: "8px", overflow: "hidden", border: "2.5px solid #000000" }}>
              <div style={{ width: `${fresh}%`, background: "#d1fae5", borderRight: parseFloat(stale) > 0 ? "2.5px solid #000000" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 900, color: C.green, transition: "width 0.5s" }}>{fresh}%</div>
              {parseFloat(stale) > 0 && <div style={{ width: `${stale}%`, background: "#ffedd5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 900, color: C.orange, transition: "width 0.5s" }}>{stale}%</div>}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", fontSize: "13px", fontWeight: 700 }}>
            <span style={{ color: C.mute }}>7-day: <strong style={{ color: C.green, fontWeight: 900 }}>+{health?.memories_last_7_days ?? 0}</strong></span>
            <span style={{ color: C.mute }}>30-day: <strong style={{ color: C.cyan, fontWeight: 900 }}>{health?.memories_last_30_days ?? 0}</strong></span>
          </div>
          <div style={{ fontSize: "11px", color: C.mute, marginTop: "8px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>Fresh = accessed in last 7 days</div>
        </div>
      </div>

      {/* Row 2: Insights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        {[
          { title: "Memory Growth", value: `+${health?.memories_last_7_days ?? 0} this week`, desc: (health?.memories_last_7_days ?? 0) > 0 ? "Active memory ingestion detected" : "No new memories in 7 days", color: C.green, icon: "📈" },
          { title: "Safety Pinned", value: `${health?.pinned_memories ?? 0} pinned`, desc: (health?.pinned_memories ?? 0) > 0 ? "Safety-critical memories protected" : "No pinned safety memories", color: C.red, icon: "📌" },
          { title: "Memory Quality", value: `${(health?.avg_importance_score ?? 0).toFixed(1)}/10`, desc: (health?.avg_importance_score ?? 0) >= 5 ? "Well-maintained memory store" : "Consider reinforcing key memories", color: C.cyan, icon: "⭐" },
          { title: "Recall Rate", value: `${(health?.avg_access_count ?? 0).toFixed(1)}× avg`, desc: (health?.avg_access_count ?? 0) > 0 ? "Memories actively recalled by agents" : "No recall patterns yet", color: C.purple, icon: "🔄" },
        ].map((ins, i) => (
          <div key={i} className="bento-panel" style={{ padding: "16px", background: "#ffffff" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span style={{ fontSize: "16px" }}>{ins.icon}</span>
              <span style={{ fontSize: "13px", fontWeight: 900, color: C.ink }}>{ins.title}</span>
            </div>
            <div style={{ fontSize: "18px", fontWeight: 950, color: ins.color, fontFamily: "var(--font-sans)", marginBottom: "4px" }}>{ins.value}</div>
            <div style={{ fontSize: "12px", color: C.mute, lineHeight: "1.4", fontWeight: 700 }}>{ins.desc}</div>
          </div>
        ))}
      </div>

      {/* Row 3: Connection Info */}
      <div className="bento-panel" style={{ padding: "16px 20px", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "14px", fontWeight: 900, color: C.ink }}>CockroachDB</span>
          <span style={{ fontSize: "12px", color: C.mute, fontWeight: 700 }}>SERIALIZABLE isolation · C-SPANN vectors · CDC changefeed</span>
        </div>
        <span style={{ fontSize: "11px", color: C.mute, fontFamily: "monospace", fontWeight: 700 }}>v24.3 · REGIONAL BY ROW · 99.99% uptime</span>
      </div>
    </div>
  );
}
