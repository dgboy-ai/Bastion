"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface Observation {
  observation_id: string;
  pattern_type: string;
  description: string;
  confidence: number;
  frequency: number;
  supporting_memories: string[];
  metadata: Record<string, unknown>;
}

interface ObservationsData {
  total_memories_scanned: number;
  observations: Observation[];
}

const PATTERN_ICONS: Record<string, string> = {
  recurring_theme: "🔄",
  co_occurrence: "🔗",
  temporal_trend: "📈",
  entity_cluster: "🧠",
};

const PATTERN_COLORS: Record<string, string> = {
  recurring_theme: "text-blue-400 bg-blue-900/30 border-blue-800",
  co_occurrence: "text-purple-400 bg-purple-900/30 border-purple-800",
  temporal_trend: "text-emerald-400 bg-emerald-900/30 border-emerald-800",
  entity_cluster: "text-amber-400 bg-amber-900/30 border-amber-800",
};

export default function ObservationsWidget() {
  const [data, setData] = useState<ObservationsData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/observations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (!cancelled) setData(d.data ?? d);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[ObservationsWidget] fetch failed:", err);
          setError(true);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="p-4 text-gray-500">Failed to load observations.</div>;
  if (!data) return <div className="p-4 text-gray-500 animate-pulse">Detecting patterns...</div>;

  const grouped = data.observations.reduce((acc, obs) => {
    if (!acc[obs.pattern_type]) acc[obs.pattern_type] = [];
    acc[obs.pattern_type].push(obs);
    return acc;
  }, {} as Record<string, Observation[]>);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Observations</h3>
        <span className="text-xs px-2 py-1 rounded bg-amber-900/50 text-amber-400 border border-amber-800">
          Meta-Pattern Detection
        </span>
      </div>

      <div className="text-sm text-gray-400 mb-4">
        Scanned {data.total_memories_scanned.toLocaleString()} memories — found {data.observations.length} patterns
      </div>

      {data.observations.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No patterns detected yet. Store more memories to enable meta-pattern detection.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([type, observations]) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{PATTERN_ICONS[type] ?? "🔍"}</span>
                <span className="text-sm font-medium text-gray-300 capitalize">
                  {type.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-gray-500">({observations.length})</span>
              </div>
              <div className="space-y-2 ml-8">
                {observations.map((obs) => (
                  <div
                    key={obs.observation_id}
                    className={`rounded-lg border p-3 ${PATTERN_COLORS[type] ?? "text-gray-400 bg-gray-800/50 border-gray-700"}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="text-sm flex-1 mr-3">{obs.description}</div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800/50">
                          {obs.frequency}x
                        </span>
                        <span className="text-xs">
                          {(obs.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {obs.supporting_memories.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        {obs.supporting_memories.length} supporting memories
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
