"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";
import { useConnection } from "@/components/DashboardLayoutWrapper";
import HealModal from "@/components/HealModal";

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

const C = {
  canvas: "var(--canvas-bg)",
  glass: "var(--glass-bg)",
  border: "#000000",
  ink: "#000000",
  body: "#111827",
  mute: "#6b7280",
  green: "#047857",
  red: "#b91c1c",
  orange: "#b45309",
  cyan: "#0369a1",
  purple: "#7c3aed"
};

export default function LogsPage({ initialMemories = [], initialTotal = 0, totalCount = 0, poisonedCount = 0, healedCount = 0 }: { initialMemories?: Memory[]; initialTotal?: number; totalCount?: number; poisonedCount?: number; healedCount?: number }) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [loading, setLoading] = useState(initialMemories.length === 0);
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["content", "chain"]));
  const [expandedThoughts, setExpandedThoughts] = useState<Set<string>>(new Set());
  const [expandedContents, setExpandedContents] = useState<Set<string>>(new Set());
  const [inspectorExpanded, setInspectorExpanded] = useState(false);
  const [healing, setHealing] = useState(false);
  const [healResult, setHealResult] = useState<string | null>(null);
  const [stats, setStats] = useState({ totalCount, poisonedCount, healedCount });
  const [showHealModal, setShowHealModal] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const { isMock } = useConnection();

  const connected = !isMock;
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Compute unique types and counts
  const typeCounts = memories.reduce((acc, m) => { acc[m.memoryType] = (acc[m.memoryType] || 0) + 1; return acc; }, {} as Record<string, number>);
  const uniqueTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

  // Removed Viewport Scroll Lock for embeddability

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const toggleThought = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedThoughts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleContent = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedContents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const healAll = () => {
    setShowHealModal(true);
  };

  const fetchMemories = useCallback(async (q?: string) => {
    if (isMock) {
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
    if (initialMemories.length === 0) {
      fetchMemories(search);
    }
    const iv = setInterval(() => fetchMemories(search), 15000);
    return () => { mountedRef.current = false; clearInterval(iv); abortRef.current?.abort(); };
  }, [search, fetchMemories, initialMemories.length]);

  const handleHealComplete = useCallback(() => {
    fetchMemories(search);
  }, [fetchMemories, search]);

  const selected = memories.find(m => m.memoryId === selectedId);
  const filteredMemories = typeFilter === "all" ? memories : memories.filter(m => m.memoryType === typeFilter);
  const poisoned = memories.filter(m => m.memoryType === "poison_attempt").length;
  const healed = memories.filter(m => m.memoryType === "healed").length;
  const avgImportance = memories.length > 0 ? (memories.reduce((a, m) => a + (m.importanceScore || 0), 0) / memories.length) : 0;

  const renderFormattedContent = (txt: string | null | undefined, memoryId: string, isCard: boolean = true) => {
    if (!txt) return null;
    // Only match <think>...</think> WITH a closing tag
    const thinkRegex = /<think>([\s\S]*?)<\/think>/;
    const match = txt.match(thinkRegex);
    const thinking = match ? match[1].trim() : null;
    const raw = match ? txt.replace(thinkRegex, "").trim() : txt;
    const isExpanded = expandedThoughts.has(memoryId);
    const isContentExpanded = expandedContents.has(memoryId);
    const CONTENT_LIMIT = 160;

    const toHtml = (str: string) => {
      let s = str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\\n/g, " ")
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      // Clean up JSON-looking content: extract human-readable parts
      s = s.replace(/Tool '([^']+)' was called with arguments:\s*\{[^}]*"content":\s*"([^"]*)"[^}]*\}\s*→?\s*result:.*$/i, (_, tool, content) => {
        return `<strong>${tool}</strong> → ${content}`;
      });
      s = s.replace(/\{"memory_type":\s*"[^"]*",\s*"content":\s*"([^"]*)"[^}]*\}/g, (_, content) => {
        return content;
      });
      return s;
    };

    const cleanContent = toHtml(raw);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* Thinking — only show in inspector (not card) */}
        {thinking && !isCard && (
          <div>
            {isExpanded ? (
              <div style={{
                background: "#f9fafb", border: "1.5px dashed #9ca3af",
                borderRadius: "6px", padding: "10px 12px",
                fontSize: "12px", color: "#4b5563",
                fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5,
                maxHeight: "140px", overflowY: "auto"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 800, fontSize: "10px", color: C.orange, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Thinking Process
                  </span>
                  <span onClick={(e) => toggleThought(memoryId, e)} style={{ fontSize: "10px", fontWeight: 900, color: C.red, cursor: "pointer", textDecoration: "underline" }}>
                    Collapse
                  </span>
                </div>
                <div dangerouslySetInnerHTML={{ __html: toHtml(thinking) }} />
              </div>
            ) : (
              <div onClick={(e) => toggleThought(memoryId, e)} style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                fontSize: "10px", color: C.orange, background: "#fffbeb",
                border: "1px solid #d97706", padding: "3px 8px", borderRadius: "4px",
                fontFamily: "var(--font-mono)", fontWeight: 800, cursor: "pointer",
                transition: "all 0.15s ease-in-out", width: "fit-content"
              }}>
                <span style={{ fontSize: "8px" }}>▶</span>
                <span>View Thinking</span>
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        {raw && (() => {
          const isLong = raw.length > CONTENT_LIMIT;
          const displayRaw = isLong ? raw.slice(0, CONTENT_LIMIT) + "..." : raw;
          const displayText = toHtml(displayRaw);
          return (
            <div>
              <div
                style={{ fontSize: isCard ? "13px" : "14px", color: "#1f2937", lineHeight: "1.5", fontWeight: 600, fontFamily: "var(--font-sans)" }}
                dangerouslySetInnerHTML={{ __html: displayText }}
              />
              {isLong && (
                <div style={{ position: "relative", display: "inline-block", marginTop: "4px" }} className="hover-expand-trigger">
                  <style>{`
                    .hover-expand-trigger:hover .hover-expand-popover {
                      opacity: 1;
                      visibility: visible;
                      transform: translateY(0);
                    }
                  `}</style>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: "3px",
                    fontSize: "10px", fontWeight: 800, color: C.cyan, cursor: "help",
                    fontFamily: "var(--font-mono)", padding: "2px 6px", borderRadius: "4px", background: "#f0f9ff", border: "1px solid #bae6fd"
                  }}>
                    🔍 Hover to read full memory
                  </div>
                  
                  {/* Floating Popover */}
                  <div className="hover-expand-popover" style={{
                    opacity: 0, visibility: "hidden", transform: "translateY(5px)", transition: "all 0.2s ease",
                    position: "absolute", top: "100%", left: "0", zIndex: 100, width: "350px", marginTop: "8px",
                    background: "#ffffff", border: "3px solid #000000", borderRadius: "8px", padding: "16px",
                    boxShadow: "4px 4px 0px #000000", maxHeight: "300px", overflowY: "auto", cursor: "default"
                  }}>
                    <div style={{ fontSize: "11px", fontWeight: 900, color: C.purple, fontFamily: "var(--font-mono)", marginBottom: "8px", textTransform: "uppercase" }}>Full Content</div>
                    <div style={{ fontSize: "13px", color: "#1f2937", lineHeight: "1.5", fontWeight: 600, fontFamily: "var(--font-sans)" }} dangerouslySetInnerHTML={{ __html: toHtml(raw) }} />
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {showHealModal && (
        <HealModal
          agentId="test-heal-demo"
          onClose={() => setShowHealModal(false)}
          onComplete={handleHealComplete}
        />
      )}
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: "16px" }}>
        <div>
          <div className="welcome-title" style={{ margin: 0 }}>Memory Chain</div>
          <div style={{ fontSize: "14px", color: C.mute, marginTop: "2px", fontWeight: 600 }}>Each block is cryptographically linked to the previous via SHA-256 hash</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
          {/* Compact stat pills */}
          {[
            { label: "Total", value: stats.totalCount, color: "#000000" },
            { label: "Showing", value: memories.length, color: C.cyan },
            { label: "Poisoned", value: stats.poisonedCount, color: stats.poisonedCount > 0 ? C.red : "#000000" },
            { label: "Healed", value: stats.healedCount, color: C.green },
            { label: "Unhealed", value: Math.max(0, stats.poisonedCount - stats.healedCount), color: stats.poisonedCount > stats.healedCount ? C.red : "#000000" },
          ].map((s, i) => (
            <div key={i} style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              padding: "6px 14px", borderRadius: "8px",
              background: "#ffffff", border: "2px solid #000000",
              boxShadow: "1.5px 1.5px 0px #000000"
            }}>
              <span style={{ fontSize: "9px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800, fontFamily: "var(--font-sans)" }}>{s.label}</span>
              <span style={{ fontSize: "16px", fontWeight: 950, color: s.color, fontFamily: "var(--font-sans)" }}>{s.value}</span>
            </div>
          ))}
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "6px",
            background: connected ? "#f0fdf4" : "#fff7ed",
            border: `2.5px solid #000000`,
            boxShadow: "1.5px 1.5px 0px #000000"
          }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: connected ? C.green : C.orange }} />
            <span style={{ fontSize: "12px", fontWeight: 900, color: connected ? C.green : C.orange, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}>
              {connected ? "LIVE" : "DEMO MODE"}
            </span>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "6px",
            background: "#f0fdf4", border: "2px solid #000000",
            boxShadow: "1.5px 1.5px 0px #000000"
          }}>
            <span style={{ fontSize: "12px", color: C.green }}>✓</span>
            <span style={{ fontSize: "11px", fontWeight: 900, color: C.green, fontFamily: "var(--font-mono)" }}>CHAIN VERIFIED</span>
          </div>
          <button
            onClick={healAll}
            disabled={stats.poisonedCount === 0}
            style={{
              padding: "5px 14px", borderRadius: "6px",
              background: stats.poisonedCount > 0 ? "#fef2f2" : "#f3f4f6",
              border: stats.poisonedCount > 0 ? `2px solid ${C.red}` : "2px solid #d1d5db",
              color: stats.poisonedCount > 0 ? C.red : "#9ca3af",
              fontSize: "11px", fontWeight: 900, 
              cursor: stats.poisonedCount > 0 ? "pointer" : "not-allowed",
              fontFamily: "var(--font-mono)",
              boxShadow: stats.poisonedCount > 0 ? "1.5px 1.5px 0px #000000" : "none",
              transition: "all 0.2s"
            }}
          >
            🛡 Heal {stats.poisonedCount} Poison{stats.poisonedCount !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
      {/* 2-Column Layout: Chain (left) + Detail Panel (right) */}
      <div style={{ display: "grid", gridTemplateColumns: inspectorExpanded ? "1fr" : "1fr 480px", gap: "20px", flex: 1, minHeight: 0, overflow: "hidden" }}>

        {/* Left: Chain Bento Panel */}
        {!inspectorExpanded && (
        <div className="bento-panel" style={{ display: "flex", flexDirection: "column", height: "100%", padding: "20px", overflow: "hidden" }}>
          {/* Search + Filter Chips */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "center", gap: "8px",
                padding: "8px 14px", borderRadius: "8px",
                background: "#ffffff", border: "2.5px solid #000000",
                boxShadow: "2px 2px 0px #000000"
              }}>
                <span style={{ fontSize: "14px" }}>🔍</span>
                <input type="text" placeholder="Search memories..." value={search} onChange={e => setSearch(e.target.value)}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#000000", fontSize: "14px", outline: "none", fontFamily: "var(--font-sans)", fontWeight: 700 }} />
              </div>
            </div>
            {/* Category filter chips */}
            {uniqueTypes.length > 1 && (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => setTypeFilter("all")} style={{
                  padding: "6px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 900, cursor: "pointer",
                  border: `2px solid #000000`,
                  background: typeFilter === "all" ? "#fef3c7" : "#ffffff",
                  color: "#000000",
                  boxShadow: typeFilter === "all" ? "2.5px 2.5px 0px #000000" : "1px 1px 0px #000000",
                  fontFamily: "var(--font-mono)",
                  transform: typeFilter === "all" ? "translate(-1.5px, -1.5px)" : "none",
                  transition: "all 0.15s ease"
                }}>All ({memories.length})</button>
                {uniqueTypes.map(([type, count]) => (
                  <button key={type} onClick={() => setTypeFilter(typeFilter === type ? "all" : type)} style={{
                    padding: "6px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 900, cursor: "pointer",
                    border: `2px solid #000000`,
                    background: typeFilter === type ? "#fef3c7" : "#ffffff",
                    color: "#000000",
                    boxShadow: typeFilter === type ? "2.5px 2.5px 0px #000000" : "1px 1px 0px #000000",
                    fontFamily: "var(--font-mono)",
                    transform: typeFilter === type ? "translate(-1.5px, -1.5px)" : "none",
                    transition: "all 0.15s ease"
                  }}>{type} ({count})</button>
                ))}
              </div>
            )}
            {/* Category Legend — compact */}
            <div style={{
              display: "flex", gap: "14px", flexWrap: "wrap",
              padding: "6px 12px", borderRadius: "6px",
              background: "#ffffff", border: "1.5px solid #000000",
            }}>
              {[
                { color: C.red, label: "poison" },
                { color: C.green, label: "healed" },
                { color: C.purple, label: "fact" },
                { color: C.cyan, label: "safety" },
                { color: C.orange, label: "semantic" },
                { color: "#3b82f6", label: "tool" },
                { color: "#6366f1", label: "task" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: "10px", fontWeight: 800, color: "#6b7280", fontFamily: "var(--font-mono)" }}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dividing Border between Controls and Scrollable Chain */}
          <div style={{ height: "3px", background: "#000000", margin: "14px 0", flexShrink: 0 }} />

          {/* Chain Timeline Scroll Container */}
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "14px", paddingLeft: "4px", paddingBottom: "30px" }}>
            <div style={{ position: "relative" }}>
            {/* Vertical chain line */}
            <div style={{ position: "absolute", left: "15px", top: "0", bottom: "0", width: "3px", background: "#000000", zIndex: 1 }} />

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: "14px", marginBottom: "4px", position: "relative" }}>
                    <div style={{
                      position: "absolute", left: "10.5px", top: "20px", width: "12px", height: "12px",
                      borderRadius: "50%", background: "#e5e7eb", border: "2px solid #000000", zIndex: 2
                    }} />
                    <div style={{ flex: 1, padding: "16px 20px", marginLeft: "32px", borderRadius: "10px", background: "#ffffff", border: "2.5px solid #000000", boxShadow: "1.5px 1.5px 0px #000000" }}>
                      <div style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
                        <div style={{ width: "80px", height: "20px", borderRadius: "4px", background: "#f3f4f6", border: "1.5px solid #000000" }} />
                        <div style={{ width: "120px", height: "14px", borderRadius: "4px", background: "#f3f4f6" }} />
                      </div>
                      <div style={{ width: "80%", height: "16px", borderRadius: "4px", background: "#f3f4f6", marginBottom: "6px" }} />
                    </div>
                  </div>
                ))}
              </div>
            ) : memories.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: C.mute, fontSize: "14px", fontWeight: 800, fontFamily: "var(--font-mono)" }}>
                {isMock ? "Demo mode — connect to CockroachDB to see memories" : "No memories in chain"}
              </div>
            ) : (
              filteredMemories.map((m, i) => {
                const isSelected = selectedId === m.memoryId;
                const trust = m.trustLevel != null ? Math.round((m.trustLevel / 4) * 100) : null;
                const isPoison = m.memoryType === "poison_attempt";
                const isHealed = m.memoryType === "healed";
                // Check chain integrity: does previous_hash match the older memory's cryptographic_hash?
                // We must use the original unfiltered 'memories' array to prevent false breaks when filtering.
                const originalIndex = memories.findIndex(mem => mem.memoryId === m.memoryId);
                const olderMemory = originalIndex >= 0 && originalIndex < memories.length - 1 ? memories[originalIndex + 1] : null;
                const olderIsHealed = olderMemory?.memoryType === "healed";
                const chainBroken = olderMemory && m.previousHash && olderMemory.cryptographicHash !== m.previousHash && !olderIsHealed;
                const isGenesis = !m.previousHash;

                return (
                  <div key={m.memoryId} className="chain-card" style={{ display: "flex", gap: "14px", marginBottom: "20px", cursor: "pointer", position: "relative" }} onClick={() => setSelectedId(isSelected ? null : m.memoryId)}>
                    {/* Chain break indicator */}
                    {chainBroken && (
                      <div style={{
                        position: "absolute", left: "0px", top: "-14px",
                        fontSize: "11px", fontWeight: 900, color: "#ffffff",
                        background: C.red, border: `2px solid #000000`,
                        borderRadius: "4px", padding: "3px 10px",
                        fontFamily: "var(--font-mono)", zIndex: 3,
                        whiteSpace: "nowrap", boxShadow: "2px 2px 0px #000000",
                        letterSpacing: "0.5px"
                      }}>
                        ⚠ BROKEN CHAIN
                      </div>
                    )}
                    {/* Absolute Node circle with glow */}
                    <div className="chain-dot" style={{
                      position: "absolute",
                      left: "10.5px",
                      top: "22px",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      background: isPoison ? C.red : isHealed ? C.green : chainBroken ? C.red : m.memoryType === "fact" ? C.purple : m.memoryType === "safety_rule" ? C.cyan : m.memoryType === "semantic" ? C.orange : m.memoryType === "tool_execution" ? "#3b82f6" : m.memoryType === "task" ? "#6366f1" : "#000000",
                      border: `2.5px solid #000000`,
                      boxShadow: isSelected
                        ? `0 0 0 4px rgba(0,0,0,0.15), 0 0 12px 4px ${isPoison ? 'rgba(239,68,68,0.4)' : isHealed ? 'rgba(16,185,129,0.4)' : chainBroken ? 'rgba(239,68,68,0.4)' : 'rgba(0,0,0,0.2)'}`
                        : `0 0 6px 2px ${isPoison ? 'rgba(239,68,68,0.3)' : isHealed ? 'rgba(16,185,129,0.3)' : chainBroken ? 'rgba(239,68,68,0.3)' : 'rgba(0,0,0,0.1)'}`,
                      transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
                      zIndex: 2
                    }} />

                    {/* Block Card */}
                    <div style={{
                      flex: 1, padding: "20px 24px", borderRadius: "10px",
                      background: "#ffffff", marginLeft: "36px",
                      border: isSelected ? `3px solid #000000` : `2.5px solid #000000`,
                      boxShadow: isSelected ? "6px 6px 0px #000000" : "2px 2px 0px #000000",
                      transform: isSelected ? "translate(-2px, -4px)" : "none",
                      transition: "all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                    }}>
                      {/* Top row: type + time + trust badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: "6px",
                          padding: "3px 10px", borderRadius: "4px", fontSize: "13px", fontWeight: 900,
                          background: isPoison ? `${C.red}12` : isHealed ? `${C.green}12` : "#f3f4f6",
                          color: isPoison ? C.red : isHealed ? C.green : "#000000",
                          border: "2px solid #000000",
                          fontFamily: "var(--font-mono)"
                        }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: isPoison ? C.red : isHealed ? C.green : m.memoryType === "fact" ? C.purple : m.memoryType === "safety_rule" ? C.cyan : m.memoryType === "semantic" ? C.orange : m.memoryType === "tool_execution" ? "#3b82f6" : m.memoryType === "task" ? "#6366f1" : "#000000", border: "1px solid #000000", flexShrink: 0 }} />
                          {m.memoryType}
                        </span>
                        <span style={{ fontSize: "13px", color: C.mute, fontWeight: 700, fontFamily: "var(--font-mono)" }}>{m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}</span>
                        {trust !== null && trust !== undefined && (
                          <span style={{
                            marginLeft: "auto", padding: "3px 10px", borderRadius: "6px", fontSize: "13px", fontWeight: 900,
                            background: trust >= 80 ? "#f0fdf4" : trust >= 50 ? "#fffbeb" : "#fef2f2",
                            color: trust >= 80 ? C.green : trust >= 50 ? C.orange : C.red,
                            border: `2px solid #000000`,
                            boxShadow: "1px 1px 0px #000000",
                            fontFamily: "var(--font-mono)"
                          }}>
                            Trust {trust}%
                          </span>
                        )}
                      </div>
                      {/* Formatted Content */}
                      {renderFormattedContent(m.content, m.memoryId, true)}
                      {/* Agent */}
                      <div style={{ fontSize: "11px", color: C.mute, marginTop: "6px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>by {m.agentId}</div>
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>
        )}

        {/* Right: Detail Panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", overflow: "hidden", height: "100%" }}>
          {/* Memory Inspector */}
          {selected ? (
            <div className="bento-panel" style={{ padding: "20px", display: "flex", flexDirection: "column", flex: 1, overflowY: "auto", border: "3px solid #000000", boxShadow: "4px 4px 0px #000000" }}>
              <div style={{ fontSize: "15px", fontWeight: 900, color: "#000000", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "1px" }}>
                <span style={{ fontSize: "16px" }}>🔍</span> INSPECTING BLOCK
                <button
                  onClick={() => setInspectorExpanded(!inspectorExpanded)}
                  style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: "6px", border: "2px solid #000000", background: inspectorExpanded ? "#000000" : "#ffffff", color: inspectorExpanded ? "#ffffff" : "#000000", fontSize: "11px", fontWeight: 900, cursor: "pointer", boxShadow: "1.5px 1.5px 0px #000000", fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {inspectorExpanded ? "Collapse" : "Expand"}
                </button>
              </div>
              <div style={{ height: "3px", background: "#000000", marginBottom: "14px" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
                {/* Identity */}
                <div>
                  <div onClick={() => toggleSection("identity")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "6px", background: "#f9fafb", border: "2px solid #000000", cursor: "pointer", boxShadow: "1px 1px 0px #000000" }}>
                    <span style={{ fontSize: "10px", color: C.ink, transition: "transform 0.2s", transform: expandedSections.has("identity") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000" }}>Identity</span>
                    <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 900, background: selected.memoryType === "poison_attempt" ? C.red : selected.memoryType === "healed" ? C.green : "#000000", color: "#ffffff", border: "1.5px solid #000000" }}>{selected.memoryType}</span>
                  </div>
                  {expandedSections.has("identity") && (
                    <div style={{ padding: "10px", background: "#ffffff", border: "2px solid #000000", borderTop: "none", borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Memory ID</div>
                        <div style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: 700, color: "#000000", wordBreak: "break-all" }}>{selected.memoryId}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Agent</div>
                        <div style={{ fontSize: "13px", fontFamily: "monospace", fontWeight: 700, color: "#000000" }}>{selected.agentId}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div>
                  <div onClick={() => toggleSection("content")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "6px", background: "#f9fafb", border: "2px solid #000000", cursor: "pointer", boxShadow: "1px 1px 0px #000000" }}>
                    <span style={{ fontSize: "10px", color: C.ink, transition: "transform 0.2s", transform: expandedSections.has("content") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000" }}>Content</span>
                  </div>
                  {expandedSections.has("content") && (
                    <div style={{ padding: "10px", background: "#ffffff", border: "2px solid #000000", borderTop: "none", borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", maxHeight: "400px", overflowY: "auto" }}>
                      {renderFormattedContent(selected.content, "inspector", false)}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div>
                  <div onClick={() => toggleSection("metadata")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "6px", background: "#f9fafb", border: "2px solid #000000", cursor: "pointer", boxShadow: "1px 1px 0px #000000" }}>
                    <span style={{ fontSize: "10px", color: C.ink, transition: "transform 0.2s", transform: expandedSections.has("metadata") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000" }}>Metadata</span>
                  </div>
                  {expandedSections.has("metadata") && (
                    <div style={{ padding: "10px", background: "#ffffff", border: "2px solid #000000", borderTop: "none", borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <div><div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>When Stored</div><div style={{ fontSize: "12px", color: "#000000", fontWeight: 700 }}>{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}</div></div>
                      <div><div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Expires</div><div style={{ fontSize: "12px", color: "#000000", fontWeight: 700 }}>{selected.expiresAt ? new Date(selected.expiresAt).toLocaleString() : "Never"}</div></div>
                      <div><div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Importance</div><div style={{ fontSize: "16px", fontWeight: 950, color: selected.importanceScore >= 0.7 ? C.green : C.orange }}>{selected.importanceScore?.toFixed(1)}</div></div>
                      <div><div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Trust Score</div><div style={{ fontSize: "16px", fontWeight: 950, color: C.purple }}>{selected.trustLevel != null ? `${Math.round((selected.trustLevel / 4) * 100)}%` : "—"}</div></div>
                      <div style={{ gridColumn: "span 2" }}><div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800 }}>Accessed</div><div style={{ fontSize: "12px", color: "#000000", fontWeight: 700 }}>{selected.accessCount} times</div></div>
                    </div>
                  )}
                </div>

                {/* Hash Chain */}
                <div>
                  <div onClick={() => toggleSection("chain")} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "6px", background: "#f9fafb", border: "2px solid #000000", cursor: "pointer", boxShadow: "1px 1px 0px #000000" }}>
                    <span style={{ fontSize: "10px", color: C.ink, transition: "transform 0.2s", transform: expandedSections.has("chain") ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#000000" }}>Cryptographic Proof</span>
                  </div>
                  {expandedSections.has("chain") && (
                    <div style={{ padding: "10px", background: "#ffffff", border: "2px solid #000000", borderTop: "none", borderBottomLeftRadius: "6px", borderBottomRightRadius: "6px", display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
                      <div>
                        <div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800, marginBottom: "4px" }}>SHA-256 Hash</div>
                        <div style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: 700, color: "#000000", wordBreak: "break-all", background: "#f9fafb", padding: "8px", borderRadius: "4px", border: "1.5px solid #000000" }}>{selected.cryptographicHash}</div>
                      </div>
                      {selected.previousHash && (
                        <div>
                          <div style={{ fontSize: "10px", color: C.mute, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 800, marginBottom: "4px" }}>Previous Hash</div>
                          <div style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: 700, color: C.mute, wordBreak: "break-all", background: "#f9fafb", padding: "8px", borderRadius: "4px", border: "1.5px solid #e5e7eb" }}>{selected.previousHash}</div>
                        </div>
                      )}
                      <div style={{ marginTop: "4px", padding: "10px", background: "#f0fdf4", borderRadius: "6px", border: "2px solid #000000", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "14px", color: C.green }}>✓</span>
                        <div>
                          <div style={{ fontSize: "12px", color: C.green, fontWeight: 900 }}>Chain Validated</div>
                          <div style={{ fontSize: "10px", color: "#374151", fontWeight: 700 }}>Integrity verified by CockroachDB</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "10px", marginTop: "14px", flexShrink: 0 }}>
                <button onClick={() => navigator.clipboard.writeText(selected.cryptographicHash)} style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "2px solid #000000", background: "#ffffff", color: "#000000", fontSize: "12px", fontWeight: 900, boxShadow: "1.5px 1.5px 0px #000000", cursor: "pointer" }}>Copy Hash</button>
                <button onClick={() => navigator.clipboard.writeText(selected.content)} style={{ flex: 1, padding: "8px 12px", borderRadius: "6px", border: "2px solid #000000", background: "#ffffff", color: "#000000", fontSize: "12px", fontWeight: 900, boxShadow: "1.5px 1.5px 0px #000000", cursor: "pointer" }}>Copy Content</button>
              </div>
            </div>
          ) : (
            /* No selection guidance card */
            <div className="bento-panel" style={{ padding: "30px 20px", display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
              <div style={{ fontSize: "36px", marginBottom: "14px" }}>🔍</div>
              <div style={{ fontSize: "16px", color: "#000000", fontWeight: 900, marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>Select a Memory Block</div>
              <div style={{ fontSize: "13px", color: C.mute, lineHeight: "1.5", fontWeight: 700 }}>Click any block in the chain to inspect its content, trust score, and cryptographic hash chain</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
