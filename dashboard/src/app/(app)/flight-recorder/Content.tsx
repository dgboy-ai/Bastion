"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";

interface AuditEvent {
  id: string;
  timestamp: string;
  type: string;
  agent_id: string;
  content_preview: string;
  hash?: string;
  previous_hash?: string;
  trust_score?: number;
  status: string;
  details?: string;
}

interface CapturedMemory {
  id: string;
  agent_id: string;
  type: string;
  content: string;
  tool?: string;
  args_keys?: string[];
  error_type?: string;
  role?: string;
  trust_level: number;
  importance_score: number;
  provenance: string;
  is_pinned: boolean;
  hash?: string;
  previous_hash?: string;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  memory_store: "Memory Store", memory_search: "Vector Search", memory_delete: "Delete",
  guard_block: "Guard Block", time_travel: "Time Travel", recovery: "Recovery",
  audit_check: "Audit", hash_verify: "Hash Verify", memory_heal: "Heal",
};

const CAPTURE_TYPE_LABELS: Record<string, string> = {
  tool_execution: "Tool Call", error_log: "Error", conversation: "Conversation",
  episodic: "Episode", session_lifecycle: "Session",
};

export default function FlightRecorderContent({
  initialEvents = [], initialTotal = 0, initialCaptures = [], initialCapturesTotal = 0,
}: {
  initialEvents?: AuditEvent[]; initialTotal?: number;
  initialCaptures?: CapturedMemory[]; initialCapturesTotal?: number;
}) {
  const [events, setEvents] = useState<AuditEvent[]>(initialEvents);
  const [loading, setLoading] = useState(initialEvents.length === 0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(initialEvents[0]?.id || "");
  const [showAll, setShowAll] = useState(false);
  const [hoveredCaptureId, setHoveredCaptureId] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [captures, setCaptures] = useState<CapturedMemory[]>(initialCaptures);
  const [capturesLoading, setCapturesLoading] = useState(initialCaptures.length === 0);
  const [captureFilter, setCaptureFilter] = useState("all");
  const { isMock } = useConnection();

  const fetchData = useCallback(async () => {
    try {
      const res = await fetchWithTimeout("/api/audit?limit=50");
      if (res.ok) {
        const data = await res.json();
        const list = data?.data?.events || data?.events || [];
        setEvents(list);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      }
    } catch { setEvents([]); } finally { setLoading(false); }
  }, [selectedId]);

  const fetchCaptures = useCallback(async () => {
    try {
      const res = await fetchWithTimeout("/api/captures?limit=50");
      if (res.ok) {
        const data = await res.json();
        const list = data?.data?.captures || [];
        setCaptures(list);
      }
    } catch { setCaptures([]); } finally { setCapturesLoading(false); }
  }, []);

  useEffect(() => {
    if (initialEvents.length === 0) fetchData();
    if (initialCaptures.length === 0) fetchCaptures();
    const iv = setInterval(() => { fetchData(); fetchCaptures(); }, 15000);
    return () => clearInterval(iv);
  }, [fetchData, fetchCaptures, initialEvents.length, initialCaptures.length]);

  const filtered = useMemo(() => {
    const res = events.filter(e => {
      if (filter !== "all" && e.type !== filter) return false;
      if (search && !e.content_preview.toLowerCase().includes(search.toLowerCase()) && !e.agent_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    return res;
  }, [events, filter, search]);

  const filteredCaptures = useMemo(() => {
    return captures.filter(c => {
      if (captureFilter !== "all" && c.type !== captureFilter) return false;
      if (search && !c.content.toLowerCase().includes(search.toLowerCase()) && !c.agent_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [captures, captureFilter, search]);

  const visibleEvents = showAll ? filtered : filtered.slice(0, 9);
  const hasMore = filtered.length > 9 && !showAll;

  const selected = events.find(e => e.id === selectedId);
  const blocked = events.filter(e => e.status === "blocked").length;
  const passed = events.filter(e => e.status === "success").length;
  const passRate = events.length > 0 ? ((passed / events.length) * 100).toFixed(0) : "—";
  const types = [...new Set(events.map(e => e.type))];
  const captureTypes = [...new Set(captures.map(c => c.type))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", width: "100%", animation: "revealUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "32px", fontWeight: 900, color: "#000000", letterSpacing: "-1px", fontFamily: "'Space Grotesk', sans-serif" }}>Audit Trail</div>
          <div style={{ fontSize: "15px", color: "#374151", fontWeight: 700, marginTop: "4px" }}>Append-only hash-chained audit log from CockroachDB</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ 
            display: "flex", alignItems: "center", gap: "6px", 
            padding: "6px 14px", borderRadius: "var(--radius-sm)", 
            background: "var(--accent-breeze)", border: "2px solid #000000",
            boxShadow: "2px 2px 0px #000000"
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#000000" }} />
            <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000" }}>{!isMock ? "LIVE CONNECTED" : "DEMO WORKLOAD"}</span>
          </div>
          <button 
            onClick={fetchData} 
            style={{ 
              padding: "8px 18px", borderRadius: "var(--radius-sm)", border: "2px solid #000000", 
              background: "#ffffff", color: "#000000", fontSize: "13px", fontWeight: 900, 
              cursor: "pointer", boxShadow: "2px 2px 0px #000000", transition: "all 0.1s ease" 
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
            Refresh
          </button>
        </div>
      </div>

      {/* Context Section — explains what this page is */}
      <div style={{ 
        padding: "18px 24px", borderRadius: "var(--radius-sm)", 
        background: "#ffffff", border: "2.5px solid #000000",
        boxShadow: "3px 3px 0px #000000"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "16px" }}>📋</span>
          <span style={{ fontSize: "15px", fontWeight: 900, color: "#000000", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "'Space Grotesk', sans-serif" }}>What is this?</span>
        </div>
        <div style={{ fontSize: "14px", color: "#374151", fontWeight: 700, lineHeight: "1.6" }}>
          Every memory operation in CockroachDB is logged here — stores, searches, deletes, guard blocks, and recoveries. Each event has a SHA-256 hash linking it to the previous event, forming a tamper-proof audit chain. The <b>Auto-Capture Feed</b> above shows memories the Bastion MCP server wrote automatically as agents used it — no manual store() needed. Click any event to inspect its cryptographic proof and execution details.
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {[
          { l: "Audit Events", v: events.length, c: "#000000" },
          { l: "Auto-Captured Memories", v: captures.length, c: "#0891b2" },
          { l: "Blocked", v: blocked, c: "#b91c1c" },
          { l: "Pass Rate", v: `${passRate}%`, c: "#047857" },
        ].map((s, i) => (
          <div key={i} style={{ 
            padding: "18px", borderRadius: "var(--radius-sm)", 
            background: "#ffffff", border: "2.5px solid #000000", 
            boxShadow: "3px 3px 0px #000000" 
          }}>
            <div style={{ fontSize: "11px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1.5px" }}>{s.l}</div>
            <div style={{ fontSize: "28px", fontWeight: 950, color: s.c, fontFamily: "'Space Grotesk', sans-serif", marginTop: "6px" }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Auto-Capture Feed — every MCP tool call lands here as a hash-chained memory */}
      <div style={{ 
        padding: "18px 24px", borderRadius: "var(--radius-sm)", 
        background: "#ffffff", border: "2.5px solid #000000",
        boxShadow: "3px 3px 0px #000000"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "16px" }}>🛰️</span>
          <span style={{ fontSize: "15px", fontWeight: 900, color: "#000000", textTransform: "uppercase", letterSpacing: "0.5px", fontFamily: "'Space Grotesk', sans-serif" }}>Auto-Capture Feed</span>
          <span style={{ 
            padding: "3px 10px", borderRadius: "var(--radius-sm)", fontSize: "11px", fontWeight: 900,
            background: "#ecfdf5", color: "#047857", border: "1.5px solid #000000", boxShadow: "1px 1px 0px #000000"
          }}>
            {captures.length} MEMORIES
          </span>
          <span style={{ fontSize: "13px", color: "#374151", fontWeight: 700 }}>
            Every tool call & error through the Bastion MCP server is auto-captured here — hash-chained, guard-screened, no manual store() required.
          </span>
        </div>

        {/* capture type filter */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
          <button 
            onClick={() => setCaptureFilter("all")} 
            style={{ 
              padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 900, cursor: "pointer",
              border: "2px solid #000000", background: captureFilter === "all" ? "#0891b2" : "#ffffff",
              color: captureFilter === "all" ? "#ffffff" : "#000000", boxShadow: "1.5px 1.5px 0px #000000"
            }}
          >
            All ({captures.length})
          </button>
          {captureTypes.map(t => (
            <button 
              key={t} 
              onClick={() => setCaptureFilter(captureFilter === t ? "all" : t)} 
              style={{ 
                padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: "12px", fontWeight: 900, cursor: "pointer",
                border: "2px solid #000000", background: captureFilter === t ? "#0891b2" : "#ffffff",
                color: captureFilter === t ? "#ffffff" : "#000000", boxShadow: "1.5px 1.5px 0px #000000"
              }}
            >
              {CAPTURE_TYPE_LABELS[t] || t} ({captures.filter(c => c.type === t).length})
            </button>
          ))}
        </div>

        {capturesLoading ? (
          <div style={{ padding: "16px", color: "#374151", fontWeight: 800, fontSize: "13px" }}>Loading captured memories…</div>
        ) : filteredCaptures.length === 0 ? (
          <div style={{ padding: "16px", color: "#374151", fontWeight: 800, fontSize: "13px" }}>
            {isMock ? "Demo mode — connect to CockroachDB to see auto-captured tool calls" : "No captured memories yet — run an agent session through the Bastion MCP server"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {filteredCaptures.slice(0, 8).map((c) => (
              <div key={c.id} style={{
                display: "flex", alignItems: "flex-start", gap: "12px",
                padding: "12px 14px", borderRadius: "var(--radius-sm)",
                background: "#f9f9f7", border: "2px solid #000000",
              }}>
                <span style={{
                  padding: "3px 10px", borderRadius: "var(--radius-sm)", fontSize: "10px", fontWeight: 900,
                  background: c.type === "error_log" ? "#fef2f2" : "#ecfdf5",
                  color: c.type === "error_log" ? "#b91c1c" : "#047857",
                  border: "1.5px solid #000000", whiteSpace: "nowrap", marginTop: "2px",
                }}>
                  {CAPTURE_TYPE_LABELS[c.type] || c.type}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                    {c.tool && <span style={{ fontSize: "11px", fontWeight: 900, color: "#0891b2", fontFamily: "var(--font-mono)" }}>{c.tool}</span>}
                    {c.error_type && <span style={{ fontSize: "11px", fontWeight: 900, color: "#b91c1c", fontFamily: "var(--font-mono)" }}>{c.error_type}</span>}
                    <span style={{ fontSize: "12px", color: "#111827", fontWeight: 850, fontFamily: "var(--font-mono)" }}>
                      {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                    </span>
                    <span style={{ fontSize: "12px", color: "#111827", fontWeight: 800 }}>trust {Math.round((Number(c.trust_level) / 4) * 100)}%</span>
                  </div>
                  <div 
                    onMouseEnter={() => setHoveredCaptureId(c.id)}
                    onMouseLeave={() => setHoveredCaptureId(null)}
                    style={{
                      fontSize: hoveredCaptureId === c.id ? "16px" : "13px", 
                      color: "#000000", fontWeight: 700, fontFamily: "var(--font-mono)",
                      wordBreak: "break-all", 
                      lineHeight: hoveredCaptureId === c.id ? "1.8" : "1.5", 
                      overflow: "hidden",
                      display: hoveredCaptureId === c.id ? "block" : "-webkit-box", 
                      WebkitLineClamp: hoveredCaptureId === c.id ? "unset" : 2, 
                      WebkitBoxOrient: "vertical",
                      background: hoveredCaptureId === c.id ? "#f3f4f6" : "#ffffff", 
                      padding: hoveredCaptureId === c.id ? "16px" : "10px 14px", 
                      borderRadius: "6px",
                      border: "2px solid #000000", boxShadow: "2px 2px 0px rgba(0,0,0,0.1)",
                      cursor: hoveredCaptureId === c.id ? "text" : "pointer",
                      transition: "all 0.2s ease"
                    }}>
                      {c.content}
                  </div>
                  {c.hash && (
                    <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "#ff5e00", fontWeight: 900, marginTop: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.hash}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter + Search */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button 
            onClick={() => setFilter("all")} 
            style={{ 
              padding: "6px 14px", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 900, cursor: "pointer", 
              border: "2px solid #000000", 
              background: filter === "all" ? "#ff5e00" : "#ffffff", 
              color: filter === "all" ? "#ffffff" : "#000000", 
              boxShadow: "2px 2px 0px #000000"
            }}
          >
            All ({events.length})
          </button>
          {types.map(t => (
            <button 
              key={t} 
              onClick={() => setFilter(filter === t ? "all" : t)} 
              style={{ 
                padding: "6px 14px", borderRadius: "var(--radius-sm)", fontSize: "13px", fontWeight: 900, cursor: "pointer", 
                border: "2px solid #000000", 
                background: filter === t ? "#ff5e00" : "#ffffff", 
                color: filter === t ? "#ffffff" : "#000000", 
                boxShadow: "2px 2px 0px #000000"
              }}
            >
              {TYPE_LABELS[t] || t} ({events.filter(e => e.type === t).length})
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <input 
          type="text" 
          placeholder="Search events..." 
          value={search} 
          onChange={e => setSearch(e.target.value)}
          style={{ 
            padding: "8px 14px", borderRadius: "var(--radius-sm)", 
            border: "2px solid #000000", background: "#ffffff", 
            color: "#000000", fontSize: "13px", fontWeight: 800, 
            outline: "none", width: "220px" 
          }} 
        />
      </div>

      {/* 2-Column: Events Grid + Detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 400px", gap: "24px", flex: 1, minHeight: 0 }}>
        {/* Events Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "18px", alignContent: "start" }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: "16px", borderRadius: "var(--radius-sm)", background: "#ffffff", border: "2px solid #000000", boxShadow: "2px 2px 0px #000000" }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                  <div style={{ width: "70px", height: "22px", borderRadius: "4px", background: "#e5e7eb" }} />
                  <div style={{ width: "80px", height: "16px", borderRadius: "4px", background: "#f3f4f6" }} />
                </div>
                <div style={{ width: "85%", height: "16px", borderRadius: "4px", background: "#f3f4f6", marginBottom: "6px" }} />
                <div style={{ width: "60%", height: "12px", borderRadius: "4px", background: "#f9fafb" }} />
              </div>
            ))
          ) : visibleEvents.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "#374151", fontWeight: 800, fontSize: "15px" }}>
              {isMock ? "Demo mode — connect to CockroachDB to see audit events" : events.length === 0 ? "No audit events yet — run the demo to generate data" : "No events match your filter"}
            </div>
          ) : (
            visibleEvents.map((e, i) => {
              const isBlocked = e.status === "blocked";
              const isPassed = e.status === "success";
              const isSelected = selectedId === e.id;
              const statusCol = isBlocked ? "#ef4444" : isPassed ? "#10b981" : "#6b7280";
              const statusBg = isBlocked ? "#fef2f2" : isPassed ? "#ecfdf5" : "#f9fafb";
              return (
                <div 
                  key={e.id} 
                  onClick={() => setSelectedId(e.id)} 
                  style={{
                    padding: "20px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                    background: isSelected ? "var(--accent-breeze)" : "#ffffff",
                    border: "2.5px solid #000000",
                    boxShadow: "3px 3px 0px #000000",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
                    <span style={{ 
                      padding: "3px 10px", borderRadius: "var(--radius-sm)", 
                      fontSize: "11px", fontWeight: 900, 
                      background: statusBg, color: statusCol, 
                      border: "1.5px solid #000000",
                      boxShadow: "1px 1px 0px #000000"
                    }}>
                      {TYPE_LABELS[e.type] || e.type}
                    </span>
                    <span style={{ fontSize: "12px", color: "#111827", fontWeight: 850, fontFamily: "var(--font-mono)" }}>
                      {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  <div style={{
                    fontSize: "14px", fontWeight: 700, color: "#000000",
                    fontFamily: "var(--font-mono)",
                    background: "#ffffff",
                    border: "2px solid #000000",
                    padding: "12px 14px",
                    borderRadius: "6px",
                    wordBreak: "break-all",
                    lineHeight: "1.6",
                    marginBottom: "12px",
                    boxShadow: "2px 2px 0px rgba(0,0,0,0.1)"
                  }}>
                    {e.content_preview}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "11px", color: "#374151", fontWeight: 800, borderTop: "1px solid #000000", paddingTop: "8px" }}>
                    <div>agent: <span style={{ color: "#000000", fontWeight: 900 }}>{e.agent_id}</span></div>
                    {e.hash && <div style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>hash: <span style={{ color: "#ff5e00", fontWeight: 900 }}>{e.hash}</span></div>}
                  </div>
                </div>
              );
            })
          )}
          {/* Show More button */}
          {hasMore && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "12px" }}>
              <button 
                onClick={() => setShowAll(true)} 
                style={{ 
                  padding: "8px 24px", borderRadius: "var(--radius-sm)", border: "2px solid #000000", 
                  background: "#ffffff", color: "#ff5e00", fontSize: "13px", fontWeight: 900, 
                  cursor: "pointer", boxShadow: "2.5px 2.5px 0px #000000" 
                }}
              >
                Show All {filtered.length} Events
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
          {selected ? (
            <div style={{ 
              padding: "20px", borderRadius: "var(--radius-sm)", 
              background: "#ffffff", border: "2.5px solid #000000", 
              boxShadow: "4px 4px 0px #000000",
              overflow: "auto", flex: 1 
            }}>
              <div style={{ fontSize: "18px", fontWeight: 950, color: "#000000", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "16px", fontFamily: "'Space Grotesk', sans-serif" }}>Event Detail</div>
              
              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Type</div>
                <div style={{ fontSize: "15px", fontWeight: 900, color: selected.status === "blocked" ? "#ef4444" : "#047857", fontFamily: "'Space Grotesk', sans-serif" }}>{TYPE_LABELS[selected.type] || selected.type}</div>
              </div>

              <div style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Content</div>
                <div style={{ 
                  fontSize: "12.5px", color: "#374151", fontWeight: 550, lineHeight: "1.6", 
                  background: "#f9f9f7", padding: "12px", borderRadius: "var(--radius-sm)", 
                  border: "2px solid #000000", wordBreak: "break-word", fontFamily: "var(--font-mono)"
                }}>{selected.content_preview}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div>
                  <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>When</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#000000" }}>{selected.timestamp ? new Date(selected.timestamp).toLocaleString() : "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Agent</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#000000" }}>{selected.agent_id}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Status</div>
                  <div style={{ fontSize: "12.5px", fontWeight: 950, color: selected.status === "blocked" ? "#ef4444" : "#047857", textTransform: "uppercase" }}>{selected.status}</div>
                </div>
                {selected.trust_score != null && (
                  <div>
                    <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>Trust</div>
                    <div style={{ fontSize: "12.5px", fontWeight: 950, color: "#0891b2" }}>{Math.round(selected.trust_score * 100)}%</div>
                  </div>
                )}
              </div>

              {selected.hash && (
                <div style={{ padding: "12px", background: "#f9f9f7", borderRadius: "var(--radius-sm)", border: "2px solid #000000", marginBottom: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>SHA-256 Hash</div>
                  <div style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "#ff5e00", fontWeight: 900, wordBreak: "break-all" }}>{selected.hash}</div>
                </div>
              )}

              {selected.previous_hash && (
                <div style={{ padding: "12px", background: "#f9f9f7", borderRadius: "var(--radius-sm)", border: "2px solid #000000", marginBottom: "10px" }}>
                  <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Previous Hash</div>
                  <div style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "#374151", fontWeight: 700, wordBreak: "break-all" }}>{selected.previous_hash}</div>
                </div>
              )}

              {selected.details && (
                <div style={{ padding: "12px", background: "#f9f9f7", borderRadius: "var(--radius-sm)", border: "2px solid #000000", marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", color: "#374151", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Execution Details</div>
                  <pre style={{ margin: 0, fontSize: "11.5px", fontFamily: "var(--font-mono)", color: "#000000", fontWeight: 700, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: "1.5" }}>{selected.details}</pre>
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button 
                  onClick={() => navigator.clipboard.writeText(selected.hash || "")} 
                  style={{ 
                    flex: 1, padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "2px solid #000000", 
                    background: "#ffffff", color: "#000000", fontSize: "13px", fontWeight: 900, 
                    cursor: "pointer", boxShadow: "2px 2px 0px #000000" 
                  }}
                >
                  Copy Hash
                </button>
                <button 
                  onClick={() => navigator.clipboard.writeText(selected.content_preview)} 
                  style={{ 
                    flex: 1, padding: "10px 14px", borderRadius: "var(--radius-sm)", border: "2px solid #000000", 
                    background: "#ffffff", color: "#000000", fontSize: "13px", fontWeight: 900, 
                    cursor: "pointer", boxShadow: "2px 2px 0px #000000" 
                  }}
                >
                  Copy Content
                </button>
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: "24px", borderRadius: "var(--radius-sm)", 
              background: "#ffffff", border: "2.5px solid #000000", 
              boxShadow: "4px 4px 0px #000000",
              flex: 1, display: "flex", flexDirection: "column", 
              justifyContent: "center", alignItems: "center", textAlign: "center" 
            }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
              <div style={{ fontSize: "18px", color: "#000000", fontWeight: 900, marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>Select an Event</div>
              <div style={{ fontSize: "14px", color: "#374151", fontWeight: 700, lineHeight: "1.5" }}>Click any audit event to inspect its hash chain, trust score, and execution details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
