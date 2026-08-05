"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Space_Grotesk, JetBrains_Mono, Inter } from "next/font/google";
import { D, navItems } from "@/components/docs/theme";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-sg" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-mono" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter" });

/* ── Canvas Background ────────────────────────────────────── */
function DocsCanvas() {
  const cvs = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = cvs.current!;
    const ctx = canvas.getContext("2d")!;
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const resize = () => {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(Math.random() * 0.5 + 0.08),
      sz: Math.random() * 2 + 0.6,
      life: Math.random(),
      decay: Math.random() * 0.0015 + 0.0004,
    }));
    let raf: number;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // 1. Draw a subtle developer tech grid
      ctx.strokeStyle = "rgba(255, 100, 0, 0.025)";
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < W; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // 2. Premium Volcanic Ambient Glow
      const grad = ctx.createRadialGradient(W / 2, H * 0.25, 0, W / 2, H * 0.25, W * 0.7);
      grad.addColorStop(0, "rgba(255,140,0,0.08)");
      grad.addColorStop(0.4, "rgba(180,30,0,0.03)");
      grad.addColorStop(0.8, "rgba(120,10,50,0.005)");
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // 3. Floating embers
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0 || p.y < -10) {
          p.x = Math.random() * W;
          p.y = H + 10;
          p.life = 1;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.sz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,170,0,${p.life * 0.45})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return (
    <canvas
      ref={cvs}
      style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }}
    />
  );
}

/* ── Sidebar Navigation ────────────────────────────────────── */
function Sidebar({
  pathname,
  mobileOpen,
  onClose,
}: {
  pathname: string;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const groups = Array.from(new Set(navItems.map((n) => n.group)));
  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.6)",
            zIndex: 998,
            display: "none",
          }}
          className="docs-overlay"
        />
      )}
      <aside
        className={`docs-sidebar ${mobileOpen ? "docs-sidebar-open" : ""}`}
        style={{
          width: "300px",
          position: "fixed",
          top: "60px",
          left: 0,
          bottom: 0,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          borderRight: "1px solid rgba(255, 170, 0, 0.08)",
          background: "rgba(9, 4, 14, 0.72)",
          backdropFilter: "blur(20px)",
          padding: "40px 24px 30px",
          overflowY: "auto",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10.5px",
            fontWeight: 800,
            color: D.gold,
            textTransform: "uppercase",
            letterSpacing: "2.5px",
            marginBottom: "20px",
            paddingLeft: "14px",
          }}
        >
          Documentation
        </div>

        {/* Search bar placeholder */}
        <div style={{ padding: "0 14px", marginBottom: "24px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#8a7e98",
            fontSize: "12.5px",
            fontFamily: "var(--font-inter)",
            cursor: "pointer",
            transition: "all 0.2s"
          }}
          className="search-box-ph"
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🔍</span>
              <span>Search docs...</span>
            </span>
            <kbd style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "4px",
              padding: "1px 6px",
              fontSize: "9px",
              fontFamily: "var(--font-mono)",
              color: "#a090b0"
            }}>⌘K</kbd>
          </div>
        </div>

        {groups.map((group) => (
          <div key={group} style={{ marginBottom: "18px" }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "9px",
                fontWeight: 800,
                color: D.mute,
                textTransform: "uppercase",
                letterSpacing: "1.8px",
                padding: "0 14px",
                marginBottom: "8px",
                opacity: 0.85
              }}
            >
              {group}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              {navItems
                .filter((n) => n.group === group)
                .map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="sidebar-link"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "9px 14px",
                        fontSize: "13.5px",
                        fontWeight: active ? 700 : 500,
                        color: active ? "#fff" : "#bcaec6",
                        borderLeft: `3.5px solid ${active ? D.lava : "transparent"}`,
                        borderRadius: "0 8px 8px 0",
                        background: active ? "rgba(255, 170, 0, 0.08)" : "transparent",
                        textDecoration: "none",
                        fontFamily: "var(--font-sg)",
                      }}
                    >
                      <span style={{ fontSize: "14px", color: active ? D.gold : D.mute }}>{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
            </div>
          </div>
        ))}
        {/* Sidebar Status Widget at the bottom */}
        <div style={{
          marginTop: "auto",
          padding: "16px 14px 10px",
          borderTop: "1px solid rgba(255, 170, 0, 0.08)",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "#9a8ea8",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00ff66", boxShadow: "0 0 6px #00ff66" }} />
            <span>BASTION CORE: <strong style={{color:"#fff"}}>ONLINE</strong></span>
          </div>
          <div style={{ opacity: 0.65 }}>SEED: 0x8AEF91C7</div>
          <div style={{ opacity: 0.65 }}>PORT: 8080</div>
        </div>
      </aside>
    </>
  );
}

