"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

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
    fetchWithTimeout("/api/health")
      .then((r) => r.json())
      .then((json) => setHealth(json.data || json))
      .catch(() => setError("Failed to load health metrics"));
  }, []);

  if (error) {
    return (
      <div style={{ padding: "40px 0" }} className="animate-fade-in">
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
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div className="animate-fade-in-up">
          <div className="welcome-title">Memory Health Dashboard</div>
          <div className="welcome-subtitle">Real-time health metrics for your CockroachDB memory store.</div>
        </div>
        <div className="stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shimmer-pulse" style={{ height: 90, borderRadius: 10 }} />
          ))}
        </div>
      </div>
    );
  }

  const freshnessPct = (health.freshness_ratio * 100).toFixed(1);
  const stalePct = (100 - health.freshness_ratio * 100).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }} className="stagger-children">
      <div className="animate-fade-in-up">
        <div className="welcome-title">Memory Health Dashboard</div>
        <div className="welcome-subtitle">
          Real-time health metrics for your CockroachDB memory store. Freshness, growth, and access patterns.
        </div>
      </div>

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

      <div className="panel hover-glow" style={{ padding: "20px" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>Freshness Distribution</div>
        <div style={{ display: "flex", height: 32, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{
            width: `${freshnessPct}%`, transition: "width 0.5s ease",
            background: "linear-gradient(90deg, rgba(0,255,136,0.2), rgba(0,255,136,0.4))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 600, color: "#00ff88",
          }}>
            {freshnessPct}% fresh
          </div>
          <div style={{
            width: `${stalePct}%`, transition: "width 0.5s ease",
            background: "linear-gradient(90deg, rgba(255,85,0,0.2), rgba(255,85,0,0.4))",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 600, color: "#ff5500",
          }}>
            {stalePct}% stale
          </div>
        </div>
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
          Fresh = accessed in last 7 days. Stale = not accessed in 7+ days.
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div className="card-interactive" style={{ padding: "16px 20px", borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#6b7280", fontSize: 12, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div style={{ color, fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
