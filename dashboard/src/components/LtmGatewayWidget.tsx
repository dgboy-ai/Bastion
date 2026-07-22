"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/fetch";

interface LtmStats {
  gateway: {
    total_checks: number;
    total_reuses: number;
    total_stores: number;
    total_tokens_saved: number;
    avg_similarity: number;
    reuse_rate: number;
  };
  cost_savings: {
    daily_usd: number;
    monthly_usd: number;
    annual_usd: number;
    avg_tokens_per_reuse: number;
    workflow_bypass_rate: number;
  };
  top_reused: { query: string; reuse_count: number; similarity: number }[];
}

const C = {
  card: "#120a0e", cardInner: "#1a1018", hairline: "rgba(255,170,0,.12)",
  ink: "#ffffff", body: "#c8c0cc", mute: "#8a8290",
  breeze: "#00e5ff", emerald: "#00ff88", sunset: "#ffaa00", lava: "#ff5500",
  magma: "#ff9c00", gold: "#ffc800",
};

export default function LtmGatewayWidget() {
  const [stats, setStats] = useState<LtmStats | null>(null);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchWithTimeout("/api/ltm-stats?hours=24")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (!cancelled) { setStats(data.data ?? data); setVisible(true); }
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 16, padding: 24 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C.lava, textTransform: "uppercase", letterSpacing: "1.5px" }}>
          LTM Gateway — Failed to load
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.hairline}`, borderRadius: 16, padding: 24, minHeight: 220 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.sunset, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 16 }}>
          LTM GATEWAY
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: C.cardInner, borderRadius: 10, height: 72, animation: "netherPulse 1.8s ease-in-out infinite" }} />
          ))}
        </div>
        <style>{`@keyframes netherPulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
      </div>
    );
  }

  const { gateway, cost_savings, top_reused } = stats;
  if (!gateway || !cost_savings) return null;
  const reusePercent = Math.round((gateway.reuse_rate ?? 0) * 100);
  const tokensK = (gateway.total_tokens_saved / 1000).toFixed(0);

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.hairline}`,
      borderRadius: 16,
      padding: 24,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: "opacity 0.5s ease, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${C.hairline}` }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.sunset, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>
            LTM GATEWAY
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>Long-Term Memory Reuse</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 999, padding: "4px 12px" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.emerald, boxShadow: `0 0 6px ${C.emerald}` }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C.emerald }}>ACTIVE</span>
        </div>
      </div>

      {/* Hero Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Saved Today", value: `$${cost_savings.daily_usd.toFixed(2)}`, color: C.emerald },
          { label: "Bypass Rate", value: `${reusePercent}%`, color: C.breeze },
          { label: "Tokens Saved", value: `${tokensK}K`, color: C.gold },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: C.cardInner, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${color}80, transparent)` }} />
            <div style={{ fontSize: 24, fontWeight: 900, color, fontFamily: "var(--font-sg)", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 10, color: C.mute, marginTop: 6, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "1px" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Stats Bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Checks", value: gateway.total_checks.toLocaleString(), color: C.body },
          { label: "Reuses", value: gateway.total_reuses.toLocaleString(), color: C.emerald },
          { label: "Stored", value: gateway.total_stores.toLocaleString(), color: C.body },
          { label: "Avg Match", value: `${(gateway.avg_similarity * 100).toFixed(1)}%`, color: C.breeze },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "10px 12px", border: `1px solid ${C.hairline}` }}>
            <div style={{ fontSize: 11, color: C.mute, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color, fontFamily: "var(--font-mono)" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Reuse Progress Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: C.mute, fontFamily: "var(--font-mono)" }}>Reuse Rate</span>
          <span style={{ fontSize: 11, color: C.emerald, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{reusePercent}%</span>
        </div>
        <div style={{ height: 6, background: "rgba(255,255,255,0.04)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 999,
            background: `linear-gradient(90deg, ${C.emerald}80, ${C.emerald})`,
            width: `${reusePercent}%`,
            boxShadow: `0 0 8px ${C.emerald}60`,
            transition: "width 1s cubic-bezier(0.16,1,0.3,1)",
          }} />
        </div>
      </div>

      {/* Cost Projections */}
      <div style={{ background: C.cardInner, borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: `1px solid ${C.hairline}` }}>
        <div style={{ fontSize: 10, color: C.mute, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "var(--font-mono)", marginBottom: 10 }}>Cost Savings Projection</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", textAlign: "center", gap: 8 }}>
          {[
            { label: "Monthly", value: `$${cost_savings.monthly_usd.toFixed(2)}` },
            { label: "Annual", value: `$${cost_savings.annual_usd.toFixed(2)}` },
            { label: "Avg Tokens", value: cost_savings.avg_tokens_per_reuse.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.emerald }}>{value}</div>
              <div style={{ fontSize: 10, color: C.mute, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Reused Queries */}
      {top_reused.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.mute, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "var(--font-mono)", marginBottom: 10 }}>Most Reused Analyses</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {top_reused.slice(0, 5).map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.015)", borderRadius: 8, padding: "8px 12px", border: `1px solid ${C.hairline}` }}>
                <span style={{ fontSize: 10, color: C.sunset, fontFamily: "var(--font-mono)", fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                <span style={{ fontSize: 12, color: C.body, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.query}</span>
                <span style={{ fontSize: 10, color: C.mute, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{item.reuse_count}×</span>
                <span style={{ fontSize: 10, color: C.emerald, fontFamily: "var(--font-mono)", flexShrink: 0 }}>{(item.similarity * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
