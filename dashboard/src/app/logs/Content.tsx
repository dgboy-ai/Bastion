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

export default function LogsPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["content", "chain"]));
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const { isMock } = useConnection();

  // Use shared context — no separate connection state
  const connected = !isMock;
  const [fetchError, setFetchError] = useState<string | null>(null);

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
    fetchMemories(search);
    const iv = setInterval(() => fetchMemories(search), 15000);
    return () => { mountedRef.current = false; clearInterval(iv); abortRef.current?.abort(); };
  }, [search, fetchMemories]);

  const selected = memories.find(m => m.memoryId === selectedId);
  const poisoned = memories.filter(m => m.memoryType === "poison_attempt").length;
  const healed = memories.filter(m => m.memoryType === "healed").length;
  const avgImportance = memories.length > 0 ? (memories.reduce((a, m) => a + (m.importanceScore || 0), 0) / memories.length) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", height: "100vh", padding: "20px 24px", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: "32px", fontWeight: 900, color: "#fff", letterSpacing: "-0.5px" }}>Memory Chain</div>
          <div style={{ fontSize: "14px", color: "#a8a0b4", marginTop: "2px" }}>Each block is cryptographically linked to the previous via SHA-256 hash</div>
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
          {/* Search + Stats Bar */}
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ fontSize: "14px" }}>🔍</span>
              <input type="text" placeholder="Search memories..." value={search} onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, background: "transparent", border: "none", color: "#fff", fontSize: "14px", outline: "none" }} />
            </div>
            <div style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(14,8,18,0.6)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#fff" }}>{memories.length}</div>
              <div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Blocks</div>
            </div>
            <div style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(14,8,18,0.6)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#ef4444" }}>{poisoned}</div>
              <div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Poisoned</div>
            </div>
            <div style={{ padding: "8px 16px", borderRadius: "8px", background: "rgba(14,8,18,0.6)", border: "1px solid rgba(255,255,255,0.06)", textAlign: "center" }}>
              <div style={{ fontSize: "20px", fontWeight: 900, color: "#34d399" }}>{healed}</div>
              <div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px" }}>Healed</div>
            </div>
          </div>

          {/* Chain Timeline */}
          <div style={{ flex: 1, overflowY: "auto", position: "relative" }}>
            {/* Vertical chain line */}
            <div style={{ position: "absolute", left: "15px", top: "0", bottom: "0", width: "2px", background: "rgba(255,255,255,0.08)" }} />

            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#a8a0b4", fontSize: "14px" }}>Loading chain...</div>
            ) : memories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#a8a0b4", fontSize: "14px" }}>
                {isMock ? "Demo mode — connect to CockroachDB to see memories" : "No memories in chain"}
              </div>
            ) : (
              memories.map((m, i) => {
                const isSelected = selectedId === m.memoryId;
                const trust = m.trustLevel != null ? Math.round(m.trustLevel * 100) : null;
                const isPoison = m.memoryType === "poison_attempt";
                const isHealed = m.memoryType === "healed";

                return (
                  <div key={m.memoryId} style={{ display: "flex", gap: "14px", marginBottom: "2px", cursor: "pointer" }} onClick={() => setSelectedId(isSelected ? null : m.memoryId)}>
                    {/* Node */}
                    <div style={{ position: "relative", zIndex: 1, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", width: "32px" }}>
                      <div style={{
                        width: "14px", height: "14px", borderRadius: "50%",
                        background: isSelected ? "#fff" : isPoison ? "#ef4444" : isHealed ? "#34d399" : "rgba(255,255,255,0.15)",
                        border: `2px solid ${isSelected ? "#ff5e00" : isPoison ? "#ef4444" : isHealed ? "#34d399" : "rgba(255,255,255,0.2)"}`,
                        boxShadow: isSelected ? "0 0 10px #ff5e00" : "none",
                        transition: "all 0.2s",
                      }} />
                      {i < memories.length - 1 && <div style={{ width: "1px", flex: 1, minHeight: "8px", background: "rgba(255,255,255,0.06)" }} />}
                    </div>

                    {/* Block Card */}
                    <div style={{
                      flex: 1, padding: "12px 14px", borderRadius: "8px", marginBottom: "4px",
                      background: isSelected ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.015)",
                      border: `1px solid ${isSelected ? "rgba(255,94,0,0.3)" : "rgba(255,255,255,0.04)"}`,
                      transition: "all 0.15s",
                    }}>
                      {/* Top row: type + time + agent */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                          background: isPoison ? "rgba(239,68,68,0.1)" : isHealed ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.06)",
                          color: isPoison ? "#ef4444" : isHealed ? "#34d399" : "#d4cce0",
                        }}>{m.memoryType}</span>
                        <span style={{ fontSize: "12px", color: "#a8a0b4" }}>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</span>
                        <span style={{ fontSize: "11px", color: "#666" }}>by {m.agentId}</span>
                        {trust !== null && <span style={{ marginLeft: "auto", fontSize: "12px", fontWeight: 700, color: trust >= 80 ? "#34d399" : trust >= 50 ? "#ff5e00" : "#ef4444" }}>{trust}%</span>}
                      </div>
                      {/* Content */}
                      <div style={{ fontSize: "14px", color: "#e0dce8", lineHeight: "1.5", marginBottom: "6px" }}>{m.content}</div>
                      {/* Bottom row: hash chain */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", color: "#666", fontFamily: "monospace" }}>
                        <span> importance: {m.importanceScore?.toFixed(1)}</span>
                        <span> accessed: {m.accessCount}×</span>
                        <span style={{ color: "#888" }}> hash: {m.cryptographicHash?.slice(0, 10)}…</span>
                        {m.previousHash && <span style={{ color: "#555" }}>← {m.previousHash.slice(0, 8)}…</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden" }}>
          {selected ? (
            <>
              {/* Memory Inspector — Expandable Sections */}
              <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", overflow: "auto", flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "16px" }}>🔍</span> Memory Inspector
                </div>

                {/* Section: Identity */}
                <div style={{ marginBottom: "8px" }}>
                  <div onClick={() => toggleSection("identity")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "10px", color: "#a8a0b4", transition: "transform 0.2s", transform: expandedSections.has("identity") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>Identity</span>
                    <span style={{ marginLeft: "auto", padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, background: selected.memoryType === "poison_attempt" ? "rgba(239,68,68,0.1)" : selected.memoryType === "healed" ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.05)", color: selected.memoryType === "poison_attempt" ? "#ef4444" : selected.memoryType === "healed" ? "#34d399" : "#d4cce0" }}>{selected.memoryType}</span>
                  </div>
                  {expandedSections.has("identity") && (
                    <div style={{ padding: "10px", marginTop: "4px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Memory ID</div><div style={{ fontSize: "11px", fontFamily: "monospace", color: "#00e5ff", wordBreak: "break-all" }}>{selected.memoryId}</div></div>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Agent</div><div style={{ fontSize: "13px", color: "#d4cce0" }}>{selected.agentId}</div></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Content */}
                <div style={{ marginBottom: "8px" }}>
                  <div onClick={() => toggleSection("content")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "10px", color: "#a8a0b4", transition: "transform 0.2s", transform: expandedSections.has("content") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>Content</span>
                  </div>
                  {expandedSections.has("content") && (
                    <div style={{ padding: "10px", marginTop: "4px" }}>
                      <div style={{ fontSize: "14px", color: "#d4cce0", lineHeight: "1.6", background: "rgba(255,255,255,0.02)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)" }}>{selected.content}</div>
                    </div>
                  )}
                </div>

                {/* Section: Metadata */}
                <div style={{ marginBottom: "8px" }}>
                  <div onClick={() => toggleSection("metadata")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "10px", color: "#a8a0b4", transition: "transform 0.2s", transform: expandedSections.has("metadata") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>Metadata</span>
                  </div>
                  {expandedSections.has("metadata") && (
                    <div style={{ padding: "10px", marginTop: "4px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>When Stored</div><div style={{ fontSize: "12px", color: "#d4cce0" }}>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</div></div>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Expires</div><div style={{ fontSize: "12px", color: "#d4cce0" }}>{selected.expiresAt ? new Date(selected.expiresAt).toLocaleString() : "Never"}</div></div>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Importance</div><div style={{ fontSize: "16px", fontWeight: 800, color: selected.importanceScore >= 0.7 ? "#34d399" : "#ff5e00" }}>{selected.importanceScore?.toFixed(1)}</div></div>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Trust Score</div><div style={{ fontSize: "16px", fontWeight: 800, color: "#00e5ff" }}>{selected.trustLevel != null ? `${Math.round(selected.trustLevel * 100)}%` : "—"}</div></div>
                        <div><div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "2px" }}>Accessed</div><div style={{ fontSize: "13px", color: "#d4cce0" }}>{selected.accessCount}×</div></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section: Hash Chain */}
                <div style={{ marginBottom: "8px" }}>
                  <div onClick={() => toggleSection("chain")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 10px", borderRadius: "6px", background: "rgba(255,255,255,0.02)", cursor: "pointer", border: "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ fontSize: "10px", color: "#a8a0b4", transition: "transform 0.2s", transform: expandedSections.has("chain") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#fff" }}>Cryptographic Proof</span>
                  </div>
                  {expandedSections.has("chain") && (
                    <div style={{ padding: "10px", marginTop: "4px" }}>
                      <div style={{ padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>SHA-256 Hash</div>
                        <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#00e5ff", wordBreak: "break-all", lineHeight: "1.6" }}>{selected.cryptographicHash}</div>
                      </div>
                      {selected.previousHash && (
                        <div style={{ marginTop: "6px", padding: "10px", background: "rgba(255,255,255,0.02)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.04)" }}>
                          <div style={{ fontSize: "10px", color: "#a8a0b4", textTransform: "uppercase" as const, letterSpacing: "1px", marginBottom: "4px" }}>Previous Block Hash</div>
                          <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#888", wordBreak: "break-all", lineHeight: "1.6" }}>{selected.previousHash}</div>
                        </div>
                      )}
                      <div style={{ marginTop: "6px", padding: "8px", background: "rgba(52,211,153,0.05)", borderRadius: "6px", border: "1px solid rgba(52,211,153,0.15)" }}>
                        <div style={{ fontSize: "11px", color: "#34d399", fontWeight: 600 }}>✓ Hash chain integrity verified by CockroachDB</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>Actions</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button onClick={() => navigator.clipboard.writeText(selected.cryptographicHash)} style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#d4cce0", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Copy Hash</button>
                  <button onClick={() => navigator.clipboard.writeText(selected.content)} style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#d4cce0", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Copy Content</button>
                </div>
              </div>
            </>
          ) : (
            /* No selection — show guidance */
            <div style={{ padding: "20px", borderRadius: "10px", background: "rgba(14,8,18,0.72)", border: "1px solid rgba(255,255,255,0.06)", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: "24px", marginBottom: "12px" }}>🔍</div>
              <div style={{ fontSize: "14px", color: "#fff", fontWeight: 700, marginBottom: "6px" }}>Select a Memory Block</div>
              <div style={{ fontSize: "12px", color: "#a8a0b4", lineHeight: "1.5" }}>Click any block in the chain to inspect its content, trust score, and cryptographic hash chain</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
