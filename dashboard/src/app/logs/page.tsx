"use client";

import { useEffect, useState } from "react";

interface Memory {
  memoryId: string;
  agentId: string;
  memoryType: string;
  content: string;
  metadata: any;
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

  useEffect(() => {
    async function fetchMemories() {
      setLoading(true);
      try {
        const queryParams = search ? `?search=${encodeURIComponent(search)}` : "";
        const res = await fetch(`/api/memories${queryParams}`);
        if (!res.ok) {
          throw new Error("Failed to fetch memories");
        }
        const data = await res.json();
        setMemories(data.memories || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      fetchMemories();
    }, 300); // Debounce search input

    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div>
      <div className="eyebrow">Data Viewer</div>
      <div className="title-xl">Memory Registry</div>
      <p className="paragraph">
        Inspect and search the complete list of long-term semantic, episodic, and cache memories stored on CockroachDB.
      </p>

      {/* Search Input */}
      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Filter memories by content or type..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="alert-box medium">
          <div className="alert-header medium">
            <span>Error</span> FETCH FAILED
          </div>
          <div className="alert-desc">{error}</div>
        </div>
      )}

      {/* Styled Data Table with Fixed Column Groups */}
      <div className="panel">
        <div className="table-container">
          <table className="data-table">
            <colgroup>
              <col style={{ width: "12%" }} />
              <col style={{ width: "42%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "12%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Type</th>
                <th>Content</th>
                <th>Importance</th>
                <th>Accesses</th>
                <th>Created At</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--mute)" }}>
                    Searching memory registry...
                  </td>
                </tr>
              ) : memories.length > 0 ? (
                memories.map((m) => (
                  <tr key={m.memoryId}>
                    <td>
                      <span className={`badge-mono ${m.memoryType === "fact" ? "fact" : ""}`}>
                        {m.memoryType}
                      </span>
                    </td>
                    <td style={{ wordBreak: "break-word", paddingRight: "16px", color: "var(--ink)" }}>
                      {m.content}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--accent-sunset)" }}>
                      {m.importanceScore.toFixed(1)}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}>
                      {m.accessCount}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--body)" }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td 
                      style={{ 
                        fontFamily: "var(--font-mono)", 
                        fontSize: "11px", 
                        color: "var(--mute)", 
                        overflow: "hidden", 
                        textOverflow: "ellipsis", 
                        whiteSpace: "nowrap" 
                      }}
                      title={m.cryptographicHash}
                    >
                      {m.cryptographicHash}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "var(--mute)" }}>
                    No memories match the filter query.
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
