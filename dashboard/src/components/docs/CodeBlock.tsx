"use client";

import { useState } from "react";
import { D } from "./theme";

export function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{
      background: "#0a0608",
      border: `1px solid ${D.borderGold}`,
      borderRadius: "8px",
      overflow: "hidden",
      margin: "16px 0",
      boxShadow: "0 4px 16px rgba(0,0,0,.4)",
    }}>
      <div style={{
        padding: "8px 14px",
        background: "rgba(255,255,255,.03)",
        borderBottom: `1px solid ${D.border}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: "5px" }}>
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ff5f57" }} />
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#febc2e" }} />
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#28c840" }} />
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: D.mute }}>{lang}</span>
          <button
            onClick={handleCopy}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              color: copied ? "#4f8" : D.mute,
              letterSpacing: "1px",
            }}
          >
            {copied ? "COPIED" : "COPY"}
          </button>
        </div>
      </div>
      <pre style={{
        padding: "14px 16px",
        margin: 0,
        fontSize: "12.5px",
        color: "#d0c8d4",
        fontFamily: "var(--font-mono)",
        lineHeight: 1.6,
        overflowX: "auto",
      }}><code>{code}</code></pre>
    </div>
  );
}
