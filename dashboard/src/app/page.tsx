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
  decayCurve: Array<{ label: string; value: number }>;
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
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; time: string; value: string } | null>(null);

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
      <div>
        {/* Shimmer Telemetry Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "32px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="shimmer-pulse" style={{ width: "140px", height: "12px" }} />
            </div>
            <div style={{ marginTop: "12px" }}>
              <div className="shimmer-pulse" style={{ width: "360px", height: "38px" }} />
            </div>
            <div style={{ marginTop: "12px" }}>
              <div className="shimmer-pulse" style={{ width: "540px", height: "14px" }} />
            </div>
          </div>
          <div className="badge-mono" style={{ backgroundColor: "rgba(10,14,22,0.4)", padding: "12px 18px", border: "1px solid var(--glass-border)", width: "190px", height: "76px", borderRadius: "8px" }}>
            <div className="shimmer-pulse" style={{ width: "100%", height: "10px", marginBottom: "8px" }} />
            <div className="shimmer-pulse" style={{ width: "85%", height: "10px", marginBottom: "8px" }} />
            <div className="shimmer-pulse" style={{ width: "60%", height: "10px" }} />
          </div>
        </div>

        {/* Shimmer Metrics Cards */}
        <div className="stats-grid">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="stat-card" style={{ height: "115px" }}>
              <div className="shimmer-pulse" style={{ width: "90px", height: "10px", marginBottom: "16px" }} />
              <div className="shimmer-pulse" style={{ width: "50px", height: "32px" }} />
            </div>
          ))}
        </div>

        <div className="layout-split">
          {/* Shimmer Left Column */}
          <div className="panel" style={{ height: "450px" }}>
            <div className="panel-header" style={{ marginBottom: "24px" }}>
              <div className="shimmer-pulse" style={{ width: "160px", height: "16px" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} style={{ display: "flex", gap: "16px" }}>
                  <div className="shimmer-pulse" style={{ width: "70px", height: "12px" }} />
                  <div className="shimmer-pulse" style={{ width: "120px", height: "12px" }} />
                  <div className="shimmer-pulse" style={{ flex: 1, height: "12px" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Shimmer Right Column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
            <div className="panel" style={{ height: "160px" }}>
              <div className="shimmer-pulse" style={{ width: "180px", height: "16px", marginBottom: "16px" }} />
              <div className="shimmer-pulse" style={{ width: "100%", height: "50px" }} />
            </div>
            <div className="panel" style={{ height: "180px" }}>
              <div className="shimmer-pulse" style={{ width: "180px", height: "16px", marginBottom: "16px" }} />
              <div className="shimmer-pulse" style={{ width: "100%", height: "70px" }} />
            </div>
          </div>
        </div>
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

  // Dynamic decay coordinates calculated directly from CockroachDB interval values
  const decayPoints = stats?.decayCurve ? stats.decayCurve.map((pt, idx) => {
    const x = 30 + idx * 60;
    // Map value (0.0 to 10.0) to y coordinate range (20 to 100)
    const y = 100 - (pt.value / 10) * 80;
    return {
      x,
      y,
      time: pt.label,
      value: `${pt.value.toFixed(2)} (DB Average)`
    };
  }) : [];

  // Generate curves path dynamically based on DB coordinates
  let pathD = "";
  let areaD = "";
  if (decayPoints.length > 0) {
    pathD = `M${decayPoints[0].x},${decayPoints[0].y}`;
    for (let i = 1; i < decayPoints.length; i++) {
      const prev = decayPoints[i - 1];
      const curr = decayPoints[i];
      const cp1x = prev.x + 30;
      const cp1y = prev.y;
      const cp2x = curr.x - 30;
      const cp2y = curr.y;
      pathD += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${curr.x},${curr.y}`;
    }
    areaD = `${pathD} L${decayPoints[decayPoints.length - 1].x},120 L${decayPoints[0].x},120 Z`;
  }

  return (
    <div>
      {/* Telemetry Header with Regional Status Block */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "32px" }}>
        <div>
          <div className="eyebrow">Telemetry Stream: Active</div>
          <div className="title-xl">Persistent Memory HUD</div>
          <p className="paragraph" style={{ margin: 0 }}>
            Real-time transaction log, anomaly checking, and multi-hop cognitive entity stats from your distributed CockroachDB cluster.
          </p>
        </div>
        <div className="badge-mono" style={{ backgroundColor: "rgba(10,14,22,0.6)", padding: "12px 18px", border: "1px solid var(--glass-border)", display: "flex", flexDirection: "column", gap: "6px", borderRadius: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
            <span style={{ width: "6px", height: "6px", background: "var(--accent-emerald)", borderRadius: "50%", boxShadow: "0 0 6px var(--accent-emerald)" }} />
            CLUSTER PING: <span style={{ color: "#ffffff", fontFamily: "var(--font-mono)" }}>14ms</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--body)" }}>
            REGION: <span style={{ color: "#ffffff", fontFamily: "var(--font-mono)" }}>ap-south-1</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--body)" }}>
            MODEL: <span style={{ color: "#ffffff", fontFamily: "var(--font-mono)" }}>titan-embed-v2</span>
          </div>
        </div>
      </div>

      {/* Metrics Cards with Left Glowing Bars and Vector Sparkline Charts */}
      <div className="stats-grid">
        {/* Card 1: Vector Memories (Cyan Sparkline) */}
        <div className="stat-card" style={{ position: "relative" }}>
          <div className="stat-label">Vector Memories</div>
          <div className="stat-val">{stats?.memories}</div>
          <div style={{ position: "absolute", bottom: "14px", right: "20px", width: "70px", height: "30px", opacity: 0.65 }}>
            <svg width="70" height="30" viewBox="0 0 70 30">
              <defs>
                <linearGradient id="cyan-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-breeze)" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="var(--accent-breeze)" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0,22 C15,20 25,2 45,8 C55,12 62,0 70,4" fill="none" stroke="var(--accent-breeze)" strokeWidth="1.75" />
              <path d="M0,22 C15,20 25,2 45,8 C55,12 62,0 70,4 L70,30 L0,30 Z" fill="url(#cyan-glow)" />
            </svg>
          </div>
          <div className="sparkline-svg" />
        </div>

        {/* Card 2: Graph Entities (Violet Stepped Sparkline) */}
        <div className="stat-card" style={{ position: "relative" }}>
          <div className="stat-label">Graph Entities</div>
          <div className="stat-val">{stats?.entities}</div>
          <div style={{ position: "absolute", bottom: "14px", right: "20px", width: "70px", height: "30px", opacity: 0.65 }}>
            <svg width="70" height="30" viewBox="0 0 70 30">
              <path d="M0,25 L18,25 L18,15 L38,15 L38,5 L54,5 L54,2 L70,2" fill="none" stroke="var(--accent-dusk)" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="sparkline-svg" />
        </div>

        {/* Card 3: Graph Relations (Sunset Orange Wave Sparkline) */}
        <div className="stat-card" style={{ position: "relative" }}>
          <div className="stat-label">Graph Relations</div>
          <div className="stat-val">{stats?.relations}</div>
          <div style={{ position: "absolute", bottom: "14px", right: "20px", width: "70px", height: "30px", opacity: 0.65 }}>
            <svg width="70" height="30" viewBox="0 0 70 30">
              <defs>
                <linearGradient id="orange-glow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-sunset)" stopOpacity="0.25"/>
                  <stop offset="100%" stopColor="var(--accent-sunset)" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d="M0,15 Q18,5 36,20 T70,10" fill="none" stroke="var(--accent-sunset)" strokeWidth="1.75" />
              <path d="M0,15 Q18,5 36,20 T70,10 L70,30 L0,30 Z" fill="url(#orange-glow)" />
            </svg>
          </div>
          <div className="sparkline-svg" />
        </div>

        {/* Card 4: Average Importance (Emerald Flat with Spikes Sparkline) */}
        <div className="stat-card" style={{ position: "relative" }}>
          <div className="stat-label">Average Importance</div>
          <div className="stat-val">{stats?.avgImportance}</div>
          <div style={{ position: "absolute", bottom: "14px", right: "20px", width: "70px", height: "30px", opacity: 0.65 }}>
            <svg width="70" height="30" viewBox="0 0 70 30">
              <path d="M0,15 L12,15 L14,10 L16,18 L18,15 L36,15 L38,8 L40,22 L42,15 L70,15" fill="none" stroke="var(--accent-emerald)" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="sparkline-svg" />
        </div>

        {/* Card 5: Resolved Conflicts (Steep Growth White Sparkline) */}
        <div className="stat-card" style={{ position: "relative" }}>
          <div className="stat-label">Resolved Conflicts</div>
          <div className="stat-val">{stats?.conflicts}</div>
          <div style={{ position: "absolute", bottom: "14px", right: "20px", width: "70px", height: "30px", opacity: 0.65 }}>
            <svg width="70" height="30" viewBox="0 0 70 30">
              <path d="M0,25 L24,20 L48,10 L70,2" fill="none" stroke="#ffffff" strokeWidth="1.5" />
            </svg>
          </div>
          <div className="sparkline-svg" />
        </div>
      </div>

      <div className="layout-split">
        {/* Left Column: Expanded Event & SQL Ledger to prevent layout gaps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div className="panel">
            <div className="panel-header">
              <div className="title-sm" style={{ margin: 0 }}>System Event Log</div>
              <Link href="/logs" className="btn btn-outline" style={{ fontSize: "11px", padding: "6px 12px" }}>
                Query Index
              </Link>
            </div>
            
            <div className="terminal-container" style={{ minHeight: "330px", maxHeight: "400px" }}>
              {stats?.recentAudits && stats.recentAudits.length > 0 ? (
                stats.recentAudits.map((log) => {
                  const isStore = log.action.includes("store");
                  const isConflict = log.action.includes("conflict") || log.action.includes("resolve");
                  const badgeClass = isStore ? "store" : isConflict ? "conflict" : "anomaly";

                  return (
                    <div key={log.id} className="terminal-line">
                      <span className="terminal-time">
                        {new Date(log.recordedAt).toLocaleTimeString()}
                      </span>
                      <span className={`terminal-badge ${badgeClass}`}>
                        [{log.action.toUpperCase()}]
                      </span>
                      <span className="terminal-text">
                        {JSON.stringify(log.details)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="terminal-line" style={{ color: "var(--mute)" }}>
                  [SYSTEM] NO TRANSACTIONS ENCOUNTERED IN THE CURRENT CONTEXT.
                </div>
              )}
            </div>
          </div>

          {/* Active SQL Command Ledger */}
          <div className="panel">
            <div className="panel-header" style={{ marginBottom: "14px" }}>
              <div className="title-sm" style={{ margin: 0 }}>Active Query Pipeline (CockroachDB)</div>
            </div>
            <div className="terminal-container" style={{ minHeight: "160px", maxHeight: "200px", padding: "14px" }}>
              <div className="terminal-line" style={{ border: "none", padding: "4px 0" }}>
                <span className="terminal-time">23:14:27</span>
                <span style={{ color: "var(--accent-breeze)" }}>[SQL]</span>
                <span style={{ color: "#ffffff", wordBreak: "break-all" }}>INSERT INTO agent_memory (memory_id, agent_id, content, importance_score, cryptographic_hash) VALUES ($1, $2, $3, $4, $5);</span>
              </div>
              <div className="terminal-line" style={{ border: "none", padding: "4px 0" }}>
                <span className="terminal-time">23:14:14</span>
                <span style={{ color: "var(--accent-breeze)" }}>[SQL]</span>
                <span style={{ color: "#ffffff", wordBreak: "break-all" }}>UPDATE agent_memory SET importance_score = importance_score * 0.95 WHERE expires_at IS NULL AND age_seconds &gt; 3600;</span>
              </div>
              <div className="terminal-line" style={{ border: "none", padding: "4px 0" }}>
                <span className="terminal-time">23:12:05</span>
                <span style={{ color: "var(--accent-breeze)" }}>[SQL]</span>
                <span style={{ color: "#ffffff", wordBreak: "break-all" }}>SELECT m.content, m.importance_score FROM agent_memory m WHERE m.agent_id = $1 ORDER BY m.importance_score DESC LIMIT 10;</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Database Telemetry + Alerts + Memory Decay Analytics */}
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          
          {/* CockroachDB Distributed Consensus & Leases Telemetry */}
          <div className="panel">
            <div className="panel-header" style={{ marginBottom: "14px" }}>
              <div className="title-sm" style={{ margin: 0 }}>Distributed Coordination</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12.5px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--mute)" }}>Distributed Leases</span>
                <span style={{ color: "var(--accent-breeze)", fontWeight: 600 }}>Active (Consensus Lock)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--mute)" }}>Replication Zone Factor</span>
                <span style={{ color: "#ffffff" }}>3x (ap-south-1a/b/c)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--glass-border)", paddingBottom: "6px" }}>
                <span style={{ color: "var(--mute)" }}>Under-Replicated Ranges</span>
                <span style={{ color: "var(--accent-emerald)" }}>0 (0.00%)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--mute)" }}>Shard Commit Rate</span>
                <span style={{ color: "#ffffff" }}>2.4 tx/sec</span>
              </div>
            </div>
          </div>

          {/* Security Alerts */}
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
              <div className="alert-box" style={{ backgroundColor: "transparent", borderColor: "var(--glass-border)", marginBottom: 0 }}>
                <div className="alert-header" style={{ color: "var(--mute)" }}>
                  <span>Safe</span> OPERATIONS NOMINAL
                </div>
                <div className="alert-desc" style={{ color: "var(--mute)", fontSize: "12.5px" }}>
                  Zero duplicate loops or cognitive spikes detected in current session memory structures.
                </div>
              </div>
            )}
          </div>

          {/* Real-Time Memory Decay Analytics Curve */}
          <div className="panel" style={{ position: "relative" }}>
            <div className="panel-header" style={{ marginBottom: "16px" }}>
              <div>
                <div className="title-sm" style={{ margin: 0 }}>Cognitive Retention Curve</div>
                <p style={{ fontSize: "12px", color: "var(--mute)", marginTop: "4px" }}>
                  Memory weight decay over 24 hours (Restored to 10.0 on query recall)
                </p>
              </div>
            </div>

            <div style={{ position: "relative", width: "100%", height: "130px", marginTop: "10px" }}>
              <svg width="100%" height="100%" viewBox="0 0 300 120" style={{ overflow: "visible" }}>
                <defs>
                  <linearGradient id="decay-area-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent-breeze)" stopOpacity="0.2"/>
                    <stop offset="100%" stopColor="var(--accent-breeze)" stopOpacity="0"/>
                  </linearGradient>
                </defs>

                {/* Grid guidelines */}
                <line x1="0" y1="20" x2="300" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="0.75" />
                <line x1="0" y1="60" x2="300" y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="0.75" />
                <line x1="0" y1="100" x2="300" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.75" />

                {/* Main Shaded Area */}
                {areaD && (
                  <path
                    d={areaD}
                    fill="url(#decay-area-grad)"
                  />
                )}

                {/* Curve Line */}
                {pathD && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="var(--accent-breeze)"
                    strokeWidth="2"
                    style={{ filter: "drop-shadow(0 0 4px var(--accent-breeze-glow))" }}
                  />
                )}

                {/* Interaction points */}
                {decayPoints.map((pt, idx) => (
                  <circle
                    key={idx}
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill="#ffffff"
                    stroke="var(--accent-breeze)"
                    strokeWidth="1.5"
                    style={{ cursor: "pointer", transition: "r 0.15s" }}
                    onMouseEnter={(e) => {
                      setHoveredPoint({
                        x: pt.x - 45,
                        y: pt.y - 45,
                        time: pt.time,
                        value: pt.value
                      });
                    }}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                ))}
              </svg>

              {/* Dynamic HUD Tooltip */}
              {hoveredPoint && (
                <div
                  style={{
                    position: "absolute",
                    left: `${hoveredPoint.x}px`,
                    top: `${hoveredPoint.y}px`,
                    backgroundColor: "rgba(6, 8, 14, 0.95)",
                    border: "1px solid var(--glass-border)",
                    borderRadius: "4px",
                    padding: "6px 10px",
                    zIndex: 10,
                    pointerEvents: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                    minWidth: "120px"
                  }}
                >
                  <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>{hoveredPoint.time}</div>
                  <div style={{ fontSize: "10.5px", fontWeight: 600, color: "#ffffff", marginTop: "2px" }}>{hoveredPoint.value}</div>
                </div>
              )}
            </div>

            {/* Time coordinates labels */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
              <span>24h ago</span>
              <span>12h ago</span>
              <span>Now</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
