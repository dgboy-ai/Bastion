"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface Node extends d3.SimulationNodeDatum {
  id: string;
  name: string;
  type: string;
  attributes: any;
}

interface Link extends d3.SimulationLinkDatum<Node> {
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
}

export default function KnowledgeGraph({ nodes, links, onNodeClick }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Clear previous drawing
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    // Create defs for filters and markers
    const defs = svg.append("defs");

    // Glowing filters for node types
    const createGlowFilter = (id: string, color: string) => {
      const filter = defs.append("filter")
        .attr("id", id)
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");
      filter.append("feGaussianBlur").attr("stdDeviation", "5").attr("result", "blur");
      filter.append("feMerge").selectAll("feMergeNode")
        .data(["blur", "SourceGraphic"])
        .enter().append("feMergeNode")
        .attr("in", d => d);
    };

    createGlowFilter("glow-sunset", "var(--accent-sunset)");
    createGlowFilter("glow-breeze", "var(--accent-breeze)");
    createGlowFilter("glow-dusk", "var(--accent-dusk)");

    // Arrow markers for relation paths
    const createMarker = (id: string, color: string) => {
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 26)
        .attr("refY", 0)
        .attr("markerWidth", 5)
        .attr("markerHeight", 5)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    };

    createMarker("arrow-sunset", "var(--accent-sunset)");
    createMarker("arrow-breeze", "var(--accent-breeze)");
    createMarker("arrow-dusk", "var(--accent-dusk)");

    // Draw background grid in SVG canvas
    const gridPattern = defs.append("pattern")
      .attr("id", "svg-grid")
      .attr("width", 50)
      .attr("height", 50)
      .attr("patternUnits", "userSpaceOnUse");

    gridPattern.append("circle")
      .attr("cx", 2)
      .attr("cy", 2)
      .attr("r", 1)
      .attr("fill", "rgba(255, 255, 255, 0.05)");

    svg.append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "url(#svg-grid)");

    // Group container for zoom and drag
    const container = svg.append("g");

    // Add zoom/pan controls
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });
    svg.call(zoom);

    // Increase simulation forces to push nodes apart and prevent overlapping text
    const simulation = d3.forceSimulation<Node>(nodes)
      .force("link", d3.forceLink<Node, Link>(links).id(d => d.id).distance(220))
      .force("charge", d3.forceManyBody().strength(-600))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(70));

    // Render relationship paths
    const linkGroup = container.append("g").attr("class", "links");
    
    // Draw links (active flow lines)
    const link = linkGroup
      .selectAll("path")
      .data(links)
      .enter()
      .append("path")
      .attr("class", "link-line")
      .attr("id", (d, i) => `linkpath-${i}`)
      .attr("stroke", (d) => {
        if (d.type === "works_on" || d.type === "building") return "var(--accent-breeze)";
        if (d.type === "collaborates" || d.type === "loves") return "var(--accent-sunset)";
        return "var(--accent-dusk)";
      })
      .attr("stroke-width", (d) => Math.max(2, d.confidence * 4))
      .attr("fill", "none")
      .attr("marker-end", (d) => {
        if (d.type === "works_on" || d.type === "building") return "url(#arrow-breeze)";
        if (d.type === "collaborates" || d.type === "loves") return "url(#arrow-sunset)";
        return "url(#arrow-dusk)";
      });

    // Render edge labels using svg textPaths aligned nicely along links
    const linkText = container.append("g")
      .selectAll("text")
      .data(links)
      .enter()
      .append("text")
      .attr("font-family", "var(--font-mono)")
      .attr("font-size", "10px")
      .attr("letter-spacing", "1px")
      .attr("dy", -6)
      .append("textPath")
      .attr("xlink:href", (d, i) => `#linkpath-${i}`)
      .style("text-anchor", "middle")
      .attr("startOffset", "50%")
      .attr("fill", "var(--mute)")
      .text(d => d.type.toUpperCase());

    // Render node groups
    const node = container.append("g")
      .selectAll(".node")
      .data(nodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(
        d3.drag<SVGGElement, Node>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended)
      )
      .on("click", (event, d) => {
        onNodeClick(d);
      });

    // Hover state halos / circles
    node.append("circle")
      .attr("r", 22)
      .attr("fill", "rgba(3, 4, 6, 0.95)")
      .attr("stroke", (d) => {
        if (d.type === "person" || d.type === "user") return "var(--accent-breeze)";
        if (d.type === "technology" || d.type === "project") return "var(--accent-sunset)";
        return "var(--accent-dusk)";
      })
      .attr("stroke-width", 2)
      .style("filter", (d) => {
        if (d.type === "person" || d.type === "user") return "url(#glow-breeze)";
        if (d.type === "technology" || d.type === "project") return "url(#glow-sunset)";
        return "url(#glow-dusk)";
      })
      .style("cursor", "pointer");

    // Inner core circle for depth
    node.append("circle")
      .attr("r", 9)
      .attr("fill", (d) => {
        if (d.type === "person" || d.type === "user") return "var(--accent-breeze)";
        if (d.type === "technology" || d.type === "project") return "var(--accent-sunset)";
        return "var(--accent-dusk)";
      })
      .style("opacity", 0.9)
      .style("pointer-events", "none");

    // Node label labels (under the node circle, clean)
    node.append("text")
      .attr("dy", 42)
      .attr("text-anchor", "middle")
      .attr("fill", "var(--ink)")
      .attr("font-family", "var(--font-display)")
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("letter-spacing", "0.5px")
      .style("text-shadow", "0 2px 6px rgba(0,0,0,0.9)")
      .text(d => d.name.toUpperCase());

    // Update positions on each tick
    simulation.on("tick", () => {
      link.attr("d", (d) => {
        const s = d.source as Node;
        const t = d.target as Node;
        return `M ${s.x || 0} ${s.y || 0} L ${t.x || 0} ${t.y || 0}`;
      });

      node.attr("transform", d => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Drag handlers
    function dragstarted(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, Node, Node>, d: Node) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links, onNodeClick]);

  return <svg ref={svgRef} className="graph-container" style={{ width: "100%", height: "100%" }} />;
}
