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
  useEffect(() => { onNodeClickRef.current = onNodeClick; });

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Clear previous drawing
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

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

    // Dynamic layout constraints
    const simulation = forceSimulation<Node>(nodes)
      .force("link", forceLink<Node, Link>(links).id(d => d.id).distance(240))
      .force("charge", forceManyBody().strength(-850))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collision", forceCollide().radius(85));

    // Render connection edges (links)
    const linkGroup = container.append("g").attr("class", "links");

    // Curved edge lines to avoid intersecting labels
    const link = linkGroup
      .selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (d.type === "works_on" || d.type === "building") return "rgba(0, 240, 255, 0.15)";
        if (d.type === "collaborates" || d.type === "loves") return "rgba(255, 115, 0, 0.15)";
        return "rgba(139, 92, 246, 0.15)";
      })
      .attr("stroke-width", 2)
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
      .attr("aria-label", (d) => `${d.label || d.id} - ${d.type || 'node'}`)
      .on("keydown", (event, d) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNodeClickRef.current(d);
        }
      });

    // Node glows (Outer bounds)
    node.append("circle")
      .attr("r", 42)
      .attr("fill", (d) => {
        if (d.type === "person" || d.type === "user") return "url(#radial-breeze)";
        if (d.type === "technology" || d.type === "project") return "url(#radial-sunset)";
        return "url(#radial-dusk)";
      })
      .attr("opacity", 0.4);

    // Distinct thin outer rim circle
    node.append("circle")
      .attr("r", 22)
      .attr("fill", "none")
      .attr("stroke", (d) => {
        if (d.type === "person" || d.type === "user") return "var(--accent-breeze)";
        if (d.type === "technology" || d.type === "project") return "var(--accent-sunset)";
        return "var(--accent-dusk)";
      })
      .attr("stroke-width", 1.25)
      .attr("opacity", 0.45);

    // Inner core circle for depth
    node.append("circle")
      .attr("r", 12)
      .attr("fill", (d) => {
        if (d.type === "person" || d.type === "user") return "rgba(0, 240, 255, 0.95)";
        if (d.type === "technology" || d.type === "project") return "rgba(255, 106, 0, 0.95)";
        return "rgba(139, 92, 246, 0.95)";
      })
      .attr("stroke", "#020305")
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    // Sleek display labels below nodes
    node.append("text")
      .attr("dy", 38)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--ink)")
      .attr("font-family", "var(--font-sans)")
      .attr("font-size", "12px")
      .attr("font-weight", "600")
      .attr("letter-spacing", "-0.2px")
      .style("pointer-events", "none")
      .style("text-shadow", "0 2px 4px rgba(0,0,0,0.8)")
      .text(d => d.name);

    // Intersecting link mapping & position calculation
    simulation.on("tick", () => {
      // Calculate arc curves for link elements
      link.attr("d", (d) => {
        const s = d.source as Node;
        const t = d.target as Node;
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

  return <svg ref={svgRef} className="graph-container" style={{ width: "100%", height: "100%" }} />;
}
