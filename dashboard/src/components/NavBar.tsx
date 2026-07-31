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
    {
      href: "/playground",
      label: "Live Demo",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )
    },
    {
      href: "/dashboard",
      label: "Dashboard",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
      )
    },
    {
      href: "/flight-recorder",
      label: "Audit Trail",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      )
    },
    {
      href: "/graph",
      label: "Knowledge Graph",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      )
    },
    {
      href: "/logs",
      label: "Memory Logs",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
          <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
        </svg>
      )
    },
    {
      href: "/health",
      label: "Health",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      )
    },
    {
      href: "/compliance",
      label: "Compliance",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 11 11 13 15 9" />
        </svg>
      )
    },
  ];

  return (
    <aside className="sidebar" style={{ 
      background: "var(--canvas-sidebar)", 
      borderRight: "3px solid #000000",
      boxShadow: "none",
      transition: "all 0.15s ease"
    }}>
      <div className="sidebar-top">
        {/* Brand Header */}
        <Link href="/" style={{ textDecoration: "none", display: "block", paddingBottom: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "40px",
              height: "40px",
              borderRadius: "var(--radius-sm)",
              background: "var(--accent-breeze)",
              border: "2.5px solid #000000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "2px 2px 0px #000000",
              flexShrink: 0,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5">
                <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 900, fontSize: "19px", letterSpacing: "2.5px", color: "#000000", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.2 }}>BASTION</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "8.5px", color: "#000000", letterSpacing: "1.5px", marginTop: "2px", whiteSpace: "nowrap", fontWeight: 900 }}>MEMORY FACTORY</div>
            </div>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="sidebar-nav" style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.href} 
                href={link.href} 
                className={`sidebar-link ${isActive ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "14px",
                  fontWeight: 800,
                  color: isActive ? "#000000" : "var(--mute)",
                  background: isActive ? "var(--accent-breeze)" : "transparent",
                  border: isActive ? "2.5px solid #000000" : "2.5px solid transparent",
                  boxShadow: isActive ? "3px 3px 0px #000000" : "none",
                  transition: "all 0.1s ease",
                  textDecoration: "none",
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "#f4f3ef";
                    e.currentTarget.style.color = "#000000";
                    e.currentTarget.style.border = "2.5px solid #000000";
                    e.currentTarget.style.boxShadow = "2px 2px 0px #000000";
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--mute)";
                    e.currentTarget.style.border = "2.5px solid transparent";
                    e.currentTarget.style.boxShadow = "none";
                  }
                }}
              >
                <span style={{ 
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "16px", 
                  color: "inherit",
                  transition: "all 0.1s"
                }}>{link.icon}</span>
                <span style={{ flex: 1, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.2px" }}>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="sidebar-footer" style={{ 
        padding: "16px 20px", 
        borderTop: "3px solid #000000",
        background: "var(--canvas-sidebar)",
      }}>
        <div className="profile-avatar" style={{ 
          background: "var(--accent-breeze)",
          border: "2px solid #000000",
          boxShadow: "1px 1px 0px #000000",
          borderRadius: "4px",
          fontWeight: 900,
          color: "#000000"
        }}>BA</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "12.5px", fontWeight: 900, color: "#000000", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "'Space Grotesk', sans-serif" }}>Bastion Agent</div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
            <CockroachIcon size={11} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "9.5px", fontFamily: "'JetBrains Mono', monospace", color: "var(--mute)" }}>
              <span style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: isMock ? "#71717a" : "#047857",
                border: "1.5px solid #000000",
                display: "inline-block",
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
