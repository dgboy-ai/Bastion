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

const TYPE_LABELS: Record<string, string> = {
  memory_store: "Memory Store", memory_search: "Vector Search", memory_delete: "Delete",
  guard_block: "Guard Block", time_travel: "Time Travel", recovery: "Recovery",
  audit_check: "Audit", hash_verify: "Hash Verify", memory_heal: "Heal",
};

export default function FlightRecorderContent({ initialEvents = [], initialTotal = 0 }: { initialEvents?: AuditEvent[]; initialTotal?: number }) {
  const [events, setEvents] = useState<AuditEvent[]>(initialEvents);
  const [loading, setLoading] = useState(initialEvents.length === 0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(initialEvents[0]?.id || "");
  const [showAll, setShowAll] = useState(false);
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

  useEffect(() => {
    if (initialEvents.length === 0) fetchData();
    const iv = setInterval(fetchData, 15000);
    return () => clearInterval(iv);
  }, [fetchData, initialEvents.length]);

  const filtered = useMemo(() => {
    return events.filter(e => {
      if (filter !== "all" && e.type !== filter) return false;
      if (search && !e.content_preview.toLowerCase().includes(search.toLowerCase()) && !e.agent_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [events, filter, search]);

  const visibleEvents = showAll ? filtered : filtered.slice(0, 9);
  const hasMore = filtered.length > 9 && !showAll;

  const selected = events.find(e => e.id === selectedId);
  const blocked = events.filter(e => e.status === "blocked").length;
  const passed = events.filter(e => e.status === "success").length;
  const passRate = events.length > 0 ? ((passed / events.length) * 100).toFixed(0) : "—";
  const types = [...new Set(events.map(e => e.type))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "32px", fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>Audit Trail</div>
          <div style={{ fontSize: "15px", color: "#c0b8cc", marginTop: "4px" }}>Append-only hash-chained audit log from CockroachDB</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "8px", background: !isMock ? "rgba(52,211,153,0.08)" : "rgba(255,94,0,0.08)", border: `1px solid ${!isMock ? "rgba(52,211,153,0.2)" : "rgba(255,94,0,0.2)"}` }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: !isMock ? "#34d399" : "#ff5e00", boxShadow: `0 0 8px ${!isMock ? "#34d399" : "#ff5e00"}` }} />
            <span style={{ fontSize: "13px", fontWeight: 700, color: !isMock ? "#34d399" : "#ff5e00" }}>{!isMock ? "Live" : "Demo Mode"}</span>
          </div>
          <button onClick={fetchData} style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "#c0b8cc", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>Refresh</button>
        </div>
      </div>

      {/* Context Section — explains what this page is */}
      <div style={{ padding: "16px 20px", borderRadius: "12px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <span style={{ fontSize: "16px" }}>📋</span>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>What is this?</span>
        </div>
        <div style={{ fontSize: "14px", color: "#c0b8cc", lineHeight: "1.6" }}>
          Every memory operation in CockroachDB is logged here — stores, searches, deletes, guard blocks, and recoveries. Each event has a SHA-256 hash linking it to the previous event, forming an tamper-proof audit chain. Click any event to inspect its cryptographic proof and execution details.
        </div>
      </div>

      {/* Stats Row — with glow */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
        {[
          { l: "Audit Events", v: events.length, c: "#fff", glow: "0 0 20px rgba(255,255,255,0.1)" },
          { l: "Passed", v: passed, c: "#34d399", glow: "0 0 20px rgba(52,211,153,0.15)" },
          { l: "Blocked", v: blocked, c: "#ef4444", glow: "0 0 20px rgba(239,68,68,0.15)" },
          { l: "Pass Rate", v: `${passRate}%`, c: "#00e5ff", glow: "0 0 20px rgba(0,229,255,0.15)" },
        ].map((s, i) => (
          <div key={i} className="hover-lift" style={{ padding: "18px", borderRadius: "12px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: s.glow, transition: "all 0.3s" }}>
            <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1.5px" }}>{s.l}</div>
            <div style={{ fontSize: "28px", fontWeight: 900, color: s.c, fontFamily: "'Space Grotesk'", marginTop: "6px", textShadow: `0 0 16px ${s.c}30` }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Filter + Search */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          <button onClick={() => setFilter("all")} style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === "all" ? "rgba(255,94,0,0.4)" : "rgba(255,255,255,0.08)"}`, background: filter === "all" ? "rgba(255,94,0,0.1)" : "rgba(255,255,255,0.02)", color: filter === "all" ? "#ff5e00" : "#c0b8cc", transition: "all 0.2s" }}>All ({events.length})</button>
          {types.map(t => (
            <button key={t} onClick={() => setFilter(filter === t ? "all" : t)} style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: `1px solid ${filter === t ? "rgba(255,94,0,0.4)" : "rgba(255,255,255,0.08)"}`, background: filter === t ? "rgba(255,94,0,0.1)" : "rgba(255,255,255,0.02)", color: filter === t ? "#ff5e00" : "#c0b8cc", transition: "all 0.2s" }}>{TYPE_LABELS[t] || t} ({events.filter(e => e.type === t).length})</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <input type="text" placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#fff", fontSize: "13px", outline: "none", width: "220px", transition: "border-color 0.2s" }} />
      </div>

      {/* 2-Column: Events Grid + Detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "14px", flex: 1, minHeight: 0 }}>
        {/* Events Grid — animated cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "10px", alignContent: "start" }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ padding: "16px", borderRadius: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", animation: `fadeUp 0.3s ease-out ${i * 0.05}s both` }}>
                <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                  <div style={{ width: "70px", height: "22px", borderRadius: "6px", background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />
                  <div style={{ width: "80px", height: "16px", borderRadius: "4px", background: "rgba(255,255,255,0.04)" }} />
                </div>
                <div style={{ width: "85%", height: "16px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", marginBottom: "6px" }} />
                <div style={{ width: "60%", height: "12px", borderRadius: "4px", background: "rgba(255,255,255,0.03)" }} />
              </div>
            ))
          ) : visibleEvents.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "#888", fontSize: "15px" }}>
              {isMock ? "Demo mode — connect to CockroachDB to see audit events" : events.length === 0 ? "No audit events yet — run the demo to generate data" : "No events match your filter"}
            </div>
          ) : (
            visibleEvents.map((e, i) => {
              const isBlocked = e.status === "blocked";
              const isPassed = e.status === "success";
              const isSelected = selectedId === e.id;
              return (
                <div key={e.id} onClick={() => setSelectedId(e.id)} className="hover-lift" style={{
                  padding: "16px", borderRadius: "10px", cursor: "pointer",
                  background: isSelected ? "rgba(255,94,0,0.06)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${isSelected ? "rgba(255,94,0,0.3)" : "rgba(255,255,255,0.04)"}`,
                  boxShadow: isSelected ? "0 0 20px rgba(255,94,0,0.1)" : "none",
                  transition: "all 0.25s",
                  animation: `fadeUp 0.3s ease-out ${i * 0.03}s both`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, background: isBlocked ? "rgba(239,68,68,0.1)" : isPassed ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)", color: isBlocked ? "#ef4444" : isPassed ? "#34d399" : "#c0b8cc", border: `1px solid ${isBlocked ? "rgba(239,68,68,0.2)" : isPassed ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.06)"}` }}>{TYPE_LABELS[e.type] || e.type}</span>
                    <span style={{ fontSize: "12px", color: "#888" }}>{e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ""}</span>
                  </div>
                  <div style={{ fontSize: "15px", color: "#e0dce8", lineHeight: "1.5", marginBottom: "8px", fontWeight: 500 }}>{e.content_preview}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "11px", color: "#666" }}>
                    <span>by {e.agent_id}</span>
                    {e.hash && <span style={{ fontFamily: "monospace", color: "#888" }}>hash: {e.hash}…</span>}
                  </div>
                </div>
              );
            })
          )}
          {/* Show More button */}
          {hasMore && (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "12px" }}>
              <button onClick={() => setShowAll(true)} style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid rgba(255,94,0,0.3)", background: "rgba(255,94,0,0.08)", color: "#ff5e00", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
                Show All {filtered.length} Events
              </button>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
          {selected ? (
            <div style={{ padding: "18px", borderRadius: "12px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", overflow: "auto", flex: 1, animation: "fadeUp 0.3s ease-out" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginBottom: "14px" }}>Event Detail</div>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "3px" }}>Type</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: selected.status === "blocked" ? "#ef4444" : "#34d399" }}>{TYPE_LABELS[selected.type] || selected.type}</div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "3px" }}>Content</div>
                <div style={{ fontSize: "14px", color: "#e0dce8", lineHeight: "1.6", background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>{selected.content_preview}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>When</div><div style={{ fontSize: "13px", color: "#e0dce8" }}>{selected.timestamp ? new Date(selected.timestamp).toLocaleString() : "—"}</div></div>
                <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Agent</div><div style={{ fontSize: "13px", color: "#e0dce8" }}>{selected.agent_id}</div></div>
                <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Status</div><div style={{ fontSize: "14px", fontWeight: 700, color: selected.status === "blocked" ? "#ef4444" : "#34d399" }}>{selected.status}</div></div>
                {selected.trust_score != null && <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Trust</div><div style={{ fontSize: "14px", fontWeight: 700, color: "#00e5ff" }}>{Math.round(selected.trust_score * 100)}%</div></div>}
              </div>
              {selected.hash && (
                <div style={{ padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>SHA-256 Hash</div>
                  <div style={{ fontSize: "13px", fontFamily: "monospace", color: "#00e5ff", wordBreak: "break-all", background: "rgba(0,229,255,0.03)", padding: "8px", borderRadius: "6px" }}>{selected.hash}</div>
                </div>
              )}
              {selected.previous_hash && (
                <div style={{ marginTop: "8px", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>Previous Hash</div>
                  <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#888", wordBreak: "break-all" }}>{selected.previous_hash}</div>
                </div>
              )}
              {selected.details && (
                <div style={{ marginTop: "8px", padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>Execution Details</div>
                  <pre style={{ margin: 0, fontSize: "12px", fontFamily: "monospace", color: "#aaa", whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: "1.6" }}>{selected.details}</pre>
                </div>
              )}
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button onClick={() => navigator.clipboard.writeText(selected.hash || "")} style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#c0b8cc", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>Copy Hash</button>
                <button onClick={() => navigator.clipboard.writeText(selected.content_preview)} style={{ flex: 1, padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#c0b8cc", fontSize: "13px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>Copy Content</button>
              </div>
            </div>
          ) : (
            <div style={{ padding: "24px", borderRadius: "12px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📋</div>
              <div style={{ fontSize: "18px", color: "#fff", fontWeight: 700, marginBottom: "8px" }}>Select an Event</div>
              <div style={{ fontSize: "14px", color: "#888", lineHeight: "1.5" }}>Click any audit event to inspect its hash chain, trust score, and execution details</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
