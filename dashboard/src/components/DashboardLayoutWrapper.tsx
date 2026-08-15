"use client";

import { useEffect, useState, Suspense, createContext, useContext } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import BackgroundParticles from "@/components/BackgroundParticles";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import { fetchWithTimeout } from "@/lib/fetch";
import Link from "next/link";
import Image from "next/image";

export interface ConnectionContextType {
  isMock: boolean;
  dbName: string;
}

export const ConnectionContext = createContext<ConnectionContextType>({
  isMock: true,
  dbName: "Simulated DB",
});

export function useConnection() {
  return useContext(ConnectionContext);
}

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isMock, setIsMock] = useState(true);
  const [dbName, setDbName] = useState("Simulated Mock");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dbConnInput, setDbConnInput] = useState("");
  const [testingConn, setTestingConn] = useState(false);
  const [connError, setConnError] = useState("");
  const [hasSavedConn, setHasSavedConn] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [authPassphrase, setAuthPassphrase] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  // Onboarding tour state
  const [tourStep, setTourStep] = useState<number | null>(() =>
    searchParams.get("tour") === "start" ? 1 : null,
  );

  const checkConnectionStatus = async () => {
    try {
      const res = await fetchWithTimeout("/api/health");
      if (res.ok) {
        const json = await res.json();
        const mockActive = json.meta?.mock === true;
        setIsMock(mockActive);
        
        const currentConn = sessionStorage.getItem("bastion_db_conn");
        if (!mockActive && currentConn) {
          try {
            const urlStr = currentConn.replace("postgresql://", "http://");
            const parsed = new URL(urlStr);
            setDbName(parsed.hostname.slice(0, 16) + (parsed.hostname.length > 16 ? "..." : ""));
          } catch {
            setDbName("Live CockroachDB");
          }
        } else if (!mockActive) {
          setDbName("CockroachDB Serverless");
        } else {
          setDbName("Simulated DB");
        }
      }
    } catch (e) {
      console.error("Failed to fetch database health status:", e);
      setIsMock(true);
    }
  };

  useEffect(() => {
    // Async data fetching — all setState calls happen after `await` (post-hydration),
    // so this is not a synchronous setState-in-effect. The rule cannot see through
    // the async function boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkConnectionStatus();
    
    try {
      const saved = sessionStorage.getItem("bastion_db_conn");
      if (saved) {
        setDbConnInput(saved);
        setHasSavedConn(true);
      }
    } catch {} // sessionStorage unavailable in private browsing
  }, []);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingConn(true);
    setConnError("");
    setNeedsAuth(false);
    setAuthError("");

    if (!dbConnInput.trim()) {
      try { sessionStorage.removeItem("bastion_db_conn"); } catch {}
      setTestingConn(false);
      setIsModalOpen(false);
      window.location.reload();
      return;
    }

    if (!dbConnInput.startsWith("postgresql://") && !dbConnInput.startsWith("postgres://") && !dbConnInput.startsWith("cockroachdb://")) {
      setConnError("Invalid protocol. Must begin with postgresql://, postgres://, or cockroachdb://");
      setTestingConn(false);
      return;
    }

    try {
      // Save temporarily so fetchWithTimeout sends x-bastion-conn header
      sessionStorage.setItem("bastion_db_conn", dbConnInput.trim());

      // Fresh clusters need to run all schema migrations on first connect, so
      // allow extra time for the health check to complete.
      const res = await fetchWithTimeout("/api/health", { timeout: 90_000 });
      const json = await res.json();

      if (res.status === 401 || json.code === "UNAUTHORIZED") {
        setNeedsAuth(true);
        setTestingConn(false);
        return;
      }

      if (!res.ok || json.success === false) {
        throw new Error(json.error || "Connection rejected by server — check credentials");
      }
      if (json.meta?.mock) {
        throw new Error("API fallback to mock data — connection string invalid or unreachable");
      }

      setHasSavedConn(true);
      setTestingConn(false);
      setIsModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      try { sessionStorage.removeItem("bastion_db_conn"); } catch {}
      setHasSavedConn(false);
      setConnError(err instanceof Error ? err.message : "Connection failed");
      setTestingConn(false);
    }
  };

  const handleAuthenticate = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/login/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase: authPassphrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || "Authentication failed");
        setAuthLoading(false);
        return;
      }
      setNeedsAuth(false);
      setAuthPassphrase("");
      setAuthError("");
      setAuthLoading(false);
      // Retry the connection test
      setTestingConn(true);
      try {
        // Save temporarily so fetchWithTimeout sends x-bastion-conn header
        sessionStorage.setItem("bastion_db_conn", dbConnInput.trim());

        const healthRes = await fetchWithTimeout("/api/health");
        const healthJson = await healthRes.json();
        if (!healthRes.ok || healthJson.success === false) {
          throw new Error(healthJson.error || "Connection rejected — check credentials");
        }
        if (healthJson.meta?.mock) {
          throw new Error("API fallback to mock data — connection string invalid or unreachable");
        }
        sessionStorage.setItem("bastion_db_conn", dbConnInput.trim());
        setHasSavedConn(true);
        setTestingConn(false);
        setIsModalOpen(false);
        window.location.reload();
      } catch (retryErr: unknown) {
        try { sessionStorage.removeItem("bastion_db_conn"); } catch {}
        setHasSavedConn(false);
        setConnError(retryErr instanceof Error ? retryErr.message : "Connection failed after auth");
        setTestingConn(false);
      }
    } catch {
      setAuthError("Login request failed");
      setAuthLoading(false);
    }
  };

  const handleClearConnection = () => {
    try { sessionStorage.removeItem("bastion_db_conn"); } catch {}
    setHasSavedConn(false);
    setDbConnInput("");
    setIsModalOpen(false);
    window.location.reload();
  };

  const handleNextTourStep = () => {
    if (tourStep === 1) {
      router.push("/graph");
      setTourStep(2);
    } else if (tourStep === 2) {
      router.push("/logs");
      setTourStep(3);
    } else if (tourStep === 3) {
      router.push("/dashboard");
      setTourStep(4);
    } else {
      setTourStep(null);
      router.push("/dashboard");
    }
  };

  return (
    <>
      <GlobalErrorHandler />
      <BackgroundParticles />
      
      {/* Main dashboard layout */}
      <ConnectionContext.Provider value={{ isMock, dbName }}>
      <div className="dashboard-layout">
        <NavBar />
        <div className="main-viewport">
          <header className="viewport-header" style={{ 
            position: "sticky", 
            top: 0, 
            zIndex: 40,
            background: "var(--canvas-sidebar)",
            backdropFilter: "none",
            borderBottom: "3px solid #000000",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "14px 32px"
          }}>
            {/* Left: Hackathon Branding */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <style dangerouslySetInnerHTML={{ __html: `
                @keyframes purpleGlow {
                  0% { box-shadow: 2px 2px 0px #000000, 0 0 6px rgba(124, 58, 237, 0.4); }
                  50% { box-shadow: 2px 2px 0px #000000, 0 0 16px rgba(124, 58, 237, 0.8); }
                  100% { box-shadow: 2px 2px 0px #000000, 0 0 6px rgba(124, 58, 237, 0.4); }
                }
                @keyframes glint {
                  0% { transform: translateX(-150%) skewX(-25deg); }
                  25% { transform: translateX(150%) skewX(-25deg); }
                  100% { transform: translateX(150%) skewX(-25deg); }
                }
                .purple-glow-badge {
                  position: relative;
                  overflow: hidden;
                  animation: purpleGlow 2.5s infinite ease-in-out;
                  border: 2px solid #000000 !important;
                }
                .purple-glow-badge::after {
                  content: '';
                  position: absolute;
                  top: 0; left: 0; width: 100%; height: 100%;
                  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
                  animation: glint 3.5s infinite ease-in-out;
                }
              `}} />
              <span className="purple-glow-badge" style={{
                fontSize: "12px",
                fontWeight: 900,
                fontFamily: "'Space Grotesk', sans-serif",
                color: "#ffffff",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                padding: "5px 12px",
                borderRadius: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                display: "inline-block"
              }}>
                CockroachDB × AWS Hackathon
              </span>
              <span style={{
                fontSize: "11px",
                fontWeight: 800,
                color: "#374151",
                fontFamily: "var(--font-mono)",
                background: "#f3f4f6",
                border: "1.5px solid #000000",
                padding: "3px 8px",
                borderRadius: "4px"
              }}>
                Memory Integrity Shield
              </span>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "#f0fdf4",
                border: "1.5px solid #16a34a",
                borderRadius: "4px",
                padding: "3px 8px",
                marginLeft: "8px",
                boxShadow: "0 2px 4px rgba(22, 163, 74, 0.1)"
              }}>
                <span style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#166534",
                  fontFamily: "var(--font-mono)"
                }}>
                  EU AI Act: Compliant
                </span>
                <Link href="/compliance" style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  color: "#ffffff",
                  background: "#16a34a",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  textDecoration: "none",
                  fontFamily: "var(--font-mono)",
                  display: "inline-block",
                  border: "1px solid #14532d",
                  transition: "background 0.2s"
                }}>
                  View Proof →
                </Link>
              </div>
            </div>

            <div className="header-actions">
              <button 
                onClick={() => setIsModalOpen(true)}
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  fontSize: "12.5px", 
                  fontWeight: 800,
                  padding: "8px 20px", 
                  background: isMock ? "var(--accent-breeze)" : "var(--accent-emerald)",
                  border: "2.5px solid #000000", 
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  color: "#000000",
                  fontFamily: "'Space Grotesk', sans-serif",
                  boxShadow: "2px 2px 0px 0px #000000",
                  transition: "all 0.1s ease"
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = "translate(-1px, -1px)";
                  e.currentTarget.style.boxShadow = "3px 3px 0px 0px #000000";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = "none";
                  e.currentTarget.style.boxShadow = "2px 2px 0px 0px #000000";
                }}
              >
                <span style={{ 
                  width: "7px", 
                  height: "7px", 
                  background: isMock ? "#000000" : "#000000", 
                  borderRadius: "50%", 
                  animation: "pulse 1.5s infinite"
                }} />
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "center", 
                    width: "20px", 
                    height: "20px", 
                    borderRadius: "50%", 
                    background: "#ffffff", 
                    padding: "2px", 
                    flexShrink: 0 
                  }}>
                    <Image src="/cockroachdb-icon.png" alt="" width={20} height={20} style={{ width: "100%", height: "100%", objectFit: "contain", filter: isMock ? "grayscale(0.5)" : "none" }} />
                  </span>
                  {isMock ? "CockroachDB (Demo)" : dbName}
                </span>
                {isMock && (
                  <span style={{
                    background: "#000000",
                    color: "#ffffff",
                    fontSize: "9px",
                    fontWeight: 900,
                    padding: "3px 8px",
                    borderRadius: "2px",
                    letterSpacing: "1px",
                    marginLeft: "6px"
                  }}>
                    CONNECT LIVE
                  </span>
                )}
              </button>
            </div>
          </header>

          <main className="page-container page-view-enter" style={{ position: "relative" }}>
            <ErrorBoundary>
                {children}
            </ErrorBoundary>

            {/* Floating Tour Guide Dialog */}
            {tourStep !== null && (
              <div style={{
                position: "fixed",
                bottom: "24px",
                right: "24px",
                width: "360px",
                background: "#ffffff",
                border: "3px solid #000000",
                borderRadius: "var(--radius-lg)",
                padding: "24px",
                boxShadow: "var(--shadow-lg)",
                zIndex: 1000,
                backdropFilter: "blur(12px)",
                animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)"
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <span style={{ color: "#ff9100", fontSize: "11px", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    GUIDED TOUR — STEP {tourStep} OF 4
                  </span>
                  <button 
                    onClick={() => setTourStep(null)} 
                    style={{ background: "none", border: "none", color: "#6b5e50", fontSize: "16px", cursor: "pointer" }}
                  >
                    &times;
                  </button>
                </div>

                <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 8px 0" }}>
                  {tourStep === 1 && "Telemetry command center"}
                  {tourStep === 2 && "Temporal Graph Explorer"}
                  {tourStep === 3 && "Cryptographic logs registry"}
                  {tourStep === 4 && "MemoryGuard OWASP Guard"}
                </h3>

                <p style={{ fontSize: "13px", color: "#b0a899", lineHeight: "1.6", margin: "0 0 20px 0" }}>
                  {tourStep === 1 && "This dashboard shows live telemetry including active memories, entity relations, cognitive decay curves, global sync times, and cache hit ratios."}
                  {tourStep === 2 && "Here you can explore the relationships between memory nodes in D3. Click on a node to view its cryptographic history chain."}
                  {tourStep === 3 && "View the ledger of raw memories recorded on CockroachDB. Search and inspect the access count, importance weights, and signature hashes."}
                  {tourStep === 4 && "Try typing input in the Test Guard panel at the bottom to check how Bastion sanitizes injection prompts, redacts PII, and seals the memory block."}
                </p>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button 
                    onClick={() => setTourStep(null)}
                    style={{ background: "none", border: "none", color: "#7a6265", fontSize: "12px", cursor: "pointer" }}
                  >
                    Skip Tour
                  </button>
                  <button 
                    onClick={handleNextTourStep}
                    style={{
                      background: "#000000",
                      border: "2px solid #000000",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "8px 16px",
                      borderRadius: "2px",
                      cursor: "pointer",
                      boxShadow: "1px 1px 0px 0px #000000"
                    }}
                  >
                    {tourStep === 4 ? "Complete Tour" : "Next View →"}
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
      </ConnectionContext.Provider>

      {/* Dynamic CockroachDB Connection Modal */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(6px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 3000,
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            background: "#ffffff",
            border: "3.5px solid #000000",
            borderRadius: "var(--radius-sm)",
            padding: "36px",
            maxWidth: "550px",
            width: "90%",
            boxShadow: "6px 6px 0px 0px #000000",
            animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 900, color: "#000000", margin: 0, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Connect CockroachDB Cluster
                </h2>
                <p style={{ fontSize: "13px", color: "#374151", fontWeight: 700, margin: "6px 0 0 0" }}>
                  Configure your private database instance to verify live memory commits.
                </p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setConnError(""); }}
                style={{ background: "none", border: "none", color: "#000000", fontSize: "24px", fontWeight: 900, cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveConnection} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", color: "#000000", fontFamily: "var(--font-sans)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "1px" }}>
                  Connection String (URI)
                </label>
                <input 
                  type="password"
                  value={dbConnInput}
                  onChange={(e) => setDbConnInput(e.target.value)}
                  placeholder="postgresql://username:password@host:26257/defaultdb?sslmode=verify-full"
                  style={{
                    background: "#ffffff",
                    border: "2.5px solid #000000",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    color: "#000000",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    width: "100%",
                    outline: "none",
                    boxShadow: "inset 1px 1px 0px rgba(0,0,0,0.1)"
                  }}
                />
                <span style={{ fontSize: "11px", color: "#374151", fontWeight: 700, lineHeight: "1.4" }}>
                  Credentials are saved locally in your browser and never transit outside your Next.js application deployment context.
                </span>
              </div>

              {needsAuth ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{
                    padding: "12px",
                    borderRadius: "var(--radius-sm)",
                    background: "#fef9c3",
                    border: "2px solid #a16207",
                    color: "#a16207",
                    fontWeight: 800,
                    fontSize: "12.5px"
                  }}>
                    Authentication required to connect. Enter your dashboard passphrase.
                  </div>
                  <input
                    type="password"
                    value={authPassphrase}
                    onChange={(e) => setAuthPassphrase(e.target.value)}
                    placeholder="Enter passphrase"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleAuthenticate(); }}
                    style={{
                      background: "#ffffff",
                      border: "2.5px solid #000000",
                      borderRadius: "var(--radius-sm)",
                      padding: "12px 14px",
                      color: "#000000",
                      fontSize: "13px",
                      fontFamily: "'JetBrains Mono', monospace",
                      width: "100%",
                      outline: "none",
                      boxShadow: "inset 1px 1px 0px rgba(0,0,0,0.1)"
                    }}
                  />
                  {authError && (
                    <div style={{
                      padding: "10px",
                      borderRadius: "var(--radius-sm)",
                      background: "#fef2f2",
                      border: "2px solid #b91c1c",
                      color: "#b91c1c",
                      fontWeight: 800,
                      fontSize: "12px"
                    }}>
                      {authError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => { setNeedsAuth(false); setAuthPassphrase(""); setAuthError(""); }}
                      style={{
                        background: "#ffffff",
                        border: "2.5px solid #000000",
                        color: "#000000",
                        fontSize: "13px",
                        fontWeight: 900,
                        padding: "10px 18px",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        boxShadow: "2.5px 2.5px 0px #000000",
                        fontFamily: "var(--font-sans)"
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAuthenticate}
                      disabled={authLoading || !authPassphrase}
                      style={{
                        background: "var(--accent-breeze)",
                        border: "2.5px solid #000000",
                        color: "#000000",
                        fontSize: "13px",
                        fontWeight: 900,
                        padding: "10px 24px",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        boxShadow: "2.5px 2.5px 0px #000000",
                        opacity: authLoading || !authPassphrase ? 0.6 : 1,
                        fontFamily: "var(--font-sans)"
                      }}
                    >
                      {authLoading ? "Authenticating..." : "Authenticate"}
                    </button>
                  </div>
                </div>
              ) : connError && (
                <div style={{
                  padding: "12px",
                  borderRadius: "var(--radius-sm)",
                  background: "#fef2f2",
                  border: "2px solid #b91c1c",
                  color: "#b91c1c",
                  fontWeight: 800,
                  fontSize: "12.5px"
                }}>
                  {connError}
                </div>
              )}

              {!needsAuth && (
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
                {hasSavedConn && (
                  <button 
                    type="button"
                    onClick={handleClearConnection}
                    style={{
                      background: "#ffffff",
                      border: "2.5px solid #000000",
                      color: "#000000",
                      fontSize: "13px",
                      fontWeight: 900,
                      padding: "10px 18px",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      boxShadow: "2.5px 2.5px 0px #000000",
                      fontFamily: "var(--font-sans)"
                    }}
                  >
                    Disconnect
                  </button>
                )}
                <button 
                  type="submit"
                  disabled={testingConn}
                  style={{
                    background: "var(--accent-breeze)",
                    border: "2.5px solid #000000",
                    color: "#000000",
                    fontSize: "13px",
                    fontWeight: 900,
                    padding: "10px 24px",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    boxShadow: "2.5px 2.5px 0px #000000",
                    opacity: testingConn ? 0.6 : 1,
                    fontFamily: "var(--font-sans)"
                  }}
                >
                  {testingConn ? "Verifying..." : "Connect Cluster"}
                </button>
              </div>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: "40px", color: "#6b7280" }}>Initializing Cockpit...</div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
