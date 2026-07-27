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
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#fff" }}>Memory Health</div>
          <div style={{ fontSize: "14px", color: "#c0b8cc", marginTop: "2px" }}>Real-time metrics for your CockroachDB memory store</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "8px", background: connected ? "rgba(52,211,153,0.08)" : "rgba(255,94,0,0.08)", border: `1px solid ${connected ? "rgba(52,211,153,0.2)" : "rgba(255,94,0,0.2)"}` }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: connected ? "#34d399" : "#ff5e00", boxShadow: `0 0 6px ${connected ? "#34d399" : "#ff5e00"}` }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: connected ? "#34d399" : "#ff5e00" }}>{connected ? "Live" : "Demo Mode"}</span>
          </div>
          {lastRefresh && <span style={{ fontSize: "11px", color: "#888", fontFamily: "monospace" }}>{lastRefresh}</span>}
        </div>
      </div>

      {/* Row 1: Score + All Metrics + Freshness — full width */}
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", gap: "12px" }}>
        {/* Health Score */}
        <div style={{ padding: "20px", borderRadius: "12px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1.5px", marginBottom: "6px" }}>Score</div>
          <div style={{ fontSize: "48px", fontWeight: 900, fontFamily: "'Space Grotesk'", color: score >= 80 ? "#34d399" : score >= 50 ? "#ff5e00" : "#ef4444" }}>{score}</div>
          <div style={{ fontSize: "12px", color: "#888" }}>/100</div>
          <div style={{ marginTop: "8px", fontSize: "13px", fontWeight: 700, color: score >= 80 ? "#34d399" : score >= 50 ? "#ff5e00" : "#ef4444" }}>
            {score >= 80 ? "✓ Healthy" : score >= 50 ? "⚠ Review" : "✗ Critical"}
          </div>
        </div>

        {/* All 6 Metrics — horizontal */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
          {[
            { l: "Total Memories", v: health?.total_memories ?? 0, c: "#fff" },
            { l: "Pinned Safety", v: health?.pinned_memories ?? 0, c: "#ef4444" },
            { l: "Fresh", v: `${fresh}%`, c: "#34d399" },
            { l: "7-Day Growth", v: `+${health?.memories_last_7_days ?? 0}`, c: "#34d399" },
            { l: "Avg Importance", v: (health?.avg_importance_score ?? 0).toFixed(1), c: "#00e5ff" },
            { l: "Avg Access", v: (health?.avg_access_count ?? 0).toFixed(1), c: "#a78bfa" },
          ].map((m, i) => (
            <div key={i} style={{ padding: "12px", borderRadius: "8px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "10px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px" }}>{m.l}</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: m.c, fontFamily: "'Space Grotesk'", marginTop: "4px" }}>{m.v}</div>
            </div>
          ))}
        </div>

        {/* Freshness Bar + Growth */}
        <div style={{ padding: "16px", borderRadius: "12px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>Freshness</div>
          <div style={{ display: "flex", height: "32px", borderRadius: "6px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ width: `${fresh}%`, background: "rgba(52,211,153,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#34d399", transition: "width 0.5s" }}>{fresh}%</div>
            {parseFloat(stale) > 0 && <div style={{ width: `${stale}%`, background: "rgba(255,94,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, color: "#ff5e00", transition: "width 0.5s" }}>{stale}%</div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", fontSize: "12px" }}>
            <span style={{ color: "#c0b8cc" }}>7-day: <strong style={{ color: "#34d399" }}>+{health?.memories_last_7_days ?? 0}</strong></span>
            <span style={{ color: "#c0b8cc" }}>30-day: <strong style={{ color: "#00e5ff" }}>{health?.memories_last_30_days ?? 0}</strong></span>
          </div>
          <div style={{ fontSize: "11px", color: "#888", marginTop: "6px" }}>Fresh = accessed in last 7 days</div>
        </div>
      </div>

      {/* Row 2: Insights — full width */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
        {[
          { title: "Memory Growth", value: `+${health?.memories_last_7_days ?? 0} this week`, desc: health?.memories_last_7_days ?? 0 > 0 ? "Active memory ingestion detected" : "No new memories in 7 days", color: (health?.memories_last_7_days ?? 0) > 0 ? "#34d399" : "#ff5e00", icon: "📈" },
          { title: "Safety Pinned", value: `${health?.pinned_memories ?? 0} pinned`, desc: (health?.pinned_memories ?? 0) > 0 ? "Safety-critical memories protected" : "No pinned safety memories", color: (health?.pinned_memories ?? 0) > 0 ? "#ef4444" : "#c0b8cc", icon: "📌" },
          { title: "Memory Quality", value: `${(health?.avg_importance_score ?? 0).toFixed(1)}/10`, desc: (health?.avg_importance_score ?? 0) >= 5 ? "Well-maintained memory store" : "Consider reinforcing key memories", color: "#00e5ff", icon: "⭐" },
          { title: "Recall Rate", value: `${(health?.avg_access_count ?? 0).toFixed(1)}× avg`, desc: (health?.avg_access_count ?? 0) > 0 ? "Memories actively recalled by agents" : "No recall patterns yet", color: "#a78bfa", icon: "🔄" },
        ].map((ins, i) => (
          <div key={i} style={{ padding: "14px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "16px" }}>{ins.icon}</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{ins.title}</span>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 800, color: ins.color, fontFamily: "'Space Grotesk'", marginBottom: "4px" }}>{ins.value}</div>
            <div style={{ fontSize: "11px", color: "#888", lineHeight: "1.4" }}>{ins.desc}</div>
          </div>
        ))}
      </div>

      {/* Row 3: Connection Info — full width */}
      <div style={{ padding: "14px 20px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>CockroachDB</span>
          <span style={{ fontSize: "12px", color: "#888" }}>SERIALIZABLE isolation · C-SPANN vectors · CDC changefeed</span>
        </div>
        <span style={{ fontSize: "11px", color: "#666", fontFamily: "monospace" }}>v24.3 · REGIONAL BY ROW · 99.99% uptime</span>
      </div>
    </div>
  );
}
