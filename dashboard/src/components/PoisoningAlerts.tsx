"use client";

interface Alert {
  severity: string;
  risk: string;
  count: number;
}

interface PoisoningAlertsProps {
  alerts: Alert[];
  onDismiss?: () => void;
}

const SEVERITY_STYLES: Record<string, { color: string; bg: string; border: string; label: string }> = {
  high: { color: "#ff3333", bg: "rgba(255, 51, 51, 0.06)", border: "rgba(255, 51, 51, 0.25)", label: "HIGH" },
  medium: { color: "#ff6600", bg: "rgba(255, 102, 0, 0.06)", border: "rgba(255, 102, 0, 0.25)", label: "MEDIUM" },
  low: { color: "#ffcc00", bg: "rgba(255, 204, 0, 0.06)", border: "rgba(255, 204, 0, 0.25)", label: "LOW" },
};

export default function PoisoningAlerts({ alerts, onDismiss }: PoisoningAlertsProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", background: "rgba(0, 255, 136, 0.04)", border: "1px solid rgba(0, 255, 136, 0.15)", borderRadius: "6px" }}>
        <span style={{ color: "var(--accent-emerald)", fontSize: "12px" }}>✓</span>
        <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: "var(--accent-emerald)" }}>NO POISONING THREATS DETECTED</span>
      </div>
    );
  }

  const highestSeverity = alerts.reduce((max, a) => {
    const order = { high: 3, medium: 2, low: 1 };
    return (order[a.severity as keyof typeof order] || 0) > (order[max.severity as keyof typeof order] || 0) ? a : max;
  }, alerts[0]);

  const style = SEVERITY_STYLES[highestSeverity.severity] || SEVERITY_STYLES.high;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: style.bg, border: `1px solid ${style.border}`, borderRadius: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: style.color, fontSize: "12px" }}>⚠</span>
          <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono)", color: style.color, fontWeight: 600, textTransform: "uppercase" }}>
              {style.label} — {alerts.length} Poisoning Alert{alerts.length > 1 ? "s" : ""}
            </span>
            <span style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
              {alerts.map(a => `${a.count}x ${a.risk}`).join(" · ")}
            </span>
          </div>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="btn btn-outline" style={{ fontSize: "8px", padding: "2px 6px", minWidth: "auto" }}>
            Dismiss
          </button>
        )}
      </div>
      {alerts.length > 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", paddingLeft: "8px" }}>
          {alerts.map((alert, idx) => {
            const s = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.high;
            return (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: s.color }} />
                <span style={{ fontWeight: 600, color: s.color }}>{s.label}:</span>
                <span>{alert.count} memories flagged as {alert.risk}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
