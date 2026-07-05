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
        <div className="app-container">
          <NavBar />
          <main className="content-wrapper">{children}</main>
          <footer className="footer">
            // BASTION AGENTIC SYSTEMS INC. // COCKROACHDB × AWS 2026 //
          </footer>
        </div>
      </body>
    </html>
  );
}
