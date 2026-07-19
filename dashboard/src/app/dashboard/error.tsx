"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "16px" }}>
      <div style={{ fontSize: "48px", opacity: 0.3 }}>⚠️</div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--ink)" }}>Dashboard Error</h2>
      <p style={{ fontSize: "14px", color: "var(--mute)", maxWidth: "400px", textAlign: "center" }}>
        {error.message || "Something went wrong loading the dashboard."}
      </p>
      <button onClick={reset} className="btn btn-outline" style={{ marginTop: "8px" }}>
        Try Again
      </button>
    </div>
  );
}
