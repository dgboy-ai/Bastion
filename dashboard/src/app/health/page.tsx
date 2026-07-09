"use client";

import { useEffect, useState } from "react";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((json) => setHealth(json.data || json))
      .catch(() => setError("Failed to load health metrics"));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "40px 0" }}>
        <div className="eyebrow" style={{ color: "var(--accent-sunset)" }}>Health Check Failed</div>
        <div className="title-md" style={{ color: "var(--accent-sunset)" }}>{error}</div>
        <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => { setError(null); window.location.reload(); }}>
          Retry
        </button>
      </div>
    );
  }

  if (!health) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div className="eyebrow">Loading Health Metrics...</div>
        <div style={{ marginTop: 16, color: "var(--mute)" }}>Querying CockroachDB</div>
      </div>
    );
  }

  const freshnessPct = (health.freshness_ratio * 100).toFixed(1);
  const stalePct = (100 - health.freshness_ratio * 100).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <div className="welcome-title">Memory Health Dashboard</div>
        <div className="welcome-subtitle">
          Real-time health metrics for your CockroachDB memory store. Freshness, growth, and access patterns.
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <KpiCard label="Total Memories" value={health.total_memories} color="var(--accent-breeze)" icon="💾" />
        <KpiCard label="Pinned (Safety)" value={health.pinned_memories} color="var(--accent-sunset)" icon="📌" />
        <KpiCard label="Last 7 Days" value={health.memories_last_7_days} color="var(--accent-emerald)" icon="📈" />
        <KpiCard label="Last 30 Days" value={health.memories_last_30_days} color="var(--accent-dusk)" icon="📅" />
        <KpiCard label="Freshness" value={`${freshnessPct}%`} color="var(--accent-emerald)" icon="✨" />
        <KpiCard label="Stale" value={`${stalePct}%`} color="var(--accent-sunset)" icon="⚠" />
        <KpiCard label="Avg Access" value={health.avg_access_count.toFixed(1)} color="var(--accent-breeze)" icon="🔄" />
        <KpiCard label="Avg Importance" value={health.avg_importance_score.toFixed(1)} color="var(--accent-dusk)" icon="⭐" />
      </div>

      {/* Freshness Distribution Bar */}
      <div className="metrics-panel">
        <div className="panel-title">Freshness Distribution</div>
        <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden", border: "1px solid var(--glass-border)" }}>
          <div
            style={{
              width: `${freshnessPct}%`,
              background: "linear-gradient(90deg, rgba(0,255,102,0.2), rgba(0,255,102,0.4))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, color: "var(--accent-emerald)",
              borderRight: freshPct > 0 ? "1px solid var(--glass-border)" : "none",
            }}
          >
            {freshnessPct}% fresh
          </div>
          <div
            style={{
              width: `${stalePct}%`,
              background: "linear-gradient(90deg, rgba(255,85,0,0.2), rgba(255,85,0,0.4))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, color: "var(--accent-sunset)",
            }}
          >
            {stalePct}% stale
          </div>
        </div>
        <p style={{ color: "var(--mute)", fontSize: 12, marginTop: 8 }}>
          Fresh = accessed in last 7 days. Stale = not accessed in 7+ days.
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div className="metrics-panel" style={{ borderLeft: `3px solid ${color}`, transition: "all 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "var(--mute)", fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div style={{ color, fontSize: 28, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}
