"use client";

import { useCallback, useEffect, useState } from "react";

export default function GlobalErrorHandler() {
  const [error, setError] = useState<string | null>(null);

  const dismiss = useCallback(() => setError(null), []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[GlobalErrorHandler]", event.error || event.message);
      setError(event.message || String(event.error));
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[GlobalErrorHandler] Unhandled rejection:", event.reason);
      setError(String(event.reason));
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (!error) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "10px 20px",
        background: "#b91c1c",
        color: "#fff",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontFamily: "monospace",
        fontSize: "13px",
      }}
    >
      <span>{error}</span>
      <button onClick={dismiss} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "18px", lineHeight: 1 }} aria-label="Dismiss error">&times;</button>
    </div>
  );
}
