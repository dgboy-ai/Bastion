"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NavBar = memo(function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Dashboard", icon: "📊" },
    { href: "/graph", label: "Knowledge Graph", icon: "🕸️" },
    { href: "/logs", label: "Memory Logs", icon: "📜" },
    { href: "/health", label: "Health", icon: "💓" },
    { href: "/compliance", label: "Compliance", icon: "⚖️" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {/* Brand Header */}
        <Link href="/" className="brand-logo-container" style={{ textDecoration: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: "drop-shadow(0 0 4px var(--accent-breeze-glow))" }}>
              <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" stroke="var(--accent-breeze)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 6l4 2.5v3.5c0 2.8-1.8 5.6-4 6.3-2.2-.7-4-3.5-4-6.3V8.5L12 6z" fill="var(--accent-breeze)" opacity="0.25" />
              <circle cx="12" cy="12" r="2" fill="var(--accent-emerald)" style={{ filter: "drop-shadow(0 0 3px var(--accent-emerald))" }} />
            </svg>
            <span style={{
              fontFamily: "var(--font-sans)",
              fontWeight: 800,
              fontSize: "18px",
              letterSpacing: "2px",
              color: "var(--ink)",
              textTransform: "uppercase"
            }}>
              Bastion
            </span>
          </div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            fontWeight: 600,
            color: "var(--accent-breeze)",
            border: "1px solid rgba(0, 229, 255, 0.15)",
            background: "rgba(0, 229, 255, 0.03)",
            padding: "2px 6px",
            borderRadius: "4px",
            letterSpacing: "1px",
            textTransform: "uppercase",
            marginTop: "6px",
            display: "inline-block"
          }}>
            Memory Engine
          </div>
        </Link>

        {/* Sidebar Navigation */}
        <nav className="sidebar-nav">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`sidebar-link ${isActive ? "active" : ""}`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Sidebar Footer / Agent Identity */}
      <div className="sidebar-footer">
        <div className="profile-avatar">BA</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden" }}>
          <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>
            Bastion Agent
          </span>
          <span style={{ fontSize: "10px", color: "var(--mute)", fontFamily: "var(--font-mono)" }}>
            v0.6.0
          </span>
        </div>
      </div>
    </aside>
  );
});

export default NavBar;
