"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/compliance", { signal: ac.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(json => {
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
      })
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load compliance data"))
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-800 rounded w-64" />
          <div className="h-64 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-5xl mx-auto">
          <div className="p-6 rounded-xl bg-red-900/20 border border-red-700">
            <h2 className="text-lg font-bold text-red-400">Compliance Check Failed</h2>
            <p className="text-sm text-gray-400 mt-2">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                fetch("/api/compliance")
                  .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
                  .then(data => {
                    setReport({
                      reportId: data.report_id ?? data.reportId,
                      agentId: data.agent_id ?? data.agentId,
                      status: data.compliance_status?.status ?? data.status,
                      generatedAt: data.generated_at ?? data.generatedAt,
                      article12: data.art12_requirements ?? data.article12 ?? {},
                      recentAuditTrail: data.recent_audit_trail ?? data.recentAuditTrail ?? [],
                      mock: data.mock,
                    });
                    setLoading(false);
                  })
                  .catch(err => { setError(err instanceof Error ? err.message : "Retry failed"); setLoading(false); });
              }}
              className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const r = report;

  if (!r || !r.article12) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-5xl mx-auto">
          <div className="p-6 rounded-xl bg-gray-900/50 border border-gray-700 text-center">
            <h2 className="text-lg font-bold">No Compliance Data Available</h2>
            <p className="text-sm text-gray-400 mt-2">Connect to CockroachDB and store agent memories to generate compliance reports.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">EU AI Act Article 12 Compliance</h1>
          <p className="text-sm text-gray-400 mt-1">
            Report {r?.reportId} — Generated {r?.generatedAt ? new Date(r.generatedAt).toLocaleString() : "—"}
          </p>
        </div>

        {/* Status Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          r?.status === "COMPLIANT" ? "bg-green-900/50 text-green-400 border border-green-700" :
          "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            r?.status === "COMPLIANT" ? "bg-green-400" : "bg-yellow-400"
          }`} />
          {r?.status ?? "UNKNOWN"}
        </div>

        {/* Article 12 Requirements */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {r?.article12 && Object.entries(r.article12).map(([key, value]) => (
            <div key={key} className="p-4 rounded-xl bg-gray-900/50 border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">
                {key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}
              </div>
              <div className={`text-lg font-bold ${value ? "text-green-400" : "text-red-400"}`}>
                {typeof value === "boolean" ? (value ? "Enabled" : "Disabled") : String(value)}
              </div>
            </div>
          ))}
        </div>

        {/* Download Options */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `bastion-compliance-${r?.reportId ?? "report"}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={() => {
              const sanitize = (v: string) => {
                const s = v.replace(/"/g, '""');
                if (/^[=+\-@]/.test(s)) return `"'${s}`;
                return s;
              };
              const rows = [["Action", "Agent", "Timestamp", "Details"]];
              for (const entry of r?.recentAuditTrail ?? []) {
                rows.push([entry.action, entry.agentId, entry.timestamp, JSON.stringify(entry.details)]);
              }
              const csv = rows.map(r => r.map(c => `"${sanitize(c)}"`).join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `bastion-audit-trail-${r?.reportId ?? "report"}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Audit Trail */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Audit Trail ({r?.recentAuditTrail?.length ?? 0} entries)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-gray-400">
                  <th className="text-left py-2 px-3">Action</th>
                  <th className="text-left py-2 px-3">Agent</th>
                  <th className="text-left py-2 px-3">Timestamp</th>
                  <th className="text-left py-2 px-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {r?.recentAuditTrail?.map((entry, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-900/50">
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-300">
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-300">{entry.agentId}</td>
                    <td className="py-2 px-3 text-gray-400 text-xs">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-gray-400 text-xs font-mono max-w-xs truncate">
                      {JSON.stringify(entry.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {r?.mock && (
          <div className="text-xs text-gray-500 text-center py-4">
            Showing reference data — connect to CRDB for live compliance reports
          </div>
        )}
      </div>
    </div>
  );
}
