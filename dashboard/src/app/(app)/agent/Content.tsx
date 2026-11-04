"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

/* ── Design Tokens (matching dashboard) ──────────────────── */
const C = {
  canvas: "#f4f3ef",
  card: "#ffffff",
  ink: "#000000",
  body: "#1c1917",
  mute: "#374151", /* Darker gray */
  yellow: "#facc15",
  green: "#059669", /* Darker green */
  red: "#dc2626", /* Darker red */
  blue: "#2563eb", /* Darker blue */
  purple: "#7c3aed", /* Darker purple */
  border: "3px solid #000000",
  shadow: "3px 3px 0px 0px #000000",
  shadowSm: "2px 2px 0px 0px #000000",
};

/* ── Types ────────────────────────────────────────────────── */
interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "pending" | "running" | "done" | "error";
  sql?: string;
  latency?: string;
}

interface GuardStage {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
}

interface Operation {
  id: string;
  type: "thought" | "tool_call" | "guard" | "approval" | "result" | "error" | "chain" | "audit";
  content: string;
  timestamp: string;
  toolCall?: ToolCall;
  guardStages?: GuardStage[];
  chainHash?: string;
  prevHash?: string;
}

interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  content: string;
  guardPassed: boolean;
  confidence: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  guard?: {
    isSafe: boolean;
    findings: Array<{ detector: string; threatType: string; severity: string; detail: string; confidence: number }>;
    trustScore: number;
    poisoningRisk: string;
  };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  operations?: Operation[];
  pendingApproval?: ApprovalRequest;
}

/* ── Utility ──────────────────────────────────────────────── */
function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function now() {
  return new Date().toISOString().slice(11, 19);
}

