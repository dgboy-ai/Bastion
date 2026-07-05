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
  source: string;
  target: string;
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
          <div className="badge-mono" style={{ backgroundColor: "rgba(10,10,10,0.85)", borderColor: "var(--hairline)", display: "flex", flexDirection: "column", gap: "4px", padding: "10px" }}>
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

      {/* Side Details Drawer with Cryptographic Timeline */}
      <div className={`side-drawer ${selectedNode ? "open" : ""}`} style={{ overflowY: "auto" }}>
        <div className="drawer-header">
          <span className="badge-mono" style={{ color: "var(--accent-sunset)" }}>Entity Metadata</span>
          <button className="drawer-close" onClick={() => setSelectedNode(null)}>
            &times;
          </button>
        </div>

        {selectedNode && (
          <>
            <div style={{ borderBottom: "1px solid var(--hairline)", paddingBottom: "20px" }}>
              <div className="eyebrow">{selectedNode.type}</div>
              <div className="title-md" style={{ margin: 0, fontSize: "24px" }}>{selectedNode.name}</div>
            </div>

            {/* Properties Block */}
            <div className="attribute-list">
              <div className="attribute-row">
                <span className="attribute-key">UUID Reference</span>
                <span className="attribute-value" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                  {selectedNode.id}
                </span>
              </div>
              {Object.entries(selectedNode.attributes).map(([key, val]) => (
                <div className="attribute-row" key={key}>
                  <span className="attribute-key">{key}</span>
                  <span className="attribute-value">{JSON.stringify(val)}</span>
                </div>
              ))}
            </div>

            {/* Cryptographic Hash Chain Audit Trail */}
            <div style={{ marginTop: "20px" }}>
              <div className="eyebrow" style={{ color: "var(--accent-emerald)" }}>Memory Audit Trail</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginTop: "16px" }}>
                {entityMemories.length > 0 ? (
                  entityMemories.map((m, idx) => (
                    <div key={m.memoryId} className="alert-box info" style={{ padding: "16px", margin: 0 }}>
                      <div className="alert-header info" style={{ fontSize: "10.5px" }}>
                        <span>MEM-{entityMemories.length - idx}</span>
                        {new Date(m.createdAt).toLocaleDateString()}
                      </div>
                      <p style={{ fontSize: "12.5px", color: "var(--ink)", margin: "8px 0" }}>{m.content}</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px" }}>
                        <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
                          HASH: <span style={{ color: "var(--accent-emerald)" }}>{m.cryptographicHash.slice(0, 16)}...</span>
                        </span>
                        {m.previousHash && (
                          <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
                            PREV: {m.previousHash.slice(0, 16)}...
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "var(--mute)", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                    NO ASSOCIATED SOURCE MEMORY ENTRIES FOUND.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
