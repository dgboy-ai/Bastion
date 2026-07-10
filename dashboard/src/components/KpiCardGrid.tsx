"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";

interface KpiCardGridProps {
  memories: number | undefined;
  entities: number | undefined;
  relations: number | undefined;
  avgImportance: string | undefined;
  onMemoryClick: () => void;
  onCognitiveClick: () => void;
}

const KpiCardGrid = memo(function KpiCardGrid({
  memories,
  entities,
  relations,
  avgImportance,
  onMemoryClick,
  onCognitiveClick,
}: KpiCardGridProps) {
  const router = useRouter();

  return (
    <div className="metrics-kpi-grid">
      <div
        className="kpi-card"
        style={{ color: "var(--accent-breeze)", cursor: "pointer", padding: "16px" }}
        onClick={onMemoryClick}
        title="Click to view raw memory values"
      >
        <div className="kpi-info">
          <span className="kpi-label" style={{ fontSize: "9px" }}>Vector Memories</span>
          <span className="kpi-val" style={{ fontSize: "24px", textShadow: "0 0 8px rgba(0, 229, 255, 0.2)" }}>{memories}</span>
          <span style={{ fontSize: "10px", color: "var(--accent-emerald)" }}>↑ 12% writes (Click)</span>
        </div>
        <div className="kpi-icon-wrapper" style={{ width: "38px", height: "38px", fontSize: "16px", color: "var(--accent-breeze)", background: "rgba(0, 229, 255, 0.04)" }}>💾</div>
      </div>

      <div
        className="kpi-card"
        style={{ color: "var(--accent-dusk)", cursor: "pointer", padding: "16px" }}
        onClick={() => router.push("/graph")}
        title="Click to navigate to Knowledge Graph"
      >
        <div className="kpi-info">
          <span className="kpi-label" style={{ fontSize: "9px" }}>Graph Entities</span>
          <span className="kpi-val" style={{ fontSize: "24px", textShadow: "0 0 8px rgba(139, 92, 246, 0.2)" }}>{entities}</span>
          <span style={{ fontSize: "10px", color: "var(--accent-emerald)" }}>↑ 8% active (Click)</span>
        </div>
        <div className="kpi-icon-wrapper" style={{ width: "38px", height: "38px", fontSize: "16px", color: "var(--accent-dusk)", background: "rgba(139, 92, 246, 0.04)" }}>🕸️</div>
      </div>

      <div
        className="kpi-card"
        style={{ color: "var(--accent-sunset)", cursor: "pointer", padding: "16px" }}
        onClick={() => router.push("/graph")}
        title="Click to navigate to Knowledge Graph"
      >
        <div className="kpi-info">
          <span className="kpi-label" style={{ fontSize: "9px" }}>Graph Relations</span>
          <span className="kpi-val" style={{ fontSize: "24px", textShadow: "0 0 8px rgba(255, 106, 0, 0.2)" }}>{relations}</span>
          <span style={{ fontSize: "10px", color: "var(--accent-emerald)" }}>↑ 15% edges (Click)</span>
        </div>
        <div className="kpi-icon-wrapper" style={{ width: "38px", height: "38px", fontSize: "16px", color: "var(--accent-sunset)", background: "rgba(255, 106, 0, 0.04)" }}>🔗</div>
      </div>

      <div
        className="kpi-card"
        style={{ color: "var(--accent-emerald)", cursor: "pointer", padding: "16px" }}
        onClick={onCognitiveClick}
        title="Click to view decay settings details"
      >
        <div className="kpi-info">
          <span className="kpi-label" style={{ fontSize: "9px" }}>Cognitive Score</span>
          <span className="kpi-val" style={{ fontSize: "24px", textShadow: "0 0 8px rgba(0, 255, 136, 0.2)" }}>{avgImportance}</span>
          <span style={{ fontSize: "10px", color: "var(--body)" }}>average weight (Click)</span>
        </div>
        <div className="kpi-icon-wrapper" style={{ width: "38px", height: "38px", fontSize: "16px", color: "var(--accent-emerald)", background: "rgba(0, 255, 136, 0.04)" }}>🧠</div>
      </div>
    </div>
  );
});

export default KpiCardGrid;
