import { D } from "./theme";

export function PageHeader({ eyebrow, title, accent }: { eyebrow: string; title: React.ReactNode; accent?: string }) {
  const c = accent || D.gold;
  return (
    <div style={{ marginBottom: "32px" }}>
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "10px",
        color: c,
        textTransform: "uppercase",
        letterSpacing: "3px",
        fontWeight: 700,
        marginBottom: "12px",
      }}>{eyebrow}</div>
      <h1 style={{
        fontSize: "clamp(32px,4vw,48px)",
        fontWeight: 900,
        color: "#fff",
        fontFamily: "var(--font-sg)",
        margin: 0,
        lineHeight: 1.1,
      }}>{title}</h1>
    </div>
  );
}
