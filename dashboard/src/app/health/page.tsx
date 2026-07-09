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
      .then(setHealth)
      .catch(() => setError("Failed to load health metrics"));
  }, []);

  if (error) return <div style={{ color: "red", padding: 24 }}>{error}</div>;
  if (!health) return <div style={{ padding: 24 }}>Loading...</div>;

  const freshnessPct = (health.freshness_ratio * 100).toFixed(1);
  const stalePct = (100 - health.freshness_ratio * 100).toFixed(1);

  return (
    <div style={{ padding: 24, fontFamily: "monospace", background: "#0a0a0f", color: "#e0e0e0", minHeight: "100vh" }}>
      <h1 style={{ color: "#00f0ff", marginBottom: 24 }}>Memory Health Dashboard</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        <KpiCard label="Total Memories" value={health.total_memories} color="#00f0ff" />
        <KpiCard label="Pinned (Safety)" value={health.pinned_memories} color="#ff6b6b" />
        <KpiCard label="Last 7 Days" value={health.memories_last_7_days} color="#51cf66" />
        <KpiCard label="Last 30 Days" value={health.memories_last_30_days} color="#ffd43b" />
        <KpiCard label="Freshness" value={`${freshnessPct}%`} color="#51cf66" />
        <KpiCard label="Stale" value={`${stalePct}%`} color="#ff6b6b" />
        <KpiCard label="Avg Access" value={health.avg_access_count.toFixed(1)} color="#74c0fc" />
        <KpiCard label="Avg Importance" value={health.avg_importance_score.toFixed(1)} color="#da77f2" />
      </div>

      <div style={{ background: "#111", borderRadius: 8, padding: 16 }}>
        <h2 style={{ color: "#ffd43b", marginBottom: 12 }}>Freshness Distribution</h2>
        <div style={{ display: "flex", height: 24, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${freshnessPct}%`, background: "#51cf66", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold" }}>
            {freshnessPct}% fresh
          </div>
          <div style={{ width: `${stalePct}%`, background: "#ff6b6b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: "bold" }}>
            {stalePct}% stale
          </div>
        </div>
        <p style={{ color: "#888", fontSize: 12, marginTop: 8 }}>
          Fresh = accessed in last 7 days. Stale = not accessed in 7+ days.
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "#111", borderRadius: 8, padding: 16, borderLeft: `4px solid ${color}` }}>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: "bold" }}>{value}</div>
    </div>
  );
}