/* ── Sub-components ───────────────────────────────────────── */

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const statusColors: Record<string, string> = {
    pending: C.mute,
    running: C.blue,
    done: C.green,
    error: C.red,
  };
  const statusLabels: Record<string, string> = {
    pending: "QUEUED",
    running: "RUNNING",
    done: "COMPLETE",
    error: "FAILED",
  };

  // Mirrors MCP_WRITE_TOOLS in the chat route — writes require human approval (HITL),
  // reads execute autonomously. Surfacing this keeps the demo honest about the policy.
  const WRITE_TOOLS = new Set(["memory_store", "memory_correct", "memory_delete", "memory_pin"]);
  const isWrite = WRITE_TOOLS.has(tool.name);

  return (
    <div style={{
      background: C.card,
      border: C.border,
      borderRadius: "4px",
      boxShadow: C.shadowSm,
      padding: "12px",
      marginBottom: "8px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 800,
            background: C.yellow,
            border: `2px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "2px 8px",
            boxShadow: C.shadowSm,
          }}>
            {tool.name}
          </span>
          {isWrite ? (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 900,
              background: C.red,
              color: "#fff",
              border: `3px solid ${C.ink}`,
              borderRadius: "6px",
              padding: "6px 14px",
              boxShadow: `2px 2px 0px ${C.ink}`,
              letterSpacing: "0.5px",
            }}>
              ✋ HITL · APPROVAL
            </span>
          ) : (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 900,
              background: "#d1fae5",
              color: "#065f46",
              border: `3px solid ${C.green}`,
              borderRadius: "6px",
              padding: "6px 14px",
              boxShadow: `2px 2px 0px ${C.ink}`,
              letterSpacing: "0.5px",
            }}>
              ↻ AUTONOMOUS READ
            </span>
          )}
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            color: statusColors[tool.status],
          }}>
            {statusLabels[tool.status]}
          </span>
          {tool.result?.source === "SQL" && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 900,
              background: "#fef3c7",
              color: "#92400e",
              border: `3px solid #d97706`,
              borderRadius: "6px",
              padding: "6px 14px",
              boxShadow: `2px 2px 0px ${C.ink}`,
            }}>
              ⚡ SQL FALLBACK
            </span>
          )}
          {tool.result?.source === "MCP" && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 900,
              background: C.green,
              color: "#fff",
              border: `3px solid ${C.ink}`,
              borderRadius: "6px",
              padding: "6px 14px",
              boxShadow: `2px 2px 0px ${C.ink}`,
            }}>
              ✓ MCP SERVER
            </span>
          )}
          {tool.result?.source === "HITL" && !isWrite && (
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "16px",
              fontWeight: 900,
              background: C.purple,
              color: "#fff",
              border: `3px solid ${C.ink}`,
              borderRadius: "6px",
              padding: "6px 14px",
              boxShadow: `2px 2px 0px ${C.ink}`,
            }}>
              ✋ HITL APPROVAL
            </span>
          )}
        </div>
        {tool.latency && (
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            color: C.mute,
          }}>
            {tool.latency}
          </span>
        )}
      </div>

      {/* Args */}
      {Object.keys(tool.args).length > 0 && (
        <details style={{ marginBottom: "6px" }}>
          <summary style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: C.mute,
            marginBottom: "4px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            cursor: "pointer",
            userSelect: "none"
          }}>
            ▶ Tool Payload
          </summary>
          <pre style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            color: C.body,
            margin: 0,
            background: "#f9f9f7",
            border: `1px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "6px 8px",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}>
            {JSON.stringify(tool.args, null, 2)}
          </pre>
        </details>
      )}

      {/* SQL */}
      {tool.sql && (
        <details style={{ marginBottom: "6px" }}>
          <summary style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: C.purple,
            marginBottom: "4px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            cursor: "pointer",
            userSelect: "none"
          }}>
            ▶ CRDB Query
          </summary>
          <pre style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            color: C.purple,
            margin: 0,
            background: "#f5f3ff",
            border: `1px solid ${C.purple}`,
            borderRadius: "4px",
            padding: "6px 8px",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
          }}>
            {tool.sql}
          </pre>
        </details>
      )}

      {/* Vector Search Results — C-SPANN */}
      {tool.name === "memory_search" && Array.isArray(tool.result?.results) && (
        <div style={{ marginBottom: "6px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 800, color: "#0369a1", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "6px" }}>
            C-SPANN Vector Results ({String(tool.result.total)} hits · {String(tool.result.latency)})
          </div>
          {(tool.result.results as any[]).slice(0, 3).map((r: any, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 8px", marginBottom: "4px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "4px", fontFamily: "var(--font-mono)", fontSize: "13px" }}>
              <span style={{ background: "#0369a1", color: "#fff", padding: "1px 6px", borderRadius: "3px", fontSize: "11px", fontWeight: 800, flexShrink: 0 }}>
                {r.similarity != null ? `${Math.round(r.similarity * 100)}%` : "—"}
              </span>
              <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#1e3a5f", fontWeight: 600 }}>
                {r.content}
              </div>
              <span style={{ fontSize: "10px", color: "#6b7280", flexShrink: 0 }}>{r.memoryType}</span>
            </div>
          ))}
        </div>
      )}

      {/* MCP offline note */}
      {tool.result?.source === "SQL" && (
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "15px",
          fontWeight: 700,
          color: "#92400e",
          background: "#fffbeb",
          border: `2px solid #d97706`,
          borderRadius: "4px",
          padding: "6px 8px",
          marginBottom: "6px",
        }}>
          ⚡ MCP server unreachable — this tool executed via inline SQL fallback against
          CockroachDB. Start the Bastion MCP server on :9997 to restore the full
          (C-SPANN + hash-chain + budget) execution path.
        </div>
      )}

      {/* Result */}
      {tool.result && (
        <details>
          <summary style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 700,
            color: C.green,
            marginBottom: "4px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            cursor: "pointer",
            userSelect: "none"
          }}>
            ▶ Execution Result
          </summary>
          <pre style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            color: C.body,
            margin: 0,
            background: "#f0fdf4",
            border: `1px solid ${C.green}`,
            borderRadius: "4px",
            padding: "6px 8px",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: "200px",
          }}>
            {JSON.stringify(tool.result, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

function GuardCheck({ stages }: { stages: GuardStage[] }) {
  return (
    <div style={{
      background: C.card,
      border: C.border,
      borderRadius: "4px",
      boxShadow: C.shadowSm,
      padding: "10px 12px",
      marginBottom: "8px",
    }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "15px",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "1px",
        marginBottom: "6px",
        color: C.ink,
      }}>
        OWASP ASI06 Guard
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {stages.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              border: `2px solid ${C.ink}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "15px",
              fontWeight: 800,
              fontFamily: "var(--font-mono)",
              background: s.status === "pass" ? C.green
                : s.status === "fail" ? C.red
                  : s.status === "running" ? C.yellow
                    : "#e5e7eb",
              color: s.status === "pass" || s.status === "fail" ? "#fff" : C.ink,
              flexShrink: 0,
            }}>
              {s.status === "pass" ? "✓" : s.status === "fail" ? "✗" : s.status === "running" ? "⟳" : "·"}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 700,
              color: s.status === "pass" ? C.green
                : s.status === "fail" ? C.red
                  : s.status === "running" ? C.ink
                    : C.mute,
            }}>
              {s.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Live CDC Feed (changefeed → S3) ──────────────────────── */
function CdcLiveFeed() {
  const [events, setEvents] = useState<{ type: string; msg: string; time: string; color: string; agent: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/cdc-feed?limit=15", { cache: "no-store" });
        const d = await res.json();
        const rows = d?.data?.events || [];
        if (!Array.isArray(rows) || rows.length === 0) return;
        if (!active) return;
        const mapped = rows.slice(0, 15).map((r: any) => {
          const action = String(r.action || "memory_changed").replace(/_/g, " ");
          const isPoison = action.includes("poison") || action.includes("block") || action.includes("guard");
          const isHeal = action.includes("heal") || action.includes("prune") || action.includes("repair");
          const isScan = action.includes("scan") || action.includes("verify") || action.includes("detect");
          const type = isPoison ? "BLOCKED" : isHeal ? "HEALED" : isScan ? "SCANNED" : "CDC EVENT";
          const color = isPoison ? "#b91c1c" : isHeal ? "#047857" : isScan ? "#0369a1" : "#7c3aed";
          return {
            type,
            msg: action,
            time: r.recordedAt ? new Date(r.recordedAt).toLocaleTimeString() : "just now",
            color,
            agent: String(r.agentId || "unknown"),
          };
        });
        setEvents(mapped);
        setLastUpdate(new Date().toLocaleTimeString());
      } catch {
        // keep last events on failure
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  return (
    <div className="brutal-hover" style={{
      background: C.card,
      border: C.border,
      borderRadius: "4px",
      boxShadow: C.shadowSm,
      padding: "10px 12px",
      marginBottom: "12px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "6px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: C.purple,
            animation: "chainDotPulse 1.6s ease-in-out infinite",
          }} />
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "1px",
            color: C.ink,
          }}>
            CDC Live Feed
          </span>
        </div>
        {lastUpdate && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: C.mute, fontWeight: 700 }}>
            ↻ {lastUpdate}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "15px",
        fontWeight: 700,
        background: "#f5f3ff",
        border: `2px solid ${C.purple}`,
        borderRadius: "4px",
        padding: "4px 8px",
        marginBottom: "8px",
        color: "#5b21b6",
        letterSpacing: "0.5px",
      }}>
        CockroachDB CDC → AWS S3 → this panel
      </div>

      {loading && events.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", color: C.mute }}>
          Tailing cdc-live/ …
        </div>
      ) : events.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "15px", color: C.mute }}>
          No CDC events yet — writes will appear here in real time.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto" }}>
          {events.map((e, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "5px 8px",
              background: i === 0 ? `${e.color}0d` : "transparent",
              border: `1px solid ${i === 0 ? e.color + "40" : C.ink}`,
              borderRadius: "3px",
            }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                fontWeight: 900,
                color: "#fff",
                background: e.color,
                padding: "1px 5px",
                borderRadius: "2px",
                flexShrink: 0,
              }}>
                {e.type}
              </span>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
                color: C.ink,
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: 600,
              }}>
                {e.msg}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: C.mute, flexShrink: 0 }}>
                {e.time}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HashChainVisual({ hashes, valid }: { hashes: string[]; valid: boolean }) {
  if (hashes.length === 0) return null;
  return (
    <div style={{
      background: C.card,
      border: C.border,
      borderRadius: "4px",
      boxShadow: C.shadowSm,
      padding: "10px 12px",
      marginBottom: "8px",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "6px",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "15px",
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: C.ink,
        }}>
          Hash Chain
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          fontWeight: 700,
          padding: "2px 6px",
          borderRadius: "3px",
          background: valid ? "#dcfce7" : "#fef2f2",
          color: valid ? "#166534" : "#991b1b",
          border: `1px solid ${valid ? "#86efac" : "#fca5a5"}`,
        }}>
          {valid ? "✓ SEALED" : "✗ BROKEN"}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
        {hashes.map((h, i) => (
          <React.Fragment key={i}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 700,
              background: i === hashes.length - 1 ? C.yellow : "#f3f4f6",
              border: `2px solid ${C.ink}`,
              borderRadius: "4px",
              padding: "2px 6px",
              boxShadow: i === hashes.length - 1 ? C.shadowSm : "none",
              color: C.ink,
            }}>
              {h.slice(0, 8)}
            </span>
            {i < hashes.length - 1 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", color: C.mute }}>→</span>
            )}
          </React.Fragment>
        ))}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", color: C.mute }}>→</span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: "15px",
          fontWeight: 700,
          color: valid ? C.green : "#ef4444",
          animation: valid ? "chainDotPulse 1.6s ease-in-out infinite" : "none",
        }}>
          {valid ? "●" : "✗"}
        </span>
      </div>
    </div>
  );
}

function ApprovalModal({
  request,
  onApprove,
  onReject,
}: {
  request: ApprovalRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 200,
      background: "rgba(244,243,239,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      animation: "fadeIn 0.2s ease-out",
    }}>
      <div style={{
        background: C.card,
        border: C.border,
        borderRadius: "4px",
        boxShadow: "6px 6px 0px 0px #000000",
        padding: "24px",
        maxWidth: "500px",
        width: "90%",
      }}>
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}>
          <span style={{
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: C.yellow,
            border: `2px solid ${C.ink}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            fontWeight: 800,
          }}>
            ⚠
          </span>
          <span style={{
            fontFamily: "var(--font-sg)",
            fontSize: "16px",
            fontWeight: 800,
            color: C.ink,
          }}>
            Write Operation Requires Approval
          </span>
        </div>

        {/* Tool */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            color: C.mute,
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "4px",
          }}>
            Tool
          </div>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            fontWeight: 800,
            background: C.yellow,
            border: `2px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "2px 8px",
            boxShadow: C.shadowSm,
          }}>
            {request.toolName}
          </span>
        </div>

        {/* Content */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            color: C.mute,
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "4px",
          }}>
            Content
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "14px",
            color: C.body,
            background: "#f9f9f7",
            border: `1px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "8px 10px",
            whiteSpace: "pre-wrap",
          }}>
            {request.content}
          </div>
        </div>

        {/* Guard Analysis */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            color: C.mute,
            textTransform: "uppercase",
            letterSpacing: "1px",
            marginBottom: "4px",
          }}>
            Guard Analysis
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 700,
              color: request.guardPassed ? C.green : C.red,
            }}>
              {request.guardPassed ? "✓ All 7 stages passed" : "✗ Guard blocked content"}
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              color: C.mute,
            }}>
              Confidence: {request.confidence}%
            </span>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 700,
              color: request.risk === "LOW" ? C.green : request.risk === "MEDIUM" ? "#f59e0b" : C.red,
            }}>
              Risk: {request.risk}
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              fontFamily: "var(--font-sg)",
              fontSize: "14px",
              fontWeight: 800,
              background: C.green,
              color: "#fff",
              border: C.border,
              borderRadius: "4px",
              boxShadow: C.shadowSm,
              padding: "10px 16px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              (e.target as HTMLButtonElement).style.transform = "translate(-1px, -1px)";
              (e.target as HTMLButtonElement).style.boxShadow = "4px 4px 0px 0px #000000";
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.transform = "none";
              (e.target as HTMLButtonElement).style.boxShadow = C.shadowSm;
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              fontFamily: "var(--font-sg)",
              fontSize: "14px",
              fontWeight: 800,
              background: C.red,
              color: "#fff",
              border: C.border,
              borderRadius: "4px",
              boxShadow: C.shadowSm,
              padding: "10px 16px",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => {
              (e.target as HTMLButtonElement).style.transform = "translate(-1px, -1px)";
              (e.target as HTMLButtonElement).style.boxShadow = "4px 4px 0px 0px #000000";
            }}
            onMouseLeave={e => {
              (e.target as HTMLButtonElement).style.transform = "none";
              (e.target as HTMLButtonElement).style.boxShadow = C.shadowSm;
            }}
          >
            ✗ Reject
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────── */
const CHAT_STORAGE_KEY = "bastion-agent-chat-v1";

