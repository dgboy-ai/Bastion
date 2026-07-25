import { NextResponse } from "next/server";
import { timingSafeEqual as cryptoTimingSafeEqual, createHmac } from "crypto";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_MAP_MAX = 10000;
const _rateBuckets = new Map<string, number[]>();

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
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  try {
    const [dataB64, sigB64] = parts;
    const data = Buffer.from(dataB64, "base64url");
    const sig = Buffer.from(sigB64, "base64url");
    if (sig.length !== 32) return false;
    const expected = createHmac("sha256", secret).update(data).digest();
    return cryptoTimingSafeEqual(sig, expected);
  } catch {
    return false;
  }
}

export function checkRateLimit(request: Request): NextResponse | null {
  if (process.env.NODE_ENV !== "production") {
    return null;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  let ip = "unknown";
  if (process.env.VERCEL && forwarded) {
    ip = forwarded.split(",")[0]?.trim() || "unknown";
  } else if (process.env.CLOUDFLARE && cfConnectingIp) {
    ip = cfConnectingIp;
  } else if (process.env.BASTION_TRUST_PROXY && forwarded) {
    ip = forwarded.split(",")[0]?.trim() || "unknown";
  } else if (realIp) {
    ip = realIp;
  }
  const now = Date.now();
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
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return NextResponse.json(
      { error: "Too many requests. Try again later.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } },
    );
  }
  timestamps.push(now);
  return null;
}

export function requireAuth(request: Request): NextResponse | null {
  const rateLimit = checkRateLimit(request);
  if (rateLimit) return rateLimit;

  // In dev/mock mode, allow unauthenticated access for easier local development
  if (process.env.NODE_ENV !== "production") {
    return null;
  }

  // Check session cookie first (set by /login page)
  if (isValidSessionCookie(request)) {
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

  return NextResponse.json(
    {
      error: "Authentication required. Log in at /login or provide a valid API key.",
      code: "UNAUTHORIZED",
    },
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}
