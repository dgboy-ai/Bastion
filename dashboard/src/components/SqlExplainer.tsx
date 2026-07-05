"use client";

import { useState } from "react";

interface SqlExplainerProps {
  queryType: "search" | "timetravel" | "cdc" | "cspann" | "audit" | "heal";
  agentId?: string;
  timestamp?: string;
  memoryId?: string;
  onClose?: () => void;
}

const SQL_QUERIES: Record<string, { title: string; description: string; sql: string; crdbFeature: string }> = {
  search: {
    title: "Semantic Vector Search",
    description:
      "C-SPANN similarity search with cognitive decay weighting. Returns memories ranked by relevance and importance.",
    sql: `-- C-SPANN Vector Similarity Search with Decay Weighting
SELECT
    memory_id, content, cryptographic_hash,
    importance_score,
    -- Decay-adjusted score: relevance × importance / time_decay
    (1.0 - (embedding <=> $1::vector(1024)))
      * importance_score
      / (1.0 + 0.01 * EXTRACT(EPOCH FROM (now() - created_at)) / 3600)
      AS decay_score
FROM agent_memory
WHERE agent_id = $2
  AND (expires_at IS NULL OR expires_at > now())
ORDER BY decay_score DESC
LIMIT $3;`,
    crdbFeature: "C-SPANN Distributed Vector Index",
  },
  timetravel: {
    title: "Point-in-Time Time Travel",
    description:
      "Reconstruct agent memory state at any past timestamp using CockroachDB's AS OF SYSTEM TIME.",
    sql: `-- AS OF SYSTEM TIME: Reconstruct memory state at a past moment
-- CockroachDB maintains MVCC history — no separate backup needed
SELECT
    memory_id, content, cryptographic_hash,
    importance_score, created_at
FROM agent_memory
  AS OF SYSTEM TIME '2026-07-03 14:47:00+00:00'
WHERE agent_id = $1
ORDER BY created_at ASC;`,
    crdbFeature: "AS OF SYSTEM TIME (MVCC Time Travel)",
  },
  cdc: {
    title: "CDC Changefeed Pipeline",
    description:
      "Every memory write streams to Lambda via CDC for real-time anomaly detection and self-healing.",
    sql: `-- CDC Changefeed: Streams memory writes to downstream processors
-- Used for hash chain verification, anomaly detection, self-healing
CREATE CHANGEFEED FOR TABLE agent_memory
  INTO 'function://cdc_handler'
  WITH
    updated,          -- Emit only changed rows
    resolved,         -- Emit resolved timestamps
    on_error=resume,  -- Don't pause on transient errors
    initial_scan='no'; -- Skip existing data, only new writes`,
    crdbFeature: "Changefeeds (CDC)",
  },
  cspann: {
    title: "C-SPANN Index Definition",
    description:
      "Distributed inverted vector index with 94% compression vs pgvector. Enables sub-linear similarity search.",
    sql: `-- C-SPANN: CockroachDB's native distributed vector index
-- 94% smaller than pgvector, real-time inserts, multi-tenant
CREATE INVERTED INDEX idx_memory_embedding
  ON agent_memory USING INVERTED (embedding)
  WITH (dim=1024);

-- Comparison: C-SPANN vs pgvector
-- C-SPANN: distributed, 94% compression, real-time
-- pgvector: single-node, no compression, requires reindexing`,
    crdbFeature: "C-SPANN Vector Indexing",
  },
  audit: {
    title: "Immutable Audit Log",
    description:
      "Append-only audit trail for every memory operation. Cannot be modified or deleted.",
    sql: `-- Append-only audit log — no UPDATE or DELETE allowed
-- Every memory operation is recorded with full context
SELECT
    audit_id, action, details, recorded_at
FROM agent_audit
WHERE agent_id = $1
ORDER BY recorded_at DESC
LIMIT 100;`,
    crdbFeature: "SERIALIZABLE Isolation + Append-Only",
  },
  heal: {
    title: "Memory Healing (Expiry Pruning)",
    description:
      "Remove expired memories and compact the memory store. Part of the self-healing pipeline.",
    sql: `-- Heal: Remove expired memories and compact storage
DELETE FROM agent_memory
WHERE agent_id = $1
  AND expires_at IS NOT NULL
  AND expires_at <= now();

-- Log the heal action for audit trail
INSERT INTO agent_audit (agent_id, workflow_id, action, details)
VALUES ($1, gen_random_uuid(), 'heal', '{"pruned": $2}');`,
    crdbFeature: "TTL Expiry + Audit Trail",
  },
};

