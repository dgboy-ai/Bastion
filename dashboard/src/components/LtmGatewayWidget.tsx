"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface LtmStats {
  gateway: {
    total_checks: number;
    total_reuses: number;
    total_stores: number;
    total_tokens_saved: number;
    avg_similarity: number;
    reuse_rate: number;
  };
  cost_savings: {
    daily_usd: number;
    monthly_usd: number;
    annual_usd: number;
    avg_tokens_per_reuse: number;
    workflow_bypass_rate: number;
  };
  top_reused: { query: string; reuse_count: number; similarity: number }[];
}

export default function LtmGatewayWidget() {
  const [stats, setStats] = useState<LtmStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/ltm-stats?hours=24")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setStats(data.data ?? data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[LtmGatewayWidget] fetch failed:", err);
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="p-4 text-gray-500">Failed to load LTM stats.</div>;
  if (!stats) return <div className="p-4 text-gray-500 animate-pulse">Loading LTM Gateway...</div>;

  const { gateway, cost_savings, top_reused } = stats;
  const reusePercent = Math.round(gateway.reuse_rate * 100);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">LTM Gateway</h3>
        <span className="text-xs px-2 py-1 rounded bg-emerald-900/50 text-emerald-400 border border-emerald-800">
          Long-Term Memory Reuse
        </span>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-emerald-400">${cost_savings.daily_usd.toFixed(2)}</div>
          <div className="text-sm text-gray-400">Saved today</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-blue-400">{reusePercent}%</div>
          <div className="text-sm text-gray-400">Workflow bypass rate</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-purple-400">
            {(gateway.total_tokens_saved / 1000).toFixed(0)}K
          </div>
          <div className="text-sm text-gray-400">Tokens saved</div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-gray-800/50 rounded p-3">
          <div className="text-sm text-gray-400">Checks</div>
          <div className="text-lg font-semibold text-white">{gateway.total_checks.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 rounded p-3">
          <div className="text-sm text-gray-400">Reuses</div>
          <div className="text-lg font-semibold text-emerald-400">{gateway.total_reuses.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 rounded p-3">
          <div className="text-sm text-gray-400">Stored</div>
          <div className="text-lg font-semibold text-white">{gateway.total_stores.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800/50 rounded p-3">
          <div className="text-sm text-gray-400">Avg Match</div>
          <div className="text-lg font-semibold text-white">
            {(gateway.avg_similarity * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Reuse progress bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-400">Reuse Rate</span>
          <span className="text-emerald-400">{reusePercent}%</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-3 rounded-full transition-all duration-500"
            style={{ width: `${reusePercent}%` }}
          />
        </div>
      </div>

      {/* Cost projections */}
      <div className="bg-gray-800/50 rounded-lg p-4 mb-4">
        <div className="text-sm text-gray-400 mb-2">Cost Savings Projection</div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-emerald-400">${cost_savings.monthly_usd.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Monthly</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-emerald-400">${cost_savings.annual_usd.toFixed(2)}</div>
            <div className="text-xs text-gray-500">Annual</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-white">{cost_savings.avg_tokens_per_reuse.toLocaleString()}</div>
            <div className="text-xs text-gray-500">Avg tokens/reuse</div>
          </div>
        </div>
      </div>

      {/* Top reused queries */}
      {top_reused.length > 0 && (
        <div>
          <div className="text-sm text-gray-400 mb-2">Most Reused Analyses</div>
          <div className="space-y-2">
            {top_reused.slice(0, 5).map((item, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-800/30 rounded px-3 py-2">
                <span className="text-sm text-gray-300 truncate flex-1 mr-3">{item.query}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{item.reuse_count}x</span>
                  <span className="text-xs text-emerald-400">{(item.similarity * 100).toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
