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
  0: "#ff3333",
  1: "#ff6600",
  2: "#ffcc00",
  3: "#66ff33",
  4: "#00ff88",
};

const TRUST_LABELS: Record<number, string> = {
  0: "CRITICAL",
  1: "HIGH",
  2: "MEDIUM",
  3: "LOW",
  4: "NONE",
};

export default function TrustRing({ trustLevelDistribution, avgTrustScore, totalMemories, dangerousMemories }: TrustRingProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hovered, setHovered] = useState<{ label: string; value: number; color: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current || totalMemories === 0) return;
    const svg = svgRef.current;
    const width = 160;
    const height = 160;
    const cx = width / 2;
    const cy = height / 2;
    const outerR = 60;
    const innerR = 42;

    const arcs: { level: number; count: number; color: string }[] = [];
    for (let lvl = 0; lvl <= 4; lvl++) {
      const count = trustLevelDistribution[lvl] ?? 0;
      if (count > 0) {
        arcs.push({ level: lvl, count, color: TRUST_COLORS[lvl] });
      }
    }

    const sel = select(svg);
    sel.selectAll("g.trust-ring-group").remove();

    const existingDefs = sel.select<SVGDefsElement>("defs");
    const defs = existingDefs.empty() ? sel.append("defs") : existingDefs;
    if (!existingDefs.empty()) {
      existingDefs.selectAll("*").remove();
    }

    const glowFilter = defs.append("filter").attr("id", "trust-ring-glow").attr("x", "-20%").attr("y", "-20%").attr("width", "140%").attr("height", "140%");
    glowFilter.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const glowMerge = glowFilter.append("feMerge");
    glowMerge.append("feMergeNode").attr("in", "blur");
    glowMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const textGlow = defs.append("filter").attr("id", "trust-text-glow").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    textGlow.append("feGaussianBlur").attr("stdDeviation", "2.5").attr("result", "blur");
    const textMerge = textGlow.append("feMerge");
    textMerge.append("feMergeNode").attr("in", "blur");
    textMerge.append("feMergeNode").attr("in", "SourceGraphic");

    const group = sel.append("g").attr("class", "trust-ring-group").attr("transform", `translate(${cx},${cy})`);

    const pie = d3Pie<{ level: number; count: number; color: string }>().value((d) => d.count).sort(null);
    const arcGen = d3Arc<PieArcDatum<{ level: number; count: number; color: string }>>().innerRadius(innerR).outerRadius(outerR).cornerRadius(2);

    const segments = group.selectAll("path").data(pie(arcs)).enter().append("path")
      .attr("d", arcGen as unknown as string)
      .attr("fill", (d: PieArcDatum<{ level: number; count: number; color: string }>) => d.data.color)
      .attr("opacity", 0.85)
      .attr("stroke", "#020305")
      .attr("stroke-width", 1.5)
      .attr("filter", "url(#trust-ring-glow)")
      .style("cursor", "pointer")
      .style("transition", "opacity 0.2s")
      .on("mouseenter", function (this: SVGPathElement, _event: unknown, d: PieArcDatum<{ level: number; count: number; color: string }>) {
        select(this).attr("opacity", 1);
        setHovered({ label: TRUST_LABELS[d.data.level], value: d.data.count, color: d.data.color });
      })
      .on("mouseleave", function (this: SVGPathElement) {
        select(this).attr("opacity", 0.85);
        setHovered(null);
      });

    segments.transition()
      .duration(800)
      .attrTween("d", function (d: PieArcDatum<{ level: number; count: number; color: string }>) {
        const interp = interpolate({ startAngle: 0, endAngle: 0 }, d);
        return (t: number) => arcGen(interp(t)) as string;
      });

    const scoreColor = avgTrustScore >= 0.8 ? "#00ff88" : avgTrustScore >= 0.5 ? "#ffcc00" : avgTrustScore >= 0.2 ? "#ff6600" : "#ff3333";
    group.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.1em")
      .attr("fill", scoreColor)
      .attr("font-family", "'JetBrains Mono', monospace")
      .attr("font-size", "22px")
      .attr("font-weight", "700")
      .attr("filter", "url(#trust-text-glow)")
      .text((avgTrustScore * 100).toFixed(0));
  }, [trustLevelDistribution, avgTrustScore, totalMemories]);

  if (totalMemories === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "160px", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        NO TRUST DATA
      </div>
    );
  }

  const dangerColor = dangerousMemories > 0 ? "var(--accent-sunset)" : "var(--accent-emerald)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <svg ref={svgRef} width="160" height="160" viewBox="0 0 160 160" style={{ overflow: "visible" }} />
        {hovered && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -60px)",
            background: "rgba(2, 3, 8, 0.92)",
            border: `1px solid ${hovered.color}`,
            borderRadius: "6px",
            padding: "6px 10px",
            zIndex: 10,
            textAlign: "center",
            pointerEvents: "none",
            whiteSpace: "nowrap",
          }}>
            <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: hovered.color, fontWeight: 600 }}>{hovered.label}</div>
            <div style={{ fontSize: "11px", color: "#fff", marginTop: "2px" }}>{hovered.value} memories</div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)", padding: "0 8px" }}>
        <span>Dangerous: <span style={{ color: dangerColor, fontWeight: 600 }}>{dangerousMemories}</span></span>
        <span>Total: <span style={{ color: "var(--accent-breeze)", fontWeight: 600 }}>{totalMemories}</span></span>
      </div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
        {[0, 1, 2, 3, 4].map((lvl) => {
          const count = trustLevelDistribution[lvl] ?? 0;
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
