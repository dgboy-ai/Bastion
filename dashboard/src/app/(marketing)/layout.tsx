import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Bastion — The System of Record for Autonomous AI",
  description: "Persistent, self-healing memory for AI agents. Built on CockroachDB. Zero downtime, zero data loss, zero re-explaining.",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ background: "#0a0a0a", color: "#ffffff", fontFamily: "'Inter', 'Space Grotesk', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
