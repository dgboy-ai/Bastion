"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Stats {
  memories: number;
  entities: number;
  relations: number;
  auditLogs: number;
  conflicts: number;
  avgImportance: string;
  recentAudits: Array<{
    id: string;
    action: string;
    recordedAt: string;
    details: any;
  }>;
}

interface Anomaly {
  id: string;
  type: string;
  severity: string;
  detail: string;
  timestamp: string;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, anomaliesRes] = await Promise.all([
          fetch("/api/stats"),
          fetch("/api/anomalies"),
        ]);

        if (!statsRes.ok || !anomaliesRes.ok) {
          throw new Error("Failed to fetch dashboard telemetry");
        }

        const statsData = await statsRes.json();
        const anomaliesData = await anomaliesRes.json();

        setStats(statsData);
        setAnomalies(anomaliesData.alerts || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "60vh" }}>
        <div className="eyebrow">Initializing Telemetry Link</div>
        <div className="title-md">Loading persistent memory HUD...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 0" }}>
        <div className="eyebrow" style={{ color: "var(--accent-sunset)" }}>Telemetry Link Offline</div>
        <div className="title-md" style={{ color: "var(--accent-sunset)" }}>
          Failed to establish database pipeline
        </div>
        <p className="paragraph">
          Error description: {error}. Please verify that BASTION_CONN in .env.local is correct and the CockroachDB cluster is accessible.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow">Telemetry Stream: Active</div>
      <div className="title-xl">Persistent Memory HUD</div>
      <p className="paragraph">
        Real-time transaction log, anomaly checking, and multi-hop cognitive entity stats from your distributed CockroachDB cluster.
      </p>

      {/* Metrics Cards with Integrated SVG Telemetry Sparklines */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Vector Memories</div>
          <div className="stat-val">{stats?.memories}</div>
          <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,25 Q15,5 30,22 T60,10 T80,18 T100,5" fill="none" stroke="var(--accent-breeze)" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="stat-card">
          <div className="stat-label">Graph Entities</div>
          <div className="stat-val">{stats?.entities}</div>
          <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,28 Q20,18 40,25 T80,5 T100,12" fill="none" stroke="var(--accent-dusk)" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="stat-card">
          <div className="stat-label">Graph Relations</div>
          <div className="stat-val">{stats?.relations}</div>
          <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,22 Q10,25 30,12 T70,28 T100,8" fill="none" stroke="var(--accent-sunset)" strokeWidth="1.5" />
          </svg>
        </div>

        <div className="stat-card">
          <div className="stat-label">Average Importance</div>
          <div className="stat-val">{stats?.avgImportance}</div>
          <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,15 L20,15 L40,15 L60,15 L80,15 L100,15" fill="none" stroke="var(--accent-emerald)" strokeWidth="1.5" strokeDasharray="3,3" />
          </svg>
        </div>

        <div className="stat-card">
          <div className="stat-label">Resolved Conflicts</div>
          <div className="stat-val">{stats?.conflicts}</div>
          <svg className="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
            <path d="M0,29 Q30,25 50,5 T100,28" fill="none" stroke="var(--mute)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      <div className="layout-split">
        {/* Left Panel: Audit trail */}
        <div className="panel">
          <div className="panel-header">
            <div className="title-sm" style={{ margin: 0 }}>System Event Log</div>
            <Link href="/logs" className="btn btn-outline" style={{ fontSize: "11px", padding: "6px 12px" }}>
              Query Index
            </Link>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Timestamp</th>
                  <th>Payload details</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentAudits && stats.recentAudits.length > 0 ? (
                  stats.recentAudits.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <span className="badge-mono">{log.action}</span>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                        {new Date(log.recordedAt).toLocaleString()}
                      </td>
                      <td style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "var(--body)" }}>
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "var(--mute)", padding: "20px" }}>
                      No audit operations logged.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Anomalies HUD */}
        <div className="panel">
          <div className="panel-header">
            <div className="title-sm" style={{ margin: 0 }}>Security & Anomalies</div>
          </div>
          {anomalies.length > 0 ? (
            anomalies.map((alert) => (
              <div key={alert.id} className={`alert-box ${alert.severity}`}>
                <div className={`alert-header ${alert.severity}`}>
                  <span>{alert.type}</span>
                  {alert.severity.toUpperCase()}
                </div>
                <div className="alert-desc">{alert.detail}</div>
              </div>
            ))
          ) : (
            <div className="alert-box" style={{ backgroundColor: "transparent", borderColor: "var(--hairline)" }}>
              <div className="alert-header" style={{ color: "var(--mute)" }}>
                <span>Safe</span> OPERATIONS NOMINAL
              </div>
              <div className="alert-desc" style={{ color: "var(--mute)", fontSize: "12.5px" }}>
                Zero duplicate loops or cognitive spikes detected in current session memory structures.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
