"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface ComplianceReport {
  reportId: string;
  agentId: string;
  status: string;
  generatedAt: string;
  article12: {
    humanOversight: boolean;
    auditTrailEnabled: boolean;
    tamperEvidentLogging: boolean;
    pointInTimeSnapshots: boolean;
    dataRetentionPolicy: string;
  };
  recentAuditTrail: { action: string; agentId: string; timestamp: string; details: Record<string, unknown> }[];
  mock?: boolean;
}

export default function CompliancePage() {
  const [report, setReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReportData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/compliance");
      if (!res.ok) {
        throw new Error(`Failed to load compliance details (HTTP ${res.status})`);
      }
      const json = await res.json();
      const data = json.data || json;
      setReport({
        reportId: data.report_id ?? data.reportId,
        agentId: data.agent_id ?? data.agentId,
        status: data.compliance_status?.status ?? data.status,
        generatedAt: data.generated_at ?? data.generatedAt,
        article12: data.art12_requirements ?? data.article12 ?? {},
        recentAuditTrail: data.recent_audit_trail ?? data.recentAuditTrail ?? [],
        mock: data.mock,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load compliance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div className="skeleton" style={{ height: "40px", width: "300px" }} />
        <div className="skeleton" style={{ height: "300px", borderRadius: "16px" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel" style={{ border: "1px solid var(--accent-sunset)", background: "rgba(255,85,0,0.03)" }}>
        <div style={{ fontSize: "12px", color: "var(--accent-sunset)", textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
          Compliance Audit Alert
        </div>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--accent-sunset)", marginTop: "8px" }}>Audit Trail Read Failed</h2>
        <p style={{ fontSize: "14px", color: "var(--body)", margin: "8px 0 20px 0" }}>{error}</p>
        <button className="btn btn-outline" style={{ borderColor: "var(--accent-sunset)", color: "var(--accent-sunset)" }} onClick={fetchReportData}>
          Retry Connection
        </button>
      </div>
    );
  }

  const r = report;

  if (!r || !r.article12) {
    return (
      <div className="panel" style={{ textAlign: "center", padding: "48px 0" }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--ink)", margin: 0 }}>No Compliance Ledger Detected</h2>
        <p style={{ fontSize: "14px", color: "var(--mute)", margin: "10px 0 0 0" }}>
          Connect to your CockroachDB database and store agent thoughts to trigger dynamic Article 12 audit records.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Title Header */}
      <div>
        <div className="welcome-title">EU AI Act Conformance</div>
        <div className="welcome-subtitle">
          Article 12 technical compliance ledger. Report ID: {r.reportId.slice(0, 18)}... &middot; Generated {new Date(r.generatedAt).toLocaleString()}
        </div>
      </div>

      {/* Compliance Health Banner */}
      <div className="panel" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "20px 24px",
        background: r.status === "COMPLIANT" ? "rgba(0, 255, 102, 0.03)" : "rgba(255, 213, 0, 0.03)",
        borderColor: r.status === "COMPLIANT" ? "rgba(0, 255, 102, 0.2)" : "rgba(255, 213, 0, 0.2)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: r.status === "COMPLIANT" ? "var(--accent-emerald)" : "#ffd43b",
            boxShadow: r.status === "COMPLIANT" ? "0 0 10px var(--accent-emerald)" : "0 0 10px #ffd43b"
          }} />
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>
              Framework Status: {r.status}
            </div>
            <div style={{ fontSize: "12px", color: "var(--mute)", marginTop: "2px" }}>
              Bastion auto-signing ledger validates all compliance criteria under Article 12(2) for high-risk AI models.
            </div>
          </div>
        </div>
      </div>

      {/* Grid Requirements */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
        {Object.entries(r.article12).map(([key, value]) => {
          const isPassed = typeof value === "boolean" ? value : true;
          return (
            <div key={key} className="kpi-card" style={{ cursor: "default" }}>
              <div className="kpi-info" style={{ width: "100%" }}>
                <span className="kpi-label" style={{ fontSize: "9.5px", color: "var(--mute)" }}>
                  {key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                </span>
                <span style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  color: isPassed ? "var(--accent-emerald)" : "var(--accent-sunset)",
                  marginTop: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%"
                }}>
                  {typeof value === "boolean" ? (value ? "ENABLED" : "DISABLED") : String(value)}
                  <span style={{ fontSize: "18px" }}>{isPassed ? "🟢" : "🔴"}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Control Buttons */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bastion-compliance-${r.reportId}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="btn btn-primary"
        >
          <span>📥</span> Export JSON Report
        </button>
        <button
          onClick={() => {
            const sanitize = (v: string) => {
              const s = v.replace(/"/g, '""');
              if (/^[=+\-@]/.test(s)) return `"'${s}`;
              return s;
            };
            const rows = [["Action", "Agent ID", "Timestamp", "Details"]];
            for (const entry of r.recentAuditTrail ?? []) {
              rows.push([entry.action, entry.agentId, entry.timestamp, JSON.stringify(entry.details)]);
            }
            const csv = rows.map((r) => r.map((c) => `"${sanitize(c)}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `bastion-audit-trail-${r.reportId}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="btn btn-outline"
        >
          <span>📊</span> Export CSV Audit Trail
        </button>
      </div>

      {/* Audit Trail Table */}
      <div className="panel" style={{ padding: "24px" }}>
        <div style={{ borderBottom: "1px solid var(--glass-border)", paddingBottom: "16px", marginBottom: "20px" }}>
          <h3 className="panel-title">Article 12(2) Active Audit Trail ({r.recentAuditTrail?.length ?? 0} events)</h3>
        </div>
        <div className="table-container" style={{ maxHeight: "380px", overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Agent</th>
                <th>Recorded At</th>
                <th>Details Payload</th>
              </tr>
            </thead>
            <tbody>
              {r.recentAuditTrail.length > 0 ? (
                r.recentAuditTrail.map((entry, idx) => (
                  <tr key={idx} className="table-row-futuristic">
                    <td style={{ padding: "12px 16px" }}>
                      <span className="badge-mono store" style={{ fontSize: "8.5px", padding: "2px 6px" }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ color: "var(--body)" }}>{entry.agentId}</td>
                    <td style={{ color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td style={{
                      color: "var(--mute)",
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      maxWidth: "280px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }} title={JSON.stringify(entry.details)}>
                      {JSON.stringify(entry.details)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: "30px 0", color: "var(--mute)" }}>
                    No audit records logged in compliance table
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {r.mock && (
        <div style={{ textAlign: "center", fontSize: "11px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
          DISPLAYING SIMULATED CONFORMANCE DATA &middot; DYNAMIC OVERRIDE INACTIVE
        </div>
      )}
    </div>
  );
}
