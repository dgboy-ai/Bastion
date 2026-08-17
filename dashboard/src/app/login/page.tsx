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
    // Only skip the login form if we already hold a valid session cookie.
    // (Do NOT check /api/health — it's public and would loop with the proxy.)
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((res) => res.json())
      .then((data) => {
        if (data?.authenticated) router.replace(redirect);
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
        background: "#f8f9fa",
        fontFamily: "'Space Grotesk', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          padding: "48px 44px",
          background: "#ffffff",
          border: "3px solid #000000",
          borderRadius: "16px",
          boxShadow: "6px 6px 0px #000000",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: "#000",
              marginBottom: 8,
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            Bastion
          </div>
          <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
            Forensic Memory System
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 900,
                color: "#374151",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
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
                padding: "14px 18px",
                background: "#f9fafb",
                border: "2.5px solid #000000",
                borderRadius: "8px",
                color: "#000",
                fontSize: 14,
                fontWeight: 600,
                outline: "none",
                boxSizing: "border-box",
                boxShadow: "2px 2px 0px #000000",
                fontFamily: "'Space Grotesk', system-ui, sans-serif",
              }}
              onFocus={(e) => {
                e.target.style.boxShadow = "3px 3px 0px #000000";
                e.target.style.background = "#fff";
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = "2px 2px 0px #000000";
                e.target.style.background = "#f9fafb";
              }}
            />
            <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280", fontWeight: 600, textAlign: "right" }}>
              Demo access: enter <strong>bastion</strong>
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "#fef2f2",
                border: "2px solid #b91c1c",
                borderRadius: "8px",
                color: "#b91c1c",
                fontSize: 13,
                fontWeight: 800,
                marginBottom: 20,
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
              padding: "14px 18px",
              background: loading ? "#9ca3af" : "#000000",
              border: "2.5px solid #000000",
              borderRadius: "8px",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "3px 3px 0px #000000",
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              letterSpacing: "0.5px",
              textTransform: "uppercase",
              transition: "all 0.15s",
            }}
          >
            {loading ? "Authenticating..." : "Enter Dashboard"}
          </button>
        </form>

        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            fontSize: 10,
            color: "#9ca3af",
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: "0.5px",
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
            background: "#f8f9fa",
            color: "#9ca3af",
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
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