import { NextResponse } from "next/server";
import { timingSafeEqual as cryptoTimingSafeEqual, createHmac } from "crypto";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_MAP_MAX = 10000;
const _rateBuckets = new Map<string, number[]>();

/**
 * Dual-layer rate limiting for serverless:
 *   Layer 1: In-memory per-invocation (best-effort, fast)
 *   Layer 2: Signed cookie counter (survives across invocations)
 *
 * The cookie is HMAC-signed to prevent tampering. Clients that disable
 * cookies still get Layer 1 protection from the in-memory map.
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  if (process.env.VERCEL && forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (process.env.CLOUDFLARE && cfConnectingIp) {
    return cfConnectingIp;
  }
  if (process.env.BASTION_TRUST_PROXY && forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  if (realIp) {
    return realIp;
  }
  return "unknown";
}

function getRateLimitCookie(request: Request): { count: number; windowStart: number } | null {
  const cookie = request.headers.get("cookie")?.match(/bastion_rl=([^;]+)/)?.[1];
  if (!cookie) return null;

  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) return null;

  const parts = cookie.split(".");
  if (parts.length !== 2) return null;

  try {
    const [payloadB64, sigB64] = parts;
    const data = Uint8Array.from(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

    if (sig.length !== 32) return null;

    // Use Node.js crypto for HMAC verification (Edge runtime handled by middleware.ts)
    const expected = Buffer.from(createHmac("sha256", secret).update(Buffer.from(data)).digest());
    const sigBuf = Buffer.from(sig);

    if (expected.length !== sig.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected[i] ^ sigBuf[i];
    }
    if (diff !== 0) return null;

    const payload = JSON.parse(new TextDecoder().decode(data));
    if (typeof payload.count !== "number" || typeof payload.windowStart !== "number") return null;
    if (Date.now() - payload.windowStart > RATE_LIMIT_WINDOW_MS * 2) return null; // Stale
    return payload;
  } catch {
    return null;
  }
}

function signRateLimitCookie(count: number, windowStart: number): string {
  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) throw new Error("BASTION_SESSION_SECRET required for rate-limit cookies");
  const payload = JSON.stringify({ count, windowStart });
  const dataB64 = Buffer.from(payload).toString("base64url");
  const sig = createHmac("sha256", secret).update(Buffer.from(payload)).digest().toString("base64url");
  return `${dataB64}.${sig}`;
}

function safeCompare(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(maxLen, 0);
  const bufB = Buffer.alloc(maxLen, 0);
  bufA.write(a);
  bufB.write(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}

function isValidSessionCookie(request: Request): boolean {
  const token = request.headers.get("cookie")?.match(/bastion_auth_token=([^;]+)/)?.[1];
  if (!token) return false;

  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) {
    // No session secret configured — reject all tokens
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  try {
    const [dataB64, sigB64] = parts;
    const data = Buffer.from(dataB64, "base64url");
    const sig = Buffer.from(sigB64, "base64url");
    if (sig.length !== 32) return false;

    // Check both potential signatures (decoded raw JSON payload or base64url format)
    const expectedWithData = createHmac("sha256", secret).update(data).digest();
    const expectedWithB64 = createHmac("sha256", secret).update(Buffer.from(dataB64, "utf8")).digest();

    const matchData = cryptoTimingSafeEqual(sig, expectedWithData);
    const matchB64 = cryptoTimingSafeEqual(sig, expectedWithB64);

    if (!matchData && !matchB64) {
      return false;
    }

    // Verify session expiration and subject claims
    const payload = JSON.parse(data.toString("utf8"));
    if (typeof payload.exp !== "number" || Date.now() / 1000 > payload.exp) {
      return false;
    }
    if (payload.sub !== "dashboard-user") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}


export function checkRateLimit(request: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  const now = Date.now();
  const ip = getClientIp(request);

  // ── Layer 1: In-memory per-invocation (fast, best-effort) ──
  let timestamps = _rateBuckets.get(ip);
  if (!timestamps) {
    if (_rateBuckets.size >= RATE_LIMIT_MAP_MAX) {
      const keys = Array.from(_rateBuckets.keys());
      for (let i = 0; i < keys.length / 2; i++) {
        _rateBuckets.delete(keys[i]);
      }
    }
    timestamps = [];
    _rateBuckets.set(ip, timestamps);
  }
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  timestamps = timestamps.filter((t) => t > cutoff);
  _rateBuckets.set(ip, timestamps);

  // ── Layer 2: Signed cookie counter (survives across serverless invocations) ──
  const cookieData = getRateLimitCookie(request);
  let cookieCount = 0;
  if (cookieData && now - cookieData.windowStart < RATE_LIMIT_WINDOW_MS) {
    cookieCount = cookieData.count;
  }

  // Use the higher of the two counters
  const effectiveCount = Math.max(timestamps.length, cookieCount);

  if (effectiveCount >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many requests. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }

  timestamps.push(now);
  return null;
}

/**
 * Build a rate-limit Set-Cookie header to include in the response.
 * Call this after checkRateLimit() returns null (allowed).
 */
