"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConnection } from "./DashboardLayoutWrapper";

const CockroachIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 31.82 32" fill="currentColor">
    <path d="M19.42 9.17a15.39 15.39 0 0 1-3.51.4 15.46 15.46 0 0 1-3.51-.4 15.63 15.63 0 0 1 3.51-3.91 15.71 15.71 0 0 1 3.51 3.91zM30 .57A17.22 17.22 0 0 0 25.59 0a17.4 17.4 0 0 0-9.68 2.93A17.38 17.38 0 0 0 6.23 0a17.22 17.22 0 0 0-4.44.57A16.22 16.22 0 0 0 0 1.13a.07.07 0 0 0 0 .09 17.32 17.32 0 0 0 .83 1.57.07.07 0 0 0 .08 0 16.39 16.39 0 0 1 1.81-.54 15.65 15.65 0 0 1 11.59 1.88 17.52 17.52 0 0 0-3.78 4.48c-.2.32-.37.65-.55 1s-.22.45-.33.69-.31.72-.44 1.08a17.46 17.46 0 0 0 4.29 18.7c.26.25.53.49.81.73s.44.37.67.54.59.44.89.64a.07.07 0 0 0 .08 0c.3-.21.6-.42.89-.64s.45-.35.67-.54.55-.48.81-.73a17.45 17.45 0 0 0 5.38-12.61 17.39 17.39 0 0 0-1.09-6.09c-.14-.37-.29-.73-.45-1.09s-.22-.47-.33-.69-.35-.66-.55-1a17.61 17.61 0 0 0-3.78-4.48 15.65 15.65 0 0 1 11.6-1.84 16.13 16.13 0 0 1 1.81.54.07.07 0 0 0 .08 0q.44-.76.82-1.56a.07.07 0 0 0 0-.09A16.89 16.89 0 0 0 30 .57z"/>
    <path d="M21.82 17.47a15.51 15.51 0 0 1-4.25 10.69 15.66 15.66 0 0 1-.72-4.68 15.5 15.5 0 0 1 4.25-10.69 15.62 15.62 0 0 1 .72 4.68" fill="#348540"/>
    <path d="M15 23.48a15.55 15.55 0 0 1-.72 4.68 15.54 15.54 0 0 1-3.53-15.37A15.5 15.5 0 0 1 15 23.48" fill="#7dbc42"/>
  </svg>
);

const NavBar = memo(function NavBar() {
  const pathname = usePathname();
  const { isMock, dbName } = useConnection();

  const links = [
    { href: "/playground", label: "Live Demo", icon: "▶️" },
    { href: "/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/flight-recorder", label: "Audit Trail", icon: "📋" },
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
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
            <CockroachIcon size={11} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--mute)" }}>
              <span style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: isMock ? "#71717a" : "#22c55e",
                boxShadow: isMock ? "none" : "0 0 6px rgba(34, 197, 94, 0.6)",
                display: "inline-block"
              }} />
              {isMock ? "Mock" : "Live"} &middot; {dbName}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
});

export default NavBar;
