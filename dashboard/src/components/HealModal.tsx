"use client";

import { useEffect, useRef, useState } from "react";

interface HealEvent {
  type: string;
  step?: number;
  label?: string;
  sql?: string;
  rows?: number;
  data?: Record<string, unknown>[];
  message?: string;
  healed?: number;
  total?: number;
  proof?: Record<string, unknown>;
}

interface HealModalProps {
  agentId: string;
  onClose: () => void;
  onComplete: () => void;
}

export default function HealModal({ agentId, onClose, onComplete }: HealModalProps) {
  const [events, setEvents] = useState<HealEvent[]>([]);
  const [isRunning, setIsRunning] = useState(true);
  const [finalResult, setFinalResult] = useState<HealEvent | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current = new AbortController();

    const run = async () => {
      try {
        const res = await fetch("/api/demo/heal-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
          signal: abortRef.current?.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                setEvents(prev => [...prev, event]);
                if (event.type === "done") {
                  setFinalResult(event);
                  setIsRunning(false);
                  onComplete();
                }
                if (event.type === "error") {
                  setIsRunning(false);
                }
              } catch {}
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setEvents(prev => [...prev, { type: "error", message: String(err) }]);
        setIsRunning(false);
      }
    };

    run();
    return () => abortRef.current?.abort();
  }, [agentId, onComplete]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const renderSql = (sql: string) => {
    return sql
      .replace(/(SELECT|FROM|WHERE|ORDER BY|GROUP BY|LIMIT|INSERT INTO|VALUES|DELETE FROM|AS OF SYSTEM TIME|AND|OR|NULL|vector)/gi, '<span style="color:#7c3aed;font-weight:800">$1</span>')
      .replace(/('[^']*')/g, '<span style="color:#047857">$1</span>')
      .replace(/(agent_memory)/g, '<span style="color:#b45309">$1</span>');
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: "20px"
    }}>
      <div style={{
        background: "#0f172a", borderRadius: "12px", border: "2px solid #334155",
        width: "100%", maxWidth: "800px", maxHeight: "80vh",
        display: "flex", flexDirection: "column", overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #334155",
          display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              width: "10px", height: "10px", borderRadius: "50%",
              background: isRunning ? "#facc15" : "#22c55e",
              animation: isRunning ? "pulse 1s infinite" : "none"
            }} />
            <span style={{ color: "#f1f5f9", fontSize: "14px", fontWeight: 800, fontFamily: "monospace" }}>
              {isRunning ? "HEALING IN PROGRESS..." : "HEAL COMPLETE"}
            </span>
          </div>
          <button onClick={() => { abortRef.current?.abort(); onClose(); }} style={{
            background: "transparent", border: "1px solid #475569",
            color: "#94a3b8", padding: "4px 12px", borderRadius: "6px",
            cursor: "pointer", fontSize: "12px", fontFamily: "monospace"
          }}>
            ✕ Close
          </button>
        </div>

        {/* Agent badge */}
        <div style={{ padding: "10px 20px", borderBottom: "1px solid #1e293b" }}>
          <span style={{
            background: "#1e293b", border: "1px solid #334155",
            borderRadius: "4px", padding: "3px 10px", fontSize: "11px",
            color: "#94a3b8", fontFamily: "monospace"
          }}>
            agent: {agentId}
          </span>
        </div>

        {/* Stream output */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: "auto", padding: "16px 20px",
          fontFamily: "'JetBrains Mono', monospace", fontSize: "12px",
          lineHeight: "1.6"
        }}>
          {events.map((event, i) => (
            <div key={i} style={{ marginBottom: "12px" }}>
              {event.type === "step" && (
                <div style={{ color: "#60a5fa", fontWeight: 800, marginTop: "8px" }}>
                  ▸ Step {event.step}: {event.label}
                </div>
              )}
              {event.type === "query" && (
                <div style={{
                  background: "#1e293b", border: "1px solid #334155",
                  borderRadius: "6px", padding: "10px 14px", marginTop: "6px",
                  marginBottom: "4px"
                }}>
                  <div style={{ color: "#64748b", fontSize: "10px", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    SQL Query
                  </div>
                  <div
                    style={{ color: "#e2e8f0", wordBreak: "break-all" }}
                    dangerouslySetInnerHTML={{ __html: renderSql(event.sql || "") }}
                  />
                </div>
              )}
              {event.type === "result" && (
                <div style={{
                  background: "#0f172a", border: "1px solid #1e293b",
                  borderRadius: "6px", padding: "8px 12px", marginTop: "4px"
                }}>
                  <div style={{ color: "#22c55e", fontSize: "10px", marginBottom: "4px" }}>
                    ✓ {event.rows} row{event.rows !== 1 ? "s" : ""} returned
                  </div>
                  {event.data && event.data.map((row, j) => (
                    <div key={j} style={{ color: "#94a3b8", fontSize: "11px", marginLeft: "12px" }}>
                      {JSON.stringify(row)}
                    </div>
                  ))}
                </div>
              )}
              {event.type === "info" && (
                <div style={{ color: "#facc15", fontSize: "11px", marginTop: "4px" }}>
                  ℹ {event.message}
                </div>
              )}
              {event.type === "progress" && (
                <div style={{ color: "#22c55e", fontSize: "11px", marginTop: "4px" }}>
                  ✓ Healed {event.healed}/{event.total}
                </div>
              )}
              {event.type === "error" && (
                <div style={{
                  color: "#ef4444", background: "#1e1b4b",
                  border: "1px solid #7f1d1d", borderRadius: "6px",
                  padding: "8px 12px", marginTop: "4px"
                }}>
                  ✗ {event.message}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Final proof */}
        {finalResult && (
          <div style={{
            padding: "16px 20px", borderTop: "1px solid #334155",
            background: "#052e16", border: "2px solid #22c55e"
          }}>
            <div style={{ color: "#22c55e", fontWeight: 800, fontSize: "13px", marginBottom: "8px", fontFamily: "monospace" }}>
              ✓ PROOF: {finalResult.healed} memories healed via {String(finalResult.proof?.method)}
            </div>
            <div style={{ color: "#86efac", fontSize: "11px", fontFamily: "monospace" }}>
              trust_level: {String(finalResult.proof?.trust_level)} | provenance: {String(finalResult.proof?.provenance)}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
