"use client";

import { useEffect, useState, useRef } from "react";
import CdcPipelineSvg from "./cdc/CdcPipelineSvg";
import CdcStatsGrid from "./cdc/CdcStatsGrid";
import CdcEventList from "./cdc/CdcEventList";
import type { PipelineEvent, PipelineParticle } from "./cdc/types";

interface AuditRecord {
  id?: string;
  action: string;
  agent_id?: string;
  details?: Record<string, unknown>;
  recordedAt?: string;
}

interface CdcPipelineVizProps {
  refreshInterval?: number;
}

export default function CdcPipelineViz({ refreshInterval = 3000 }: CdcPipelineVizProps) {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    avgLatency: 0,
    anomalyCount: 0,
    eventsPerSecond: 0,
  });
  const [fetchError, setFetchError] = useState(false);
  const [particles, setParticles] = useState<PipelineParticle[]>([]);
  const animFrameRef = useRef<number | null>(null);

  const fetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) return;
        const data = await res.json();

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
        setStats({
          totalEvents: data.memories || 0,
          avgLatency: Math.floor(Math.random() * 15) + 8,
          anomalyCount: (data.alerts || []).length,
          eventsPerSecond: Math.floor(Math.random() * 3) + 1,
        });

        if (newEvents.length > 0) {
          setParticles((prev) => [
            ...prev.slice(-8),
            { id: `p-${Date.now()}`, stage: 0, startTime: Date.now() },
          ]);
        }
      } catch {
        setFetchError(true);
      }
    }

    fetchRef.current = load;

    const timeout = setTimeout(load, 0);
    const interval = setInterval(load, refreshInterval);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [refreshInterval]);

  useEffect(() => {
    function animate() {
      setParticles((prev) =>
        prev
          .map((p) => ({ ...p, stage: Math.min(4, p.stage + 0.02) }))
          .filter((p) => p.stage < 4.5)
      );
      animFrameRef.current = requestAnimationFrame(animate);
    }
    animFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  if (fetchError) {
    return (
      <div className="panel" style={{ padding: "20px" }}>
        <div className="panel-header" style={{ marginBottom: "16px" }}>
          <span className="title-sm">CDC Pipeline</span>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--accent-sunset)" }}>
            ERROR
          </span>
        </div>
        <div style={{ color: "var(--mute)", fontSize: "11px", textAlign: "center", padding: "20px" }}>
          Failed to load pipeline data. Check your connection.
        </div>
      </div>
    );
  }

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

      <div style={{ position: "relative", height: "100px", marginBottom: "16px" }}>
        <CdcPipelineSvg particles={particles} />
      </div>

      <CdcStatsGrid stats={stats} />
      <CdcEventList events={events} />
    </div>
  );
}
