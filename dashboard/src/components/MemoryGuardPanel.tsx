"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface Finding {
  detector: string;
  threatType: string;
  severity: string;
  detail: string;
  confidence: number;
  timestamp: string;
}

interface Report {
  summary: {
    totalChecks: number;
    blockedCount: number;
    blockedPct: number;
    avgTrustScore: number;
    poisoningRiskDistribution: Record<string, number>;
  };
  recentFindings: Finding[];
  mock?: boolean;
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "var(--accent-sunset)", bg: "rgba(255, 85, 0, 0.08)", border: "rgba(255, 85, 0, 0.25)" },
  high: { color: "#ff8c00", bg: "rgba(255, 140, 0, 0.08)", border: "rgba(255, 140, 0, 0.25)" },
  medium: { color: "#ffd43b", bg: "rgba(255, 212, 59, 0.08)", border: "rgba(255, 212, 59, 0.25)" },
  low: { color: "var(--accent-breeze)", bg: "rgba(0, 240, 255, 0.08)", border: "rgba(0, 240, 255, 0.25)" },
};

export default function MemoryGuardPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<{ isSafe: boolean; findings: { detector: string; severity: string; detail: string }[] } | null>(null);
  const [scanning, setScanning] = useState(false);

  const fetchGuardReport = async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const res = await fetchWithTimeout("/api/asi06");
      if (!res.ok) {
        throw new Error(`Failed to load security report (HTTP ${res.status})`);
      }
      const data = await res.json();
      setReport(data);
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuardReport();
  }, []);

  const handleScan = async () => {
    if (!scanInput.trim()) return;
    setScanning(true);
    try {
      const res = await fetchWithTimeout("/api/asi06", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: scanInput }),
      });
      const data = await res.json();
      setScanResult(data);
    } catch (err) {
      console.error("[MemoryGuardPanel] scan failed:", err);
      setScanResult({
        isSafe: false,
        findings: [{ detector: "system", severity: "high", detail: "Scan request failed — check network connectivity" }]
      });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return <div className="skeleton" style={{ height: "240px", borderRadius: "16px" }} />;
  }

  if (fetchError) {
    return (
      <div className="panel" style={{ border: "1px solid var(--accent-sunset)", background: "rgba(255,85,0,0.03)", textAlign: "center" }}>
        <div style={{ fontSize: "12px", color: "var(--accent-sunset)", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px" }}>
          Security Node Offline
        </div>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--ink)", marginTop: "8px" }}>MemoryGuard Guardrail Interface Disconnected</h2>
        <p style={{ fontSize: "14px", color: "var(--body)", margin: "8px 0 20px 0" }}>
          Verify that the telemetry network is functioning and click retry.
        </p>
        <button className="btn btn-outline" style={{ borderColor: "var(--accent-sunset)", color: "var(--accent-sunset)" }} onClick={fetchGuardReport}>
          Retry Security Scan
        </button>
      </div>
    );
  }

  const s = report?.summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
        <div className="kpi-card" style={{ cursor: "default" }}>
          <div className="kpi-info">
            <span className="kpi-label">Total Checks</span>
            <span className="kpi-val" style={{ color: "var(--ink)" }}>{s?.totalChecks?.toLocaleString() ?? "—"}</span>
          </div>
        </div>
        <div className="kpi-card" style={{ cursor: "default" }}>
          <div className="kpi-info">
            <span className="kpi-label">Blocked Inputs</span>
            <span className="kpi-val" style={{ color: "var(--accent-sunset)" }}>{s?.blockedCount?.toLocaleString() ?? "—"}</span>
          </div>
        </div>
        <div className="kpi-card" style={{ cursor: "default" }}>
          <div className="kpi-info">
            <span className="kpi-label">Avg Trust Score</span>
            <span className="kpi-val" style={{ color: "var(--accent-emerald)" }}>{s?.avgTrustScore?.toFixed(2) ?? "—"}</span>
          </div>
        </div>
        <div className="kpi-card" style={{ cursor: "default" }}>
          <div className="kpi-info">
            <span className="kpi-label">Block Rate</span>
            <span className="kpi-val" style={{ color: "#ffd43b" }}>{s?.blockedPct?.toFixed(2) ?? "—"}%</span>
          </div>
        </div>
      </div>

      {/* Dynamic Scanner Console */}
      <div className="panel" style={{ padding: "20px" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#fff", margin: "0 0 12px 0" }}>Test Ingestion Context (OWASP ASI06)</h3>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <input
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleScan()}
            placeholder="Paste text containing API secrets, PII parameters, or system-prompt override queries..."
            className="input-futuristic"
          />
          <button
            onClick={handleScan}
            disabled={scanning || !scanInput.trim()}
            className="btn btn-primary"
            style={{ flexShrink: 0 }}
          >
            {scanning ? "Evaluating..." : "Evaluate Content"}
          </button>
        </div>

        {scanResult && (
          <div style={{
            marginTop: "16px",
            padding: "16px",
            borderRadius: "8px",
            border: `1px solid ${scanResult.isSafe ? "rgba(0, 255, 102, 0.25)" : "rgba(255, 85, 0, 0.25)"}`,
            background: scanResult.isSafe ? "rgba(0, 255, 102, 0.03)" : "rgba(255, 85, 0, 0.03)"
          }}>
            <div style={{
              fontSize: "14px",
              fontWeight: 800,
              color: scanResult.isSafe ? "var(--accent-emerald)" : "var(--accent-sunset)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <span>{scanResult.isSafe ? "🛡️ SANITIZED & APPROVED" : "🚨 INGESTION THREAT BLOCKED"}</span>
            </div>
            
            {scanResult.findings.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                {scanResult.findings.map((f, i) => {
                  const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.high;
                  return (
                    <div key={i} style={{
                      padding: "10px 14px",
                      borderRadius: "6px",
                      background: sev.bg,
                      border: `1px solid ${sev.border}`,
                      color: sev.color,
                      fontSize: "12px",
                      fontFamily: "var(--font-mono)"
                    }}>
                      [{f.detector.toUpperCase()}] {f.detail}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "12.5px", color: "var(--body)", margin: "8px 0 0 0" }}>
                No active signatures detected. Payload is clean for long-term database storage.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Recent Findings Log */}
      <div>
        <h3 className="panel-title" style={{ fontSize: "14px", color: "var(--body)", marginBottom: "12px" }}>Active Guard Warnings Log</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {report?.recentFindings && report.recentFindings.length > 0 ? (
            report.recentFindings.map((f, i) => {
              const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.high;
              return (
                <div key={i} style={{
                  padding: "16px",
                  borderRadius: "8px",
                  background: sev.bg,
                  border: `1px solid ${sev.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, fontFamily: "var(--font-mono)", color: sev.color }}>
                      {f.threatType.toUpperCase()}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--mute)" }}>
                      {new Date(f.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#fff", fontWeight: 500 }}>{f.detail}</div>
                  <div style={{ display: "flex", gap: "16px", fontSize: "11px", color: "var(--mute)", marginTop: "4px" }}>
                    <span>Signature: {f.detector}</span>
                    <span>Safety Margin: {(f.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--mute)", fontSize: "12.5px" }}>
              No threat alerts logged in the current validation session
            </div>
          )}
        </div>
      </div>

      {report?.mock && (
        <div style={{ textAlign: "center", fontSize: "11px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
          SHOWING STANDBY SIGNATURE LOGS &middot; TELEMETRY BRIDGE ACTIVE
        </div>
      )}
    </div>
  );
}
