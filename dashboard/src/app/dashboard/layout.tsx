import NavBar from "@/components/NavBar";
import BackgroundParticles from "@/components/BackgroundParticles";
import ErrorBoundary from "@/components/ErrorBoundary";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <GlobalErrorHandler />
      <BackgroundParticles />
      <div className="dashboard-layout">
        <NavBar />
        <div className="main-viewport">
          <header className="viewport-header">
            <div className="header-search">
              <span>🔍</span>
              <input type="text" placeholder="Search cognitive memory context..." disabled />
            </div>
            <div className="header-actions">
              <div className="badge-mono" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", padding: "6px 14px", border: "1px solid var(--glass-border)", borderRadius: "9999px" }}>
                <span style={{ width: "6px", height: "6px", background: "var(--accent-emerald)", borderRadius: "50%", boxShadow: "0 0 6px var(--accent-emerald)" }} />
                CockroachDB: ap-south-1
              </div>
            </div>
          </header>
          <main className="page-container">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </>
  );
}
