import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import BackgroundParticles from "@/components/BackgroundParticles";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bastion | AI Agentic Memory Engine",
  description: "Globally persistent, transactionally resilient memory with time-travel and knowledge graph capabilities built natively on CockroachDB and AWS.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BackgroundParticles />
        <div className="dashboard-layout">
          {/* Vertical left navigation sidebar */}
          <NavBar />
          
          {/* Main content frame with top header bar */}
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
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
