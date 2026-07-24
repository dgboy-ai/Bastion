"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

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
}

export default function LogsPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function fetchMemories() {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const queryParams = search ? `?search=${encodeURIComponent(search)}` : "";
        const res = await fetchWithTimeout(`/api/memories${queryParams}`, { signal: ac.signal });
        if (cancelled || !mountedRef.current) return;
        if (!res.ok) {
          throw new Error("Failed to fetch memories");
        }
        const json = await res.json();
        if (cancelled) return;
        const data = json.data || json;
        setMemories(data.memories || []);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchMemories();
    }, 300); // Debounce search input

    return () => {
      cancelled = true;
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [search]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Title Header */}
      <div>
        <div className="welcome-title">Memory Registry</div>
        <div className="welcome-subtitle">Inspect, query, and search the complete list of long-term semantic, episodic, and cache memories stored on CockroachDB.</div>
      </div>

      {error && (
        <div className="alert-box medium">
          <div className="alert-header medium">
            <span>Error</span> FETCH FAILED
          </div>
          <div className="alert-desc">{error}</div>
          <button
            className="btn btn-outline"
            style={{ marginTop: "8px", fontSize: "12px", padding: "4px 14px" }}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Styled Data Table with Integrated Cyberpunk Search Bar */}
      <div className="panel" style={{ display: "flex", flexDirection: "column", gap: "20px", padding: "24px" }}>
        
        {/* Integrated Header and Search bar wrapper */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "20px", flexWrap: "wrap", borderBottom: "1px solid var(--glass-border)", paddingBottom: "18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#ffffff" }}>Ledger Entries</span>
            <span className="badge-mono" style={{ fontSize: "9.5px", padding: "2px 6px" }}>
              {memories.length} records active
            </span>
          </div>
          
          {/* Cyberpunk Search Input Field */}
          <div className="header-search" style={{ width: "380px", background: "rgba(255, 255, 255, 0.015)" }}>
            <span style={{ fontSize: "14px", color: "var(--mute)" }}>🔍</span>
            <input
              type="text"
              placeholder="Search by memory content, type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ fontSize: "12.5px" }}
            />
          </div>
        </div>

        {/* Scrollable Data Table Container */}
        <div className="table-container" style={{ maxHeight: "560px", overflowY: "auto" }}>
          <table className="data-table">
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--canvas-card)", backdropFilter: "blur(8px)" }}>Type</th>
                <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--canvas-card)", backdropFilter: "blur(8px)" }}>Content</th>
                <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--canvas-card)", backdropFilter: "blur(8px)" }}>Importance</th>
                <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--canvas-card)", backdropFilter: "blur(8px)" }}>Accesses</th>
                <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--canvas-card)", backdropFilter: "blur(8px)" }}>Created At</th>
                <th style={{ position: "sticky", top: 0, zIndex: 1, backgroundColor: "var(--canvas-card)", backdropFilter: "blur(8px)" }}>Hash</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px 0", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    SYNCHRONIZING MEMORIES PIPELINE...
                  </td>
                </tr>
              ) : memories.length > 0 ? (
                memories.map((m) => {
                  // Generate custom badges for different memory types matching dashboard mix
                  const isFact = m.memoryType === "fact";
                  const isCache = m.memoryType.includes("cache");
                  const badgeClass = isFact ? "store" : isCache ? "conflict" : "anomaly";

                  return (
                    <tr key={m.memoryId}>
                      <td style={{ padding: "12px 14px" }}>
                        <span className={`badge-mono ${badgeClass}`} style={{ fontSize: "8.5px", padding: "2px 6px" }}>
                          {m.memoryType}
                        </span>
                      </td>
                      <td style={{ wordBreak: "break-word", padding: "12px 14px", paddingRight: "16px", color: "var(--ink)", fontSize: "12.5px" }}>
                        {m.content}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-sunset)", fontWeight: 700 }}>
                        {m.importanceScore != null ? m.importanceScore.toFixed(1) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--body)" }}>
                        {m.accessCount}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--mute)" }}>
                        {m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}
                      </td>
                      <td 
                        style={{ 
                          padding: "12px 14px",
                          fontFamily: "var(--font-mono)", 
                          fontSize: "11px", 
                          color: "var(--mute)", 
                          overflow: "hidden", 
                          textOverflow: "ellipsis", 
                          whiteSpace: "nowrap" 
                        }}
                        title={m.cryptographicHash}
                      >
                        {(m.cryptographicHash ?? "—").slice(0, 14)}...
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "40px 0", color: "var(--mute)", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                    NO MEMORIES MATCHED YOUR ACTIVE REGISTRY FILTER QUERY
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
