"use client";

import { useEffect, useRef, useState } from "react";
import { interpolate } from "d3-interpolate";
import { arc as d3Arc, pie as d3Pie, PieArcDatum } from "d3-shape";
import { select } from "d3-selection";
import "d3-transition";

interface TrustRingProps {
  trustLevelDistribution: Record<number, number>;
  avgTrustScore: number;
  totalMemories: number;
  dangerousMemories: number;
}

const TRUST_COLORS: Record<number, string> = {
  0: "#ef4444", // Critical: Red
  1: "#f97316", // High: Orange
  2: "#d97706", // Medium: Dark Amber (for readability)
  3: "#2563eb", // Low: Blue
  4: "#16a34a", // None: Green
};

const TRUST_LABELS: Record<number, string> = {
  0: "CRITICAL THREAT",
  1: "HIGH RISK",
  2: "CAUTION",
  3: "SECURE (LOW DRIFT)",
  4: "SECURE",
};

export default function TrustRing({ trustLevelDistribution, avgTrustScore, totalMemories, dangerousMemories }: TrustRingProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<{ label: string; value: number; color: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current || totalMemories === 0) return;
    const svg = svgRef.current;
    const width = 240;
    const height = 240;
    const cx = width / 2;
    const cy = height / 2;
    const outerR = 90;
    const innerR = 66;

    const arcs: { level: number; count: number; color: string }[] = [];
    for (let lvl = 0; lvl <= 4; lvl++) {
      const count = (trustLevelDistribution ?? {})[lvl] ?? 0;
      if (count > 0) {
        arcs.push({ level: lvl, count, color: TRUST_COLORS[lvl] });
      }
    }

    const sel = select(svg);
    sel.selectAll("g.trust-ring-group").remove();

    const group = sel.append("g").attr("class", "trust-ring-group").attr("transform", `translate(${cx},${cy})`);

    const pie = d3Pie<{ level: number; count: number; color: string }>().value((d) => d.count).sort(null);
    const arcGen = d3Arc<PieArcDatum<{ level: number; count: number; color: string }>>().innerRadius(innerR).outerRadius(outerR).cornerRadius(4);

    const segments = group.selectAll("path").data(pie(arcs)).enter().append("path")
      .attr("d", arcGen as unknown as string)
      .attr("fill", (d: PieArcDatum<{ level: number; count: number; color: string }>) => d.data.color)
      .attr("opacity", 0.9)
      .attr("stroke", "#000000")
      .attr("stroke-width", 2.5)
      .style("cursor", "pointer")
      .style("transition", "all 0.15s ease")
      .on("mouseenter", function (this: SVGPathElement, _event: unknown, d: PieArcDatum<{ level: number; count: number; color: string }>) {
        select(this).attr("opacity", 1).attr("stroke-width", 3.5);
        setHovered({ label: TRUST_LABELS[d.data.level], value: d.data.count, color: d.data.color });
      })
      .on("mouseleave", function (this: SVGPathElement) {
        select(this).attr("opacity", 0.9).attr("stroke-width", 2.5);
        setHovered(null);
      });


    const safeScore = avgTrustScore ?? 0;
    
    // Text is drawn in high contrast black
    group.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.1em")
      .attr("fill", "#000000")
      .attr("font-family", "'Space Grotesk', sans-serif")
      .attr("font-size", "46px")
      .attr("font-weight", "950")
      .text((safeScore * 100).toFixed(0));

    const statusLabel = safeScore >= 0.7 ? "SECURE" : safeScore >= 0.4 ? "CAUTION" : "RISK DETECTED";
    const labelColor = safeScore >= 0.7 ? "#16a34a" : safeScore >= 0.4 ? "#d97706" : "#ef4444";
    
    group.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "2.8em")
      .attr("fill", labelColor)
      .attr("font-family", "'Space Grotesk', sans-serif")
      .attr("font-size", "11px")
      .attr("font-weight", "900")
      .attr("letter-spacing", "1.5")
      .text(statusLabel);
  }, [trustLevelDistribution, avgTrustScore, totalMemories]);

  if (totalMemories === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", height: "160px", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        NO TRUST DATA
      </div>
    );
  }

  const dangerColor = dangerousMemories > 0 ? "#ef4444" : "#16a34a";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <svg ref={svgRef} width="240" height="240" viewBox="0 0 240 240" style={{ overflow: "visible" }} />
        {hovered && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60px)",
            background: "#ffffff",
            border: `2px solid #000000`,
            boxShadow: "3px 3px 0px #000000",
            borderRadius: "6px",
            padding: "8px 12px",
            zIndex: 10,
            textAlign: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}>
            <div style={{ fontSize: "10px", fontFamily: "var(--font-sans)", color: hovered.color, fontWeight: 900 }}>{hovered.label}</div>
            <div style={{ fontSize: "12px", color: "#000000", fontWeight: 800, marginTop: "4px" }}>{hovered.value} memories</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)", padding: "0 8px" }}>
        <span>Dangerous: <span style={{ color: dangerColor, fontWeight: 600 }}>{dangerousMemories}</span></span>
        <span>Total: <span style={{ color: "var(--accent-breeze)", fontWeight: 600 }}>{totalMemories}</span></span>
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
        {[0, 1, 2, 3, 4].map((lvl) => {
          const count = (trustLevelDistribution ?? {})[lvl] ?? 0;
          if (count === 0) return null;
          return (
            <div key={lvl} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: TRUST_COLORS[lvl], display: "inline-block" }} />
              <span>{TRUST_LABELS[lvl]}: {count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
