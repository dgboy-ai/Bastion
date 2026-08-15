import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Page-route authentication for the Bastion dashboard.
//
// API routes enforce their own auth via src/lib/api-auth.ts (requireAuth).
// This proxy protects the rendered pages: any request to a protected page
// without a valid `bastion_auth_token` cookie is redirected to /login.
//
// Demo/dev mode: when BASTION_DEV_MODE=true or BASTION_DISABLE_AUTH=true and
// NODE_ENV !== "production", the proxy lets every request through so judges
// can explore the dashboard without logging in. In production these flags are
// ignored and session auth is always enforced.

const PROTECTED_PREFIXES = ["/dashboard", "/graph", "/logs", "/health", "/compliance", "/flight-recorder"];

function devAuthBypass(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.BASTION_DEV_MODE === "true") return true;
  if (process.env.BASTION_DISABLE_AUTH === "true") return true;
  return false;
}

function isValidSession(request: NextRequest): boolean {
  const token = request.cookies.get("bastion_auth_token")?.value;
  if (!token) return false;

  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [dataB64, sigB64] = parts;
  try {
    const sig = Buffer.from(sigB64, "base64url");
    if (sig.length !== 32) return false;

    // The login route signs the base64url payload string (see
    // src/app/login/api/route.ts). Also accept a signature over the raw bytes
    // for backward compatibility with older tokens.
    const expectedOverB64 = createHmac("sha256", secret).update(dataB64).digest();
    const expectedOverData = createHmac("sha256", secret).update(Buffer.from(dataB64, "base64url")).digest();

    const matchB64 = timingSafeEqual(sig, expectedOverB64);
    const matchData = timingSafeEqual(sig, expectedOverData);
    if (!matchB64 && !matchData) return false;

    const payload = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) return false;
    if (payload.sub !== "dashboard-user") return false;
    return true;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only guard page routes; leave API routes, login, static assets alone.
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  if (devAuthBypass()) return NextResponse.next();

  if (isValidSession(request)) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"],
};