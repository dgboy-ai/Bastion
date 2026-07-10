"use client";

import type { PipelineEvent } from "./types";

export default function CdcEventList({ events }: { events: PipelineEvent[] }) {
  return (
    <div style={{ borderTop: "1px solid var(--glass-border)", paddingTop: "12px" }}>
      <div style={{ fontSize: "10px", color: "var(--mute)", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
        RECENT EVENTS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", maxHeight: "120px", overflowY: "auto" }}>
        {events.slice(0, 5).map((event) => (
          <div
            key={event.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 10px",
              background: "rgba(255,255,255,0.01)",
              border: "1px solid var(--glass-border)",
              borderRadius: "4px",
              fontSize: "9px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background:
                    event.type === "anomaly"
                      ? "#ff4444"
                      : event.type === "write"
                      ? "var(--accent-sunset)"
                      : "var(--accent-emerald)",
                }}
              />
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--body)" }}>
                {event.type.toUpperCase()}
              </span>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
              {event.latency}ms
            </span>
            <span style={{ fontFamily: "var(--font-mono)", color: "var(--mute)", fontSize: "8px" }}>
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
