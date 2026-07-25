"use client";

import { useEffect, useRef, useState } from "react";

interface LiveEvent {
  type: string;
  event?: string;
  agentId?: string;
  memoryId?: string;
  content?: string;
  timestamp?: string;
  message?: string;
}

export default function LiveEventFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const rafRef = useRef<number | null>(null);
  const tailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;
    let connecting = false;

    function connect() {
      if (connecting) return;
      connecting = true;
      const newEs = new EventSource("/api/events");
      es = newEs;

      newEs.onopen = () => {
        connecting = false;
        setConnected(true);
        retryDelay = 1000;
      };

      newEs.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as LiveEvent;
          setEvents((prev) => {
            const next = [...prev, data];
            return next.length > 50 ? next.slice(-50) : next;
          });
        } catch {
          // ignore parse errors
        }
      };

      newEs.onerror = () => {
        connecting = false;
        setConnected(false);
        newEs.close();
        if (es === newEs) es = null;
        retryTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30000);
          connect();
        }, retryDelay);
      };
    }

    connect();

    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Auto-scroll removed — users should control their own scroll position
  // The feed updates in place without forcing scroll to bottom

  return (
    <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <span style={{
          width: "8px", height: "8px", borderRadius: "50%",
          backgroundColor: connected ? "var(--accent-emerald)" : "var(--accent-sunset)",
          display: "inline-block",
        }} />
        <span>{connected ? "Live" : "Disconnected"}</span>
        <span style={{ color: "var(--mute)" }}>{events.filter(e => e.type === "event").length} events</span>
      </div>
      <div style={{ maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
        {events.filter(e => e.type === "event").slice(-20).map((evt, i) => (
          <div key={i} style={{ display: "flex", gap: "6px", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span style={{ color: "var(--accent-breeze)", whiteSpace: "nowrap" }}>
              {evt.timestamp ? new Date(evt.timestamp).toLocaleTimeString() : ""}
            </span>
            <span style={{
              color: evt.event?.includes("conflict") ? "var(--accent-sunset)" :
                     evt.event?.includes("anomaly") ? "var(--accent-magenta)" :
                     evt.event?.includes("heal") ? "var(--accent-emerald)" :
                     "var(--ink)",
              whiteSpace: "nowrap",
            }}>
              {evt.event}
            </span>
            <span style={{ color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {evt.content ?? evt.message ?? ""}
            </span>
          </div>
        ))}
        <div ref={tailRef} />
      </div>
    </div>
  );
}
