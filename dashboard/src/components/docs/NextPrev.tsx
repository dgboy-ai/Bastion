import Link from "next/link";
import { D, navItems, getAdjacentPages } from "./theme";

export function NextPrev({ pathname }: { pathname: string }) {
  const { prev, next } = getAdjacentPages(pathname);
  if (!prev && !next) return null;
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      gap: "16px",
      marginTop: "48px",
      paddingTop: "24px",
      borderTop: `1px solid ${D.borderGold}`,
      flexWrap: "wrap",
    }}>
      {prev ? (
        <Link href={prev.href} style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          padding: "14px 18px",
          background: D.card,
          border: `1px solid ${D.border}`,
          borderRadius: "8px",
          textDecoration: "none",
          transition: "all .2s",
          flex: "1 1 200px",
          maxWidth: "300px",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: D.mute, textTransform: "uppercase", letterSpacing: "1px" }}>← Previous</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: D.gold, fontFamily: "var(--font-sg)" }}>{prev.icon} {prev.label}</span>
        </Link>
      ) : <div />}
      {next ? (
        <Link href={next.href} style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          padding: "14px 18px",
          background: D.card,
          border: `1px solid ${D.border}`,
          borderRadius: "8px",
          textDecoration: "none",
          transition: "all .2s",
          textAlign: "right",
          flex: "1 1 200px",
          maxWidth: "300px",
          marginLeft: "auto",
        }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: D.mute, textTransform: "uppercase", letterSpacing: "1px" }}>Next →</span>
          <span style={{ fontSize: "14px", fontWeight: 700, color: D.gold, fontFamily: "var(--font-sg)" }}>{next.icon} {next.label}</span>
        </Link>
      ) : <div />}
    </div>
  );
}
