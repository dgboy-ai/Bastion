"use client";

interface Stats {
  totalEvents: number;
  avgLatency: number;
  anomalyCount: number;
  eventsPerSecond: number;
}

interface StatCardProps {
  value: string;
  label: string;
  color: string;
}

function StatCard({ value, label, color }: StatCardProps) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: "16px",
          fontWeight: 700,
          color,
          fontFamily: "var(--font-mono)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
        {label}
      </div>
    </div>
  );
}

export default function CdcStatsGrid({ stats }: { stats: Stats }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "12px",
        marginBottom: "16px",
      }}
    >
      <StatCard
        value={String(stats.totalEvents)}
        label="TOTAL EVENTS"
        color="var(--accent-sunset)"
      />
      <StatCard
        value={`${stats.avgLatency}ms`}
        label="AVG LATENCY"
        color="var(--accent-breeze)"
      />
      <StatCard
        value={String(stats.anomalyCount)}
        label="ANOMALIES"
        color={stats.anomalyCount > 0 ? "#ff4444" : "var(--accent-emerald)"}
      />
      <StatCard
        value={`${stats.eventsPerSecond}/s`}
        label="THROUGHPUT"
        color="var(--accent-dusk)"
      />
    </div>
  );
}
