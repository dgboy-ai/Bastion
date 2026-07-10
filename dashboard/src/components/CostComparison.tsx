"use client";

import { memo } from "react";

const CostComparison = memo(function CostComparison() {
  const competitors = [
    { name: "Bastion", monthly: 0, annual: 0, color: "#10b981", features: "Full SDK + Dashboard + CRDT + Compliance" },
    { name: "Mem0", monthly: 249, annual: 2988, color: "#ef4444", features: "Graph memory (Pro tier)" },
    { name: "Zep", monthly: 125, annual: 1500, color: "#f97316", features: "Temporal graph (50K credits)" },
    { name: "Letta", monthly: 99, annual: 1188, color: "#eab308", features: "Cloud pricing" },
  ];

  const maxAnnual = Math.max(...competitors.map((c) => c.annual));

  return (
    <div style={{ background: "var(--canvas-card)", border: "1px solid var(--border)", borderRadius: "6px", padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h3 style={{ fontSize: "14px", fontFamily: "var(--font-mono)", color: "var(--ink)", letterSpacing: "1px" }}>
          COST COMPARISON
        </h3>
        <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)", background: "rgba(16, 185, 129, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
          CRDB SERVERLESS = FREE
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {competitors.map((c) => (
          <div key={c.name} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "60px", fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--ink)", fontWeight: c.name === "Bastion" ? 700 : 400 }}>
              {c.name}
            </div>
            <div style={{ flex: 1, height: "24px", background: "var(--canvas-soft)", borderRadius: "4px", overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  height: "100%",
                  width: `${maxAnnual > 0 ? (c.annual / maxAnnual) * 100 : 0}%`,
                  background: c.color,
                  borderRadius: "4px",
                  transition: "width 0.5s ease",
                  minWidth: c.annual === 0 ? "2px" : undefined,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  fontSize: "10px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink)",
                  fontWeight: 600,
                }}
              >
                {c.monthly === 0 ? "$0/mo" : `$${c.monthly}/mo`}
              </span>
            </div>
            <div style={{ width: "120px", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)", textAlign: "right" }}>
              ${c.annual.toLocaleString()}/yr
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>Annual savings vs Mem0</span>
          <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)", fontWeight: 700 }}>$2,988</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>Annual savings vs Zep</span>
          <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)", fontWeight: 700 }}>$1,500</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>Annual savings vs Letta</span>
          <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)", fontWeight: 700 }}>$1,188</span>
        </div>
      </div>

      <div style={{ marginTop: "16px", padding: "12px", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)", borderRadius: "6px" }}>
        <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)", marginBottom: "4px" }}>
          WHAT BASTION INCLUDES FOR FREE
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          {[
            "Hash-chain integrity",
            "AS OF SYSTEM TIME",
            "CRDT conflict resolution",
            "OWASP ASI06 detection",
            "EU AI Act compliance",
            "C-SPANN vector search",
            "Knowledge graph",
            "CDC self-healing",
            "Python + TypeScript SDK",
            "3 framework adapters",
          ].map((feature) => (
            <div key={feature} style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)", display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ color: "var(--accent-emerald)" }}>✓</span>
              {feature}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default CostComparison;
