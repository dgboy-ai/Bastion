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

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/graph",
  "/logs",
  "/health",
  "/compliance",
  "/flight-recorder",
  "/agent",
  "/playground",
  "/skills",
  "/soc",
];

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_COOKIE = "bastion_rl";

function readRateLimitCookie(request: NextRequest): { count: number; windowStart: number } | null {
  const secret = process.env.BASTION_SESSION_SECRET;
  const value = request.cookies.get(RATE_LIMIT_COOKIE)?.value;
  if (!secret || !value) return null;

  const parts = value.split(".");
  if (parts.length !== 2) return null;
  try {
    const payloadBytes = Buffer.from(parts[0], "base64url");
    const sig = Buffer.from(parts[1], "base64url");
    if (sig.length !== 32) return null;
    const expected = createHmac("sha256", secret).update(payloadBytes).digest();
    if (!timingSafeEqual(sig, expected)) return null;

    const payload = JSON.parse(payloadBytes.toString("utf8"));
    if (typeof payload.count !== "number" || typeof payload.windowStart !== "number") return null;
    if (Date.now() - payload.windowStart > RATE_LIMIT_WINDOW_MS * 2) return null;
    return payload;
  } catch {
    return null;
  }
}

function writeRateLimitCookie(count: number, windowStart: number): string | null {
  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) return null;
  const payload = JSON.stringify({ count, windowStart });
  const payloadB64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(Buffer.from(payload)).digest().toString("base64url");
  return `${payloadB64}.${sig}`;
}

function applyApiRateLimit(request: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const now = Date.now();
  const existing = readRateLimitCookie(request);
  let count = 1;
  let windowStart = now;
  if (existing && now - existing.windowStart < RATE_LIMIT_WINDOW_MS) {
    count = existing.count + 1;
    windowStart = existing.windowStart;
  }

  if (count > RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many requests. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const value = writeRateLimitCookie(count, windowStart);
  const response = NextResponse.next();
  if (value) {
    response.cookies.set(RATE_LIMIT_COOKIE, value, {
      httpOnly: true,
      sameSite: "strict",
      secure: true,
      path: "/",
      maxAge: 120,
    });
  }
  return response;
}

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

  // API routes enforce auth themselves, but the signed-cookie rate-limit
  // counter must be incremented here because route handlers cannot easily
  // set a cookie on an otherwise-successful response.
  if (pathname.startsWith("/api/")) {
    return applyApiRateLimit(request) ?? NextResponse.next();
  }

  // Only guard page routes; leave login and static assets alone.
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
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/graph/:path*",
    "/logs/:path*",
    "/health/:path*",
    "/compliance/:path*",
    "/flight-recorder/:path*",
    "/agent/:path*",
    "/playground/:path*",
    "/skills/:path*",
    "/soc/:path*",
  ],
};