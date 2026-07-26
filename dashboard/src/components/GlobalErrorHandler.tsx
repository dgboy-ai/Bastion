"use client";

import { useEffect, useState, useCallback } from "react";

interface ErrorInfo {
  message: string;
  source?: string;
  timestamp: string;
}

export default function GlobalErrorHandler() {
  const [error, setError] = useState<ErrorInfo | null>(null);

  const handleError = useCallback((event: ErrorEvent) => {
    console.error("[GlobalErrorHandler]", event.error);
    setError({
      message: event.error?.message || "An unexpected error occurred",
      source: "window.error",
      timestamp: new Date().toISOString(),
    });
  }, []);

  const handleRejection = useCallback((event: PromiseRejectionEvent) => {
    console.error("[GlobalErrorHandler] Unhandled rejection:", event.reason);
    setError({
      message: String(event.reason?.message || event.reason || "Unhandled promise rejection"),
      source: "unhandledrejection",
      timestamp: new Date().toISOString(),
    });
  }, []);

  useEffect(() => {
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [handleError, handleRejection]);

  if (!error) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        maxWidth: 420,
        padding: "16px 20px",
        background: "rgba(15, 10, 20, 0.95)",
        border: "1px solid rgba(239, 68, 68, 0.4)",
        borderRadius: 12,
        backdropFilter: "blur(12px)",
        zIndex: 9999,
        fontFamily: "'Inter', system-ui, sans-serif",
        boxShadow: "0 8px 32px rgba(239, 68, 68, 0.15)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 14, color: "#ef4444", fontWeight: 600 }}>Error</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {error.source && `${error.source} · `}{new Date(error.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.5, marginBottom: 12 }}>
        {error.message.slice(0, 200)}
      </div>
      <button
        onClick={() => setError(null)}
        style={{
          padding: "6px 14px",
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 6,
          color: "#ef4444",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
