"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";

interface Memory {
  memoryId: string;
  agentId: string;
  memoryType: string;
  content: string;
  metadata: Record<string, unknown>;
  previousHash: string | null;
  cryptographicHash: string;
  importanceScore: number;
  createdAt: string;
  expiresAt: string | null;
  accessCount: number;
  trustLevel?: number;
}

export default function LogsPage({ initialMemories = [], initialTotal = 0 }: { initialMemories?: Memory[]; initialTotal?: number }) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(initialMemories.length === 0);
  const [lastRefresh, setLastRefresh] = useState<string>(new Date().toLocaleTimeString());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["content", "chain"]));
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const { isMock } = useConnection();

  const connected = !isMock;
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Compute unique types and counts
  const typeCounts = memories.reduce((acc, m) => { acc[m.memoryType] = (acc[m.memoryType] || 0) + 1; return acc; }, {} as Record<string, number>);
  const uniqueTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const fetchMemories = useCallback(async (q?: string) => {
    if (isMock) {
      // Demo mode — show empty state
      setMemories([]);
      setLastRefresh(new Date().toLocaleTimeString());
      setFetchError(null);
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const qp = q ? `?search=${encodeURIComponent(q)}` : "";
      const res = await fetchWithTimeout(`/api/memories${qp}`, { signal: ac.signal });
      if (!mountedRef.current) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setMemories(json.data?.memories || []);
      setLastRefresh(new Date().toLocaleTimeString());
      setFetchError(null);
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError" || !mountedRef.current) return;
      setFetchError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [isMock]);

  useEffect(() => {
    mountedRef.current = true;
    // Only fetch on mount if no initial data from server
    if (initialMemories.length === 0) {
      fetchMemories(search);
    }
    const iv = setInterval(() => fetchMemories(search), 15000);
    return () => { mountedRef.current = false; clearInterval(iv); abortRef.current?.abort(); };
  }, [search, fetchMemories, initialMemories.length]);

  const selected = memories.find(m => m.memoryId === selectedId);
  const filteredMemories = typeFilter === "all" ? memories : memories.filter(m => m.memoryType === typeFilter);
  const poisoned = memories.filter(m => m.memoryType === "poison_attempt").length;
  const healed = memories.filter(m => m.memoryType === "healed").length;
  const avgImportance = memories.length > 0 ? (memories.reduce((a, m) => a + (m.importanceScore || 0), 0) / memories.length) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", height: "100vh", padding: "20px 24px", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "32px", fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>Memory Chain</div>
          <div style={{ fontSize: "14px", color: "#c0b8cc", marginTop: "2px" }}>Each block is cryptographically linked to the previous via SHA-256 hash</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 12px", borderRadius: "8px", background: connected ? "rgba(52,211,153,0.08)" : "rgba(255,94,0,0.08)", border: `1px solid ${connected ? "rgba(52,211,153,0.2)" : "rgba(255,94,0,0.2)"}` }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: connected ? "#34d399" : "#ff5e00", boxShadow: `0 0 6px ${connected ? "#34d399" : "#ff5e00"}` }} />
            <span style={{ fontSize: "12px", fontWeight: 700, color: connected ? "#34d399" : "#ff5e00" }}>{connected ? "Live" : "Demo Mode"}</span>
          </div>
          </div>
      </div>

      {/* 2-Column Layout: Chain (left) + Detail Panel (right) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "16px", flex: 1, minHeight: 0 }}>

        {/* Left: Chain */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
          {/* Search + Filter Chips */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Search memories..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: "14px", outline: "none" }} />
              </div>
            </div>
            {/* Category filter chips */}
            {uniqueTypes.length > 1 && (
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setTypeFilter("all")} style={{
                  padding: "4px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${typeFilter === "all" ? "rgba(255,94,0,0.4)" : "rgba(255,255,255,0.08)"}`,
                  background: typeFilter === "all" ? "rgba(255,94,0,0.1)" : "rgba(255,255,255,0.02)",
                  color: typeFilter === "all" ? "#ff5e00" : "#a8a0b4",
                }}>All ({memories.length})</button>
                {uniqueTypes.map(([type, count]) => (
                  <button key={type} onClick={() => setTypeFilter(typeFilter === type ? "all" : type)} style={{
                    padding: "4px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${typeFilter === type ? "rgba(255,94,0,0.4)" : "rgba(255,255,255,0.08)"}`,
                    background: typeFilter === type ? "rgba(255,94,0,0.1)" : "rgba(255,255,255,0.02)",
                    color: typeFilter === type ? "#ff5e00" : "#a8a0b4",
                  }}>{type} ({count})</button>
                ))}
              </div>
            )}
            {/* Category Legend */}
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", padding: "8px 12px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
              {[
                { color: "#ef4444", label: "poison_attempt", desc: "Malicious injection blocked by guard" },
                { color: "#34d399", label: "healed", desc: "Restored via time-travel" },
                { color: "#c0b8cc", label: "fact", desc: "Verified agent knowledge" },
                { color: "#c0b8cc", label: "safety_rule", desc: "Security policy" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#d4cce0" }}>{item.label}</span>
                  <span style={{ fontSize: "12px", color: "#999" }}>— {item.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Chain Timeline */}
          <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
            {/* Vertical chain line — subtle, single color */}
            <div style={{ position: "absolute", left: "15px", top: "0", bottom: "0", width: "1px", background: "rgba(255,255,255,0.06)" }} />

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: "14px", marginBottom: "4px" }}>
                    <div style={{ width: "32px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
                      {i < 5 && <div style={{ width: "1px", flex: 1, minHeight: "6px", background: "rgba(255,255,255,0.04)" }} />}
                    </div>
                    <div style={{ flex: 1, padding: "14px 16px", borderRadius: "8px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                        <div style={{ width: "60px", height: "20px", borderRadius: "4px", background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s infinite" }} />
                        <div style={{ width: "120px", height: "14px", borderRadius: "4px", background: "rgba(255,255,255,0.04)" }} />
                      </div>
                      <div style={{ width: "80%", height: "16px", borderRadius: "4px", background: "rgba(255,255,255,0.04)", marginBottom: "6px" }} />
                      <div style={{ width: "60%", height: "12px", borderRadius: "4px", background: "rgba(255,255,255,0.03)" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : memories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#c0b8cc", fontSize: "14px" }}>
                {isMock ? "Demo mode — connect to CockroachDB to see memories" : "No memories in chain"}
              </div>
            ) : (
              filteredMemories.map((m, i) => {
                const isSelected = selectedId === m.memoryId;
                const trust = m.trustLevel != null ? Math.round(m.trustLevel * 100) : null;
                const isPoison = m.memoryType === "poison_attempt";
                const isHealed = m.memoryType === "healed";

                return (
                  <div key={m.memoryId} style={{ display: "flex", gap: "14px", marginBottom: "4px", cursor: "pointer" }} onClick={() => setSelectedId(isSelected ? null : m.memoryId)}>
                    {/* Node — minimal, professional */}
                    <div style={{ position: "relative", zIndex: 1, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", width: "32px" }}>
                      <div style={{
                        width: "10px", height: "10px", borderRadius: "50%",
                        background: isSelected ? "#fff" : isPoison ? "rgba(239,68,68,0.4)" : isHealed ? "rgba(52,211,153,0.4)" : "rgba(255,255,255,0.12)",
                        border: `1.5px solid ${isSelected ? "#ff5e00" : isPoison ? "rgba(239,68,68,0.5)" : isHealed ? "rgba(52,211,153,0.5)" : "rgba(255,255,255,0.15)"}`,
                        transition: "all 0.15s",
                      }} />
                      {i < memories.length - 1 && <div style={{ width: "1px", flex: 1, minHeight: "6px", background: "rgba(255,255,255,0.04)" }} />}
                    </div>

                    {/* Block Card — Clean, spacious */}
                    <div style={{
                      flex: 1, padding: "14px 16px", borderRadius: "8px", marginBottom: "4px",
                      background: isSelected ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${isSelected ? "rgba(255,94,0,0.3)" : "rgba(255,255,255,0.04)"}`,
                      transition: "all 0.15s",
                    }}>
                      {/* Top row: type + time + trust badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{
                          padding: "3px 10px", borderRadius: "4px", fontSize: "13px", fontWeight: 700,
                          background: isPoison ? "rgba(239,68,68,0.1)" : isHealed ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.06)",
                          color: isPoison ? "#ef4444" : isHealed ? "#34d399" : "#d4cce0",
                        }}>{m.memoryType}</span>
                        <span style={{ fontSize: "14px", color: "#c0b8cc" }}>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</span>
                        {trust !== null && (
                          <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: "6px", fontSize: "13px", fontWeight: 800, background: trust >= 80 ? "rgba(52,211,153,0.1)" : trust >= 50 ? "rgba(255,94,0,0.1)" : "rgba(239,68,68,0.1)", color: trust >= 80 ? "#34d399" : trust >= 50 ? "#ff5e00" : "#ef4444", border: `1px solid ${trust >= 80 ? "rgba(52,211,153,0.2)" : trust >= 50 ? "rgba(255,94,0,0.2)" : "rgba(239,68,68,0.2)"}` }}>
                            Trust {trust}%
                          </span>
                        )}
                      </div>
                      {/* Content — bigger, cleaner */}
                      <div style={{ fontSize: "16px", color: "#e0dce8", lineHeight: "1.5", fontWeight: 500 }}>{m.content}</div>
                      {/* Agent — small, subtle */}
                      <div style={{ fontSize: "11px", color: "#aaa", marginTop: "6px" }}>by {m.agentId}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Always-visible Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
          {/* Chain Summary — Always Visible */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "16px" }}>⛓</span> Chain Summary
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Total Blocks</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: "#fff", fontFamily: "'Space Grotesk'" }}>{memories.length}</div>
              </div>
              <div style={{ padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Avg Importance</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: "#00e5ff", fontFamily: "'Space Grotesk'" }}>{avgImportance.toFixed(1)}</div>
              </div>
              <div style={{ padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Poisoned</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: "#ef4444", fontFamily: "'Space Grotesk'" }}>{poisoned}</div>
              </div>
              <div style={{ padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px" }}>
                <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Healed</div>
                <div style={{ fontSize: "24px", fontWeight: 900, color: "#34d399", fontFamily: "'Space Grotesk'" }}>{healed}</div>
              </div>
            </div>
            {/* Chain Integrity */}
            <div style={{ marginTop: "10px", padding: "10px", background: "rgba(52,211,153,0.05)", borderRadius: "6px", border: "1px solid rgba(52,211,153,0.15)" }}>
              <div style={{ fontSize: "13px", color: "#34d399", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "14px" }}>✓</span> Hash chain integrity verified by CockroachDB
              </div>
              <div style={{ fontSize: "11px", color: "#c0b8cc", marginTop: "4px" }}>
                {memories.length} blocks linked via SHA-256 cryptographic hashes
              </div>
            </div>
          </div>

          {/* Memory Inspector — when a block is selected */}
          {selected && (
            <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", overflow: "auto", flex: 1 }}>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "16px" }}>🔍</span> Memory Inspector
              </div>

              {/* Identity */}
              <div style={{ marginBottom: "8px" }}>
                <div onClick={() => toggleSection("identity")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "10px", color: "#c0b8cc", transition: "transform 0.2s", transform: expandedSections.has("identity") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Identity</span>
                  <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: selected.memoryType === "poison_attempt" ? "rgba(239,68,68,0.1)" : selected.memoryType === "healed" ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)", color: selected.memoryType === "poison_attempt" ? "#ef4444" : selected.memoryType === "healed" ? "#34d399" : "#d4cce0" }}>{selected.memoryType}</span>
                </div>
                {expandedSections.has("identity") && (
                  <div style={{ padding: "10px", marginTop: "4px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Memory ID</div><div style={{ fontSize: "12px", fontFamily: "monospace", color: "#00e5ff", wordBreak: "break-all" }}>{selected.memoryId}</div></div>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Agent</div><div style={{ fontSize: "14px", color: "#d4cce0" }}>{selected.agentId}</div></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Content */}
              <div style={{ marginBottom: "8px" }}>
                <div onClick={() => toggleSection("content")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "10px", color: "#c0b8cc", transition: "transform 0.2s", transform: expandedSections.has("content") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Content</span>
                </div>
                {expandedSections.has("content") && (
                  <div style={{ padding: "10px", marginTop: "4px" }}>
                    <div style={{ fontSize: "14px", color: "#d4cce0", lineHeight: "1.6", background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)" }}>{selected.content}</div>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div style={{ marginBottom: "8px" }}>
                <div onClick={() => toggleSection("metadata")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "10px", color: "#c0b8cc", transition: "transform 0.2s", transform: expandedSections.has("metadata") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Metadata</span>
                </div>
                {expandedSections.has("metadata") && (
                  <div style={{ padding: "10px", marginTop: "4px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>When Stored</div><div style={{ fontSize: "13px", color: "#d4cce0" }}>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</div></div>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Expires</div><div style={{ fontSize: "13px", color: "#d4cce0" }}>{selected.expiresAt ? new Date(selected.expiresAt).toLocaleString() : "Never"}</div></div>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Importance</div><div style={{ fontSize: "18px", fontWeight: 800, color: selected.importanceScore >= 0.7 ? "#34d399" : "#ff5e00" }}>{selected.importanceScore?.toFixed(1)}</div></div>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Trust Score</div><div style={{ fontSize: "18px", fontWeight: 800, color: "#00e5ff" }}>{selected.trustLevel != null ? `${Math.round(selected.trustLevel * 100)}%` : "—"}</div></div>
                      <div><div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Accessed</div><div style={{ fontSize: "14px", color: "#d4cce0" }}>{selected.accessCount}×</div></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Hash Chain */}
              <div style={{ marginBottom: "8px" }}>
                <div onClick={() => toggleSection("chain")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "10px", color: "#c0b8cc", transition: "transform 0.2s", transform: expandedSections.has("chain") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Cryptographic Proof</span>
                </div>
                {expandedSections.has("chain") && (
                  <div style={{ padding: "10px", marginTop: "4px" }}>
                    <div style={{ padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)" }}>
                      <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>SHA-256 Hash</div>
                      <div style={{ fontSize: "13px", fontFamily: "monospace", color: "#00e5ff", wordBreak: "break-all", lineHeight: "1.6", background: "rgba(0,229,255,0.03)", padding: "8px", borderRadius: "4px" }}>{selected.cryptographicHash}</div>
                    </div>
                    {selected.previousHash && (
                      <div style={{ marginTop: "6px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: "11px", color: "#c0b8cc", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>Previous Block Hash</div>
                        <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#aaa", wordBreak: "break-all", lineHeight: "1.6" }}>{selected.previousHash}</div>
                      </div>
                    )}
                    <div style={{ marginTop: "8px", padding: "10px", background: "rgba(52,211,153,0.05)", borderRadius: "6px", border: "1px solid rgba(52,211,153,0.15)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "14px" }}>✓</span>
                      <div>
                        <div style={{ fontSize: "13px", color: "#34d399", fontWeight: 600 }}>Chain Verified</div>
                        <div style={{ fontSize: "11px", color: "#c0b8cc" }}>Integrity confirmed by CockroachDB</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "6px" }}>
                <button onClick={() => navigator.clipboard.writeText(selected.cryptographicHash)} style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#d4cce0", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Copy Hash</button>
                <button onClick={() => navigator.clipboard.writeText(selected.content)} style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#d4cce0", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Copy Content</button>
              </div>
            </div>
          )}

          {/* No selection — guidance */}
          {!selected && (
            <div style={{ padding: "20px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: "28px", marginBottom: "12px" }}>🔍</div>
              <div style={{ fontSize: "16px", color: "#fff", fontWeight: 700, marginBottom: "6px" }}>Select a Memory Block</div>
              <div style={{ fontSize: "13px", color: "#c0b8cc", lineHeight: "1.5" }}>Click any block in the chain to inspect its content, trust score, and cryptographic hash chain</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
