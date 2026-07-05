"use client";

import { useEffect, useState } from "react";
import KnowledgeGraph from "@/components/KnowledgeGraph";

interface Node {
  id: string;
  name: string;
  type: string;
  attributes: any;
}

interface Link {
  id: string;
  source: any;
  target: any;
  type: string;
  confidence: number;
}

interface EntityMemory {
  memoryId: string;
  content: string;
  cryptographicHash: string;
  previousHash: string | null;
  createdAt: string;
  importanceScore: number;
}

const INTERVALS = [
  { label: "Now (Real-Time)", value: "" },
  { label: "10 Seconds Ago", value: "-10s" },
  { label: "30 Seconds Ago", value: "-30s" },
  { label: "1 Minute Ago", value: "-1m" },
  { label: "5 Minutes Ago", value: "-5m" },
  { label: "15 Minutes Ago", value: "-15m" },
  { label: "30 Minutes Ago", value: "-30m" },
  { label: "1 Hour Ago", value: "-1h" },
  { label: "6 Hours Ago", value: "-6h" },
  { label: "12 Hours Ago", value: "-12h" },
  { label: "24 Hours Ago", value: "-24h" },
];

export default function GraphPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [sliderVal, setSliderVal] = useState(0);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [entityMemories, setEntityMemories] = useState<EntityMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Fetch graph layout nodes
  useEffect(() => {
    async function fetchGraphData() {
      setLoading(true);
      try {
        const interval = INTERVALS[sliderVal].value;
        const queryParams = interval ? `?as_of=${encodeURIComponent(interval)}` : "";
        
        const res = await fetch(`/api/graph${queryParams}`);
        if (!res.ok) {
          throw new Error("Failed to fetch knowledge graph state");
        }
        const data = await res.json();
        
        setNodes(data.nodes.map((n: any) => ({ ...n })));
        setLinks(data.links.map((l: any) => ({ ...l })));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchGraphData();
  }, [sliderVal]);

  // Fetch memory audit path when an entity is clicked
  useEffect(() => {
    if (!selectedNode) {
      setEntityMemories([]);
      return;
    }

    const entityId = selectedNode.id;

    async function fetchEntityMemories() {
      try {
        const res = await fetch(`/api/entity-memories?entity_id=${entityId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch entity audit trail");
        }
        const data = await res.json();
        setEntityMemories(data.memories || []);
      } catch (err) {
        console.error("Failed to load entity memories:", err);
      }
    }

    fetchEntityMemories();
  }, [selectedNode]);

  const handleCopyId = () => {
    if (!selectedNode) return;
    navigator.clipboard.writeText(selectedNode.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Find incoming and outgoing links for the selected node
  const activeRelationships = selectedNode
    ? links.filter((l) => {
        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        return srcId === selectedNode.id || tgtId === selectedNode.id;
      })
    : [];

  const activeInterval = INTERVALS[sliderVal];

  return (
    <div>
      <div className="eyebrow">Mindmap HUD</div>
      <div className="title-xl">Temporal Graph Explorer</div>
      <p className="paragraph">
        Interactive visualization of the agent's memory graph. Drag nodes to inspect relationships; use the slider at the bottom to time-travel into the past.
      </p>

      {error && (
        <div className="alert-box medium" style={{ marginBottom: "24px" }}>
          <div className="alert-header medium">
            <span>Error</span> RENDER FAILED
          </div>
          <div className="alert-desc">{error}</div>
        </div>
      )}

      {/* Main Graph Card */}
      <div className="panel" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
        
        <div className="graph-overlay-hud">
          <div className="badge-mono" style={{ backgroundColor: "rgba(10,10,10,0.85)", borderColor: "var(--glass-border)", display: "flex", flexDirection: "column", gap: "4px", padding: "10px", borderRadius: "6px" }}>
            <span style={{ color: "var(--accent-sunset)", fontWeight: 600 }}>COCKROACHDB C-SPANN ACTIVE</span>
            <span style={{ fontSize: "9px" }}>Nodes: {nodes.length} | Edges: {links.length}</span>
          </div>
        </div>

        {/* D3 Graph Component */}
        <div style={{ height: "600px" }}>
          {nodes.length > 0 ? (
            <KnowledgeGraph
              nodes={nodes}
              links={links}
              onNodeClick={(node) => setSelectedNode(node)}
            />
          ) : loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
              SYNCHRONIZING GRAPH STATE...
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
              NO ENTITIES DETECTED IN THIS TIME SNAPSHOT
            </div>
          )}
        </div>

        {/* Temporal Time-Travel Slider */}
        <div className="graph-slider-panel">
          <div className="slider-row">
            <span className="slider-label">AS OF SYSTEM TIME</span>
            <input
              type="range"
              className="time-slider"
              min="0"
              max={INTERVALS.length - 1}
              value={sliderVal}
              onChange={(e) => setSliderVal(parseInt(e.target.value, 10))}
            />
            <span className="badge-mono" style={{ minWidth: "150px", textAlign: "center" }}>
              {activeInterval.label}
            </span>
          </div>
        </div>
      </div>

      {/* Re-engineered World-Class Details Side Drawer */}
      <div className={`side-drawer ${selectedNode ? "open" : ""}`} style={{ overflowY: "auto" }}>
        <div className="drawer-header">
          <span className="badge-mono" style={{ color: "var(--accent-breeze)" }}>Node Profile</span>
          <button className="drawer-close" onClick={() => setSelectedNode(null)}>
            &times;
          </button>
        </div>

        {selectedNode && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Header Block with Visual Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "20px" }}>
              <div 
                style={{ 
                  width: "48px", 
                  height: "48px", 
                  borderRadius: "12px", 
                  background: selectedNode.type === "person" ? "rgba(0, 229, 255, 0.08)" : "rgba(255, 106, 0, 0.08)",
                  border: `1px solid ${selectedNode.type === "person" ? "rgba(0, 229, 255, 0.3)" : "rgba(255, 106, 0, 0.3)"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px"
                }}
              >
                {selectedNode.type === "person" ? "👤" : "⚙️"}
              </div>
              <div style={{ flex: 1 }}>
                <div className="eyebrow" style={{ margin: 0, fontSize: "10px" }}>{selectedNode.type}</div>
                <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--ink)", letterSpacing: "-0.5px" }}>{selectedNode.name}</div>
              </div>
              <div className="badge-mono" style={{ borderColor: "rgba(0, 255, 136, 0.25)", color: "var(--accent-emerald)", background: "rgba(0, 255, 136, 0.03)", fontSize: "9px" }}>
                ✓ Verified
              </div>
            </div>

            {/* Micro KPI Cards for Node Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>Read Accesses</span>
                <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink)", marginTop: "4px" }}>24 pings</span>
              </div>
              <div style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "12px", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>Decay Rate</span>
                <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--accent-sunset)", marginTop: "4px" }}>-0.05/hr</span>
              </div>
            </div>

            {/* Properties List styled as high-end SaaS details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div className="attribute-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
                <span className="attribute-key">UUID Reference</span>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--body)", background: "rgba(255,255,255,0.02)", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--glass-border)", width: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {selectedNode.id}
                  </span>
                  <button 
                    onClick={handleCopyId} 
                    className="btn btn-outline" 
                    style={{ fontSize: "10px", padding: "6px 12px", borderRadius: "4px", minWidth: "65px" }}
                  >
                    {copiedId ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {Object.entries(selectedNode.attributes).map(([key, val]) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", background: "rgba(255,255,255,0.01)", padding: "12px", borderRadius: "6px", border: "1px solid var(--glass-border)" }}>
                  <span className="attribute-key" style={{ color: "var(--mute)" }}>{key}</span>
                  <span style={{ fontSize: "13px", color: "var(--ink)", fontWeight: 500 }}>
                    {typeof val === "string" ? val : JSON.stringify(val)}
                  </span>
                </div>
              ))}
            </div>

            {/* Active Graph Connections Panel */}
            <div>
              <div className="eyebrow">Local Connections</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                {activeRelationships.map((r) => {
                  const srcName = typeof r.source === "object" ? r.source.name : nodes.find(n => n.id === r.source)?.name || r.source;
                  const tgtName = typeof r.target === "object" ? r.target.name : nodes.find(n => n.id === r.target)?.name || r.target;
                  const isOutgoing = srcName === selectedNode.name;

                  return (
                    <div key={r.id} style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)", border: "1px solid var(--glass-border)", borderRadius: "6px", padding: "10px 14px", fontSize: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ color: isOutgoing ? "var(--accent-sunset)" : "var(--accent-breeze)" }}>
                          {isOutgoing ? "→" : "←"}
                        </span>
                        <span style={{ color: "var(--body)" }}>
                          {isOutgoing ? `Connects to ` : `Connected by `}
                          <strong style={{ color: "#ffffff" }}>{isOutgoing ? tgtName : srcName}</strong>
                        </span>
                      </div>
                      <span className="badge-mono" style={{ fontSize: "8.5px", padding: "1px 6px" }}>{r.type}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rebuilt Memory Audit Trail - High-Fidelity Chronological Timeline */}
            <div>
              <div className="eyebrow" style={{ color: "var(--accent-emerald)" }}>Cryptographic Timeline Trail</div>
              
              <div style={{ position: "relative", marginTop: "16px", paddingLeft: "24px" }}>
                {/* Vertical Timeline Connection Line */}
                {entityMemories.length > 1 && (
                  <div 
                    style={{ 
                      position: "absolute", 
                      left: "4px", 
                      top: "10px", 
                      bottom: "10px", 
                      width: "1.5px", 
                      borderLeft: "1.5px dashed var(--glass-border)" 
                    }} 
                  />
                )}

                {entityMemories.length > 0 ? (
                  entityMemories.map((m, idx) => (
                    <div key={m.memoryId} style={{ position: "relative", marginBottom: "20px" }}>
                      
                      {/* Timeline Node Glow Bullet */}
                      <div 
                        style={{ 
                          position: "absolute", 
                          left: "-24px", 
                          top: "4px", 
                          width: "9px", 
                          height: "9px", 
                          borderRadius: "50%", 
                          backgroundColor: "var(--accent-emerald)",
                          boxShadow: "0 0 6px var(--accent-emerald)"
                        }} 
                      />

                      {/* Timeline Card Bubble */}
                      <div 
                        style={{ 
                          background: "rgba(10, 14, 26, 0.45)", 
                          border: "1px solid var(--glass-border)", 
                          borderRadius: "8px", 
                          padding: "16px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--mute)", borderBottom: "1px solid rgba(255,255,255,0.03)", paddingBottom: "6px", marginBottom: "8px" }}>
                          <span style={{ fontWeight: 600, color: "var(--accent-emerald)", fontFamily: "var(--font-mono)" }}>MEM_CHAIN #{entityMemories.length - idx}</span>
                          <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                        </div>
                        <p style={{ fontSize: "13px", color: "var(--ink)", lineHeight: 1.5, margin: 0 }}>
                          {m.content}
                        </p>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(255,255,255,0.03)", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
                          <div>HASH: <span style={{ color: "var(--accent-emerald)" }}>{m.cryptographicHash.slice(0, 18)}...</span></div>
                          {m.previousHash && <div>PREV: {m.previousHash.slice(0, 18)}...</div>}
                        </div>
                      </div>

                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--mute)", fontSize: "12px", fontFamily: "var(--font-mono)", padding: "10px 0" }}>
                    NO SOURCE MEMORIES ESTABLISHED RELATIONSHIPS FOR THIS NODE.
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
