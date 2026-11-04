"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface Skill {
  name: string;
  description: string;
  compatibility: string;
  version: string;
  author: string;
  domain: string;
}

interface SkillDetail extends Skill {
  content: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  cockroachdb: "#f97316",
  aws: "#ec4899",
  default: "#0ea5e9",
};

export default function SkillsContent() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState<string>("all");
  const [selected, setSelected] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const cancelledRef = useRef(false);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/skills");
      if (!res.ok) throw new Error(`Failed to load skills (HTTP ${res.status})`);
      const json = await res.json();
      if (cancelledRef.current) return;
      setSkills(json.skills ?? []);
      setDomains(json.domains ?? []);
      setTotal(json.total ?? 0);
    } catch (err: unknown) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load skills");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    loadSkills();
    return () => {
      cancelledRef.current = true;
    };
  }, [loadSkills]);

  const openSkill = useCallback(async (name: string) => {
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/skills?name=${encodeURIComponent(name)}`);
      if (!res.ok) throw new Error(`Skill '${name}' not found`);
      const json = await res.json();
      setSelected(json.skill as SkillDetail);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load skill detail");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills
      .filter(s => selectedDomain === "all" || s.domain === selectedDomain)
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [skills, query, selectedDomain]);

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="welcome-section">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h1 className="title-lg" style={{ margin: 0 }}>CockroachDB Agent Skills</h1>
          <span className="badge badge-green" style={{ fontFamily: "var(--font-mono)", fontSize: "11px" }}>CRDB TOOL #4</span>
        </div>
        <p className="welcome-subtitle" style={{ marginTop: "6px" }}>
          Machine-executable playbooks for cluster operations — health checks, performance triage, security audits, capacity planning. These power Bastion&apos;s skills engine and are exposed over MCP.
        </p>
      </div>

      {/* Tool count + domain filter */}
      <div className="panel" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ fontSize: "28px", fontWeight: 900, fontFamily: "var(--font-sg)", color: "var(--ink)" }}>{loading ? "…" : total}</span>
          <span style={{ fontSize: "12px", color: "var(--mute)", fontWeight: 700 }}>skills registered</span>
        </div>
        <div style={{ width: "1px", height: "28px", background: "var(--faint)" }} />
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {["all", ...domains].map(d => (
            <button
              key={d}
              onClick={() => setSelectedDomain(d)}
              className={selectedDomain === d ? "btn btn-primary" : "btn btn-outline"}
              style={{ padding: "6px 14px", fontSize: "12px", textTransform: "capitalize" }}
            >
              {d === "all" ? "All" : d}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search skills — e.g. cluster, security, benchmark…"
        style={{
          width: "100%",
          padding: "14px 18px",
          borderRadius: "var(--radius-sm)",
          border: "2.5px solid #000000",
          background: "var(--canvas-card)",
          fontSize: "14px",
          fontWeight: 600,
          color: "var(--ink)",
          outline: "none",
          boxShadow: "var(--shadow-sm)",
          fontFamily: "var(--font-sans)",
        }}
      />

      {error && (
        <div className="panel" style={{ border: "1px solid var(--accent-sunset)", background: "rgba(239,68,68,0.03)" }}>
          <div style={{ fontSize: "13px", color: "var(--accent-sunset)", fontWeight: 700 }}>{error}</div>
        </div>
      )}

      {/* Skills grid */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: "140px", borderRadius: "var(--radius-sm)" }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px" }}>
          {filtered.map(s => {
            const color = DOMAIN_COLORS[s.domain] ?? DOMAIN_COLORS.default;
            return (
              <button
                key={s.name}
                onClick={() => openSkill(s.name)}
                className="panel"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  padding: "18px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  border: "2.5px solid #000000",
                  background: selected?.name === s.name ? "var(--canvas-elevated)" : "var(--canvas-card)",
                  boxShadow: selected?.name === s.name ? "var(--shadow-md)" : "var(--shadow-sm)",
                  fontFamily: "var(--font-sans)",
                  color: "var(--ink)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ width: "8px", height: "8px", background: color, borderRadius: "50%", border: "1.5px solid #000000", flexShrink: 0 }} />
                  <span style={{ fontSize: "15px", fontWeight: 900, fontFamily: "var(--font-sg)", letterSpacing: "0.3px" }}>{s.name}</span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--mute)", lineHeight: 1.55, margin: 0, fontWeight: 500 }}>{s.description}</p>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "auto" }}>
                  <span className="badge" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>{s.domain}</span>
                  <span className="badge" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>v{s.version || "1.0"}</span>
                  <span className="badge" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>by {s.author}</span>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && !loading && (
            <div className="panel" style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
              <div style={{ fontSize: "14px", color: "var(--mute)", fontWeight: 700 }}>No skills match &quot;{query}&quot; in domain &quot;{selectedDomain}&quot;.</div>
            </div>
          )}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="panel" style={{ border: "2.5px solid #000000", boxShadow: "var(--shadow-md)", padding: "0", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 24px", borderBottom: "2px solid #000000", background: "var(--canvas-elevated)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <h2 style={{ fontSize: "20px", fontWeight: 900, fontFamily: "var(--font-sg)", margin: 0, color: "var(--ink)" }}>{selected.name}</h2>
                <span className="badge badge-blue" style={{ fontSize: "10px", fontFamily: "var(--font-mono)" }}>{selected.domain}</span>
              </div>
              <p style={{ fontSize: "13px", color: "var(--mute)", margin: "8px 0 0 0", maxWidth: "720px", lineHeight: 1.5 }}>{selected.description}</p>
              {selected.compatibility && (
                <p style={{ fontSize: "12px", color: "var(--body)", margin: "10px 0 0 0", fontFamily: "var(--font-mono)" }}>
                  <span style={{ fontWeight: 700, color: "var(--ink)" }}>Compatibility:</span> {selected.compatibility}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              className="btn btn-outline"
              style={{ flexShrink: 0, fontSize: "12px" }}
            >
              Close
            </button>
          </div>
          <div style={{ padding: "20px 24px", maxHeight: "480px", overflowY: "auto" }}>
            {detailLoading ? (
              <div className="skeleton" style={{ height: "200px" }} />
            ) : (
              <pre style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--body)", whiteSpace: "pre-wrap", lineHeight: 1.65, margin: 0 }}>{selected.content}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
