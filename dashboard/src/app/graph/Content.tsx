"use client";

import { useEffect, useRef, useState } from "react";
import KnowledgeGraph from "@/components/KnowledgeGraph";
import ErrorBoundary from "@/components/ErrorBoundary";
import { fetchWithTimeout } from "@/lib/fetch";
import TrustRing from "@/components/TrustRing";
import PoisoningAlerts from "@/components/PoisoningAlerts";
import DriftChart from "@/components/DriftChart";

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
  const [trustSummary, setTrustSummary] = useState<{
    totalMemories: number;
    avgTrustScore: number;
    trustLevelDistribution: Record<number, number>;
    poisoningDistribution: Record<string, number>;
    dangerousMemories: number;
  } | null>(null);
  const [trustAlerts, setTrustAlerts] = useState<{ severity: string; risk: string; count: number }[]>([]);
  const [trustLoading, setTrustLoading] = useState(false);
  const [driftData, setDriftData] = useState<{
    latest: { overall_drift_score: number; status: string; top_drift_signals: string[]; recommendation: string } | null;
    timeSeries: { score: number; timestamp: string; status: string }[];
  } | null>(null);
  const [driftLoading, setDriftLoading] = useState(false);

  // Write state
  const [showCreateEntity, setShowCreateEntity] = useState(false);
  const [newEntityName, setNewEntityName] = useState("");
  const [newEntityType, setNewEntityType] = useState("concept");
  const [newEntityAttrs, setNewEntityAttrs] = useState("");
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeMsg, setWriteMsg] = useState<string | null>(null);
  const [addRelationMode, setAddRelationMode] = useState(false);
  const [relationSource, setRelationSource] = useState<string | null>(null);
  const [relationType, setRelationType] = useState("related_to");
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("");
  const [editAttrs, setEditAttrs] = useState("");

  // Fetch graph layout nodes
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function fetchGraphData() {
      setLoading(true);
      setError(null);
      try {
        const interval = INTERVALS[sliderVal].value;
        const queryParams = interval ? `?as_of=${encodeURIComponent(interval)}` : "";
        
        const res = await fetchWithTimeout(`/api/graph${queryParams}`, { signal: ac.signal });
        if (cancelled) return;
        if (!res.ok) {
          throw new Error("Failed to fetch knowledge graph state");
        }
        const json = await res.json();
        if (cancelled) return;
        const data = json.data || json;
        
        const fetchedNodes = (data.nodes || []) as Node[];
        setNodes(fetchedNodes);
        setLinks((data.links || []) as Link[]);
        setError(null);
        setSelectedNode(prev => {
          if (prev && !fetchedNodes.some(n => n.id === prev.id)) {
            return null;
          }
          return prev;
        });
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGraphData();

    return () => { cancelled = true; ac.abort(); };
  }, [sliderVal]);

  // Fetch memory audit path + trust data when an entity is clicked
  useEffect(() => {
    let cancelled = false;

    async function fetchEntityMemories() {
      if (!selectedNode) {
        if (!cancelled) {
          setEntityMemories([]);
          setTrustSummary(null);
          setTrustAlerts([]);
          setDriftData(null);
        }
        return;
      }

      const entityId = selectedNode.id;

      setTrustLoading(true);
      setDriftLoading(true);
      try {
        const [memRes, trustRes, driftRes] = await Promise.all([
          fetchWithTimeout(`/api/entity-memories?entity_id=${entityId}`),
          fetchWithTimeout(`/api/trust?entity_id=${encodeURIComponent(entityId)}&limit=50`),
          fetchWithTimeout("/api/drift?limit=50"),
        ]);

        if (!memRes.ok) throw new Error("Failed to fetch entity audit trail");

        const memData = await memRes.json();
        const trustData = trustRes.ok ? await trustRes.json() : null;
        const driftRaw = driftRes.ok ? await driftRes.json() : null;

        if (!cancelled) {
          // Unwrap apiSuccess envelopes
          const memDataUnwrapped = memData?.data || memData;
          const trustDataUnwrapped = trustData?.data || trustData;
          const driftDataUnwrapped = driftRaw?.data || driftRaw;

          setEntityMemories(memDataUnwrapped?.memories || []);
          setTrustSummary(trustDataUnwrapped?.summary ?? null);
          setTrustAlerts(trustDataUnwrapped?.alerts ?? []);
          if (driftDataUnwrapped) {
            setDriftData({ latest: driftDataUnwrapped.latest, timeSeries: driftDataUnwrapped.timeSeries });
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load entity data:", err);
          setError(err instanceof Error ? err.message : "Failed to load entity data");
        }
      } finally {
        if (!cancelled) {
          setTrustLoading(false);
          setDriftLoading(false);
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

  // Write operations
  const refreshGraph = async () => {
    const res = await fetchWithTimeout("/api/graph");
    if (res.ok) {
      const json = await res.json();
      const data = json.data || json;
      setNodes((data.nodes || []) as Node[]);
      setLinks((data.links || []) as Link[]);
    }
  };

  const createEntity = async () => {
    if (!newEntityName.trim()) return;
    setWriteLoading(true);
    setWriteMsg(null);
    try {
      let attrs = {};
      if (newEntityAttrs.trim()) {
        try { attrs = JSON.parse(newEntityAttrs); } catch { setWriteMsg("Invalid JSON in attributes"); setWriteLoading(false); return; }
      }
      const res = await fetchWithTimeout("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_entity", name: newEntityName, entityType: newEntityType, attributes: attrs }),
      });
      const json = await res.json();
      if (json.success) {
        setWriteMsg(`Created entity: ${json.data.name}`);
        setShowCreateEntity(false);
        setNewEntityName("");
        setNewEntityAttrs("");
        await refreshGraph();
      } else {
        setWriteMsg(json.error || "Failed");
      }
    } catch { setWriteMsg("Failed to create entity"); }
    setWriteLoading(false);
  };

  const deleteEntity = async (entityId: string) => {
    if (!confirm("Delete this entity and all its relations?")) return;
    setWriteLoading(true);
    try {
      await fetchWithTimeout("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_entity", entityId }),
      });
      setSelectedNode(null);
      setEditingNode(null);
      await refreshGraph();
    } catch { setWriteMsg("Failed to delete entity"); }
    setWriteLoading(false);
  };

  const updateEntity = async () => {
    if (!editingNode) return;
    setWriteLoading(true);
    setWriteMsg(null);
    try {
      let attrs = undefined;
      if (editAttrs.trim()) {
        try { attrs = JSON.parse(editAttrs); } catch { setWriteMsg("Invalid JSON in attributes"); setWriteLoading(false); return; }
      }
      const res = await fetchWithTimeout("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_entity", entityId: editingNode.id, name: editName, entityType: editType, attributes: attrs }),
      });
      const json = await res.json();
      if (json.success) {
        setWriteMsg(`Updated: ${json.data.name}`);
        setEditingNode(null);
        await refreshGraph();
      } else {
        setWriteMsg(json.error || "Failed");
      }
    } catch { setWriteMsg("Failed to update entity"); }
    setWriteLoading(false);
  };

  const createRelation = async (targetId: string) => {
    if (!relationSource || !targetId) return;
    setWriteLoading(true);
    setWriteMsg(null);
    try {
      const res = await fetchWithTimeout("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_relation", sourceEntityId: relationSource, targetEntityId: targetId, relationType, confidence: 0.8 }),
      });
      const json = await res.json();
      if (json.success) {
        setWriteMsg(`Created relation: ${relationType}`);
        setAddRelationMode(false);
        setRelationSource(null);
        await refreshGraph();
      } else {
        setWriteMsg(json.error || "Failed");
      }
    } catch { setWriteMsg("Failed to create relation"); }
    setWriteLoading(false);
  };

  const deleteRelation = async (relationId: string) => {
    setWriteLoading(true);
    try {
      await fetchWithTimeout("/api/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_relation", relationId }),
      });
      await refreshGraph();
    } catch { setWriteMsg("Failed to delete relation"); }
    setWriteLoading(false);
  };

  const handleNodeClick = (node: Node) => {
    if (addRelationMode) {
      if (!relationSource) {
        setRelationSource(node.id);
        setWriteMsg(`Source: ${node.name} — now click target`);
      } else {
        createRelation(node.id);
      }
      return;
    }
    setSelectedNode(node);
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
    <div style={{ background: "#f8f9fa", minHeight: "100vh", padding: "32px 40px" }}>
      <div>
        <div style={{ fontSize: "28px", fontWeight: 900, color: "#000", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>Temporal Graph Explorer</div>
        <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px", fontWeight: 600 }}>Interactive visualization of the agent&apos;s memory graph. Click nodes to inspect local connections and blockchain cryptographic history.</div>
      </div>

      {/* Context Section — explains what this page is */}
      <div style={{
        padding: "18px 24px", borderRadius: "12px",
        background: "#ffffff", border: "3px solid #000000",
        boxShadow: "3px 3px 0px #000000"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "16px" }}>🕸️</span>
          <span style={{ fontSize: "15px", fontWeight: 900, color: "#000000", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "'Space Grotesk', sans-serif" }}>What is this?</span>
        </div>
        <div style={{ fontSize: "14px", color: "#374151", fontWeight: 600, lineHeight: "1.6" }}>
          This interface visualizes the semantic entity-relationship graph constructed dynamically from the agent&apos;s long-term memory in CockroachDB. You can slide the time travel controller to query the database <strong>AS OF SYSTEM TIME</strong> and inspect past graph configurations. Click any node to audit its cryptographic ledger blocks, real-time trust index, and vector drift.
        </div>
      </div>

      {selectedNode && <PoisoningAlerts alerts={trustAlerts} />}

      {/* Write Toolbar */}
      <div style={{
        display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap",
        background: "#fff", border: "3px solid #000", borderRadius: "12px",
        boxShadow: "3px 3px 0px #000", padding: "14px 20px", marginBottom: "16px",
      }}>
        <button
          onClick={() => { setShowCreateEntity(!showCreateEntity); setWriteMsg(null); }}
          style={{
            padding: "8px 16px", borderRadius: "6px", border: "2.5px solid #000",
            background: showCreateEntity ? "#000" : "#fff", color: showCreateEntity ? "#fff" : "#000",
            fontWeight: 900, fontSize: "12px", fontFamily: "'Space Grotesk'", cursor: "pointer",
            boxShadow: "2px 2px 0px #000",
          }}
        >
          + Create Entity
        </button>
        <button
          onClick={() => {
            setAddRelationMode(!addRelationMode);
            setRelationSource(null);
            setWriteMsg(addRelationMode ? null : "Click source node, then target node");
          }}
          style={{
            padding: "8px 16px", borderRadius: "6px", border: "2.5px solid #000",
            background: addRelationMode ? "#047857" : "#fff", color: addRelationMode ? "#fff" : "#000",
            fontWeight: 900, fontSize: "12px", fontFamily: "'Space Grotesk'", cursor: "pointer",
            boxShadow: "2px 2px 0px #000",
          }}
        >
          {addRelationMode ? "Cancel Relation" : "+ Add Relation"}
        </button>
        <button
          onClick={refreshGraph}
          style={{
            padding: "8px 16px", borderRadius: "6px", border: "2.5px solid #000",
            background: "#fff", color: "#000", fontWeight: 900, fontSize: "12px",
            fontFamily: "'Space Grotesk'", cursor: "pointer", boxShadow: "2px 2px 0px #000",
          }}
        >
          ↻ Refresh
        </button>
        {writeMsg && (
          <span style={{ fontSize: "11px", fontWeight: 800, color: writeMsg.includes("Failed") || writeMsg.includes("Invalid") ? "#b91c1c" : "#047857", fontFamily: "'JetBrains Mono'" }}>
            {writeMsg}
          </span>
        )}
        {writeLoading && <span style={{ fontSize: "11px", color: "#6b7280" }}>Saving…</span>}
      </div>

      {/* Create Entity Form */}
      {showCreateEntity && (
        <div style={{
          background: "#fff", border: "3px solid #000", borderRadius: "12px",
          boxShadow: "4px 4px 0px #000", padding: "20px 24px", marginBottom: "16px",
        }}>
          <div style={{ fontSize: "14px", fontWeight: 900, fontFamily: "'Space Grotesk'", marginBottom: "14px" }}>Create New Entity</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "end" }}>
            <div>
              <label style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Name</label>
              <input value={newEntityName} onChange={e => setNewEntityName(e.target.value)} placeholder="e.g. CockroachDB"
                style={{ width: "100%", padding: "8px 12px", border: "2px solid #000", borderRadius: "6px", fontSize: "13px", fontWeight: 700, marginTop: "4px", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Type</label>
              <select value={newEntityType} onChange={e => setNewEntityType(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", border: "2px solid #000", borderRadius: "6px", fontSize: "13px", fontWeight: 700, marginTop: "4px", boxSizing: "border-box", background: "#fff" }}>
                {["concept", "person", "database", "feature", "component", "tool", "agent", "system", "security", "deployment"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Attributes (JSON)</label>
              <input value={newEntityAttrs} onChange={e => setNewEntityAttrs(e.target.value)} placeholder='{"role": "primary"}'
                style={{ width: "100%", padding: "8px 12px", border: "2px solid #000", borderRadius: "6px", fontSize: "12px", fontFamily: "'JetBrains Mono'", marginTop: "4px", boxSizing: "border-box" }} />
            </div>
            <button onClick={createEntity} disabled={writeLoading || !newEntityName.trim()}
              style={{
                padding: "8px 16px", borderRadius: "6px", border: "2.5px solid #000",
                background: "#047857", color: "#fff", fontWeight: 900, fontSize: "12px",
                fontFamily: "'Space Grotesk'", cursor: "pointer", boxShadow: "2px 2px 0px #000",
                opacity: writeLoading || !newEntityName.trim() ? 0.5 : 1,
              }}>
              Create
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: "14px 18px", borderRadius: "8px", background: "#fef2f2",
          border: "2.5px solid #b91c1c", boxShadow: "3px 3px 0px #b91c1c",
          marginBottom: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "13px", fontWeight: 900, color: "#b91c1c", fontFamily: "'Space Grotesk'" }}>
              <span>Error</span> RENDER FAILED
            </div>
            <button
              style={{
                marginTop: "8px", fontSize: "11px", padding: "5px 14px", fontWeight: 900, fontFamily: "'Space Grotesk'",
                border: "2px solid #b91c1c", borderRadius: "4px", background: "#fff", color: "#b91c1c",
                cursor: "pointer", boxShadow: "1px 1px 0px #b91c1c",
              }}
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
          <div style={{ fontSize: "12px", color: "#374151", marginTop: "4px" }}>{error}</div>
        </div>
      )}

      {/* Side-by-Side HUD Layout Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: "24px", alignItems: "stretch" }}>
        
        {/* Left Column: Interactive Map Panel */}
        <div style={{
          padding: 0, overflow: "hidden", position: "relative", height: "640px",
          background: "#ffffff", border: "3px solid #000000", borderRadius: "12px",
          boxShadow: "4px 4px 0px #000000",
        }}>
          <div className="graph-overlay-hud" style={{ position: "absolute", top: "16px", left: "16px", zIndex: 10 }}>
            <div style={{ background: "#000", display: "flex", flexDirection: "column", gap: "4px", padding: "10px 14px", borderRadius: "6px", border: "2px solid #000", boxShadow: "2px 2px 0px #000" }}>
              <span style={{ color: "#34d399", fontWeight: 900, fontSize: "10px", fontFamily: "'Space Grotesk'" }}>COCKROACHDB C-SPANN ACTIVE</span>
              <span style={{ fontSize: "9px", color: "#9ca3af", fontFamily: "'JetBrains Mono'" }}>Nodes: {nodes.length} | Edges: {links.length}</span>
            </div>
          </div>

          <div style={{ height: "100%" }}>
            {nodes.length > 0 ? (
              <ErrorBoundary
                fallback={
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#b91c1c", fontFamily: "'JetBrains Mono'", fontSize: "11px", fontWeight: 800 }}>
                    GRAPH RENDER FAILED — {selectedNode ? "SELECTED NODE" : "CHECK DATA SOURCE"}
                  </div>
                }
              >
                <KnowledgeGraph
                  nodes={nodes}
                  links={links}
                  onNodeClick={handleNodeClick}
                />
              </ErrorBoundary>
            ) : loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af", fontFamily: "'JetBrains Mono'", fontSize: "11px", fontWeight: 800 }}>
                SYNCHRONIZING GRAPH SNAPSHOT...
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af", fontFamily: "'JetBrains Mono'", fontSize: "11px", fontWeight: 800 }}>
                NO ENTITIES DETECTED IN THIS TIME SNAPSHOT
              </div>
            )}
          </div>

          {/* Temporal Time-Travel Slider */}
          <div className="graph-slider-panel" style={{
            position: "absolute", bottom: "16px", left: "16px", right: "16px", zIndex: 10,
            background: "#ffffff", padding: "12px 20px", borderRadius: "8px",
            border: "3px solid #000000", boxShadow: "3px 3px 0px #000000"
          }}>
            <div className="slider-row" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <span className="slider-label" style={{
                fontFamily: "'JetBrains Mono'", fontSize: "10px", fontWeight: 900, color: "#000000", letterSpacing: "0.5px"
              }}>AS OF SYSTEM TIME</span>
              <input
                type="range"
                className="time-slider"
                min="0"
                max={INTERVALS.length - 1}
                value={sliderVal}
                onChange={(e) => setSliderVal(parseInt(e.target.value, 10))}
                style={{ flex: 1, accentColor: "#000000" }}
              />
              <span style={{
                minWidth: "140px", textAlign: "center", fontSize: "11px", fontWeight: 900,
                fontFamily: "'JetBrains Mono'", color: "#000000", background: "#f3f4f6",
                border: "2px solid #000000", padding: "5px 12px", borderRadius: "4px",
                boxShadow: "1.5px 1.5px 0px #000000"
              }}>
                {activeInterval.label}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Embedded Metadata Inspector Panel */}
        <div style={{
          height: "640px", display: "flex", flexDirection: "column", overflowY: "auto",
          background: "#ffffff", border: "3px solid #000000", borderRadius: "12px",
          boxShadow: "4px 4px 0px #000000", padding: "24px",
        }}>
          {selectedNode ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              {/* Header profile details */}
              <div style={{ display: "flex", alignItems: "center", gap: "14px", borderBottom: "2px solid #e5e7eb", paddingBottom: "16px" }}>
                <div
                  style={{
                    width: "44px", height: "44px", borderRadius: "10px",
                    background: selectedNode.type === "person" ? "#eff6ff" : "#fff7ed",
                    border: `2px solid ${selectedNode.type === "person" ? "#0369a1" : "#ea580c"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px",
                  }}
                >
                  {selectedNode.type === "person" ? "👤" : "⚙️"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "9px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "1px", margin: 0 }}>{selectedNode.type}</div>
                  <div style={{ fontSize: "18px", fontWeight: 900, color: "#000", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Space Grotesk'" }}>{selectedNode.name}</div>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  style={{
                    fontSize: "10px", padding: "6px 12px", fontWeight: 900, fontFamily: "'Space Grotesk'",
                    border: "2px solid #000", borderRadius: "6px", background: "#fff", color: "#374151",
                    cursor: "pointer", boxShadow: "1px 1px 0px #000",
                  }}
                >
                  Deselect
                </button>
                <button
                  onClick={() => {
                    setEditingNode(selectedNode);
                    setEditName(selectedNode.name);
                    setEditType(selectedNode.type);
                    setEditAttrs(selectedNode.attributes ? JSON.stringify(selectedNode.attributes, null, 0) : "");
                  }}
                  style={{
                    fontSize: "10px", padding: "6px 12px", fontWeight: 900, fontFamily: "'Space Grotesk'",
                    border: "2px solid #0369a1", borderRadius: "6px", background: "#eff6ff", color: "#0369a1",
                    cursor: "pointer", boxShadow: "1px 1px 0px #0369a1",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteEntity(selectedNode.id)}
                  disabled={writeLoading}
                  style={{
                    fontSize: "10px", padding: "6px 12px", fontWeight: 900, fontFamily: "'Space Grotesk'",
                    border: "2px solid #b91c1c", borderRadius: "6px", background: "#fef2f2", color: "#b91c1c",
                    cursor: "pointer", boxShadow: "1px 1px 0px #b91c1c",
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Edit Entity Form */}
              {editingNode && editingNode.id === selectedNode.id && (
                <div style={{ padding: "14px", borderRadius: "8px", background: "#f0fdf4", border: "2px solid #047857" }}>
                  <div style={{ fontSize: "12px", fontWeight: 900, color: "#047857", marginBottom: "10px" }}>Edit Entity</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name"
                      style={{ padding: "6px 10px", border: "2px solid #000", borderRadius: "4px", fontSize: "12px", fontWeight: 700 }} />
                    <select value={editType} onChange={e => setEditType(e.target.value)}
                      style={{ padding: "6px 10px", border: "2px solid #000", borderRadius: "4px", fontSize: "12px", fontWeight: 700, background: "#fff" }}>
                      {["concept", "person", "database", "feature", "component", "tool", "agent", "system", "security", "deployment"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input value={editAttrs} onChange={e => setEditAttrs(e.target.value)} placeholder='{"key": "value"}'
                      style={{ padding: "6px 10px", border: "2px solid #000", borderRadius: "4px", fontSize: "11px", fontFamily: "'JetBrains Mono'" }} />
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={updateEntity} disabled={writeLoading}
                        style={{ padding: "6px 14px", borderRadius: "4px", border: "2px solid #000", background: "#047857", color: "#fff", fontWeight: 900, fontSize: "11px", cursor: "pointer", boxShadow: "1px 1px 0px #000" }}>
                        Save
                      </button>
                      <button onClick={() => setEditingNode(null)}
                        style={{ padding: "6px 14px", borderRadius: "4px", border: "2px solid #d1d5db", background: "#fff", color: "#374151", fontWeight: 900, fontSize: "11px", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Trust Assessment Ring */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "12px" }}>Memory Trust Assessment</div>
                {trustLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "160px", color: "#9ca3af", fontFamily: "'JetBrains Mono'", fontSize: "10px", fontWeight: 800 }}>
                    LOADING TRUST DATA...
                  </div>
                ) : trustSummary ? (
                  <TrustRing
                    trustLevelDistribution={trustSummary.trustLevelDistribution}
                    avgTrustScore={trustSummary.avgTrustScore}
                    totalMemories={trustSummary.totalMemories}
                    dangerousMemories={trustSummary.dangerousMemories}
                  />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "160px", color: "#9ca3af", fontFamily: "'JetBrains Mono'", fontSize: "10px", fontWeight: 800 }}>
                    NO MEMORY TRUST DATA
                  </div>
                )}
              </div>

              {/* Agent Stability Index */}
              <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: "16px" }}>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "12px" }}>Agent Stability Index</div>
                {driftLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100px", color: "#9ca3af", fontFamily: "'JetBrains Mono'", fontSize: "10px", fontWeight: 800 }}>
                    LOADING DRIFT DATA...
                  </div>
                ) : (
                  <DriftChart
                    timeSeries={driftData?.timeSeries ?? []}
                    overallScore={driftData?.latest?.overall_drift_score ?? 0}
                    status={driftData?.latest?.status ?? "HEALTHY"}
                    topSignals={driftData?.latest?.top_drift_signals ?? []}
                    recommendation={driftData?.latest?.recommendation ?? ""}
                    loading={driftData === null}
                  />
                )}
              </div>

              {/* Attributes and metadata details */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  <span style={{ fontSize: "9px", color: "#6b7280", fontWeight: 900, fontFamily: "'JetBrains Mono'", textTransform: "uppercase" as const }}>UUID Reference</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontFamily: "'JetBrains Mono'", fontSize: "10px", color: "#374151", background: "#f9fafb", padding: "6px 10px", borderRadius: "4px", border: "1.5px solid #e5e7eb", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
                      {selectedNode.id}
                    </span>
                    <button
                      onClick={handleCopyId}
                      style={{
                        fontSize: "9px", padding: "6px 10px", minWidth: "50px", fontWeight: 900, fontFamily: "'Space Grotesk'",
                        border: "2px solid #000", borderRadius: "4px", background: "#fff", color: "#374151",
                        cursor: "pointer", boxShadow: "1px 1px 0px #000",
                      }}
                    >
                      {copiedId ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>

                {Object.entries(selectedNode.attributes ?? {}).map(([key, val]) => (
                  <div key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", background: "#f9fafb", padding: "10px 12px", borderRadius: "6px", border: "1.5px solid #e5e7eb" }}>
                    <span style={{ fontSize: "9px", color: "#6b7280", fontWeight: 900, fontFamily: "'JetBrains Mono'" }}>{key}</span>
                    <span style={{ fontSize: "12px", color: "#000", fontWeight: 700 }}>
                      {typeof val === "string" ? val : JSON.stringify(val)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Connections list */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Local Relationships</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                  {activeRelationships.length > 0 ? (
                    activeRelationships.map((r) => {
                      const srcName = typeof r.source === "object" ? r.source.name : nodes.find(n => n.id === r.source)?.name || r.source;
                      const tgtName = typeof r.target === "object" ? r.target.name : nodes.find(n => n.id === r.target)?.name || r.target;
                      const isOutgoing = srcName === selectedNode.name;

                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", border: "1.5px solid #e5e7eb", borderRadius: "6px", padding: "8px 12px", fontSize: "11px" }}>
                          <span style={{ color: "#374151", fontWeight: 600 }}>
                            {isOutgoing ? `Connects to ` : `Connected by `}
                            <strong style={{ color: "#000", fontWeight: 900 }}>{isOutgoing ? tgtName : srcName}</strong>
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontSize: "8px", fontWeight: 900, padding: "2px 6px", borderRadius: "3px", background: "#e5e7eb", color: "#374151", fontFamily: "'JetBrains Mono'" }}>{r.type}</span>
                            <button
                              onClick={() => deleteRelation(r.id)}
                              style={{ fontSize: "8px", padding: "2px 6px", fontWeight: 900, border: "1.5px solid #b91c1c", borderRadius: "3px", background: "#fef2f2", color: "#b91c1c", cursor: "pointer" }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ color: "#9ca3af", fontSize: "11px", fontFamily: "'JetBrains Mono'", fontWeight: 700 }}>No local relationships detected.</div>
                  )}
                </div>
              </div>

              {/* Cryptographic Timeline */}
              <div>
                <div style={{ fontSize: "10px", fontWeight: 900, color: "#047857", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Cryptographic Timeline Chain</div>
                <div style={{ position: "relative", marginTop: "12px", paddingLeft: "16px" }}>
                  {entityMemories.length > 1 && (
                    <div style={{ position: "absolute", left: "4px", top: "8px", bottom: "8px", width: "1px", borderLeft: "2px dashed #d1d5db" }} />
                  )}

                  {entityMemories.length > 0 ? (
                    entityMemories.map((m, idx) => (
                      <div key={m.memoryId} style={{ position: "relative", marginBottom: "14px" }}>
                        <div style={{ position: "absolute", left: "-16px", top: "5px", width: "7px", height: "7px", borderRadius: "50%", backgroundColor: "#047857", border: "1.5px solid #000" }} />
                        <div style={{ background: "#fff", border: "2px solid #000", borderRadius: "6px", padding: "10px 12px", boxShadow: "2px 2px 0px #000" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "9px", color: "#6b7280", paddingBottom: "4px", marginBottom: "6px", borderBottom: "1px solid #e5e7eb", fontWeight: 800 }}>
                            <span style={{ color: "#047857", fontFamily: "'JetBrains Mono'" }}>BLOCK #{entityMemories.length - idx}</span>
                            <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                          </div>
                          <p style={{ fontSize: "11px", color: "#374151", lineHeight: 1.4, margin: 0, fontWeight: 600 }}>
                            {m.content}
                          </p>
                          <div style={{ marginTop: "6px", fontSize: "8px", fontFamily: "'JetBrains Mono'", color: "#9ca3af", fontWeight: 800 }}>
                            HASH: <span style={{ color: "#047857" }}>{m.cryptographicHash.slice(0, 12)}…</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: "#9ca3af", fontSize: "11px", fontFamily: "'JetBrains Mono'", fontWeight: 700, padding: "4px 0" }}>
                      No cryptographic ledger blocks.
                    </div>
                  )}
                </div>
              </div>

            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#9ca3af", textAlign: "center", gap: "12px" }}>
              <div style={{ fontSize: "28px" }}>🕸️</div>
              <span style={{ fontSize: "12px", fontFamily: "'JetBrains Mono'", textTransform: "uppercase", fontWeight: 800, maxWidth: "240px", lineHeight: 1.5 }}>Select a node in the graph map to inspect properties &amp; cryptographic transaction logs.</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
