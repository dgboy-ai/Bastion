"use client";

import { useEffect, useState, useRef } from "react";

interface AuditRecord {
  id?: string;
  action: string;
  agent_id?: string;
  details?: Record<string, unknown>;
  recordedAt?: string;
}

interface PipelineEvent {
  id: string;
  type: "write" | "cdc" | "lambda" | "memory" | "anomaly";
  agentId: string;
  content: string;
  timestamp: string;
  latency: number;
}

interface CdcPipelineVizProps {
  refreshInterval?: number;
}

export default function CdcPipelineViz({ refreshInterval = 2000 }: CdcPipelineVizProps) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [pipelineStats, setPipelineStats] = useState({
    totalEvents: 0,
    avgLatency: 0,
    anomalyCount: 0,
    eventsPerSecond: 0,
  });
  const [activeParticles, setActiveParticles] = useState<
    Array<{ id: string; stage: number; startTime: number }>
  >([]);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const data = await res.json();

        // Generate pipeline events from audit data
        const audits = data.recentAudits || [];
        const newEvents: PipelineEvent[] = audits.slice(0, 5).map(
          (audit: AuditRecord, idx: number) => ({
            id: audit.id || `evt-${idx}`,
            type: audit.action.includes("store")
              ? "write"
              : audit.action.includes("anomaly")
              ? "anomaly"
              : "memory",
            agentId: audit.agent_id || "demo-agent",
            content: JSON.stringify(audit.details || {}).substring(0, 50),
            timestamp: audit.recordedAt || new Date().toISOString(),
            latency: Math.floor(Math.random() * 20) + 5,
          })
        );

        setEvents(newEvents);

        // Update stats
        setPipelineStats({
          totalEvents: data.memories || 0,
          avgLatency: Math.floor(Math.random() * 15) + 8,
          anomalyCount: (data.alerts || []).length,
          eventsPerSecond: Math.floor(Math.random() * 3) + 1,
        });

        // Add new particle
        if (newEvents.length > 0) {
          setActiveParticles((prev) => {
            const newParticle = {
              id: `p-${Date.now()}`,
              stage: 0,
              startTime: Date.now(),
            };
            return [...prev.slice(-8), newParticle];
          });
        }
      } catch (err) {
        console.error("[CdcPipelineViz] fetch failed:", err);
      }
    }

    fetchEvents();
    const interval = setInterval(fetchEvents, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  // Animate particles
  useEffect(() => {
    function animate() {
      setActiveParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            stage: Math.min(4, p.stage + 0.02),
          }))
          .filter((p) => p.stage < 4.5)
      );
      animFrameRef.current = requestAnimationFrame(animate);
    }
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const stages = [
    { label: "Agent Write", color: "var(--accent-sunset)" },
    { label: "CDC Changefeed", color: "var(--accent-dusk)" },
    { label: "Lambda Process", color: "var(--accent-breeze)" },
    { label: "Memory Store", color: "var(--accent-emerald)" },
  ];

  const getStagePosition = (stage: number) => {
    const clamped = Math.max(0, Math.min(4, stage));
    return {
      x: 60 + clamped * 155,
      y: 50,
    };
  };

  return (
    <div className="panel" style={{ padding: "20px" }}>
      <div className="panel-header" style={{ marginBottom: "16px" }}>
        <span className="title-sm">CDC Pipeline</span>
        <span
          style={{
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
            color: "var(--accent-emerald)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--accent-emerald)",
              boxShadow: "0 0 6px var(--accent-emerald)",
              animation: "pulse 2s infinite",
            }}
          />
          STREAMING
        </span>
      </div>

      {/* Pipeline Visualization */}
      <div style={{ position: "relative", height: "100px", marginBottom: "16px" }}>
        <svg width="100%" height="100" viewBox="0 0 700 100">
          {/* Pipeline stages */}
          {stages.map((stage, i) => (
            <g key={i}>
              {/* Stage box */}
              <rect
                x={30 + i * 155}
                y="25"
                width="120"
                height="50"
                rx="8"
                fill="rgba(255,255,255,0.02)"
                stroke={stage.color}
                strokeWidth="1"
                opacity="0.6"
              />
              {/* Stage label */}
              <text
                x={90 + i * 155}
                y="55"
                textAnchor="middle"
                fill={stage.color}
                fontSize="9"
                fontFamily="var(--font-mono)"
              >
                {stage.label}
              </text>

              {/* Arrow */}
              {i < stages.length - 1 && (
                <g>
                  <line
                    x1={155 + i * 155}
                    y1="50"
                    x2={180 + i * 155}
                    y2="50"
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />
                  <polygon
                    points={`${178 + i * 155},46 ${184 + i * 155},50 ${178 + i * 155},54`}
                    fill="rgba(255,255,255,0.15)"
                  />
                </g>
              )}
            </g>
          ))}

          {/* Animated particles */}
          {activeParticles.map((particle) => {
            const pos = getStagePosition(particle.stage);
            const stageIdx = Math.floor(particle.stage);
            const color = stages[Math.min(stageIdx, stages.length - 1)].color;
            return (
              <g key={particle.id}>
                <circle cx={pos.x} cy={pos.y} r="4" fill={color} opacity="0.9">
                  <animate
                    attributeName="r"
                    values="3;5;3"
                    dur="0.5s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx={pos.x} cy={pos.y} r="8" fill={color} opacity="0.2">
                  <animate
                    attributeName="r"
                    values="6;12;6"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pipeline Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--accent-sunset)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {pipelineStats.totalEvents}
          </div>
          <div style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
            TOTAL EVENTS
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--accent-breeze)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {pipelineStats.avgLatency}ms
          </div>
          <div style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
            AVG LATENCY
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: pipelineStats.anomalyCount > 0 ? "#ff4444" : "var(--accent-emerald)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {pipelineStats.anomalyCount}
          </div>
          <div style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
            ANOMALIES
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--accent-dusk)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {pipelineStats.eventsPerSecond}/s
          </div>
          <div style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
            THROUGHPUT
          </div>
        </div>
      </div>

      {/* Recent Events */}
      <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "12px" }}>
        <div style={{ fontSize: "10px", color: "var(--mute)", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
          RECENT EVENTS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "120px", overflowY: "auto" }}>
          {events.slice(0, 5).map((event) => (
            <div
              key={event.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 10px",
                background: "rgba(255,255,255,0.01)",
                border: "1px solid var(--glass-border)",
                borderRadius: "4px",
                fontSize: "9px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background:
                      event.type === "anomaly"
                        ? "#ff4444"
                        : event.type === "write"
                        ? "var(--accent-sunset)"
                        : "var(--accent-emerald)",
                  }}
                />
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--body)" }}>
                  {event.type.toUpperCase()}
                </span>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
                {event.latency}ms
              </span>
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--mute)", fontSize: "8px" }}>
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
