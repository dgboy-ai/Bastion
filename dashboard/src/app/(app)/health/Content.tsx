"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";
import LogsPage from "@/app/logs/Content";

interface Health {
  total_memories: number;
  pinned_memories: number;
  memories_last_7_days: number;
  memories_last_30_days: number;
  freshness_ratio: number;
  avg_access_count: number;
  avg_importance_score: number;
  stm_total: number;
  stm_active: number;
  audit_total: number;
  audit_recent: number;
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

function TimeTravelPanel() {
  const [timestamp, setTimestamp] = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryTimeTravel = async () => {
    if (!timestamp) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetchWithTimeout(`/api/health?as_of=${encodeURIComponent(timestamp)}`);
      const json = await res.json();
      const data = json.data || json;
      setResults(data.memories || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  };

  const presets = [
    { label: "1 hour ago", ts: new Date(Date.now() - 3600000).toISOString() },
    { label: "24 hours ago", ts: new Date(Date.now() - 86400000).toISOString() },
    { label: "7 days ago", ts: new Date(Date.now() - 604800000).toISOString() },
  ];

  return (
    <div className="bento-panel" style={{ padding: "24px 28px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "14px" }}>
        <span style={{ fontSize: "18px" }}>⏱️</span>
        <span style={{
          fontSize: "15px", fontWeight: 900, fontFamily: "'Space Grotesk', sans-serif",
          letterSpacing: "2px", color: "#000000"
        }}>AS OF SYSTEM TIME — Time-Travel Query</span>
      </div>
      <div style={{ height: "3px", background: "#000000", marginBottom: "16px" }} />
      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "16px", fontWeight: 600 }}>
        Query the memory state at any point in the past. CockroachDB maintains MVCC snapshots — no extra storage needed.
      </div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "12px", flexWrap: "wrap" }}>
        <input
          type="datetime-local"
          value={timestamp ? new Date(timestamp).toISOString().slice(0, 16) : ""}
          onChange={(e) => setTimestamp(e.target.value ? new Date(e.target.value).toISOString() : "")}
          style={{
            flex: 1, minWidth: "200px", padding: "10px 12px",
            border: "2px solid #000000", borderRadius: "6px",
            fontFamily: "'JetBrains Mono', monospace", fontSize: "13px",
            background: "#ffffff",
          }}
        />
        <button
          onClick={queryTimeTravel}
          disabled={loading || !timestamp}
          style={{
            padding: "10px 20px", background: loading ? "#9ca3af" : "#0369a1",
            border: "2px solid #000000", borderRadius: "6px",
            color: "#fff", fontSize: "13px", fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            boxShadow: "2px 2px 0px #000000",
          }}
        >
          {loading ? "Querying..." : "⏱️ Query Past State"}
        </button>
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => setTimestamp(p.ts)}
            style={{
              padding: "6px 12px", background: "#f3f4f6",
              border: "1px solid #d1d5db", borderRadius: "4px",
              fontSize: "12px", fontWeight: 700, color: "#374151",
              cursor: "pointer", fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ marginTop: "12px", padding: "10px", background: "#fef2f2", border: "2px solid #b91c1c", borderRadius: "6px", color: "#b91c1c", fontSize: "13px", fontWeight: 700 }}>
          ✗ {error}
        </div>
      )}
      {results && (
        <div style={{ marginTop: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#0369a1", marginBottom: "8px" }}>
            {results.length} memories at this point in time
          </div>
          {results.slice(0, 5).map((m: any, i: number) => (
            <div key={i} style={{
              padding: "8px 12px", marginBottom: "4px", background: "#f0f9ff",
              border: "1px solid #bae6fd", borderRadius: "4px",
              fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
            }}>
              <span style={{ fontWeight: 800, color: "#0369a1" }}>{m.memory_type}</span>
              <span style={{ color: "#6b7280", margin: "0 8px" }}>·</span>
              <span style={{ color: "#374151" }}>{(m.content || "").slice(0, 80)}...</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

  if (loading) {
    return <div style={{ padding: "40px", fontWeight: 800 }}>Loading health metrics...</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1400px", margin: "0 auto", paddingBottom: "40px" }}>
      <style>{`
        .tooltip {
          position: relative;
          cursor: help;
          display: inline-block;
          border-bottom: 1.5px dotted #a1a1aa;
        }
        .tooltip:hover::after {
          content: attr(data-tip);
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 8px;
          padding: 8px 12px;
          background: #000000;
          color: #ffffff;
          font-size: 12px;
          font-weight: 800;
          font-family: var(--font-sans);
          border-radius: 6px;
          white-space: nowrap;
          z-index: 50;
          pointer-events: none;
          box-shadow: 0px 4px 12px rgba(0,0,0,0.15);
        }
        .metric-group {
          padding: 20px;
          background: #ffffff;
          border: 3px solid #000000;
          border-radius: 12px;
          box-shadow: 4px 4px 0px #000000;
        }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: 950, color: C.ink, margin: 0, fontFamily: "var(--font-sg)", letterSpacing: "-0.5px" }}>Memory Engine</h1>
          <div style={{ fontSize: "15px", color: C.mute, marginTop: "6px", fontWeight: 700 }}>
            Real-time telemetry and logs for your agent's CockroachDB memory architecture.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {lastRefresh && <span style={{ fontSize: "12px", color: C.mute, fontFamily: "var(--font-mono)", fontWeight: 700 }}>Updated {lastRefresh}</span>}
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            padding: "6px 14px", borderRadius: "8px",
            background: connected ? "#f0fdf4" : "#fff7ed",
            border: `3px solid #000000`,
            boxShadow: "2px 2px 0px #000000"
          }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: connected ? C.green : C.orange }} />
            <span style={{ fontSize: "13px", fontWeight: 900, color: connected ? C.green : C.orange, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
              {connected ? "LIVE CONNECTION" : "DEMO MODE"}
            </span>
          </div>
        </div>
      </div>

      {/* Core Storage Architecture */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
        
        {/* Short-Term Memory */}
        <div className="metric-group" style={{ background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "3px solid #000000", paddingBottom: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px" }}>⚡</span>
            <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "1px" }}>Short-Term Memory</span>
          </div>
          <div style={{ fontSize: "13px", color: C.mute, fontWeight: 700, marginBottom: "20px", lineHeight: 1.4 }}>
            Fast-path messaging and active conversation contexts with ephemeral TTL bounds.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div className="tooltip" data-tip="Messages currently unexpired" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Active Contexts</div>
              <div style={{ fontSize: "32px", fontWeight: 950, color: C.orange }}>{health?.stm_active ?? 0}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tooltip" data-tip="Total historical messages stored" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Lifetime Vol</div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: C.ink }}>{health?.stm_total ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Long-Term Memory */}
        <div className="metric-group" style={{ background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "3px solid #000000", paddingBottom: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px" }}>🧠</span>
            <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "1px" }}>Long-Term Memory</span>
          </div>
          <div style={{ fontSize: "13px", color: C.mute, fontWeight: 700, marginBottom: "20px", lineHeight: 1.4 }}>
            Persistent, vectorized facts and semantics consolidated from short-term context.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div className="tooltip" data-tip="Total memories persistently stored" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Total Facts</div>
              <div style={{ fontSize: "32px", fontWeight: 950, color: C.green }}>{health?.total_memories ?? 0}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tooltip" data-tip="Memories ingested in the last 7 days" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>7-Day Ingestion</div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: C.ink }}>+{health?.memories_last_7_days ?? 0}</div>
            </div>
          </div>
        </div>

        {/* Forensic Audit Memory */}
        <div className="metric-group" style={{ background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "3px solid #000000", paddingBottom: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "20px" }}>🛡️</span>
            <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "1px" }}>Forensic Trail</span>
          </div>
          <div style={{ fontSize: "13px", color: C.mute, fontWeight: 700, marginBottom: "20px", lineHeight: 1.4 }}>
            Immutable, append-only logs tracking agent actions, thought processes, and decisions.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <div className="tooltip" data-tip="Audit events recorded in the last 7 days" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Recent Audits</div>
              <div style={{ fontSize: "32px", fontWeight: 950, color: C.purple }}>{health?.audit_recent ?? 0}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="tooltip" data-tip="Total immutable events tracked" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Total Immutables</div>
              <div style={{ fontSize: "20px", fontWeight: 900, color: C.ink }}>{health?.audit_total ?? 0}</div>
            </div>
          </div>
        </div>

      </div>

      <div style={{ height: "3px", background: "#e5e7eb" }} />

      {/* Main Dashboard Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px" }}>
        
        {/* Left Column: Overall Health Score */}
        <div className="metric-group" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", background: "#f8fafc" }}>
          <div className="tooltip" data-tip="Weighted score of Freshness, Access Rate, and Importance" style={{ fontSize: "13px", color: C.mute, textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 900 }}>
            LTM Health Score
          </div>
          
          <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "16px 0" }}>
            <span style={{ fontSize: "84px", fontWeight: 950, fontFamily: "var(--font-sans)", color: score >= 80 ? C.green : score >= 50 ? C.orange : C.red, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: "20px", color: C.mute, fontWeight: 800 }}>/100</span>
          </div>
          
          <div style={{ 
            padding: "8px 20px", borderRadius: "8px", border: "3px solid #000000", 
            background: score >= 80 ? "#f0fdf4" : score >= 50 ? "#fffbeb" : "#fef2f2", 
            fontSize: "15px", fontWeight: 900, color: score >= 80 ? C.green : score >= 50 ? C.orange : C.red, 
            boxShadow: "2px 2px 0px #000000" 
          }}>
            {score >= 80 ? "✓ Healthy & Active" : score >= 50 ? "⚠ Requires Attention" : "✗ Critical Condition"}
          </div>

          <p style={{ fontSize: "12px", color: C.mute, marginTop: "24px", lineHeight: 1.5, fontWeight: 600 }}>
            {score >= 80 ? "Your agent is frequently recalling high-importance, fresh memories." : "Your agent is rarely accessing memories, or data is becoming stale."}
          </p>
        </div>

        {/* Right Column: Key Pillars */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px" }}>
          
          {/* Pillar 1: Scale */}
          <div className="metric-group">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "3px solid #000000", paddingBottom: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "20px" }}>📈</span>
              <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "1px" }}>LTM Momentum</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <div className="tooltip" data-tip="Total memories stored in the database" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Total Volume</div>
                <div style={{ fontSize: "32px", fontWeight: 950, color: C.ink }}>{health?.total_memories ?? 0}</div>
              </div>
              <div>
                <div className="tooltip" data-tip="Memories ingested in the last 7 days" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>7-Day Ingestion</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: C.green }}>+{health?.memories_last_7_days ?? 0}</div>
              </div>
            </div>
          </div>

          {/* Pillar 2: Relevance */}
          <div className="metric-group">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "3px solid #000000", paddingBottom: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "20px" }}>🧠</span>
              <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "1px" }}>Relevance</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <div className="tooltip" data-tip="Percentage of memories accessed recently" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Active Freshness</div>
                <div style={{ fontSize: "32px", fontWeight: 950, color: parseFloat(fresh) > 50 ? C.green : C.orange }}>{fresh}%</div>
              </div>
              <div>
                <div className="tooltip" data-tip="Average times a memory is recalled by the agent" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Avg Recall Count</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: C.purple }}>{(health?.avg_access_count ?? 0).toFixed(1)}x</div>
              </div>
            </div>
          </div>

          {/* Pillar 3: Security */}
          <div className="metric-group">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: "3px solid #000000", paddingBottom: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "20px" }}>🛡️</span>
              <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "1px" }}>Security & Value</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div>
                <div className="tooltip" data-tip="Memories explicitly locked from being forgotten/pruned" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Pinned Guardrails</div>
                <div style={{ fontSize: "32px", fontWeight: 950, color: C.red }}>{health?.pinned_memories ?? 0}</div>
              </div>
              <div>
                <div className="tooltip" data-tip="Average user-assigned importance rating" style={{ fontSize: "12px", color: C.mute, fontWeight: 800, marginBottom: "4px" }}>Avg Importance</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: C.cyan }}>{(health?.avg_importance_score ?? 0).toFixed(1)} <span style={{fontSize:"14px", color:C.mute}}>/ 10</span></div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Freshness Bar Component */}
      <div className="metric-group" style={{ padding: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 950, color: C.ink, textTransform: "uppercase", letterSpacing: "0.5px" }}>Memory Freshness Distribution</div>
            <div style={{ fontSize: "13px", color: C.mute, fontWeight: 700, marginTop: "4px" }}>Fresh memories have been recalled by an agent in the last 7 days. Stale memories may need pruning.</div>
          </div>
          <div style={{ display: "flex", gap: "16px", fontSize: "14px", fontWeight: 800 }}>
            <span style={{ color: C.green }}>{health?.memories_last_7_days ?? 0} Fresh</span>
            <span style={{ color: C.orange }}>{(health?.total_memories ?? 0) - (health?.memories_last_7_days ?? 0)} Stale</span>
          </div>
        </div>

        <div style={{ display: "flex", height: "40px", borderRadius: "12px", overflow: "hidden", border: "3px solid #000000", boxShadow: "2px 2px 0px #000000" }}>
          <div style={{ width: `${fresh}%`, background: "#34d399", borderRight: parseFloat(stale) > 0 ? "3px solid #000000" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 900, color: "#064e3b", transition: "width 0.5s" }}>
            {parseFloat(fresh) > 5 && `${fresh}% Fresh`}
          </div>
          {parseFloat(stale) > 0 && (
            <div style={{ width: `${stale}%`, background: "#fdba74", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 900, color: "#7c2d12", transition: "width 0.5s" }}>
              {parseFloat(stale) > 5 && `${stale}% Stale`}
            </div>
          )}
        </div>
      </div>

      {/* Insights Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "20px" }}>
        {[
          { title: "Ingestion Rate", value: `+${health?.memories_last_7_days ?? 0} this week`, desc: (health?.memories_last_7_days ?? 0) > 0 ? "Agent is actively learning and ingesting context." : "No new memories learned in the past 7 days.", color: C.green, icon: "📈" },
          { title: "Guardrail Safety", value: `${health?.pinned_memories ?? 0} pinned`, desc: (health?.pinned_memories ?? 0) > 0 ? "Core instructions are locked from modification." : "No safety rules are currently pinned.", color: C.red, icon: "📌" },
          { title: "Data Quality", value: `${(health?.avg_importance_score ?? 0).toFixed(1)}/10`, desc: (health?.avg_importance_score ?? 0) >= 5 ? "Stored context is considered highly relevant." : "Average importance is low. Consider filtering.", color: C.cyan, icon: "⭐" },
          { title: "Utilization", value: `${(health?.avg_access_count ?? 0).toFixed(1)}× recalled`, desc: (health?.avg_access_count ?? 0) > 0 ? "Memories are being successfully retrieved." : "Stored memories are rarely accessed by agents.", color: C.purple, icon: "🔄" },
        ].map((ins, i) => (
          <div key={i} className="metric-group" style={{ padding: "20px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <span style={{ fontSize: "20px" }}>{ins.icon}</span>
                <span style={{ fontSize: "14px", fontWeight: 950, color: C.ink, textTransform: "uppercase" }}>{ins.title}</span>
              </div>
              <div style={{ fontSize: "22px", fontWeight: 950, color: ins.color, fontFamily: "var(--font-sans)", marginBottom: "8px" }}>{ins.value}</div>
            </div>
            <div style={{ fontSize: "13px", color: C.mute, lineHeight: "1.5", fontWeight: 700 }}>{ins.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ height: "3px", background: "#e5e7eb", margin: "16px 0" }} />

      {/* Time-Travel Panel — AS OF SYSTEM TIME */}
      <TimeTravelPanel />

      {/* Embedded Memory Logs (Micro View) */}
      <div>
        <h2 style={{ fontSize: "28px", fontWeight: 950, color: C.ink, margin: "0 0 20px 0", fontFamily: "var(--font-sg)", letterSpacing: "-0.5px" }}>Memory Inspector</h2>
        <div style={{ height: "900px", display: "flex", flexDirection: "column", border: "3px solid #000000", borderRadius: "12px", background: "#f8fafc", boxShadow: "4px 4px 0px #000000", overflow: "hidden", padding: "24px" }}>
          <LogsPage />
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="metric-group" style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "15px", fontWeight: 950, color: C.ink, textTransform: "uppercase" }}>CockroachDB Engine</span>
          <span style={{ fontSize: "13px", color: C.mute, fontWeight: 700 }}>SERIALIZABLE isolation · C-SPANN vector index · CDC changefeeds</span>
        </div>
        <span style={{ fontSize: "12px", color: C.mute, fontFamily: "var(--font-mono)", fontWeight: 800 }}>v24.3 · REGIONAL BY ROW · 99.99% uptime</span>
      </div>
    </div>
  );
}
