import type { Metadata } from "next";
import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bastion — The System of Record for Autonomous AI",
  description: "Persistent, self-healing memory for AI agents. Built on CockroachDB. Zero downtime, zero data loss, zero re-explaining.",
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Bastion — The System of Record for Autonomous AI",
    description: "Persistent, self-healing memory for AI agents. Built on CockroachDB. Zero downtime, zero data loss, zero re-explaining.",
    url: "https://bastion-self.vercel.app",
    siteName: "Bastion",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Bastion — Agentic Memory Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bastion — The System of Record for Autonomous AI",
    description: "Persistent, self-healing memory for AI agents. Built on CockroachDB.",
    images: ["/og-image.png"],
  },
  metadataBase: new URL("https://bastion-self.vercel.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-api-key={process.env.BASTION_API_KEY || ''}>
      <body style={{
        color: "#ffffff",
        fontFamily: "'Inter', 'Space Grotesk', system-ui, sans-serif",
        margin: 0, minHeight: "100vh", overflowY: "auto",
        background: "#0a0508",
      }}>

        <GlobalErrorHandler />
        <div style={{
          animation: "pageEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        }}>
          {children}
        </div>
        <style>{`
          @keyframes pageEnter {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          html {
            scroll-behavior: smooth;
          }
        `}</style>
      </body>
    </html>
  );
}
