"use client";

export default function PlaygroundError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", gap: "16px", padding: "40px", background: "#0a0508",
    }}>
      <div style={{ fontSize: "48px", color: "#ff2a00" }}>!</div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "16px",
        color: "#ffffff", fontWeight: 700,
      }}>
        Playground Error
      </div>
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "12px",
        color: "#8a8290", maxWidth: "400px", textAlign: "center", lineHeight: "1.5",
      }}>
        {error.message || "Something went wrong"}
      </div>
      <button onClick={reset} style={{
        padding: "10px 24px", borderRadius: "8px", border: "1px solid rgba(255,170,0,.3)",
        background: "rgba(255,170,0,.08)", color: "#ffaa00", cursor: "pointer",
        fontSize: "13px", fontWeight: 600, fontFamily: "var(--font-mono)",
      }}>
        Try again
      </button>
    </div>
  );
}
