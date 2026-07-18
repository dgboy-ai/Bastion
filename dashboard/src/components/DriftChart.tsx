"use client";

import { useEffect, useRef, useState } from "react";

interface TimePoint {
  score: number;
  timestamp: string;
  status: string;
}

interface DriftChartProps {
  timeSeries: TimePoint[];
  overallScore: number;
  status: string;
  topSignals: string[];
  recommendation: string;
  loading?: boolean;
}

const WIDTH = 260;
const HEIGHT = 100;
const PAD_LEFT = 20;
const PAD_RIGHT = 10;
const PAD_TOP = 8;
const PAD_BOTTOM = 18;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

export default function DriftChart({ timeSeries, overallScore, status, topSignals, recommendation, loading }: DriftChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; score: number; time: string } | null>(null);

  useEffect(() => {
    if (!svgRef.current || timeSeries.length < 2) return;
    const svg = svgRef.current;

    // Cleanup function to remove all children and event listeners on unmount/re-render
    const cleanup = () => {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    };

    cleanup();
    const ns = "http://www.w3.org/2000/svg";

    const xScale = (i: number) => PAD_LEFT + (i / (timeSeries.length - 1)) * PLOT_W;
    const yScale = (s: number) => PAD_TOP + (1 - s) * PLOT_H;

    let healthyD = "";
    let driftingD = "";
    const threshold = 0.3;
    const criticalThreshold = 0.6;

    const healthySegments: string[] = [];
    const driftingSegments: string[] = [];
    const criticalSegments: string[] = [];
    for (let i = 1; i < timeSeries.length; i++) {
      const prev = timeSeries[i - 1];
      const curr = timeSeries[i];
      const x1 = xScale(i - 1);
      const y1 = yScale(prev.score);
      const x2 = xScale(i);
      const y2 = yScale(curr.score);
      if (curr.score >= criticalThreshold) {
        criticalSegments.push(`M${x1},${y1}L${x2},${y2}`);
      } else if (curr.score >= threshold) {
        driftingSegments.push(`M${x1},${y1}L${x2},${y2}`);
      } else {
        healthySegments.push(`M${x1},${y1}L${x2},${y2}`);
      }
    }
    healthyD = healthySegments.join("");
    driftingD = driftingSegments.join("");

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const defs = document.createElementNS(ns, "defs");
    const glowFilter = document.createElementNS(ns, "filter");
    glowFilter.setAttribute("id", "drift-line-glow");
    glowFilter.setAttribute("x", "-20%");
    glowFilter.setAttribute("y", "-20%");
    glowFilter.setAttribute("width", "140%");
    glowFilter.setAttribute("height", "140%");
    const blur = document.createElementNS(ns, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "2");
    blur.setAttribute("result", "blur");
    glowFilter.appendChild(blur);
    const merge = document.createElementNS(ns, "feMerge");
    const mn1 = document.createElementNS(ns, "feMergeNode");
    mn1.setAttribute("in", "blur");
    const mn2 = document.createElementNS(ns, "feMergeNode");
    mn2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mn1);
    merge.appendChild(mn2);
    glowFilter.appendChild(merge);
    defs.appendChild(glowFilter);
    svg.appendChild(defs);

    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("x", String(PAD_LEFT));
    bg.setAttribute("y", String(PAD_TOP));
    bg.setAttribute("width", String(PLOT_W));
    bg.setAttribute("height", String(PLOT_H));
    bg.setAttribute("fill", "rgba(255,255,255,0.015)");
    bg.setAttribute("rx", "3");
    svg.appendChild(bg);

    const thresholdLine = document.createElementNS(ns, "line");
    const thresholdY = yScale(threshold);
    thresholdLine.setAttribute("x1", String(PAD_LEFT));
    thresholdLine.setAttribute("y1", String(thresholdY));
    thresholdLine.setAttribute("x2", String(PAD_LEFT + PLOT_W));
    thresholdLine.setAttribute("y2", String(thresholdY));
    thresholdLine.setAttribute("stroke", "rgba(255,106,0,0.3)");
    thresholdLine.setAttribute("stroke-dasharray", "3,3");
    thresholdLine.setAttribute("stroke-width", "1");
    svg.appendChild(thresholdLine);

    const criticalLine = document.createElementNS(ns, "line");
    const criticalY = yScale(criticalThreshold);
    criticalLine.setAttribute("x1", String(PAD_LEFT));
    criticalLine.setAttribute("y1", String(criticalY));
    criticalLine.setAttribute("x2", String(PAD_LEFT + PLOT_W));
    criticalLine.setAttribute("y2", String(criticalY));
    criticalLine.setAttribute("stroke", "rgba(255,51,51,0.3)");
    criticalLine.setAttribute("stroke-dasharray", "3,3");
    criticalLine.setAttribute("stroke-width", "1");
    svg.appendChild(criticalLine);

    const labelThreshold = document.createElementNS(ns, "text");
    labelThreshold.setAttribute("x", String(PAD_LEFT + PLOT_W + 2));
    labelThreshold.setAttribute("y", String(thresholdY + 3));
    labelThreshold.setAttribute("fill", "rgba(255,106,0,0.4)");
    labelThreshold.setAttribute("font-size", "7");
    labelThreshold.setAttribute("font-family", "var(--font-mono)");
    labelThreshold.textContent = "THR";
    svg.appendChild(labelThreshold);

    const labelCritical = document.createElementNS(ns, "text");
    labelCritical.setAttribute("x", String(PAD_LEFT + PLOT_W + 2));
    labelCritical.setAttribute("y", String(criticalY + 3));
    labelCritical.setAttribute("fill", "rgba(255,51,51,0.4)");
    labelCritical.setAttribute("font-size", "7");
    labelCritical.setAttribute("font-family", "var(--font-mono)");
    labelCritical.textContent = "CRIT";
    svg.appendChild(labelCritical);

    if (healthyD) {
      const healthyPath = document.createElementNS(ns, "path");
      healthyPath.setAttribute("d", healthyD);
      healthyPath.setAttribute("fill", "none");
      healthyPath.setAttribute("stroke", "var(--accent-emerald)");
      healthyPath.setAttribute("stroke-width", "2");
      healthyPath.setAttribute("stroke-linecap", "round");
      healthyPath.setAttribute("stroke-linejoin", "round");
      healthyPath.setAttribute("filter", "url(#drift-line-glow)");
      svg.appendChild(healthyPath);
    }

    if (driftingD) {
      const driftingPath = document.createElementNS(ns, "path");
      driftingPath.setAttribute("d", driftingD);
      driftingPath.setAttribute("fill", "none");
      driftingPath.setAttribute("stroke", "var(--accent-sunset)");
      driftingPath.setAttribute("stroke-width", "2");
      driftingPath.setAttribute("stroke-linecap", "round");
      driftingPath.setAttribute("stroke-linejoin", "round");
      driftingPath.setAttribute("filter", "url(#drift-line-glow)");
      svg.appendChild(driftingPath);
    }

    if (criticalSegments.length > 0) {
      const criticalD = criticalSegments.join("");
      const criticalPath = document.createElementNS(ns, "path");
      criticalPath.setAttribute("d", criticalD);
      criticalPath.setAttribute("fill", "none");
      criticalPath.setAttribute("stroke", "#ff3333");
      criticalPath.setAttribute("stroke-width", "2.5");
      criticalPath.setAttribute("stroke-linecap", "round");
      criticalPath.setAttribute("stroke-linejoin", "round");
      criticalPath.setAttribute("filter", "url(#drift-line-glow)");
      svg.appendChild(criticalPath);
    }

    for (let i = 0; i < timeSeries.length; i++) {
      const pt = timeSeries[i];
      const cx = xScale(i);
      const cy = yScale(pt.score);
      const dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "3");
      dot.setAttribute("fill", pt.score >= criticalThreshold ? "#ff3333" : pt.score >= threshold ? "var(--accent-sunset)" : "var(--accent-emerald)");
      dot.setAttribute("opacity", "0.8");
      dot.setAttribute("style", "cursor: pointer");
      dot.addEventListener("mouseenter", () => {
        setHoveredPoint({ x: cx, y: cy, score: pt.score, time: formatTime(pt.timestamp) });
      });
      dot.addEventListener("mouseleave", () => setHoveredPoint(null));
      svg.appendChild(dot);
    }

    return cleanup;
  }, [timeSeries]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: `${HEIGHT}px`, color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        LOADING DRIFT...
      </div>
    );
  }

  if (timeSeries.length < 2) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: `${HEIGHT}px`, color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        INSUFFICIENT DRIFT DATA
      </div>
    );
  }

  const statusColor = status === "CRITICAL" ? "#ff3333" : status === "DRIFTING" ? "var(--accent-sunset)" : "var(--accent-emerald)";
  const hoverBorderColor = hoveredPoint && hoveredPoint.score >= 0.6 ? "#ff3333" : hoveredPoint && hoveredPoint.score >= 0.3 ? "var(--accent-sunset)" : "var(--accent-emerald)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "18px", fontFamily: "var(--font-mono)", fontWeight: 700, color: statusColor }}>
            {(overallScore * 100).toFixed(0)}
          </span>
          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: statusColor, fontWeight: 600 }}>
            {status}
          </span>
        </div>
        <span style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
          {timeSeries.length} samples
        </span>
      </div>

      <div style={{ position: "relative", width: `${WIDTH}px`, height: `${HEIGHT}px` }}>
        <svg ref={svgRef} width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ overflow: "visible" }} />
        {hoveredPoint && (
          <div style={{
            position: "absolute",
            left: `${Math.min(hoveredPoint.x, WIDTH - 80)}px`,
            top: `${Math.max(hoveredPoint.y - 36, 0)}px`,
            background: "rgba(2, 3, 8, 0.92)",
            border: `1px solid ${hoverBorderColor}`,
            borderRadius: "4px",
            padding: "4px 8px",
            zIndex: 10,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            fontFamily: "var(--font-mono)",
            fontSize: "9px",
            color: "#fff",
          }}>
            <div>Score: {(hoveredPoint.score * 100).toFixed(0)}</div>
            <div style={{ color: "var(--mute)", fontSize: "8px" }}>{hoveredPoint.time}</div>
          </div>
        )}
      </div>

      {topSignals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--accent-sunset)", fontWeight: 600 }}>Top Signals:</div>
          {topSignals.map((signal, i) => (
            <div key={i} style={{ fontSize: "8px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
              {signal.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}

      {recommendation && recommendation !== "No action needed. Agent behavior is stable." && (
        <div style={{ fontSize: "9px", color: "var(--accent-breeze)", fontFamily: "var(--font-mono)", padding: "6px 8px", background: "rgba(0, 229, 255, 0.04)", borderRadius: "4px", border: "1px solid rgba(0, 229, 255, 0.1)" }}>
          {recommendation}
        </div>
      )}
    </div>
  );
}