export function buildRateLimitCookie(request: Request): string | null {
  if (process.env.NODE_ENV !== "production") return null;
  if (!process.env.BASTION_SESSION_SECRET) return null;

  const now = Date.now();
  const cookieData = getRateLimitCookie(request);
  let count = 1;
  let windowStart = now;
  if (cookieData && now - cookieData.windowStart < RATE_LIMIT_WINDOW_MS) {
    count = cookieData.count + 1;
    windowStart = cookieData.windowStart;
  }
  const value = signRateLimitCookie(count, windowStart);
  return `bastion_rl=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=120`;
}

// ── CSRF Protection ────────────────────────────────────────────────────────
//
// Double-submit cookie pattern: the CSRF token is derived from the session
// cookie's HMAC signature. The client sends it in X-CSRF-Token header.
// An attacker who can read the cookie (SameSite=Lax) cannot forge the
// header value without knowing the session secret.

function deriveCsrfToken(sessionCookie: string): string | null {
  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) return null;
  const parts = sessionCookie.split(".");
  if (parts.length !== 2) return null;
  // Token = HMAC of the session payload using session secret
  const payload = parts[0];
  return createHmac("sha256", secret + ":csrf").update(payload).digest("base64url");
}

function verifyCsrfToken(request: Request): boolean {
  const sessionCookie = request.headers.get("cookie")?.match(/bastion_auth_token=([^;]+)/)?.[1];
  if (!sessionCookie) return false; // No session = no CSRF check needed

  const csrfHeader = request.headers.get("x-csrf-token");
  if (!csrfHeader) return false; // Missing header = reject

  const expected = deriveCsrfToken(sessionCookie);
  if (!expected) return false;

  return safeCompare(csrfHeader, expected);
}

export function requireAuth(request: Request): NextResponse | null {
  const rateLimit = checkRateLimit(request);
  if (rateLimit) return rateLimit;

  // Check session cookie first (set by /login page)
  if (isValidSessionCookie(request)) {
    // For state-changing methods (POST, PUT, DELETE, PATCH), verify CSRF token
    const method = request.method.toUpperCase();
    if (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH") {
      if (!verifyCsrfToken(request)) {
        return NextResponse.json(
          { error: "CSRF token missing or invalid. Include X-CSRF-Token header.", code: "CSRF_REJECTED" },
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    return null;
  }

  // Fall back to API key for programmatic access (e.g., SDK, CI)
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const providedKey = match[1];
    const expectedKey = process.env.BASTION_API_KEY;
    if (expectedKey && safeCompare(providedKey, expectedKey)) {
      return null;
    }
  }

  // In local dev, allow unauthenticated access to facilitate easy testing and auditing
  // NOTE: This bypass is controlled by BASTION_DEV_MODE env var, NOT by Host header
  // Host header is user-controllable and MUST NOT be used for security decisions
  if (process.env.NODE_ENV !== "production") {
    if (process.env.BASTION_DEV_MODE === "true") {
      return null;
    }
  }

  // Allow disabling auth via env var (for public demo deployments)
  // NOTE: This only bypasses API key auth; session cookie auth is still enforced
  // by middleware.ts for page routes. Remove this in production.
  if (process.env.BASTION_DISABLE_AUTH === "true" && process.env.NODE_ENV !== "production") {
    return null;
  }

  return NextResponse.json(
    {
      error: "Authentication required. Log in at /login or provide a valid API key.",
      code: "UNAUTHORIZED",
    },
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

/**
 * Add rate-limit cookie header to a response.
 * Usage: return addRateLimitCookie(request, NextResponse.json({ ... }));
 */
export function addRateLimitCookie(request: Request, response: NextResponse): NextResponse {
  const cookie = buildRateLimitCookie(request);
  if (cookie) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}