export default function SqlExplainer({
  queryType,
  agentId = "demo-agent",
  timestamp,
  memoryId,
  onClose,
}: SqlExplainerProps) {
  const [copied, setCopied] = useState(false);
  const query = SQL_QUERIES[queryType] || SQL_QUERIES.search;

  // Replace $1, $2, $3 with actual values
  const filledSql = query.sql
    .replace(/\$1/g, `'${agentId}'`)
    .replace(/\$2/g, `'${agentId}'`)
    .replace(/\$3/g, "5")
    .replace(/'2026-07-03 14:47:00\+00:00'/, `'${timestamp || new Date().toISOString()}'`);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(filledSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(4, 6, 13, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        style={{
          maxWidth: "700px",
          width: "100%",
          maxHeight: "85vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="panel-header" style={{ borderBottom: "none" }}>
          <div>
            <span className="title-sm" style={{ margin: 0 }}>
              SQL Explainer
            </span>
            <div
              style={{
                fontSize: "10px",
                fontFamily: "var(--font-mono)",
                color: "var(--accent-breeze)",
                marginTop: "4px",
              }}
            >
              {query.crdbFeature}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn btn-outline"
              style={{ fontSize: "11px", padding: "6px 12px" }}
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy SQL"}
            </button>
            {onClose && (
              <button
                className="btn btn-outline"
                style={{ fontSize: "11px", padding: "6px 12px" }}
                onClick={onClose}
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <p style={{ fontSize: "13px", color: "var(--body)", lineHeight: 1.6, margin: "12px 0 16px" }}>
          {query.description}
        </p>

        {/* SQL Code Block */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.3)",
            border: "1px solid var(--glass-border)",
            borderRadius: "8px",
            padding: "16px",
            overflowX: "auto",
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              lineHeight: 1.6,
              color: "var(--ink)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            <code>
              {filledSql.split("\n").map((line, i) => {
                // Syntax highlighting
                let colored = line;
                if (line.trim().startsWith("--")) {
                  return (
                    <div key={i} style={{ color: "var(--accent-emerald)", opacity: 0.7 }}>
                      {line}
                    </div>
                  );
                }
                const keywords = [
                  "SELECT",
                  "FROM",
                  "WHERE",
                  "INSERT",
                  "INTO",
                  "VALUES",
                  "UPDATE",
                  "DELETE",
                  "CREATE",
                  "ORDER BY",
                  "LIMIT",
                  "AND",
                  "OR",
                  "AS",
                  "WITH",
                ];
                let result = line;
                for (const kw of keywords) {
                  const regex = new RegExp(`\\b${kw}\\b`, "gi");
                  result = result.replace(
                    regex,
                    (match) => `___KEYWORD___${match}___END_KEYWORD___`
                  );
                }

                const parts = result.split(/(___KEYWORD___|___END_KEYWORD___)/);
                return (
                  <div key={i}>
                    {parts.map((part, j) => {
                      if (part === "___KEYWORD___" || part === "___END_KEYWORD___") return null;
                      if (keywords.some((kw) => part.toUpperCase() === kw)) {
                        return (
                          <span key={j} style={{ color: "var(--accent-breeze)", fontWeight: 600 }}>
                            {part}
                          </span>
                        );
                      }
                      return <span key={j}>{part}</span>;
                    })}
                  </div>
                );
              })}
            </code>
          </pre>
        </div>

        {/* Feature Badge */}
        <div
          style={{
            marginTop: "16px",
            padding: "10px 14px",
            background: "rgba(0, 229, 255, 0.04)",
            border: "1px solid rgba(0, 229, 255, 0.15)",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "var(--accent-breeze)",
              boxShadow: "0 0 6px var(--accent-breeze)",
            }}
          />
          <span style={{ fontSize: "11px", color: "var(--accent-breeze)" }}>
            CockroachDB Feature: {query.crdbFeature}
          </span>
        </div>
      </div>
    </div>
  );
}
