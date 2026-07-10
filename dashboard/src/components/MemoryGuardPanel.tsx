"use client";

import { useEffect, useState } from "react";

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

const SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400 bg-red-900/30 border-red-700",
  high: "text-orange-400 bg-orange-900/30 border-orange-700",
  medium: "text-yellow-400 bg-yellow-900/30 border-yellow-700",
  low: "text-blue-400 bg-blue-900/30 border-blue-700",
};

export default function MemoryGuardPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<{ isSafe: boolean; findings: { detector: string; severity: string; detail: string }[] } | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    fetch("/api/asi06", { signal: ac.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => { if (!cancelled) setReport(data); })
      .catch(() => { if (!cancelled) setFetchError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; ac.abort(); };
  }, []);

  const handleScan = async () => {
    if (!scanInput.trim()) return;
    setScanning(true);
    try {
      const res = await fetch("/api/asi06", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: scanInput }),
      });
      const data = await res.json();
      setScanResult(data);
    } catch (err) {
      console.error("[MemoryGuardPanel] scan failed:", err);
      setScanResult({ isSafe: false, findings: [{ detector: "system", severity: "high", detail: "Scan request failed — check network connectivity" }] });
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-700 animate-pulse h-64" />;
  }

  const s = report?.summary;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
          <div className="text-sm text-gray-400">Total Checks</div>
          <div className="text-2xl font-bold text-white">{s?.totalChecks?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
          <div className="text-sm text-gray-400">Blocked</div>
          <div className="text-2xl font-bold text-red-400">{s?.blockedCount?.toLocaleString() ?? "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
          <div className="text-sm text-gray-400">Avg Trust Score</div>
          <div className="text-2xl font-bold text-green-400">{s?.avgTrustScore?.toFixed(2) ?? "—"}</div>
        </div>
        <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
          <div className="text-sm text-gray-400">Block Rate</div>
          <div className="text-2xl font-bold text-yellow-400">{s?.blockedPct?.toFixed(2) ?? "—"}%</div>
        </div>
      </div>

      {/* Scan Input */}
      <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Test Content Against MemoryGuard</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleScan()}
            placeholder="Paste content to scan for prompt injection, secrets, etc..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleScan}
            disabled={scanning || !scanInput.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm font-medium transition-colors"
          >
            {scanning ? "Scanning..." : "Scan"}
          </button>
        </div>
        {scanResult && (
          <div className={`mt-3 p-3 rounded border ${scanResult.isSafe ? "border-green-700 bg-green-900/20" : "border-red-700 bg-red-900/20"}`}>
            <div className="text-sm font-medium mb-1">{scanResult.isSafe ? "SAFE" : "THREAT DETECTED"}</div>
            {scanResult.findings.map((f, i) => (
              <div key={i} className={`text-xs ${SEVERITY_COLORS[f.severity]?.split(" ")[0] ?? "text-gray-400"}`}>
                [{f.severity}] {f.detail}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Findings */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">Recent Security Findings</h3>
        <div className="space-y-2">
          {report?.recentFindings?.map((f, i) => (
            <div key={i} className={`p-3 rounded-lg border ${SEVERITY_COLORS[f.severity] ?? "border-gray-700 bg-gray-900/30"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase">{f.threatType}</span>
                <span className="text-xs opacity-70">{new Date(f.timestamp).toLocaleString()}</span>
              </div>
              <div className="text-sm">{f.detail}</div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span>Detector: {f.detector}</span>
                <span>Confidence: {(f.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {report?.mock && (
        <div className="text-xs text-gray-500 text-center">Showing reference data — connect to CRDB for live results</div>
      )}
    </div>
  );
}
