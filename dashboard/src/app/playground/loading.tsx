export default function PlaygroundLoading() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", gap: "16px", background: "#0a0508",
    }}>
      <div style={{
        width: "48px", height: "48px", border: "3px solid rgba(255,170,0,.15)",
        borderTop: "3px solid #ffaa00", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{
        fontFamily: "var(--font-mono)", fontSize: "12px",
        color: "#8a8290", letterSpacing: "2px", textTransform: "uppercase",
      }}>
        Loading Playground...
      </div>
      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
