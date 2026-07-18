"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface CacheStats {
  summary: {
    total_queries: number;
    cache_hits: number;
    cache_misses: number;
    hit_rate_percent: number;
    total_tokens_saved: number;
    total_cost_saved_usd: number;
    avg_latency_ms: number;
    avg_hit_latency_ms: number;
    avg_miss_latency_ms: number;
  };
  projections: {
    daily: number;
    monthly: number;
    annual: number;
  };
  competitor_comparison: {
    bastion_monthly: number;
    mem0_monthly: number;
    zep_monthly: number;
    letta_monthly: number;
    annual_savings_vs_mem0: number;
    annual_savings_vs_zep: number;
  };
}

export default function CacheCostWidget() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/cache-stats?hours=24")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data) => {
        if (!cancelled) {
          // Unwrap apiSuccess envelope
          setStats(data?.data || data);
        }
      })
      .catch((err) => { if (!cancelled) { console.error("[CacheCostWidget] fetch failed:", err); setFetchError(true); } });
    return () => { cancelled = true; };
  }, []);

  if (fetchError) {
    return <div className="p-4 text-gray-500">Failed to load cache stats.</div>;
  }

  if (!stats) {
    return <div className="p-4 text-gray-500 animate-pulse">Loading cache stats...</div>;
  }

  const { summary, projections, competitor_comparison } = stats;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Semantic Cache Cost Savings
      </h3>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-3xl font-bold text-green-400">
            ${summary.total_cost_saved_usd.toFixed(2)}
          </div>
          <div className="text-sm text-gray-400">Saved today</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-400">
            {summary.hit_rate_percent}%
          </div>
          <div className="text-sm text-gray-400">Cache hit rate</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-lg font-semibold text-white">
            {summary.total_tokens_saved.toLocaleString()}
          </div>
          <div className="text-xs text-gray-400">Tokens saved</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">
            {summary.avg_hit_latency_ms}ms
          </div>
          <div className="text-xs text-gray-400">Hit latency</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-semibold text-white">
            {summary.avg_miss_latency_ms}ms
          </div>
          <div className="text-xs text-gray-400">Miss latency</div>
        </div>
      </div>

      <div className="border-t border-gray-700 pt-4">
        <h4 className="text-sm font-medium text-gray-300 mb-3">
          Competitor Cost Comparison (Monthly)
        </h4>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-green-400">Bastion</span>
            <span className="text-green-400 font-bold">$0/mo</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Mem0</span>
            <span className="text-red-400">${competitor_comparison.mem0_monthly}/mo</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Zep</span>
            <span className="text-red-400">${competitor_comparison.zep_monthly}/mo</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400">Letta</span>
            <span className="text-red-400">${competitor_comparison.letta_monthly}/mo</span>
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-400">
          Annual savings vs Mem0: <span className="text-green-400 font-bold">${competitor_comparison.annual_savings_vs_mem0.toLocaleString()}</span>
        </div>
      </div>

      <div className="border-t border-gray-700 pt-4 mt-4">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Projections</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-400">Monthly</div>
            <div className="text-white font-semibold">${projections.monthly.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-400">Annual</div>
            <div className="text-white font-semibold">${projections.annual.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-gray-400">Queries</div>
            <div className="text-white font-semibold">{summary.total_queries}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
