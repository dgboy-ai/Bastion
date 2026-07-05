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
      <Link href="/" className="brand-logo-container" style={{ display: "flex", alignItems: "center", gap: "14px", textDecoration: "none" }}>
        {/* Futuristic 3D Isometric Glass Cube Core */}
        <svg width="34" height="34" viewBox="0 0 34 34" style={{ overflow: "visible" }}>
          <defs>
            <filter id="logo-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            
            <linearGradient id="top-face" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-breeze)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--accent-dusk)" stopOpacity="0.2" />
            </linearGradient>
            
            <linearGradient id="left-face" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-dusk)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--accent-sunset)" stopOpacity="0.2" />
            </linearGradient>
            
            <linearGradient id="right-face" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--accent-breeze)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="var(--accent-sunset)" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Floating animated 3D Node structure */}
          <g style={{
            transformOrigin: "17px 17px",
            animation: "logoFloat 3s ease-in-out infinite alternate"
          }}>
            {/* Outer dotted wireframe perimeter */}
            <path d="M17,5 L28,11 L28,23 L17,29 L6,23 L6,11 Z" fill="none" stroke="rgba(0, 229, 255, 0.4)" strokeWidth="0.75" strokeDasharray="3 3" />
            
            {/* Isometric Glass Faces */}
            <path d="M17,5 L28,11 L17,17 L6,11 Z" fill="url(#top-face)" stroke="var(--accent-breeze)" strokeWidth="0.75" />
            <path d="M6,11 L17,17 L17,29 L6,23 Z" fill="url(#left-face)" stroke="var(--accent-dusk)" strokeWidth="0.75" />
            <path d="M28,11 L17,17 L17,29 L28,23 Z" fill="url(#right-face)" stroke="var(--accent-sunset)" strokeWidth="0.75" />
            
            {/* Glowing core engine anchor */}
            <circle cx="17" cy="17" r="2.5" fill="#ffffff" filter="url(#logo-glow)" />
          </g>
        </svg>

        {/* High-end clean typography styling */}
        <span className="brand-logo" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontWeight: 800,
            fontSize: "17px",
            letterSpacing: "3px", // Premium spaced out look
            color: "var(--ink)",
            textTransform: "uppercase"
          }}>
            Bastion
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "8px",
            fontWeight: 600,
            color: "var(--accent-breeze)",
            border: "1px solid rgba(0, 229, 255, 0.15)",
            background: "rgba(0, 229, 255, 0.03)",
            padding: "2px 8px",
            borderRadius: "4px",
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            opacity: 0.85
          }}>
            Memory Engine
          </span>
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

      {/* SVG logo floating keyframe animation */}
      <style jsx global>{`
        @keyframes logoFloat {
          0% { transform: translateY(-1px) rotate(0deg); }
          100% { transform: translateY(1.5px) rotate(2deg); }
        }
      `}</style>
    </header>
  );
}
