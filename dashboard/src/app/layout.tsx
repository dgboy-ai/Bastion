import type { Metadata } from "next";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bastion — The System of Record for Autonomous AI",
  description: "Persistent, self-healing memory for AI agents. Built on CockroachDB. Zero downtime, zero data loss, zero re-explaining.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#ffffff", fontFamily: "'Inter', 'Space Grotesk', system-ui, sans-serif", margin: 0 }}>
        <GlobalErrorHandler />
        {children}
      </body>
    </html>
  );
}
