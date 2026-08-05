import { D } from "./theme";

export function FeatureCard({
  title,
  description,
  color,
  icon,
}: {
  title: string;
  description: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  const c = color || D.gold;
  return (
    <div style={{
      display: "flex",
      gap: "14px",
      padding: "14px 16px",
      background: D.card,
      border: `1px solid ${D.border}`,
      borderRadius: "8px",
    }}>
      <div style={{ width: "4px", borderRadius: "2px", background: c, flexShrink: 0 }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {icon && <span style={{ fontSize: "14px" }}>{icon}</span>}
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "var(--font-sg)" }}>{title}</div>
        </div>
        <div style={{ fontSize: "13px", color: D.mute, marginTop: "2px", lineHeight: 1.5 }}>{description}</div>
      </div>
    </div>
  );
}
