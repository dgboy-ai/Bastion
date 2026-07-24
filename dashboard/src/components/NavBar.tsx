"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NavBar = memo(function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/playground", label: "Playground", icon: "🎮" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/flight-recorder", label: "Flight Recorder", icon: "✈️" },
    { href: "/graph", label: "Knowledge Graph", icon: "🕸️" },
    { href: "/logs", label: "Memory Logs", icon: "📜" },
    { href: "/health", label: "Health", icon: "💓" },
    { href: "/compliance", label: "Compliance", icon: "⚖️" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {/* Brand Header */}
        <Link href="/" style={{ textDecoration: "none", display: "block", paddingBottom: "16px", borderBottom: "1px solid var(--glass-border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: "linear-gradient(135deg, #ff5e00 0%, #ff9100 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 20px rgba(255, 94, 0, 0.35)", flexShrink: 0
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: "17px", letterSpacing: "2px", color: "var(--ink)", fontFamily: "var(--font-sg)", lineHeight: 1.2 }}>BASTION</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "8.5px", color: "#ff9100", letterSpacing: "1.2px", marginTop: "2px", whiteSpace: "nowrap", fontWeight: 700 }}>MEMORY FACTORY</div>
            </div>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="sidebar-nav" style={{ marginTop: "12px" }}>
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.href} 
                href={link.href} 
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <span style={{ fontSize: "16px", filter: isActive ? "drop-shadow(0 0 6px rgba(255, 94, 0, 0.6))" : "none" }}>{link.icon}</span>
                <span style={{ flex: 1 }}>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <div className="profile-avatar" style={{ background: "linear-gradient(135deg, #ff5e00, #ff9100)" }}>BA</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Bastion Agent</div>
          <div style={{ fontSize: "9px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>v0.10.0 &middot; CockroachDB</div>
        </div>
      </div>
    </aside>
  );
});

export default NavBar;