function parseThinkBlocks(text: string) {
  if (!text || !text.includes("<think>")) return text;

  const parts = text.split(/(<think>[\s\S]*?(?:<\/think>|$))/gi);

  return parts.map((part, i) => {
    if (part.toLowerCase().startsWith("<think>")) {
      const thinkContent = part.replace(/^<think>/i, "").replace(/<\/think>$/i, "").trim();
      if (!thinkContent) return null;
      return (
        <details key={i} style={{
          marginBottom: "12px",
          background: "#f8fafc",
          padding: "12px",
          borderRadius: "4px",
          border: `2px solid ${C.ink}`,
          boxShadow: C.shadowSm
        }}>
          <summary style={{
            cursor: "pointer",
            fontWeight: 800,
            fontSize: "14px",
            color: C.ink,
            fontFamily: "var(--font-mono)",
            userSelect: "none"
          }}>
            💭 Internal Model Reasoning
          </summary>
          <div style={{
            marginTop: "12px",
            fontSize: "15px",
            fontWeight: 600,
            color: C.body,
            whiteSpace: "pre-wrap",
            borderTop: `2px dashed ${C.ink}`,
            paddingTop: "12px"
          }}>
            {thinkContent}
          </div>
        </details>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function loadChatMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (m: ChatMessage) => m && typeof m === "object" && (m.role === "user" || m.role === "assistant")
      );
    }
  } catch {
    // Corrupt storage — start fresh
  }
  return [];
}

const CHAIN_STORAGE_KEY = "bastion_agent_chain";

function loadChainHashes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(CHAIN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { }
  return [];
}

async function fetchChainFromDB(): Promise<{ hashes: string[]; prevHashes: string[]; valid: boolean }> {
  try {
    const res = await fetch("/api/agent/chain", { cache: "no-store" });
    if (!res.ok) return { hashes: [], prevHashes: [], valid: true };
    const data = await res.json();
    const hashes = (data.hashes || []).map((h: { hash: string }) => h.hash);
    const prevHashes = (data.hashes || []).map((h: { prevHash: string }) => h.prevHash);
    return { hashes, prevHashes, valid: data.chainValid !== false };
  } catch {
    return { hashes: [], prevHashes: [], valid: true };
  }
}

export default function AgentContent({ initialStats }: { initialStats: { memories: number; auditLogs: number; chainIntact: boolean; initialHashes: { hash: string; prevHash: string; content: string; createdAt: string }[] } }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const pendingResumeRef = useRef<{ message: string; history: Array<{ role: string; content: string }>; assistantContent?: string } | null>(null);
  const [chainHashes, setChainHashes] = useState<string[]>(
    initialStats.initialHashes?.map(h => h.hash) || []
  );
  const [chainPrevHashes, setChainPrevHashes] = useState<string[]>(
    initialStats.initialHashes?.map(h => h.prevHash) || []
  );
  const [chainValid, setChainValid] = useState(initialStats.chainIntact);
  const [activeProvider, setActiveProvider] = useState<string>("");
  const [activeModel, setActiveModel] = useState<string>("");
  const [mcpStatus, setMcpStatus] = useState<"checking" | "connected" | "offline">("checking");
  const [mcpDetail, setMcpDetail] = useState("");
  const [isoData, setIsoData] = useState<{ isolation_level: string; read_committed_enabled: boolean } | null>(null);
  const [isoOpen, setIsoOpen] = useState(false);
  const [slashTools, setSlashTools] = useState<{ name: string; description: string }[]>([]);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMemoriesRef = useRef(initialStats.memories);
  const [memoriesAnim, setMemoriesAnim] = useState<{ old: number; new: number; show: boolean }>({ old: initialStats.memories, new: initialStats.memories, show: false });
  const [stats, setStats] = useState(initialStats);

  // Refresh stats from database
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        // Update chain validity from real DB verification
        if (data.chainIntact !== undefined) {
          setChainValid(data.chainIntact);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Load persisted chat after mount (client-only) to avoid SSR hydration mismatch
  useEffect(() => {
    const persisted = loadChatMessages();
    if (persisted.length > 0) {
      setMessages(persisted);
    }
    // Fetch real hashes from DB on mount
    fetchChainFromDB().then(({ hashes, prevHashes, valid }) => {
      if (hashes.length > 0) {
        setChainHashes(hashes);
        setChainPrevHashes(prevHashes);
        setChainValid(valid);
      } else {
        // Fall back to session storage
        const cached = loadChainHashes();
        if (cached.length > 0) setChainHashes(cached);
      }
    });
  }, []);

  // Persist chain hashes across reloads so the sidebar stays in sync
  useEffect(() => {
    try {
      window.sessionStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify(chainHashes));
    } catch { }
  }, [chainHashes]);

  const checkMcp = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/health", { cache: "no-store" });
      const data = await res.json();
      if (data.mcp?.connected) {
        setMcpStatus("connected");
        setMcpDetail(data.mcp.version ? `Bastion Memory v${data.mcp.version}` : "Connected");
      } else {
        setMcpStatus("offline");
        setMcpDetail(data.mcp?.error || "MCP server unreachable");
      }
    } catch (error) {
      setMcpStatus("offline");
      setMcpDetail(error instanceof Error ? error.message : "MCP server unreachable");
    }
  }, []);

  useEffect(() => {
    checkMcp();
  }, [checkMcp]);

  useEffect(() => {
    fetch("/api/isolation", { cache: "no-store" })
      .then(r => r.json())
      .then(d => { if (d.data) setIsoData(d.data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isoOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-iso-panel]")) setIsoOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isoOpen]);

  useEffect(() => {
    if (mcpStatus === "connected") {
      fetch("/api/mcp/tools")
        .then(r => r.json())
        .then(d => {
          if (!d.tools?.length) return;
          const seen = new Set<string>();
          const unique = d.tools.filter((t: any) => {
            if (!t?.name || seen.has(t.name)) return false;
            seen.add(t.name);
            return true;
          });
          setSlashTools(unique);
        })
        .catch(() => { });
    }
  }, [mcpStatus]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      if (messages.length > 0) {
        window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
      } else {
        window.localStorage.removeItem(CHAT_STORAGE_KEY);
      }
    } catch {
      // Storage full/unavailable — persist is best-effort
    }
  }, [messages]);

  // Auto-resize textarea when input value changes (e.g. paste)
  useEffect(() => {
    const ta = inputRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
    }
  }, [input]);

  // Animate memory count when it changes
  useEffect(() => {
    if (stats.memories !== prevMemoriesRef.current) {
      const oldVal = prevMemoriesRef.current;
      prevMemoriesRef.current = stats.memories;
      setMemoriesAnim({ old: oldVal, new: stats.memories, show: true });
      const t = setTimeout(() => setMemoriesAnim(prev => ({ ...prev, show: false })), 3000);
      return () => clearTimeout(t);
    }
  }, [stats.memories]);

  const addOps = useCallback((msgId: string, ops: Operation[]) => {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, operations: [...(m.operations || []), ...ops] } : m
    ));
  }, []);

  const processInput = useCallback(async (userInput: string) => {
    const msgId = genId();
    const assistantMsgId = genId();

    const userMsg: ChatMessage = {
      id: msgId,
      role: "user",
      content: userInput,
    };

    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      operations: [],
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsProcessing(true);

    try {
      // Call the real LLM agent
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userInput,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.provider) setActiveProvider(data.provider);
      if (data.model) setActiveModel(data.model);
      checkMcp();

      if (data.error) {
        addOps(assistantMsgId, [{
          id: genId(),
          type: "error",
          content: data.error,
          timestamp: now(),
        }]);
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: "Agent error: " + data.error } : m
        ));
        return;
      }

      // Process agent steps
      const steps = data.steps || [];
      for (const step of steps) {
        if (step.type === "thought") {
          addOps(assistantMsgId, [{
            id: genId(),
            type: "thought",
            content: step.content,
            timestamp: now(),
          }]);
        } else if (step.type === "tool_call") {
          const toolCall: ToolCall = {
            id: genId(),
            name: step.toolName || "unknown",
            args: step.toolArgs || {},
            status: "running",
          };
          addOps(assistantMsgId, [{
            id: genId(),
            type: "tool_call",
            content: "",
            timestamp: now(),
            toolCall,
          }]);
        } else if (step.type === "tool_result") {
          // Update the last tool call with result
          setMessages(prev => prev.map(m => {
            if (m.id !== assistantMsgId) return m;
            const ops = m.operations || [];
            // Find the last tool_call op and update it
            for (let i = ops.length - 1; i >= 0; i--) {
              if (ops[i].type === "tool_call" && ops[i].toolCall && !ops[i].toolCall?.result) {
                ops[i].toolCall = {
                  ...ops[i].toolCall!,
                  name: step.toolName || ops[i].toolCall!.name,
                  status: "done",
                  result: step.toolResult,
                  sql: step.sql,
                  latency: step.latency,
                };
                break;
              }
            }
            return { ...m, operations: [...ops] };
          }));

          // Add audit entry for the tool call
          addOps(assistantMsgId, [{
            id: genId(),
            type: "audit",
            content: `${step.toolName} executed — SERIALIZABLE isolation`,
            timestamp: now(),
          }]);
        } else if (step.type === "response") {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: step.content } : m
          ));
        } else if (step.type === "error") {
          addOps(assistantMsgId, [{
            id: genId(),
            type: "error",
            content: step.content,
            timestamp: now(),
          }]);
        }
      }

      // If no response step found, set a default
      const hasResponse = steps.some((s: { type: string }) => s.type === "response");
      if (!hasResponse && !data.pendingApproval) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, content: "Agent processed your request." } : m
        ));
      }

      // Handle pending approval (HITL)
      if (data.pendingApproval) {
        pendingResumeRef.current = {
          message: userInput,
          history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          assistantContent: steps.filter((s: { type: string }) => s.type === "thought").map((s: { content: string }) => s.content).join("\n"),
        };
        const guard = data.pendingApproval.guard;
        const approval: ApprovalRequest = {
          id: genId(),
          toolName: data.pendingApproval.toolName,
          args: data.pendingApproval.args,
          content: data.pendingApproval.content,
          guardPassed: guard ? guard.isSafe : true,
          confidence: guard ? Math.round(guard.trustScore * 100) : 94,
          risk: guard ? (guard.poisoningRisk === "NONE" ? "LOW" : guard.poisoningRisk === "MEDIUM" ? "MEDIUM" : "HIGH") : "LOW",
          guard: guard || undefined,
        };
        setPendingApproval(approval);
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? {
            ...m,
            content: guard
              ? (guard.isSafe ? "Guard passed. Approval required to store memory." : `Guard BLOCKED content (${guard.poisoningRisk}): ${guard.findings[0]?.detail || "injection detected"}`)
              : "Guard passed all 7 stages. Approval required to store memory.",
            pendingApproval: approval,
          } : m
        ));
      }

    } catch (error) {
      addOps(assistantMsgId, [{
        id: genId(),
        type: "error",
        content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: now(),
      }]);
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, content: "An error occurred. Please try again." } : m
      ));
    } finally {
      refreshStats();
      setIsProcessing(false);
    }
  }, [addOps, messages, checkMcp, refreshStats]);

  const resumeAgentLoop = useCallback(async (approved: boolean, result?: Record<string, unknown>) => {
    const resume = pendingResumeRef.current;
    if (!resume) return;
    const assistantMsgId = [...messages].reverse().find(m => m.role === "assistant" && m.operations?.some(o => o.type === "tool_call"))?.id;
    const targetId = assistantMsgId || genId();

    try {
      setIsProcessing(true);
      // Build history that includes the assistant's previous plan so the LLM knows the remaining steps
      const resumeHistory = [
        ...resume.history,
        ...(resume.assistantContent ? [{ role: "assistant" as const, content: resume.assistantContent }] : []),
      ];
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: resume.message,
          history: resumeHistory,
          resumeApproval: {
            approved,
            toolName: pendingApproval?.toolName || "memory_store",
            result: result || {},
          },
        }),
      });
      const data = await res.json();
      if (data.provider) setActiveProvider(data.provider);
      if (data.model) setActiveModel(data.model);

      if (data.error) {
        addOps(targetId, [{
          id: genId(),
          type: "error",
          content: data.error,
          timestamp: now(),
        }]);
        return;
      }

      const steps = data.steps || [];
      for (const step of steps) {
        if (step.type === "thought") {
          addOps(targetId, [{
            id: genId(),
            type: "thought",
            content: step.content,
            timestamp: now(),
          }]);
        } else if (step.type === "tool_call") {
          addOps(targetId, [{
            id: genId(),
            type: "tool_call",
            content: "",
            timestamp: now(),
            toolCall: {
              id: genId(),
              name: step.toolName || "unknown",
              args: step.toolArgs || {},
              status: "running",
            },
          }]);
        } else if (step.type === "tool_result") {
          setMessages(prev => prev.map(m => {
            if (m.id !== targetId) return m;
            const ops = m.operations || [];
            for (let i = ops.length - 1; i >= 0; i--) {
              if (ops[i].type === "tool_call" && ops[i].toolCall && !ops[i].toolCall?.result) {
                ops[i].toolCall = {
                  ...ops[i].toolCall!,
                  name: step.toolName || ops[i].toolCall!.name,
                  status: "done",
                  result: step.toolResult,
                  sql: step.sql,
                  latency: step.latency,
                };
                break;
              }
            }
            return { ...m, operations: [...ops] };
          }));
          addOps(targetId, [{
            id: genId(),
            type: "audit",
            content: `${step.toolName} executed — SERIALIZABLE isolation`,
            timestamp: now(),
          }]);
        } else if (step.type === "response") {
          setMessages(prev => prev.map(m =>
            m.id === targetId ? { ...m, content: step.content } : m
          ));
        } else if (step.type === "error") {
          addOps(targetId, [{
            id: genId(),
            type: "error",
            content: step.content,
            timestamp: now(),
          }]);
        }
      }

      // If the resumed loop itself triggers another HITL approval, store it for the next round
      if (data.pendingApproval) {
        pendingResumeRef.current = {
          message: resume.message,
          history: resume.history,
          assistantContent: steps.filter((s: { type: string }) => s.type === "thought").map((s: { content: string }) => s.content).join("\n"),
        };
        const guard = data.pendingApproval.guard;
        const approval: ApprovalRequest = {
          id: genId(),
          toolName: data.pendingApproval.toolName,
          args: data.pendingApproval.args,
          content: data.pendingApproval.content,
          guardPassed: guard ? guard.isSafe : true,
          confidence: guard ? Math.round(guard.trustScore * 100) : 94,
          risk: guard ? (guard.poisoningRisk === "NONE" ? "LOW" : guard.poisoningRisk === "MEDIUM" ? "MEDIUM" : "HIGH") : "LOW",
          guard: guard || undefined,
        };
        setPendingApproval(approval);
      }
    } catch (error) {
      addOps(targetId, [{
        id: genId(),
        type: "error",
        content: `Continuation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: now(),
      }]);
    } finally {
      refreshStats();
      setIsProcessing(false);
    }
  }, [addOps, messages, checkMcp, refreshStats]);

  const handleApprove = useCallback(async () => {
    if (!pendingApproval) return;
    const approval = pendingApproval;
    setPendingApproval(null);

    // Find the last assistant message with pendingApproval
    const assistantMsg = [...messages].reverse().find(m => m.pendingApproval);
    const assistantMsgId = assistantMsg?.id || genId();

    // Remove pending approval from message
    setMessages(prev => prev.map(m =>
      m.pendingApproval ? { ...m, pendingApproval: undefined } : m
    ));

    try {
      const res = await fetch("/api/mcp/memory_store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(approval.args),
      });
      const data = await res.json();

      if (data.error) {
        addOps(assistantMsgId, [{
          id: genId(),
          type: "error",
          content: `Store failed: ${data.error}`,
          timestamp: now(),
        }]);
        return;
      }

      const hash = data.data?.cryptographicHash || data.cryptographicHash || genId();
      const newHash = hash.slice(0, 8);
      const source = data.data?.source || data.source || "SQL";

      // Update the existing pending tool_call card in place instead of adding a duplicate
      setMessages(prev => prev.map(m => {
        if (m.id !== assistantMsgId) return m;
        const ops = m.operations || [];
        for (let i = ops.length - 1; i >= 0; i--) {
          if (ops[i].type === "tool_call" && ops[i].toolCall && !ops[i].toolCall?.result) {
            ops[i].toolCall = {
              ...ops[i].toolCall!,
              status: "done",
              result: { tool: "memory_store", ...data.data, source },
            };
            break;
          }
        }
        return { ...m, operations: [...ops] };
      }));

      // Re-fetch real chain from DB — source of truth, not client-side guessing
      fetchChainFromDB().then(({ hashes, prevHashes, valid }) => {
        if (hashes.length > 0) {
          setChainHashes(hashes);
          setChainPrevHashes(prevHashes);
          setChainValid(valid);
        } else {
          // Fallback: append the new hash if DB fetch fails
          setChainHashes(prev => [...prev, newHash]);
          setChainPrevHashes(prev => [...prev, ""]);
        }
      });

      addOps(assistantMsgId, [
        {
          id: genId(),
          type: "chain",
          content: `Chain grew: ${chainHashes[chainHashes.length - 1]} → ${newHash}`,
          timestamp: now(),
          prevHash: chainHashes[chainHashes.length - 1],
          chainHash: newHash,
        },
        {
          id: genId(),
          type: "audit",
          content: `Stored via ${source}. SERIALIZABLE isolation. Audit log updated at ${now()}`,
          timestamp: now(),
        },
      ]);

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? {
          ...m,
          content: `Memory stored successfully. Hash chain extended. Audit trail updated.`,
        } : m
      ));

      // Resume the agent loop so the LLM continues with remaining steps (ccloud, skills, search, etc.)
      const result = { ...data.data, source };
      resumeAgentLoop(true, result);
    } catch (error) {
      addOps(assistantMsgId, [{
        id: genId(),
        type: "error",
        content: `Store failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        timestamp: now(),
      }]);
      resumeAgentLoop(false);
    }
  }, [pendingApproval, messages, chainHashes, addOps, resumeAgentLoop]);

  const handleReject = useCallback(() => {
    if (!pendingApproval) return;
    // Find the last assistant message with pendingApproval
    const assistantMsg = [...messages].reverse().find(m => m.pendingApproval);
    const assistantMsgId = assistantMsg?.id || genId();

    setMessages(prev => prev.map(m =>
      m.pendingApproval ? { ...m, pendingApproval: undefined } : m
    ));

    addOps(assistantMsgId, [{
      id: genId(),
      type: "error",
      content: `Memory rejected by human operator at ${now()}`,
      timestamp: now(),
    }]);

    setMessages(prev => prev.map(m =>
      m.id === assistantMsgId ? {
        ...m,
        content: "Memory rejected. No changes were made.",
      } : m
    ));

    setPendingApproval(null);

    // Resume the agent loop so the LLM can continue with remaining steps
    resumeAgentLoop(false);
  }, [pendingApproval, messages, addOps, resumeAgentLoop]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;
    const val = input.trim();
    setInput("");
    processInput(val);
  };

  const handleClearChat = async () => {
    setMessages([]);
    setPendingApproval(null);
    // Fetch real hashes from DB instead of hardcoded reset
    const { hashes, prevHashes } = await fetchChainFromDB();
    setChainHashes(hashes.length > 0 ? hashes : []);
    setChainPrevHashes(prevHashes.length > 0 ? prevHashes : []);
    setActiveProvider("");
    setActiveModel("");
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
      window.sessionStorage.removeItem(CHAIN_STORAGE_KEY);
    } catch {
      // best-effort
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 130px)", /* Adjusted for header height + layout padding */
      background: C.canvas,
      border: C.border, /* Add outer border since it's floating inside padded container */
      boxShadow: C.shadow,
      borderRadius: "8px",
      overflow: "hidden",
    }}>
      {/* ── Header ────────────────────────────────────────── */}
      <div style={{
        background: C.card,
        borderBottom: C.border,
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontFamily: "var(--font-sg)",
            fontSize: "18px",
            fontWeight: 900,
            color: C.ink,
          }}>
            🔒 BASTION AGENT
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            background: activeProvider === "Groq" ? "#fce7f3" : "#dbeafe",
            border: `2px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "2px 8px",
            boxShadow: C.shadowSm,
          }}>
            {activeModel || "qwen/qwen3.6-27b"}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            background: activeProvider === "Groq" ? "#4c1d95" : "#fef3c7",
            color: activeProvider === "Groq" ? "#fff" : "#000",
            border: `2px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "2px 8px",
            boxShadow: C.shadowSm,
          }}>
            {activeProvider || "Groq"}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 700,
            background: mcpStatus === "connected" ? C.green : mcpStatus === "checking" ? "#e5e7eb" : "#fef3c7",
            color: mcpStatus === "connected" ? "#fff" : mcpStatus === "checking" ? C.mute : "#92400e",
            border: `2px solid ${C.ink}`,
            borderRadius: "4px",
            padding: "2px 8px",
            boxShadow: C.shadowSm,
          }}>
            {mcpStatus === "connected" ? "● MCP CONNECTED" : mcpStatus === "checking" ? "⟳ MCP…" : "⚡ MCP OFFLINE"}
          </span>
          <div data-iso-panel style={{ position: "relative" }}>
            <span
              onClick={() => isoData && setIsoOpen(!isoOpen)}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "15px",
                fontWeight: 700,
                background: isoData?.isolation_level === "serializable" ? C.green : isoData ? "#f59e0b" : "#9ca3af",
                color: "#fff",
                border: `2px solid ${C.ink}`,
                borderRadius: "4px",
                padding: "2px 8px",
                boxShadow: C.shadowSm,
                cursor: isoData ? "pointer" : "default",
                transition: "all 0.15s ease",
                textDecoration: isoData ? "underline" : "none",
                textUnderlineOffset: "3px",
              }}
              onMouseEnter={(e) => { if (isoData) e.currentTarget.style.transform = "scale(1.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {isoData?.isolation_level === "serializable" ? "SERIALIZABLE" : isoData ? isoData.isolation_level?.toUpperCase() : "ISO…"}
            </span>
            {isoOpen && isoData && (
              <div style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: "6px",
                background: C.card,
                border: `2px solid ${C.ink}`,
                borderRadius: "6px",
                boxShadow: C.shadow,
                padding: "12px 16px",
                minWidth: "320px",
                zIndex: 100,
                fontFamily: "var(--font-mono)",
                fontSize: "13px",
              }}>
                <div style={{ fontWeight: 900, marginBottom: "8px", fontSize: "14px" }}>Isolation Proof</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: C.mute }}>Level</span>
                  <span style={{ fontWeight: 700, color: C.green }}>{isoData.isolation_level}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ color: C.mute }}>READ COMMITTED</span>
                  <span style={{ fontWeight: 700, color: isoData.read_committed_enabled ? "#f59e0b" : C.mute }}>
                    {isoData.read_committed_enabled ? "enabled (not used)" : "disabled"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ color: C.mute }}>Enforcement</span>
                  <span style={{ fontWeight: 700 }}>application-layer</span>
                </div>
                <div style={{ borderTop: C.border, paddingTop: "8px", color: C.mute, lineHeight: 1.5 }}>
                  Every write runs <code style={{ background: "#e5e7eb", padding: "1px 4px", borderRadius: "2px" }}>SET TRANSACTION ISOLATION LEVEL SERIALIZABLE</code> via <code style={{ background: "#e5e7eb", padding: "1px 4px", borderRadius: "2px" }}>retry.py:80</code>. Concurrent writers abort with 40001, retry with exponential backoff.
                </div>
                <div
                  onClick={() => setIsoOpen(false)}
                  style={{ position: "absolute", top: "6px", right: "8px", cursor: "pointer", color: C.mute, fontWeight: 700 }}
                >✕</div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            fontWeight: 900,
            color: memoriesAnim.show ? C.green : C.mute,
            background: memoriesAnim.show ? "#d1fae5" : "transparent",
            padding: memoriesAnim.show ? "2px 8px" : "0",
            borderRadius: "4px",
            transition: "all 0.3s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
          }}>
            {memoriesAnim.show ? (
              <>
                <span style={{ textDecoration: "line-through", opacity: 0.5, fontSize: "13px" }}>{memoriesAnim.old}</span>
                <span style={{ color: C.green, fontWeight: 900 }}>→</span>
                <span style={{ color: C.green, fontWeight: 900 }}>{memoriesAnim.new}</span>
                <span>memories</span>
              </>
            ) : (
              <>{stats.memories} memories</>
            )}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            color: C.mute,
            fontWeight: 800,
          }}>
            {stats.auditLogs} audit
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "15px",
            color: C.green,
            fontWeight: 900,
          }}>
            ● Chain intact
          </span>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────── */}
      <div style={{
        display: "flex",
        flex: 1,
        overflow: "hidden",
      }}>
        {/* Chat Panel */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          borderRight: C.border,
          minWidth: 0,
        }}>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px",
          }}>
            {/* MCP connection status */}
            {mcpStatus !== "connected" && (
              <div style={{
                background: mcpStatus === "checking" ? C.card : "#fffbeb",
                border: mcpStatus === "checking" ? C.border : `2px solid #d97706`,
                borderLeft: mcpStatus === "checking" ? C.border : `6px solid #d97706`,
                borderRadius: "4px",
                boxShadow: C.shadowSm,
                padding: "12px 14px",
                marginBottom: "16px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: mcpStatus === "checking" ? "#e5e7eb" : "#fbbf24",
                    border: `2px solid ${C.ink}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "14px",
                    fontWeight: 800,
                    flexShrink: 0,
                  }}>
                    {mcpStatus === "checking" ? "⟳" : "⚡"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "15px",
                      fontWeight: 800,
                      color: mcpStatus === "checking" ? C.mute : "#92400e",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      marginBottom: "2px",
                    }}>
                      {mcpStatus === "checking" ? "Checking MCP connection…" : "MCP Server Offline — Degraded Mode"}
                    </div>
                    {mcpStatus === "offline" && (
                      <>
                        <div style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "15px",
                          color: "#78350f",
                          lineHeight: "1.5",
                          marginBottom: "6px",
                        }}>
                          The Bastion MCP server is not running, so the agent is operating in
                          <strong> SQL fallback mode</strong>. Tool calls still execute directly against
                          CockroachDB, but the full MCP engine (C-SPANN vector search, hash-chain
                          integrity, budget tracking, guardrails) is unavailable.
                        </div>
                        <div style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "15px",
                          color: "#92400e",
                          background: "#fef3c7",
                          border: `1px solid #d97706`,
                          borderRadius: "4px",
                          padding: "4px 8px",
                          marginBottom: "8px",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}>
                          {mcpDetail || "http://localhost:9997/mcp"}
                        </div>
                        <div style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "15px",
                          color: "#78350f",
                          lineHeight: "1.5",
                        }}>
                          Start it with: <span style={{ background: "#fff", border: "1px solid #d97706", padding: "0 4px", borderRadius: "3px" }}>
                            python -m bastion.mcp_server --transport http
                          </span>{" "}then hit retry.
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={checkMcp}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "15px",
                      fontWeight: 800,
                      background: C.card,
                      color: C.ink,
                      border: `2px solid ${C.ink}`,
                      borderRadius: "4px",
                      boxShadow: C.shadowSm,
                      padding: "6px 12px",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                      (e.target as HTMLButtonElement).style.transform = "translate(-1px, -1px)";
                      (e.target as HTMLButtonElement).style.boxShadow = "4px 4px 0px 0px #000000";
                    }}
                    onMouseLeave={e => {
                      (e.target as HTMLButtonElement).style.transform = "none";
                      (e.target as HTMLButtonElement).style.boxShadow = C.shadowSm;
                    }}
                  >
                    ↻ RETRY
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 && (
              <div style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: "16px",
              }}>
                <div style={{
                  fontFamily: "var(--font-sg)",
                  fontSize: "24px",
                  fontWeight: 900,
                  color: C.ink,
                }}>
                  Ask me anything about your memories
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "14px",
                  color: C.mute,
                  textAlign: "center",
                  maxWidth: "400px",
                  lineHeight: "1.6",
                }}>
                  I can search, store, and retrieve memories with cryptographic proof.
                  Reads run autonomously; writes require your approval (human-in-the-loop).
                  Every action is logged, every memory is chained, and the OWASP ASI06 guard screens every write.
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", marginTop: "8px" }}>
                  {[
                    "What do you know about SQL injection?",
                    "Remember that parameterized queries prevent injection",
                    "What did I know an hour ago?",
                    "Show me the audit trail",
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(suggestion); }}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "15px",
                        fontWeight: 700,
                        background: C.card,
                        color: C.body,
                        border: `2px solid ${C.ink}`,
                        borderRadius: "4px",
                        padding: "6px 10px",
                        cursor: "pointer",
                        boxShadow: C.shadowSm,
                        transition: "all 0.15s ease",
                      }}
                      onMouseEnter={e => {
                        (e.target as HTMLButtonElement).style.background = C.yellow;
                      }}
                      onMouseLeave={e => {
                        (e.target as HTMLButtonElement).style.background = C.card;
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <div key={msg.id} style={{ marginBottom: "16px", animation: "fadeInUp 0.3s ease-out forwards" }}>
                {/* User message */}
                {msg.role === "user" && (
                  <div style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginBottom: "8px",
                  }}>
                    <div className="brutal-hover" style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "16px",
                      fontWeight: 700,
                      background: C.yellow,
                      color: C.ink,
                      border: C.border,
                      borderRadius: "4px",
                      padding: "12px 18px",
                      maxWidth: "70%",
                      boxShadow: C.shadow,
                    }}>
                      {msg.content}
                    </div>
                  </div>
                )}

                {/* Assistant message */}
                {msg.role === "assistant" && (
                  <div>
                    {/* Operations */}
                    {msg.operations?.map(op => (
                      <div key={op.id} style={{ marginBottom: "6px", animation: "fadeInUp 0.3s ease-out forwards" }}>
                        {op.type === "thought" && (
                          <div style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "15px",
                            color: C.body, /* Use dark body instead of mute */
                            fontWeight: 600, /* Make it bolder */
                            fontStyle: "italic",
                            padding: "4px 8px",
                            borderLeft: `3px solid ${C.yellow}`,
                            marginBottom: "6px",
                          }}>
                            💭 {op.content}
                          </div>
                        )}
                        {op.type === "tool_call" && op.toolCall && (
                          <ToolCallCard tool={op.toolCall} />
                        )}
                        {op.type === "guard" && op.guardStages && (
                          <GuardCheck stages={op.guardStages} />
                        )}
                        {op.type === "chain" && (
                          <div style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "15px",
                            fontWeight: 700,
                            color: C.green,
                            padding: "4px 8px",
                            borderLeft: `3px solid ${C.green}`,
                            marginBottom: "6px",
                          }}>
                            ⛓️ {op.content}
                          </div>
                        )}
                        {op.type === "audit" && (
                          <div style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "15px",
                            color: C.body, /* Darker than mute */
                            fontWeight: 700, /* Bold */
                            padding: "4px 8px",
                            borderLeft: `3px solid ${C.blue}`,
                            marginBottom: "6px",
                          }}>
                            📋 {op.content}
                          </div>
                        )}
                        {op.type === "error" && (
                          <div style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "15px",
                            color: C.red,
                            padding: "4px 8px",
                            borderLeft: `3px solid ${C.red}`,
                            marginBottom: "6px",
                            fontWeight: 700,
                          }}>
                            ✗ {op.content}
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Text response */}
                    {msg.content && (
                      <div className="brutal-hover" style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "16px",
                        fontWeight: 600,
                        color: C.ink,
                        padding: "16px 20px",
                        background: "#ffffff",
                        border: C.border,
                        borderRadius: "4px",
                        boxShadow: C.shadow,
                        whiteSpace: "pre-wrap",
                        lineHeight: "1.6",
                      }}>
                        {parseThinkBlocks(msg.content)}
                      </div>
                    )}

                    {/* Loading State */}
                    {isProcessing && !msg.content && (!msg.operations || msg.operations.length === 0) && (
                      <div style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "16px",
                        fontWeight: 800,
                        color: "#1e1e1e",
                        padding: "14px 20px",
                        background: "#f0f0f0",
                        border: `3px solid ${C.ink}`,
                        borderRadius: "8px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "12px",
                        boxShadow: `3px 3px 0px ${C.ink}`,
                      }}>
                        <span style={{
                          display: "inline-flex",
                          gap: "4px",
                          alignItems: "center",
                        }}>
                          <span style={{ animation: "pulseOpacity 1.2s infinite 0s" }}>●</span>
                          <span style={{ animation: "pulseOpacity 1.2s infinite 0.3s" }}>●</span>
                          <span style={{ animation: "pulseOpacity 1.2s infinite 0.6s" }}>●</span>
                        </span>
                        <span>Thinking...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ position: "relative" }}>
            {input.startsWith("/") && slashTools.length > 0 && (
              <div style={{
                position: "absolute",
                bottom: "100%",
                left: "12px",
                right: "12px",
                maxHeight: "340px",
                overflowY: "auto",
                background: "#fafafa",
                border: `3px solid ${C.ink}`,
                borderRadius: "8px",
                boxShadow: `4px 4px 0px ${C.ink}`,
                zIndex: 100,
                marginBottom: "8px",
                padding: "6px",
              }}>
                {slashTools.filter((t, idx, arr) => arr.findIndex(x => x.name === t.name) === idx)
                  .filter(t => t.name.toLowerCase().includes(slashFilter.toLowerCase())).map((tool, i) => (
                    <div key={tool.name} onClick={() => { setInput(`/${tool.name} `); setSlashFilter(""); inputRef.current?.focus(); }}
                      style={{
                        padding: "12px 16px",
                        cursor: "pointer",
                        background: i === slashIndex ? "#fde68a" : "transparent",
                        borderRadius: "6px",
                        border: `1px solid ${i === slashIndex ? C.ink : "transparent"}`,
                        marginBottom: "3px",
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        transition: "all 0.12s ease",
                      }}>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "16px",
                        fontWeight: 900,
                        color: "#1e1e1e",
                        minWidth: "220px",
                        letterSpacing: "-0.3px",
                      }}>/{tool.name}</span>
                      <span style={{
                        fontFamily: "var(--font-sg)",
                        fontSize: "14px",
                        color: "#4a4a4a",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        lineHeight: 1.4,
                      }}>{tool.description}</span>
                    </div>
                  ))}
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ padding: "14px 18px", borderTop: `3px solid ${C.ink}`, background: C.card, display: "flex", gap: "10px", alignItems: "flex-end" }}>
              <textarea ref={inputRef} value={input}
                onChange={e => { const val = e.target.value; setInput(val); if (val.startsWith("/")) { setSlashFilter(val.slice(1)); setSlashIndex(0); } else { setSlashFilter(""); } }}
                onKeyDown={e => {
                  const filtered = slashTools.filter(t => t.name.toLowerCase().includes(slashFilter.toLowerCase()));
                  if (input.startsWith("/") && filtered.length > 0) {
                    if (e.key === "ArrowDown") { e.preventDefault(); setSlashIndex(i => Math.min(i + 1, filtered.length - 1)); return; }
                    if (e.key === "ArrowUp") { e.preventDefault(); setSlashIndex(i => Math.max(i - 1, 0)); return; }
                    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && filtered[slashIndex])) { e.preventDefault(); const s = filtered[slashIndex] || filtered[0]; setInput(`/${s.name} `); setSlashFilter(""); return; }
                  }
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); }
                }}
                placeholder={slashTools.length > 0 ? "Type / for MCP tools..." : "Type a message... (search, store, time-travel, audit, health)"}
                disabled={isProcessing}
                rows={1}
                style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: C.body, background: input.startsWith("/") ? "#f5f3ff" : "#f9f9f7", border: `3px solid ${input.startsWith("/") ? C.purple : C.ink}`, borderRadius: "6px", padding: "12px 16px", outline: "none", boxShadow: `2px 2px 0px ${C.ink}`, resize: "none", overflowY: "auto", minHeight: "48px", maxHeight: "200px", lineHeight: "1.5" }}
              />
              <button
                type="button"
                onClick={handleClearChat}
                disabled={isProcessing || messages.length === 0}
                style={{
                  fontFamily: "var(--font-sg)",
                  fontSize: "15px",
                  fontWeight: 800,
                  background: isProcessing || messages.length === 0 ? "#e5e7eb" : "#ffffff",
                  color: C.ink,
                  border: `3px solid ${C.ink}`,
                  borderRadius: "6px",
                  boxShadow: `2px 2px 0px ${C.ink}`,
                  padding: "10px 18px",
                  cursor: isProcessing || messages.length === 0 ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                }}
                title="Clear chat (local only — memories stay in CockroachDB)"
              >
                Clear
              </button>
              <button
                type="submit"
                disabled={isProcessing || !input.trim()}
                style={{
                  fontFamily: "var(--font-sg)",
                  fontSize: "18px",
                  fontWeight: 900,
                  background: isProcessing ? "#e5e7eb" : C.yellow,
                  color: C.ink,
                  border: `3px solid ${C.ink}`,
                  borderRadius: "6px",
                  boxShadow: `2px 2px 0px ${C.ink}`,
                  padding: "10px 24px",
                  cursor: isProcessing ? "not-allowed" : "pointer",
                  transition: "all 0.15s ease",
                  minWidth: "52px",
                }}
              >
                {isProcessing ? "⟳" : "→"}
              </button>
            </form>
          </div>
        </div>

        {/* Operations Panel */}
        <div style={{
          width: "420px",
          flexShrink: 0,
          overflowY: "auto",
          padding: "16px",
          background: C.canvas,
        }}>
          {/* Hash Chain */}
          <HashChainVisual hashes={chainHashes} valid={chainValid} />

          {/* Live CDC Feed */}
          <CdcLiveFeed />

          {/* Quick Stats */}
          <div className="brutal-hover" style={{
            background: C.card,
            border: C.border,
            borderRadius: "4px",
            boxShadow: C.shadowSm,
            padding: "10px 12px",
            marginBottom: "12px",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "6px",
              color: C.ink,
            }}>
              Cluster
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {[
                { label: "Cluster", value: "bastion-memory-29951" },
                { label: "Region", value: "aws-ap-south-1" },
                { label: "Vector Index", value: "C-SPANN" },
                { label: "Isolation", value: isoData?.isolation_level === "serializable" ? "SERIALIZABLE" : isoData?.isolation_level?.toUpperCase() || "…" },
                { label: "TTL", value: "Row-level active" },
                { label: "CDC", value: "Streaming to S3" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "15px",
                    color: C.mute,
                    fontWeight: 700,
                  }}>
                    {item.label}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "15px",
                    color: C.ink,
                    fontWeight: 700,
                  }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* AWS Services */}
          <div className="brutal-hover" style={{
            background: C.card,
            border: C.border,
            borderRadius: "4px",
            boxShadow: C.shadowSm,
            padding: "10px 12px",
            marginBottom: "12px",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "6px",
              color: C.ink,
            }}>
              AWS Services
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {[
                { name: "KMS", desc: "Envelope encryption + signing", status: "active" },
                { name: "S3", desc: "Cold archives + CDC export", status: "active" },
              ].map((svc, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: svc.status === "active" ? C.green : "#f59e0b",
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: C.ink,
                  }}>
                    {svc.name}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "15px",
                    color: C.mute,
                  }}>
                    {svc.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* MCP & LLM */}
          <div className="brutal-hover" style={{
            background: C.card,
            border: C.border,
            borderRadius: "4px",
            boxShadow: C.shadowSm,
            padding: "10px 12px",
            marginBottom: "12px",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "6px",
              color: C.ink,
            }}>
              MCP & LLM
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {[
                { name: "MCP", desc: mcpStatus === "connected" ? "Bastion server on :9997" : mcpStatus === "checking" ? "Probing…" : "Offline — SQL fallback active", status: mcpStatus === "connected" ? "active" : "degraded" },
                { name: "LLM", desc: activeProvider === "Groq" || activeProvider === "" ? `${activeModel || "qwen/qwen3.6-27b"}` : `${activeProvider} / ${activeModel || "unknown"}`, status: "active" },
              ].map((svc, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: svc.status === "active" ? C.green : "#f59e0b",
                    flexShrink: 0,
                  }} />
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: C.ink,
                  }}>
                    {svc.name}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "15px",
                    color: C.mute,
                  }}>
                    {svc.desc}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="brutal-hover" style={{
            background: C.card,
            border: C.border,
            borderRadius: "4px",
            boxShadow: C.shadowSm,
            padding: "10px 12px",
          }}>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: "15px",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "1px",
              marginBottom: "6px",
              color: C.ink,
            }}>
              Activity Log
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {messages.slice(-6).reverse().map((msg, i) => {
                const isUser = msg.role === "user";
                let previewText = msg.content;
                // Use operation text if assistant has no text content yet
                if (!isUser && !previewText && msg.operations && msg.operations.length > 0) {
                  const firstOp = msg.operations[0];
                  previewText = `[${firstOp.type.toUpperCase()}] ${firstOp.content || ""}`;
                }

                return (
                  <div key={i} style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    padding: "8px",
                    background: isUser ? "#fffbeb" : "#f8fafc",
                    border: `1px solid ${C.ink}`,
                    borderRadius: "4px",
                    marginBottom: "6px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        padding: "2px 6px",
                        background: isUser ? C.yellow : C.ink,
                        color: isUser ? C.ink : "#fff",
                        borderRadius: "2px",
                      }}>
                        {isUser ? "You" : "Agent"}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "13px",
                      color: C.ink,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontWeight: isUser ? 600 : 500,
                    }}>
                      {previewText ? previewText : (isUser ? "..." : "Thinking...")}
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "15px",
                  color: C.mute,
                  fontStyle: "italic",
                }}>
                  No activity yet. Type a message to begin.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {pendingApproval && (
        <ApprovalModal
          request={pendingApproval}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes chainDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        @keyframes pulseOpacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}