/* ── Breadcrumbs ────────────────────────────────────────────── */
function Breadcrumbs({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    const item = navItems.find((n) => n.href === href);
    return { label: item?.label || p.charAt(0).toUpperCase() + p.slice(1), href };
  });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        marginBottom: "20px",
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        color: D.mute,
        flexWrap: "wrap",
      }}
    >
      <Link
        href="/docs/introduction"
        style={{ color: D.mute, textDecoration: "none", transition: "color .2s" }}
        className="bc-link"
      >
        docs
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ color: D.mute }}>/</span>
          {i < crumbs.length - 1 ? (
            <Link
              href={c.href}
              style={{ color: D.mute, textDecoration: "none", transition: "color .2s" }}
              className="bc-link"
            >
              {c.label}
            </Link>
          ) : (
            <span style={{ color: D.gold }}>{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ── Mobile Hamburger ──────────────────────────────────────── */
function Hamburger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="docs-hamburger"
      style={{
        display: "none",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "6px",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={D.body} strokeWidth="2">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    </button>
  );
}

/* ── Docs Layout ─────────────────────────────────────────── */
export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable}`}
      style={{
        position: "relative",
        minHeight: "100vh",
        fontFamily: "var(--font-inter), sans-serif",
        overflowX: "hidden",
        background: D.bg,
        color: D.body,
      }}
    >
      <DocsCanvas />
      {/* Nav */}
      <nav
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 900,
          padding: "14px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(6,3,7,.85)",
          backdropFilter: "blur(24px)",
          borderBottom: `1px solid ${D.borderGold}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Hamburger onClick={() => setMobileOpen(!mobileOpen)} />
          <Link
            href="/"
            style={{
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "6px",
                background: `linear-gradient(135deg,${D.lava},${D.magma})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 0 16px ${D.lava}40`,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2.5"
              >
                <path d="M12 2L3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4z" />
              </svg>
            </div>
            <span
              style={{
                fontWeight: 900,
                fontSize: "16px",
                letterSpacing: "3px",
                color: "#fff",
                textTransform: "uppercase",
                fontFamily: "var(--font-sg)",
              }}
            >
              BASTION
            </span>
          </Link>
        </div>
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <Link
            href="/"
            style={{
              color: D.body,
              fontSize: "13px",
              textDecoration: "none",
              fontWeight: 600,
            }}
            className="nav-link"
          >
            Home
          </Link>
          <Link
            href="/playground"
            style={{
              color: D.body,
              fontSize: "13px",
              textDecoration: "none",
              fontWeight: 600,
            }}
            className="nav-link"
          >
            Live Demo
          </Link>
          <Link
            href="/playground"
            className="nav-cta"
            style={{
              padding: "8px 18px",
              borderRadius: "6px",
              background: `linear-gradient(135deg,${D.lava},${D.magma})`,
              color: "#fff",
              fontSize: "12px",
              fontWeight: 800,
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "1px",
              transition: "transform .2s",
            }}
          >
            Enter Live Demo
          </Link>
        </div>
      </nav>
      {/* Content */}
      <div
        style={{
          display: "flex",
          marginLeft: "300px",
          width: "calc(100% - 300px)",
          padding: "80px 40px 80px",
          justifyContent: "center",
        }}
        className="docs-main-container"
      >
        <Sidebar
          pathname={pathname}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />
        <main 
          style={{ 
            flexGrow: 1, 
            maxWidth: "960px",
            width: "100%",
            background: "rgba(14, 5, 20, 0.45)",
            border: "1px solid rgba(255, 255, 255, 0.04)",
            borderRadius: "14px",
            padding: "40px 48px",
            boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(8px)",
          }}
          className="docs-reader-panel"
        >
          <Breadcrumbs pathname={pathname} />
          {children}
        </main>
      </div>
      <style>{`
        .bc-link:hover { color: ${D.gold} !important; }
        .nav-link:hover { color: ${D.gold} !important; }
        .nav-cta:hover { transform: scale(1.03); }
        .sidebar-link { transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1) !important; }
        .sidebar-link:hover {
          background: rgba(255, 170, 0, 0.05) !important;
          color: #fff !important;
          transform: translateX(4px);
        }
        .search-box-ph:hover {
          border-color: rgba(255, 170, 0, 0.3) !important;
          background: rgba(255, 255, 255, 0.06) !important;
        }
        .docs-overlay { display: none !important; }
        .docs-sidebar { display: flex !important; }
        .docs-hamburger { display: none !important; }
        .docs-sidebar-open { display: flex !important; }
        @media (max-width: 768px) {
          .docs-main-container {
            margin-left: 0 !important;
            width: 100% !important;
            padding: 90px 16px 40px !important;
          }
          .docs-reader-panel {
            padding: 24px 20px !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          .docs-overlay { display: block !important; position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 998; }
          .docs-sidebar {
            display: none !important;
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 280px !important;
            height: 100vh !important;
            z-index: 999;
            background: ${D.bg};
            padding: 80px 20px 20px !important;
            border-right: 1px solid ${D.borderGold} !important;
            overflow-y: auto !important;
          }
          .docs-sidebar-open { display: flex !important; }
          .docs-hamburger { display: block !important; }
        }
      `}</style>
    </div>
  );
}
