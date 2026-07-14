"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import BackgroundParticles from "@/components/BackgroundParticles";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import { fetchWithTimeout } from "@/lib/fetch";

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [isMock, setIsMock] = useState(true);
  const [dbName, setDbName] = useState("Simulated Mock");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dbConnInput, setDbConnInput] = useState("");
  const [testingConn, setTestingConn] = useState(false);
  const [connError, setConnError] = useState("");

  // Onboarding tour state
  const [tourStep, setTourStep] = useState<number | null>(null);

  useEffect(() => {
    // Check if onboarding tour is requested in URL
    if (searchParams.get("tour") === "start") {
      setTourStep(1);
    }
  }, [searchParams]);

  const checkConnectionStatus = async () => {
    try {
      const res = await fetchWithTimeout("/api/health");
      if (res.ok) {
        const json = await res.json();
        const mockActive = json.meta?.mock === true;
        setIsMock(mockActive);
        
        const currentConn = localStorage.getItem("bastion_db_conn");
        if (!mockActive && currentConn) {
          // Parse connection string to extract host for display
          try {
            const urlStr = currentConn.replace("postgresql://", "http://");
            const parsed = new URL(urlStr);
            setDbName(parsed.hostname.slice(0, 16) + (parsed.hostname.length > 16 ? "..." : ""));
          } catch {
            setDbName("Live CockroachDB");
          }
        } else if (!mockActive) {
          setDbName("Static Config");
        } else {
          setDbName("Simulated Mock");
        }
      }
    } catch (e) {
      console.error("Failed to fetch database health status:", e);
      setIsMock(true);
    }
  };

  useEffect(() => {
    checkConnectionStatus();
    
    // Prefill connection string from localStorage
    const saved = localStorage.getItem("bastion_db_conn");
    if (saved) {
      setDbConnInput(saved);
    }
  }, []);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingConn(true);
    setConnError("");

    if (!dbConnInput.trim()) {
      localStorage.removeItem("bastion_db_conn");
      setTestingConn(false);
      setIsModalOpen(false);
      window.location.reload();
      return;
    }

    // Verify it is a valid postgresql string
    if (!dbConnInput.startsWith("postgresql://") && !dbConnInput.startsWith("postgres://")) {
      setConnError("Invalid protocol. Must begin with postgresql://");
      setTestingConn(false);
      return;
    }

    try {
      // Temporarily write to localStorage to test with API routes
      localStorage.setItem("bastion_db_conn", dbConnInput.trim());

      // Ping health API to verify connection
      const res = await fetchWithTimeout("/api/health");
      const json = await res.json();

      if (json.meta?.mock) {
        throw new Error("API fallback to mock data — connection string invalid or unreachable");
      }

      // Success
      setTestingConn(false);
      setIsModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      localStorage.removeItem("bastion_db_conn");
      setConnError(err instanceof Error ? err.message : "Connection failed");
      setTestingConn(false);
    }
  };

  const handleClearConnection = () => {
    localStorage.removeItem("bastion_db_conn");
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
      // Remove tour param from URL
      router.push("/dashboard");
    }
  };

  return (
    <>
      <GlobalErrorHandler />
      <BackgroundParticles />
      
      {/* Global Mock/Demo Status Banner */}
      {isMock && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "36px",
          background: "linear-gradient(90deg, #ff5e00 0%, #ff8c00 100%)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          zIndex: 2000,
          fontSize: "13px",
          fontWeight: 600,
          boxShadow: "0 4px 20px rgba(255, 94, 0, 0.25)",
          padding: "0 24px",
          fontFamily: "'Space Grotesk', sans-serif"
        }}>
          <span>⚠️ Bastion is running in Simulated Demo Mode.</span>
          <button 
            onClick={() => setIsModalOpen(true)}
            style={{
              background: "#ffffff",
              border: "none",
              color: "#ff5e00",
              fontWeight: 700,
              fontSize: "11px",
              padding: "4px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}
          >
            Connect CockroachDB
          </button>
        </div>
      )}

      {/* Main dashboard grid layout */}
      <div 
        className="dashboard-layout" 
        style={{ 
          marginTop: isMock ? "36px" : "0px",
          transition: "margin 0.3s ease"
        }}
      >
        <NavBar />
        <div className="main-viewport">
          <header className="viewport-header" style={{ position: "relative" }}>
            <div className="header-search">
              <span>🔍</span>
              <input type="text" placeholder="Search cognitive memory context..." disabled />
            </div>
            
            <div className="header-actions">
              <button 
                onClick={() => setIsModalOpen(true)}
                className="badge-mono" 
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px", 
                  fontSize: "11px", 
                  padding: "8px 16px", 
                  background: "rgba(10, 5, 16, 0.4)",
                  border: isMock ? "1px solid rgba(255, 94, 0, 0.3)" : "1px solid rgba(0, 255, 102, 0.3)", 
                  borderRadius: "9999px",
                  cursor: "pointer",
                  color: isMock ? "#ff9100" : "#00ff88",
                  transition: "all 0.3s"
                }}
              >
                <span style={{ 
                  width: "6px", 
                  height: "6px", 
                  background: isMock ? "#ff5e00" : "#00ff88", 
                  borderRadius: "50%", 
                  boxShadow: isMock ? "0 0 8px #ff5e00" : "0 0 8px #00ff88" 
                }} />
                DB: {dbName}
              </button>
            </div>
          </header>

          <main className="page-container" style={{ position: "relative" }}>
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
                background: "rgba(27, 10, 20, 0.95)",
                border: "1px solid #ff5e00",
                borderRadius: "12px",
                padding: "24px",
                boxShadow: "0 20px 50px rgba(0,0,0,0.6), 0 0 25px rgba(255,94,0,0.15)",
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
                      background: "linear-gradient(135deg, #ff5e00, #ff8c00)",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                      padding: "8px 16px",
                      borderRadius: "4px",
                      cursor: "pointer"
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

      {/* Dynamic CockroachDB Connection Modal */}
      {isModalOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.8)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 3000,
          animation: "fadeIn 0.2s ease-out"
        }}>
          <div style={{
            background: "rgba(20, 10, 15, 0.95)",
            border: "1px solid #ff5e00",
            borderRadius: "16px",
            padding: "36px",
            maxWidth: "550px",
            width: "90%",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 94, 0, 0.15)",
            animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#fff", margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                  Connect CockroachDB Cluster
                </h2>
                <p style={{ fontSize: "13px", color: "#7a6265", margin: "4px 0 0 0" }}>
                  Configure your private database instance to verify live memory commits.
                </p>
              </div>
              <button 
                onClick={() => { setIsModalOpen(false); setConnError(""); }}
                style={{ background: "none", border: "none", color: "#7a6265", fontSize: "20px", cursor: "pointer" }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveConnection} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "11px", color: "#b0a899", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>
                  Connection String (URI)
                </label>
                <input 
                  type="password"
                  value={dbConnInput}
                  onChange={(e) => setDbConnInput(e.target.value)}
                  placeholder="postgresql://username:password@host:26257/defaultdb?sslmode=verify-full"
                  style={{
                    background: "rgba(255, 255, 255, 0.02)",
                    border: "1px solid rgba(255, 60, 0, 0.15)",
                    borderRadius: "6px",
                    padding: "12px 14px",
                    color: "#fff",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    width: "100%",
                    outline: "none"
                  }}
                />
                <span style={{ fontSize: "11px", color: "#7a6265", lineHeight: "1.4" }}>
                  Credentials are saved locally in your browser and never transit outside your Next.js application deployment context.
                </span>
              </div>

              {connError && (
                <div style={{
                  padding: "12px",
                  borderRadius: "6px",
                  background: "rgba(255, 60, 0, 0.08)",
                  border: "1px solid rgba(255, 60, 0, 0.25)",
                  color: "#ff9100",
                  fontSize: "12.5px"
                }}>
                  {connError}
                </div>
              )}

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "12px" }}>
                {localStorage.getItem("bastion_db_conn") && (
                  <button 
                    type="button"
                    onClick={handleClearConnection}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255, 60, 0, 0.2)",
                      color: "#ff5e00",
                      fontSize: "13px",
                      fontWeight: 600,
                      padding: "10px 18px",
                      borderRadius: "4px",
                      cursor: "pointer"
                    }}
                  >
                    Disconnect
                  </button>
                )}
                
                <button 
                  type="submit"
                  disabled={testingConn}
                  style={{
                    background: "linear-gradient(135deg, #ff5e00, #ff8c00)",
                    border: "none",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 700,
                    padding: "10px 24px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    boxShadow: "0 0 15px rgba(255, 94, 0, 0.2)",
                    opacity: testingConn ? 0.6 : 1
                  }}
                >
                  {testingConn ? "Verifying..." : "Connect Cluster"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: "40px", color: "#6b7280" }}>Initializing Cockpit View...</div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
