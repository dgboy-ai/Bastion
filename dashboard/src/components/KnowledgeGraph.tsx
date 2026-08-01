"use client";

import { useEffect, useRef } from "react";
import {
  drag,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  select,
  zoom as d3Zoom,
  zoomIdentity,
} from "d3";
import type {
  D3DragEvent,
  SimulationLinkDatum,
  SimulationNodeDatum,
} from "d3";

interface Node extends SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface Link extends SimulationLinkDatum<Node> {
  id: string;
  source: string | Node;
  target: string | Node;
  type: string;
  confidence: number;
}

interface KnowledgeGraphProps {
  nodes: Node[];
  links: Link[];
  onNodeClick: (node: Node) => void;
  width?: number;
  height?: number;
}

export default function KnowledgeGraph({ nodes, links, onNodeClick }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const onNodeClickRef = useRef(onNodeClick);
  const zoomBehaviorRef = useRef<any>(null);

  useEffect(() => { onNodeClickRef.current = onNodeClick; });

  const zoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy as any, 1.3);
  };

  const zoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(250).call(zoomBehaviorRef.current.scaleBy as any, 0.75);
  };

  const resetZoom = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return;
    select(svgRef.current).transition().duration(350).call(
      zoomBehaviorRef.current.transform as any,
      zoomIdentity
    );
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Clear previous drawing
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    if (nodes.length === 0) return;

    const defs = svg.append("defs");

    // Smooth Radial Gradient Glows for Node Core and Halo
    const createGlowGradients = (id: string, color: string) => {
      const g = defs.append("radialGradient").attr("id", `radial-${id}`);
      g.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 1);
      g.append("stop").attr("offset", "60%").attr("stop-color", color).attr("stop-opacity", 0.7);
      g.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);

      const filter = defs.append("filter").attr("id", `filter-${id}`).attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
      filter.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    };

    createGlowGradients("sunset", "var(--accent-sunset)");
    createGlowGradients("breeze", "var(--accent-breeze)");
    createGlowGradients("dusk", "var(--accent-dusk)");

    // Arrow markers for clean curved line endpoints (offset refX slightly)
    const createMarker = (id: string, color: string) => {
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 36) // Offset to sit outside the larger node rim
        .attr("refY", -1.5)
        .attr("markerWidth", 5.5)
        .attr("markerHeight", 5.5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L8,0L0,4")
        .attr("fill", color)
        .attr("opacity", 0.5);
    };

    createMarker("arrow-sunset", "var(--accent-sunset)");
    createMarker("arrow-breeze", "var(--accent-breeze)");
    createMarker("arrow-dusk", "var(--accent-dusk)");

    // Grid coordinates background pattern
    defs.append("pattern")
      .attr("id", "grid")
      .attr("width", 40)
      .attr("height", 40)
      .attr("patternUnits", "userSpaceOnUse")
      .append("path")
      .attr("d", "M 40 0 L 0 0 0 40")
      .attr("fill", "none")
      .attr("stroke", "rgba(255, 255, 255, 0.015)")
      .attr("stroke-width", 0.5);

    svg.append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "url(#grid)");

    const container = svg.append("g");

    // Pan & Zoom controls
    const zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });
    svg.call(zoomBehavior);
    zoomBehaviorRef.current = zoomBehavior;

    // Filter valid links where both source and target nodes exist in the dataset
    const nodeIds = new Set(nodes.map((n) => n.id));
    const validLinks = links
      .filter((l) => {
        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        return nodeIds.has(srcId) && nodeIds.has(tgtId);
      })
      .map((l) => ({
        ...l,
        source: typeof l.source === "object" ? l.source.id : l.source,
        target: typeof l.target === "object" ? l.target.id : l.target,
      }));

    // Dynamic layout constraints
    const simulation = forceSimulation<Node>(nodes)
      .force("link", forceLink<Node, Link>(validLinks).id(d => d.id).distance(140))
      .force("charge", forceManyBody().strength(-320))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide().radius(75));

    // Render connection edges (links)
    const linkGroup = container.append("g").attr("class", "links");

    // Curved edge lines to avoid intersecting labels
    const link = linkGroup
      .selectAll("path")
      .data(validLinks)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", "#4b5563")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.5)
      .attr("marker-end", (d) => {
        if (d.type === "works_on" || d.type === "building") return "url(#arrow-breeze)";
        if (d.type === "collaborates" || d.type === "loves") return "url(#arrow-sunset)";
        return "url(#arrow-dusk)";
      });

    // Render node groups
    const node = container.append("g")
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(
        drag<SVGGElement, Node>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      )
      .on("click", (event, d) => {
        onNodeClickRef.current(d);
      })
      .attr("tabIndex", 0)
      .attr("role", "button")
      .attr("aria-label", (d) => `${d.name || d.id} - ${d.type || 'node'}`)
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNodeClickRef.current(d);
        }
      });

    // Main neo-brutalist solid circle node
    node.append("circle")
      .attr("r", 15)
      .attr("fill", (d) => {
        if (d.type === "person" || d.type === "user") return "#fcd34d"; // Yellow
        if (d.type === "technology" || d.type === "project") return "#a78bfa"; // Purple
        return "#34d399"; // Green
      })
      .attr("stroke", "#000000")
      .attr("stroke-width", 2.5)
      .style("cursor", "pointer");

    // Clean text label below node
    node.append("text")
      .attr("dy", 32)
      .attr("text-anchor", "middle")
      .attr("fill", "#000000")
      .attr("font-family", "var(--font-sans)")
      .attr("font-size", "11.5px")
      .attr("font-weight", "900")
      .style("pointer-events", "none")
      .text(d => d.name);

    // Intersecting link mapping & position calculation
    simulation.on("tick", () => {
      // Keep nodes bounded inside container viewport margins to prevent off-screen scatter
      nodes.forEach((n) => {
        const margin = 48; // Buffer to prevent label and glow clipping
        n.x = Math.max(margin, Math.min(width - margin, n.x || 0));
        n.y = Math.max(margin, Math.min(height - margin, n.y || 0));
      });

      // Calculate arc curves for link elements
      link.attr("d", (d) => {
        const s = d.source as unknown as Node;
        const t = d.target as unknown as Node;
        const sx = s.x || 0;
        const sy = s.y || 0;
        const tx = t.x || 0;
        const ty = t.y || 0;
        const dx = tx - sx;
        const dy = ty - sy;
        const dr = Math.sqrt(dx * dx + dy * dy);
        // Returns slightly curved arc lines so labels don't collide
        return `M${sx},${sy}A${dr * 1.25},${dr * 1.25} 0 0,1 ${tx},${ty}`;
      });

      node.attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Drag handlers
    function dragstarted(event: D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <svg ref={svgRef} className="graph-container" style={{ width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute",
        bottom: "85px",
        right: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        zIndex: 20
      }}>
        {[
          { label: "➕", onClick: zoomIn, title: "Zoom In" },
          { label: "➖", onClick: zoomOut, title: "Zoom Out" },
          { label: "⟲", onClick: resetZoom, title: "Recenter" },
        ].map((btn, idx) => (
          <button
            key={idx}
            onClick={btn.onClick}
            title={btn.title}
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "6px",
              border: "2px solid #000000",
              background: "#ffffff",
              color: "#000000",
              fontWeight: "bold",
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "2px 2px 0px #000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.1s ease",
              outline: "none"
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translate(-1px, -1px)";
              e.currentTarget.style.boxShadow = "3px 3px 0px #000000";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translate(0, 0)";
              e.currentTarget.style.boxShadow = "2px 2px 0px #000000";
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
