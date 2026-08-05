export const D = {
  gold: "#ffc800",
  lava: "#ff2a00",
  magma: "#ff9c00",
  cyan: "#00e5ff",
  purple: "#b026ff",
  body: "#e8e2ec",
  mute: "#8a8290",
  bg: "#0a0308",
  card: "rgba(255,255,255,.03)",
  border: "rgba(255,255,255,.06)",
  borderGold: "rgba(255,170,0,.15)",
} as const;

export const navItems = [
  { href: "/docs/introduction", label: "Introduction", icon: "📖", group: "Getting Started" },
  { href: "/docs/quickstart", label: "Quick Start", icon: "⚡", group: "Getting Started" },
  { href: "/docs/architecture", label: "Architecture", icon: "🏗️", group: "Core Concepts" },
  { href: "/docs/memory-architecture", label: "Memory System", icon: "🧠", group: "Core Concepts" },
  { href: "/docs/security", label: "Security", icon: "🛡️", group: "Core Concepts" },
  { href: "/docs/cockroachdb", label: "CockroachDB", icon: "🦎", group: "Core Concepts" },
  { href: "/docs/configuration", label: "Configuration", icon: "⚙️", group: "Reference" },
  { href: "/docs/setup", label: "Setup Guide", icon: "🔧", group: "Reference" },
] as const;

export type NavItem = (typeof navItems)[number];

export function getAdjacentPages(pathname: string) {
  const idx = navItems.findIndex((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  if (idx === -1) return { prev: null, next: null };
  return {
    prev: idx > 0 ? navItems[idx - 1] : null,
    next: idx < navItems.length - 1 ? navItems[idx + 1] : null,
  };
}
