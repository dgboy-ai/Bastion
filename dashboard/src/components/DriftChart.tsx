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

const WIDTH = 540;
const HEIGHT = 110;
const PAD_LEFT = 24;
const PAD_RIGHT = 16;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
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
      healthyPath.setAttribute("stroke", "#10b981");
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
      driftingPath.setAttribute("stroke", "#f97316");
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
      criticalPath.setAttribute("stroke", "#ef4444");
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
      dot.setAttribute("r", "3.5");
      dot.setAttribute("fill", pt.score >= criticalThreshold ? "#ef4444" : pt.score >= threshold ? "#f97316" : "#10b981");
      dot.setAttribute("opacity", "0.85");
      dot.setAttribute("style", "cursor: pointer");

      dot.addEventListener("mouseenter", () => {
        const existing = svg.querySelector("#drift-tooltip");
        if (existing) existing.remove();

        const tooltipGroup = document.createElementNS(ns, "g");
        tooltipGroup.setAttribute("id", "drift-tooltip");
        tooltipGroup.setAttribute("style", "pointer-events: none;");

        const tooltipRect = document.createElementNS(ns, "rect");
        const tx = Math.min(cx + 8, WIDTH - 95);
        const ty = Math.max(cy - 32, 5);
        tooltipRect.setAttribute("x", String(tx));
        tooltipRect.setAttribute("y", String(ty));
        tooltipRect.setAttribute("width", "85");
        tooltipRect.setAttribute("height", "26");
        tooltipRect.setAttribute("fill", "rgba(6, 3, 10, 0.95)");
        tooltipRect.setAttribute("stroke", pt.score >= criticalThreshold ? "#ef4444" : pt.score >= threshold ? "#f97316" : "#10b981");
        tooltipRect.setAttribute("stroke-width", "1");
        tooltipRect.setAttribute("rx", "4");
        tooltipGroup.appendChild(tooltipRect);

        const text1 = document.createElementNS(ns, "text");
        text1.setAttribute("x", String(tx + 6));
        text1.setAttribute("y", String(ty + 10));
        text1.setAttribute("fill", "#fff");
        text1.setAttribute("font-size", "7.5");
        text1.setAttribute("font-family", "var(--font-mono)");
        text1.textContent = `Score: ${(pt.score * 100).toFixed(0)}`;
        tooltipGroup.appendChild(text1);

        const text2 = document.createElementNS(ns, "text");
        text2.setAttribute("x", String(tx + 6));
        text2.setAttribute("y", String(ty + 18));
        text2.setAttribute("fill", "rgba(255,255,255,0.6)");
        text2.setAttribute("font-size", "6.5");
        text2.setAttribute("font-family", "var(--font-mono)");
        text2.textContent = formatTime(pt.timestamp);
        tooltipGroup.appendChild(text2);

        svg.appendChild(tooltipGroup);
      });

      dot.addEventListener("mouseleave", () => {
        const tooltip = svg.querySelector("#drift-tooltip");
        if (tooltip) tooltip.remove();
      });

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

  const statusColor = status === "CRITICAL" ? "#ef4444" : status === "DRIFTING" ? "#f97316" : "#10b981";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "18px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: statusColor }}>
            {(overallScore * 100).toFixed(0)}%
          </span>
          <span style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", color: statusColor, fontWeight: 600 }}>
            {status}
          </span>
        </div>
        <span style={{ fontSize: "9.5px", color: "var(--mute)", fontFamily: "'JetBrains Mono', monospace" }}>
          {timeSeries.length} samples
        </span>
      </div>

      <div style={{ position: "relative", width: "100%", height: `${HEIGHT}px` }}>
        <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} style={{ overflow: "visible" }} />
      </div>

      {topSignals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "4px" }}>
          <div style={{ fontSize: "9.5px", fontFamily: "'JetBrains Mono', monospace", color: "#f97316", fontWeight: 700 }}>Top Signals:</div>
          {topSignals.map((signal, i) => (
            <div key={i} style={{ fontSize: "9px", fontFamily: "'JetBrains Mono', monospace", color: "var(--mute)" }}>
              {signal.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}

      {recommendation && recommendation !== "No action needed. Agent behavior is stable." && (
        <div style={{ fontSize: "9.5px", color: "#00e5ff", fontFamily: "'JetBrains Mono', monospace", padding: "6px 10px", background: "rgba(0, 229, 255, 0.04)", borderRadius: "6px", border: "1px solid rgba(0, 229, 255, 0.15)", marginTop: "4px" }}>
          {recommendation}
        </div>
      )}
    </div>
  );
}
