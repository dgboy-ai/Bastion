"use client";

import { useEffect, useState, Suspense, createContext, useContext } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import NavBar from "@/components/NavBar";
import BackgroundParticles from "@/components/BackgroundParticles";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import { fetchWithTimeout } from "@/lib/fetch";

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
    checkConnectionStatus();
    
    try {
      const saved = localStorage.getItem("bastion_db_conn");
      if (saved) {
        setDbConnInput(saved);
        setHasSavedConn(true);
      }
    } catch {} // localStorage unavailable in private browsing
  }, []);

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingConn(true);
    setConnError("");

    if (!dbConnInput.trim()) {
      try { localStorage.removeItem("bastion_db_conn"); } catch {}
      setTestingConn(false);
      setIsModalOpen(false);
      window.location.reload();
      return;
    }

    if (!dbConnInput.startsWith("postgresql://") && !dbConnInput.startsWith("postgres://")) {
      setConnError("Invalid protocol. Must begin with postgresql://");
      setTestingConn(false);
      return;
    }

    try {
      localStorage.setItem("bastion_db_conn", dbConnInput.trim());
      setHasSavedConn(true);
      const res = await fetchWithTimeout("/api/health");
      const json = await res.json();

      if (json.meta?.mock) {
        throw new Error("API fallback to mock data — connection string invalid or unreachable");
      }

      setTestingConn(false);
      setIsModalOpen(false);
      window.location.reload();
    } catch (err: unknown) {
      try { localStorage.removeItem("bastion_db_conn"); } catch {}
      setHasSavedConn(false);
      setConnError(err instanceof Error ? err.message : "Connection failed");
      setTestingConn(false);
    }
  };

  const handleClearConnection = () => {
    try { localStorage.removeItem("bastion_db_conn"); } catch {}
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
          <header className="viewport-header" style={{ position: "sticky", top: 0, zIndex: 40 }}>
            <div className="header-search">
              <span>🔍</span>
              <input
                type="text"
                placeholder="Search cognitive memory context..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const q = (e.target as HTMLInputElement).value.trim();
                    if (q) window.location.href = `/logs?q=${encodeURIComponent(q)}`;
                  }
                }}
                aria-label="Search memories"
              />
            </div>
            
            <div className="header-actions">
              <button 
                onClick={() => setIsModalOpen(true)}
                style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px", 
                  fontSize: "12px", 
                  fontWeight: 600,
                  padding: "7px 16px", 
                  background: isMock ? "rgba(255, 94, 0, 0.1)" : "rgba(0, 255, 136, 0.1)",
                  border: isMock ? "1px solid rgba(255, 94, 0, 0.35)" : "1px solid rgba(0, 255, 136, 0.35)", 
                  borderRadius: "9999px",
                  cursor: "pointer",
                  color: isMock ? "#ff9100" : "#00ff88",
                  fontFamily: "var(--font-mono)",
                  boxShadow: isMock ? "0 0 15px rgba(255, 94, 0, 0.15)" : "0 0 15px rgba(0, 255, 136, 0.15)",
                  transition: "all 0.2s ease"
                }}
              >
                <span style={{ 
                  width: "7px", 
                  height: "7px", 
                  background: isMock ? "#ff5e00" : "#00ff88", 
                  borderRadius: "50%", 
                  boxShadow: isMock ? "0 0 10px #ff5e00" : "0 0 10px #00ff88",
                  animation: "pulse 2s infinite"
                }} />
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <img src="/cockroachdb-icon.png" alt="" style={{ width: "22px", height: "22px", flexShrink: 0, mixBlendMode: "screen" }} />
                  {isMock ? "CockroachDB (Demo Mode)" : `CockroachDB: ${dbName}`}
                </span>
                {isMock && (
                  <span style={{
                    background: "linear-gradient(135deg, #ff5e00, #ff8800)",
                    color: "#ffffff",
                    fontSize: "9.5px",
                    fontWeight: 800,
                    padding: "3px 8px",
                    borderRadius: "4px",
                    letterSpacing: "0.8px",
                    marginLeft: "4px"
                  }}>
                    CONNECT LIVE DB
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
      </ConnectionContext.Provider>

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
                {hasSavedConn && (
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

export default function DashboardLayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: "40px", color: "#6b7280" }}>Initializing Cockpit...</div>}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
