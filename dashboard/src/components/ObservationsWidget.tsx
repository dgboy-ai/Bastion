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

const C = {
  card: "#120a0e", cardInner: "#1a1018", hairline: "rgba(255,170,0,.12)",
  ink: "#ffffff", body: "#c8c0cc", mute: "#8a8290",
  breeze: "#00e5ff", emerald: "#00ff88", sunset: "#ffaa00", lava: "#ff5500",
  dusk: "#ff6600", gold: "#ffc800",
};

const PATTERN_META: Record<string, { icon: string; color: string; label: string }> = {
  recurring_theme:  { icon: "⟳", color: C.breeze,  label: "Recurring Theme"  },
  co_occurrence:    { icon: "⊕", color: "#b026ff",  label: "Co-Occurrence"    },
  temporal_trend:   { icon: "↗", color: C.emerald,  label: "Temporal Trend"   },
  entity_cluster:   { icon: "◈", color: C.sunset,   label: "Entity Cluster"   },
};

export default function ObservationsWidget() {
  const [data, setData] = useState<ObservationsData | null>(null);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/observations")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (!cancelled) { setData(d.data ?? d); setVisible(true); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.lava, textTransform: "uppercase" as const, letterSpacing: "1.5px" }}>
          Observations — Failed to load
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.sunset, textTransform: "uppercase" as const, letterSpacing: "2px", marginBottom: 16 }}>
          META-PATTERN DETECTION
        </div>
        {[1,2,3].map(i => (
          <div key={i} style={{ background: C.cardInner, borderRadius: 8, height: 52, marginBottom: 8, animation: "netherPulse 1.8s ease-in-out infinite" }} />
        ))}
        <style>{`@keyframes netherPulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  const grouped = data.observations.reduce((acc, obs) => {
    if (!acc[obs.pattern_type]) acc[obs.pattern_type] = [];
    acc[obs.pattern_type].push(obs);
    return acc;
  }, {} as Record<string, Observation[]>);

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.hairline}`,
      borderRadius: 16,
      padding: 24,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.hairline}` }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.sunset, textTransform: "uppercase" as const, letterSpacing: "2px", marginBottom: 4 }}>
            META-PATTERN DETECTION
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Observations</div>
        </div>
        <div style={{ textAlign: "right" as const }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.gold, fontFamily: "var(--font-sg)" }}>{data.observations.length}</div>
          <div style={{ fontSize: 10, color: C.mute, fontFamily: "var(--font-mono)" }}>patterns</div>
        </div>
      </div>

      {/* Scan summary */}
      <div style={{ background: C.cardInner, borderRadius: 10, padding: "10px 14px", marginBottom: 16, border: `1px solid ${C.hairline}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.mute }}>Memories scanned</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.breeze, fontFamily: "var(--font-mono)" }}>
          {data.total_memories_scanned.toLocaleString()}
        </span>
      </div>

      {data.observations.length === 0 ? (
        <div style={{ textAlign: "center" as const, padding: "32px 0", color: C.mute, fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>◈</div>
          No patterns detected yet. Store more memories.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {Object.entries(grouped).map(([type, observations]) => {
            const meta = PATTERN_META[type] ?? { icon: "◆", color: C.mute, label: type.replace(/_/g, " ") };
            return (
              <div key={type}>
                {/* Group Header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", marginBottom: 4,
                  background: `${meta.color}08`,
                  border: `1px solid ${meta.color}20`,
                  borderRadius: 8,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                  onClick={() => setExpanded(expanded === type ? null : type)}
                >
                  <span style={{ fontSize: 16, color: meta.color, width: 20, textAlign: "center" as const }}>{meta.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: meta.color, flex: 1 }}>{meta.label}</span>
                  <span style={{
                    fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700,
                    color: meta.color, background: `${meta.color}18`,
                    border: `1px solid ${meta.color}30`, borderRadius: 999, padding: "2px 8px"
                  }}>
                    {observations.length}
                  </span>
                  <span style={{ fontSize: 10, color: C.mute, marginLeft: 4 }}>{expanded === type ? "▲" : "▼"}</span>
                </div>

                {/* Observations list (collapsed by default) */}
                {expanded === type && (
                  <div style={{ marginLeft: 12, marginBottom: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {observations.map((obs) => (
                      <div key={obs.observation_id} style={{
                        background: C.cardInner, borderRadius: 8, padding: "10px 14px",
                        border: `1px solid ${meta.color}15`,
                        display: "flex", gap: 10, alignItems: "flex-start",
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: C.body, lineHeight: 1.4 }}>{obs.description}</div>
                          {obs.supporting_memories.length > 0 && (
                            <div style={{ fontSize: 10, color: C.mute, marginTop: 4, fontFamily: "var(--font-mono)" }}>
                              {obs.supporting_memories.length} supporting memories
                            </div>
                          )}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: meta.color, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                            {(obs.confidence * 100).toFixed(0)}%
                          </span>
                          <span style={{ fontSize: 10, color: C.mute, fontFamily: "var(--font-mono)" }}>
                            {obs.frequency}×
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
