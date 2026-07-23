import { NextResponse } from "next/server";
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const _rateBuckets = new Map<string, number[]>();

function safeCompare(a: string, b: string): boolean {
  // Pad to same length to prevent timing side-channel on length
  const maxLen = Math.max(a.length, b.length);
  const bufA = Buffer.alloc(maxLen, 0);
  const bufB = Buffer.alloc(maxLen, 0);
  bufA.write(a);
  bufB.write(b);
  return cryptoTimingSafeEqual(bufA, bufB);
}

export function checkRateLimit(request: Request): NextResponse | null {
  // Determine client IP: trust X-Forwarded-For behind known proxies,
  // otherwise use a combination of headers for rate limiting
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");

  let ip = "unknown";
  if (process.env.VERCEL && forwarded) {
    ip = forwarded.split(",")[0]?.trim() || "unknown";
  } else if (process.env.CLOUDFLARE && cfConnectingIp) {
    ip = cfConnectingIp;
  } else if (process.env.BASTION_TRUST_PROXY && forwarded) {
    // Only trust X-Forwarded-For behind an explicit proxy configuration
    ip = forwarded.split(",")[0]?.trim() || "unknown";
  } else if (realIp) {
    ip = realIp;
  }
  // If still unknown, we can't rate-limit per-IP, but we still track
  const now = Date.now();
  let timestamps = _rateBuckets.get(ip);
  if (!timestamps) {
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

export function checkApiKey(request: Request): { valid: boolean; key?: string; error?: string } {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedKey = match ? match[1] : "";
  const expectedKey = process.env.BASTION_API_KEY;

  if (!expectedKey) {
    // No API key configured — deny all requests (set BASTION_API_KEY to enable access)
    return { valid: false, error: "API key not configured. Set BASTION_API_KEY environment variable." };
  }

  if (!providedKey) {
    return { valid: false, error: "Missing Authorization header with Bearer token" };
  }

  if (!safeCompare(providedKey, expectedKey)) {
    return { valid: false, error: "Invalid API key" };
  }

  return { valid: true, key: providedKey };
}

export function unauthorizedResponse(error: string): NextResponse {
  return NextResponse.json(
    {
      error,
      code: "UNAUTHORIZED",
      docs: "https://bastion.ai/docs/api-auth",
    },
    { status: 401, headers: { "Content-Type": "application/json" } },
  );
}

export function requireAuth(request: Request): NextResponse | null {
  const rateLimit = checkRateLimit(request);
  if (rateLimit) return rateLimit;
  const auth = checkApiKey(request);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error || "Authentication required");
  }
  return null;
}
