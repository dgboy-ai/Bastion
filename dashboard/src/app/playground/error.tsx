"use client";

import Link from "next/link";

export default function PlaygroundError({ error, reset }: { error: Error; reset: () => void }) {
  const isNetwork = error.message?.includes("fetch") || error.message?.includes("network") || error.message?.includes("Failed to fetch");

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "80vh", gap: "16px", padding: "40px", background: "#0a0508",
    }}>
      <div style={{
        width: "80px", height: "80px", borderRadius: "50%",
        background: isNetwork ? "rgba(255,68,68,0.08)" : "rgba(255,145,0,0.08)",
        border: `2px solid ${isNetwork ? "rgba(255,68,68,0.2)" : "rgba(255,145,0,0.2)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "32px", marginBottom: "8px",
      }}>
        {isNetwork ? "📡" : "⚠️"}
      </div>
      <div style={{ fontSize: "22px", color: "#ffffff", fontWeight: 700 }}>
        {isNetwork ? "Connection Lost" : "Something Went Wrong"}
      </div>
      <div style={{
        fontSize: "14px", color: "#a0a0b0", maxWidth: "440px", textAlign: "center", lineHeight: "1.6",
      }}>
        {isNetwork
          ? "Unable to reach CockroachDB. Check your internet connection and try again."
          : error.message || "An unexpected error occurred while loading the playground."
        }
      </div>
      <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
        <button onClick={reset} style={{
          padding: "12px 28px", borderRadius: "10px", border: "none",
          background: "linear-gradient(135deg, #ff5e00, #ff9100)",
          color: "#fff", fontWeight: 700, fontSize: "14px", cursor: "pointer",
        }}>
          Try Again
        </button>
        <Link href="/" style={{
          padding: "12px 28px", borderRadius: "10px",
          border: "1px solid #2a2a35", background: "#1a1a24",
          color: "#a0a0b0", fontSize: "14px", fontWeight: 600, textDecoration: "none",
        }}>
          Go Home
        </Link>
      </div>
    </div>
  );
}
