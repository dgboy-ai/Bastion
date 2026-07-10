"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface Region {
  region: string;
  label: string;
  memories: number;
  latency_ms: number;
  status: string;
  utilization: number;
}

interface RegionStats {
  regions: Region[];
  total_memories: number;
  cross_region_syncs: number;
  avg_global_latency_ms: number;
  compliance: Record<string, string[]>;
}

const REGION_COORDS: Record<string, { x: number; y: number }> = {
  "us-east1": { x: 28, y: 38 },
  "us-west1": { x: 15, y: 36 },
  "eu-west1": { x: 45, y: 30 },
  "eu-central1": { x: 50, y: 32 },
  "ap-south1": { x: 65, y: 45 },
  "ap-northeast1": { x: 80, y: 35 },
};

export default function RegionMapWidget() {
  const [stats, setStats] = useState<RegionStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/region-stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) setStats(data.data ?? data);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[RegionMapWidget] fetch failed:", err);
          setError(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="p-4 text-gray-500">Failed to load region data.</div>;
  if (!stats) return <div className="p-4 text-gray-500 animate-pulse">Loading regions...</div>;

  const maxMemories = Math.max(1, ...stats.regions.map((r) => r.memories));

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Multi-Region Memory Distribution</h3>
        <span className="text-xs px-2 py-1 rounded bg-blue-900/50 text-blue-400 border border-blue-800">
          CockroachDB Distributed
        </span>
      </div>

      {/* World map with dots */}
      <div className="relative bg-gray-800/50 rounded-lg mb-6" style={{ paddingBottom: "45%" }}>
        <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full">
          {/* Grid lines */}
          {[0, 15, 30, 45, 60].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2="100" y2={y} stroke="#374151" strokeWidth="0.2" />
          ))}
          {[0, 20, 40, 60, 80, 100].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="60" stroke="#374151" strokeWidth="0.2" />
          ))}

          {/* Connection lines between regions */}
          {stats.regions.map((r, i) =>
            stats.regions.slice(i + 1).map((r2) => {
              const c1 = REGION_COORDS[r.region];
              const c2 = REGION_COORDS[r2.region];
              if (!c1 || !c2) return null;
              return (
                <line
                  key={`${r.region}-${r2.region}`}
                  x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y}
                  stroke="#1e40af" strokeWidth="0.3" strokeDasharray="1,1" opacity="0.4"
                />
              );
            })
          )}

          {/* Region dots */}
          {stats.regions.map((r) => {
            const coords = REGION_COORDS[r.region];
            if (!coords) return null;
            const size = 1.5 + (r.memories / maxMemories) * 2.5;
            return (
              <g key={r.region}>
                {/* Pulse ring */}
                <circle cx={coords.x} cy={coords.y} r={size + 1.5} fill="none" stroke="#3b82f6" strokeWidth="0.3" opacity="0.3">
                  <animate attributeName="r" from={size} to={size + 3} dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite" />
                </circle>
                {/* Main dot */}
                <circle cx={coords.x} cy={coords.y} r={size} fill="#3b82f6" opacity="0.9" />
                <circle cx={coords.x} cy={coords.y} r={size * 0.4} fill="#93c5fd" />
                {/* Label */}
                <text x={coords.x} y={coords.y - size - 1} textAnchor="middle" fill="#9ca3af" fontSize="1.8">
                  {r.region}
                </text>
                <text x={coords.x} y={coords.y + size + 2.5} textAnchor="middle" fill="#6b7280" fontSize="1.4">
                  {r.memories.toLocaleString()} mem
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Region cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        {stats.regions.map((r) => (
          <div key={r.region} className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-white">{r.label}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Memories</span>
                <div className="text-white font-medium">{r.memories.toLocaleString()}</div>
              </div>
              <div>
                <span className="text-gray-500">Latency</span>
                <div className="text-white font-medium">{r.latency_ms}ms</div>
              </div>
            </div>
            {/* Utilization bar */}
            <div className="mt-2 w-full bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full"
                style={{ width: `${Math.round(r.utilization * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4 bg-gray-800/50 rounded-lg p-4">
        <div className="text-center">
          <div className="text-xl font-bold text-white">{stats.total_memories.toLocaleString()}</div>
          <div className="text-xs text-gray-400">Total memories</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-blue-400">{stats.avg_global_latency_ms}ms</div>
          <div className="text-xs text-gray-400">Avg latency</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-emerald-400">{stats.regions.length}</div>
          <div className="text-xs text-gray-400">Active regions</div>
        </div>
      </div>
    </div>
  );
}
