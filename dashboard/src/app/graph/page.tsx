"use client";

import { useEffect, useState } from "react";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import ErrorBoundary from "@/components/ErrorBoundary";

interface Node {
  id: string;
  name: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface Link {
  id: string;
  source: string | Node;
  target: string | Node;
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
        
        setNodes(data.nodes as Node[]);
        setLinks(data.links as Link[]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }

    fetchGraphData();
  }, [sliderVal]);

  // Fetch memory audit path when an entity is clicked
  useEffect(() => {
    let cancelled = false;

    async function fetchEntityMemories() {
      if (!selectedNode) {
        if (!cancelled) setEntityMemories([]);
        return;
      }

      const entityId = selectedNode.id;

      try {
        const res = await fetch(`/api/entity-memories?entity_id=${entityId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch entity audit trail");
        }
        const data = await res.json();
        if (!cancelled) {
          setEntityMemories(data.memories || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load entity memories:", err);
        }
      }
    }

    fetchEntityMemories();
    return () => { cancelled = true; };
  }, [selectedNode]);

  const handleCopyId = () => {
    if (!selectedNode) return;
    navigator.clipboard.writeText(selectedNode.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const activeRelationships = selectedNode
    ? links.filter((l) => {
        const srcId = typeof l.source === "object" ? l.source.id : l.source;
        const tgtId = typeof l.target === "object" ? l.target.id : l.target;
        return srcId === selectedNode.id || tgtId === selectedNode.id;
      })
    : [];

  const activeInterval = INTERVALS[sliderVal];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <div className="welcome-title">Temporal Graph Explorer</div>
        <div className="welcome-subtitle">Interactive visualization of the agent&apos;s memory graph. Click nodes to inspect local connections and blockchain cryptographic history.</div>
      </div>

      {error && (
        <div className="alert-box medium" style={{ marginBottom: "12px" }}>
          <div className="alert-header medium">
            <span>Error</span> RENDER FAILED
          </div>
          <div className="alert-desc">{error}</div>
        </div>
      )}

      {/* Side-by-Side HUD Layout Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: "24px", alignItems: "stretch" }}>
        
        {/* Left Column: Interactive Map Panel */}
        <div className="panel" style={{ padding: 0, overflow: "hidden", position: "relative", height: "640px" }}>
          <div className="graph-overlay-hud">
            <div className="badge-mono" style={{ backgroundColor: "rgba(10,10,10,0.85)", borderColor: "var(--glass-border)", display: "flex", flexDirection: "column", gap: "4px", padding: "10px", borderRadius: "6px" }}>
              <span style={{ color: "var(--accent-sunset)", fontWeight: 600 }}>COCKROACHDB C-SPANN ACTIVE</span>
              <span style={{ fontSize: "9px" }}>Nodes: {nodes.length} | Edges: {links.length}</span>
            </div>
          </div>

          <div style={{ height: "100%" }}>
            {nodes.length > 0 ? (
              <ErrorBoundary
                fallback={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--accent-sunset)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    GRAPH RENDER FAILED — {selectedNode ? "SELECTED NODE" : "CHECK DATA SOURCE"}
                  </div>
                }
              >
                <KnowledgeGraph
                  nodes={nodes}
                  links={links}
                  onNodeClick={(node) => setSelectedNode(node)}
                />
              </ErrorBoundary>
            ) : loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                SYNCHRONIZING GRAPH SNAPSHOT...
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
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
              <span className="badge-mono" style={{ minWidth: "140px", textAlign: "center", fontSize: "10px" }}>
                {activeInterval.label}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Embedded Metadata Inspector Panel */}
        <div className="panel" style={{ height: "640px", display: "flex", flexDirection: "column", overflowY: "auto", padding: "24px" }}>
          {selectedNode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Header profile details */}
              <div style={{ display: "flex", alignItems: "center", gap: "14px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "16px" }}>
                <div 
                  style={{ 
                    width: "44px", 
                    height: "44px", 
                    borderRadius: "10px", 
                    background: selectedNode.type === "person" ? "rgba(0, 229, 255, 0.08)" : "rgba(255, 106, 0, 0.08)",
                    border: `1px solid ${selectedNode.type === "person" ? "rgba(0, 229, 255, 0.25)" : "rgba(255, 106, 0, 0.25)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px"
                  }}
                >
                  {selectedNode.type === "person" ? "👤" : "⚙️"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="kpi-label" style={{ fontSize: "8.5px", margin: 0 }}>{selectedNode.type}</div>
                  <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedNode.name}</div>
                </div>
                <button 
                  className="btn btn-outline" 
                  style={{ fontSize: "10px", padding: "4px 8px" }}
                  onClick={() => setSelectedNode(null)}
                >
                  Deselect
                </button>
              </div>

              {/* Node statistics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--glass-border)", borderRadius: "6px", padding: "10px", display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>Read Accesses</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--ink)", marginTop: "2px" }}>24 pings</span>
                </div>
                <div style={{ background: "rgba(255,255,255,0.01)", border: "1px solid var(--glass-border)", borderRadius: "6px", padding: "10px", display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "8px", color: "var(--mute)", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>Decay Rate</span>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent-sunset)", marginTop: "2px" }}>-0.05/hr</span>
                </div>
              </div>

              {/* Attributes and metadata details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>UUID Reference</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--body)", background: "rgba(255,255,255,0.02)", padding: "4px 8px", borderRadius: "4px", border: "1px solid var(--glass-border)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedNode.id}
                    </span>
                    <button 
                      onClick={handleCopyId} 
                      className="btn btn-outline" 
                      style={{ fontSize: "9px", padding: "4px 8px", minWidth: "50px" }}
                    >
                      {copiedId ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {Object.entries(selectedNode.attributes).map(([key, val]) => (
                  <div key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", background: "rgba(255,255,255,0.01)", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--glass-border)" }}>
                    <span style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>{key}</span>
                    <span style={{ fontSize: "12px", color: "var(--ink)", fontWeight: 500 }}>
                      {typeof val === "string" ? val : JSON.stringify(val)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Connections list */}
              <div>
                <span className="kpi-label" style={{ fontSize: "9px" }}>Local Relationships</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {activeRelationships.length > 0 ? (
                    activeRelationships.map((r) => {
                      const srcName = typeof r.source === "object" ? r.source.name : nodes.find(n => n.id === r.source)?.name || r.source;
                      const tgtName = typeof r.target === "object" ? r.target.name : nodes.find(n => n.id === r.target)?.name || r.target;
                      const isOutgoing = srcName === selectedNode.name;

                      return (
                        <div key={r.id} style={{ display: "flex", justifyItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)", border: "1px solid var(--glass-border)", borderRadius: "6px", padding: "8px 12px", fontSize: "11.5px" }}>
                          <span style={{ color: "var(--body)" }}>
                            {isOutgoing ? `Connects to ` : `Connected by `}
                            <strong style={{ color: "#ffffff" }}>{isOutgoing ? tgtName : srcName}</strong>
                          </span>
                          <span className="badge-mono" style={{ fontSize: "8px", padding: "1px 4px" }}>{r.type}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: "var(--mute)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>No local relationships detected.</div>
                  )}
                </div>
              </div>

              {/* Cryptographic Timeline */}
              <div>
                <span className="kpi-label" style={{ fontSize: "9px", color: "var(--accent-emerald)" }}>Cryptographic Timeline Chain</span>
                <div style={{ position: "relative", marginTop: "12px", paddingLeft: "16px" }}>
                  {entityMemories.length > 1 && (
                    <div style={{ position: "absolute", left: "4px", top: "8px", bottom: "8px", width: "1px", borderLeft: "1px dashed var(--glass-border)" }} />
                  )}

                  {entityMemories.length > 0 ? (
                    entityMemories.map((m, idx) => (
                      <div key={m.memoryId} style={{ position: "relative", marginBottom: "14px" }}>
                        <div style={{ position: "absolute", left: "-16px", top: "5px", width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "var(--accent-emerald)", boxShadow: "0 0 4px var(--accent-emerald)" }} />
                        <div style={{ background: "rgba(10, 14, 26, 0.45)", border: "1px solid var(--glass-border)", borderRadius: "6px", padding: "10px 12px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9.5px", color: "var(--mute)", paddingBottom: "4px", marginBottom: "6px", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                            <span style={{ color: "var(--accent-emerald)", fontFamily: "var(--font-mono)" }}>BLOCK #{entityMemories.length - idx}</span>
                            <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p style={{ fontSize: "11.5px", color: "var(--ink)", lineHeight: 1.4, margin: 0 }}>
                            {m.content}
                          </p>
                          <div style={{ marginTop: "6px", fontSize: "8.5px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
                            HASH: <span style={{ color: "var(--accent-emerald)" }}>{m.cryptographicHash.slice(0, 12)}...</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "var(--mute)", fontSize: "11px", fontFamily: "var(--font-mono)", padding: "4px 0" }}>
                      No cryptographic ledger blocks.
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--mute)", textAlign: "center", gap: "8px" }}>
              <div style={{ fontSize: "24px" }}>🕸️</div>
              <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>Select a node in the graph map to inspect properties &amp; cryptographic transaction logs.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
