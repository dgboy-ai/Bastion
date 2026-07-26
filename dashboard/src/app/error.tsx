"use client";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0508",
        fontFamily: "'Inter', system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          padding: 40,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: 16,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.6 }}>⚠</div>
        <h2
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#ef4444",
            marginBottom: 12,
          }}
        >
          Application Error
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.6,
            marginBottom: 24,
          }}
        >
          {error.message || "An unexpected error occurred. Our team has been notified."}
        </p>
        {error.digest && (
          <p
            style={{
              fontSize: 11,
              color: "rgba(255,255,255,0.3)",
              fontFamily: "monospace",
              marginBottom: 20,
            }}
          >
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            padding: "10px 24px",
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: 8,
            color: "#ef4444",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
