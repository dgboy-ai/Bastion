"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Overview" },
    { href: "/graph", label: "Knowledge Graph" },
    { href: "/logs", label: "Memory Logs" },
  ];

  return (
    <header className="nav-bar">
      <Link href="/" className="brand-logo-container">
        <svg width="32" height="32" viewBox="0 0 32 32" style={{ overflow: "visible" }}>
          <defs>
            <filter id="logo-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Hexagon inset by 4px to prevent stroke/glow edge clipping */}
          <polygon 
            points="16,4 28,11 28,25 16,28 4,25 4,11" 
            className="logo-hex" 
            style={{ filter: "url(#logo-glow)", stroke: "var(--accent-sunset)", strokeWidth: "2px", fill: "none" }}
          />
          <circle cx="16" cy="16" r="4.5" fill="var(--accent-sunset)" />
        </svg>
        <span className="brand-logo">
          BASTION <span>Memory Engine</span>
        </span>
      </Link>
      <nav className="nav-links">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`nav-link ${isActive ? "active" : ""}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
