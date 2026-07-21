"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NavBar = memo(function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/flight-recorder", label: "Flight Recorder", icon: "✈️" },
    { href: "/graph", label: "Knowledge Graph", icon: "🕸️" },
    { href: "/logs", label: "Memory Logs", icon: "📜" },
    { href: "/health", label: "Health", icon: "💓" },
    { href: "/compliance", label: "Compliance", icon: "⚖️" },
  ];

  return (
    <aside style={{
      width: "240px", height: "100vh", position: "fixed", top: 0, left: 0, zIndex: 100,
      background: "linear-gradient(180deg, #120a0e 0%, #0a0508 100%)",
      borderRight: "1px solid rgba(255,170,0,.12)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "0",
    }}>
      {/* Top */}
      <div>
        {/* Brand */}
        <Link href="/" style={{ textDecoration: "none", display: "block", padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,170,0,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg,#ffea00,#ff5500)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 16px rgba(255,85,0,.3)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/></svg>
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: "16px", letterSpacing: "2.5px", color: "#fff", fontFamily: "var(--font-sg)" }}>BASTION</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8px", color: "#ffaa00", letterSpacing: "1.5px", marginTop: "2px" }}>MEMORY ENGINE</div>
            </div>
          </div>
        </Link>

        {/* Navigation */}
        <nav style={{ padding: "16px 12px", display: "flex", flexDirection: "column", gap: "4px" }}>
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link key={link.href} href={link.href} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "12px 16px", borderRadius: "8px",
                textDecoration: "none",
                fontSize: "13px", fontWeight: isActive ? 700 : 500,
                color: isActive ? "#fff" : "#9a929e",
                background: isActive ? "rgba(255,170,0,.08)" : "transparent",
                borderLeft: isActive ? "3px solid #ffaa00" : "3px solid transparent",
                transition: "all .3s",
                fontFamily: "var(--font-sg)",
              }}>
                <span style={{ fontSize: "15px" }}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div style={{ padding: "16px 20px", borderTop: "1px solid rgba(255,170,0,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: "rgba(255,170,0,.1)", border: "1px solid rgba(255,170,0,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, color: "#ffaa00", fontFamily: "var(--font-mono)" }}>BA</div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>Bastion Agent</div>
            <div style={{ fontSize: "9px", color: "#6a6270", fontFamily: "var(--font-mono)" }}>v0.10.0</div>
          </div>
        </div>
      </div>
    </aside>
  );
});

export default NavBar;
