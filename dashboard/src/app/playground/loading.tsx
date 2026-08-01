export default function PlaygroundLoading() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: "75vh", gap: "16px", background: "transparent",
    }}>
      <div style={{
        width: "48px", height: "48px", border: "4px solid #000000",
        borderTop: "4px solid #ff5e00", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        boxShadow: "2px 2px 0px #000000"
      }} />
      <div style={{
        fontFamily: "'Space Grotesk', sans-serif", fontSize: "13px", fontWeight: 900,
        color: "#000000", letterSpacing: "1.5px", textTransform: "uppercase",
      }}>
        Loading Live Demo...
      </div>
      <style>{`@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
