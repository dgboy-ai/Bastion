"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  useEffect(() => {
    fetch("/api/health", { credentials: "same-origin" })
      .then((res) => {
        if (res.ok) router.replace(redirect);
      })
      .catch(() => {});
  }, [router, redirect]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/login/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      router.push(data.redirect || redirect);
    } catch {
      setError("Connection failed. Try again.");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0508",
        fontFamily: "'Inter', 'Space Grotesk', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: 40,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16,
          backdropFilter: "blur(20px)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#fff",
              marginBottom: 8,
            }}
          >
            Bastion
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.5)" }}>
            Forensic Memory System
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(255,255,255,0.6)",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Passphrase
            </label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Enter dashboard passphrase"
              autoFocus
              style={{
                width: "100%",
                padding: "12px 16px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                color: "#fff",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(139, 92, 246, 0.5)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(255,255,255,0.1)";
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 8,
                color: "#ef4444",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passphrase}
            style={{
              width: "100%",
              padding: "12px 16px",
              background: loading ? "rgba(139, 92, 246, 0.5)" : "#8b5cf6",
              border: "none",
              borderRadius: 8,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {loading ? "Authenticating..." : "Enter Dashboard"}
          </button>
        </form>

        <div
          style={{
            marginTop: 24,
            textAlign: "center",
            fontSize: 12,
            color: "rgba(255,255,255,0.3)",
          }}
        >
          SHA-256 hash chains · CockroachDB · OWASP ASI06
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0508",
            color: "rgba(255,255,255,0.5)",
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        >
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
