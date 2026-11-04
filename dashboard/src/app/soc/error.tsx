"use client";

export default function SocError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: "16px" }}>
      <div style={{ fontSize: "48px", opacity: 0.3 }}>⚠️</div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "var(--ink)" }}>SOC View Unavailable</h2>
      <p style={{ fontSize: "14px", color: "var(--mute)", maxWidth: "400px", textAlign: "center" }}>
        This view could not be loaded. Please try again.
      </p>
      <button onClick={reset} className="btn btn-outline" style={{ marginTop: "8px" }}>
        Try Again
      </button>
    </div>
  );
}
