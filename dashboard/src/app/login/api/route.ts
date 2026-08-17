import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

// ── Brute-force protection: 5 attempts per minute per IP ──
const LOGIN_WINDOW_MS = 60_000;
const LOGIN_MAX_ATTEMPTS = 5;
const _loginBuckets = new Map<string, number[]>();

function checkLoginRateLimit(ip: string): NextResponse | null {
  if (process.env.NODE_ENV !== "production") return null;

  const now = Date.now();
  let timestamps = _loginBuckets.get(ip);
  if (!timestamps) {
    if (_loginBuckets.size > 5000) {
      const keys = Array.from(_loginBuckets.keys());
      for (let i = 0; i < keys.length / 2; i++) _loginBuckets.delete(keys[i]);
    }
    timestamps = [];
    _loginBuckets.set(ip, timestamps);
  }
  const cutoff = now - LOGIN_WINDOW_MS;
  timestamps = timestamps.filter((t) => t > cutoff);
  _loginBuckets.set(ip, timestamps);

  if (timestamps.length >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((timestamps[0] + LOGIN_WINDOW_MS - now) / 1000);
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${retryAfter}s.`, code: "RATE_LIMITED" },
      { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter) } },
    );
  }

  timestamps.push(now);
  return null;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  if (process.env.VERCEL && forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  if (process.env.BASTION_TRUST_PROXY && forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  if (realIp) return realIp;
  return "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateLimitResponse = checkLoginRateLimit(ip);
  if (rateLimitResponse) return rateLimitResponse;

  let body: { passphrase?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const passphrase = body.passphrase?.trim();
  if (!passphrase) {
    return NextResponse.json({ error: "Passphrase required" }, { status: 400 });
  }

  // Validate passphrase against BASTION_LOGIN_PASSPHRASE or BASTION_API_KEY.
  // In mock mode (no CRDB conn, no expected key), allow any passphrase for local dev.
  const expectedPassphrase = process.env.BASTION_LOGIN_PASSPHRASE || process.env.BASTION_API_KEY;

  if (expectedPassphrase) {
    // Demo bypass for Vercel deployment
    if (process.env.VERCEL && passphrase === "bastion") {
      // Allow demo access
    } else {
      const { timingSafeEqual, scryptSync } = await import("crypto");
      try {
        const hashA = scryptSync(passphrase, "static-bastion-salt", 64);
        const hashB = scryptSync(expectedPassphrase, "static-bastion-salt", 64);
        if (!timingSafeEqual(hashA, hashB)) {
          return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
        }
      } catch (err) {
        // Fallback for edge environments if scrypt fails
        if (passphrase !== expectedPassphrase) {
          return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
        }
      }
    }
  }

  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Create session payload
  const sessionData = JSON.stringify({
    sub: "dashboard-user",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
    nonce: randomBytes(8).toString("hex"),
  });

  const dataB64 = Buffer.from(sessionData).toString("base64url");

  let sigB64: string;
  if (secret) {
    const sig = createHmac("sha256", secret).update(dataB64).digest();
    sigB64 = sig.toString("base64url");
  } else {
    // Dev mode: generate a dummy signature (32 bytes)
    sigB64 = randomBytes(32).toString("base64url");
  }

  const token = `${dataB64}.${sigB64}`;

  // Derive CSRF token from session payload (double-submit cookie pattern)
  const csrfToken = secret
    ? createHmac("sha256", secret + ":csrf").update(dataB64).digest("base64url")
    : randomBytes(32).toString("base64url");

  // Set HTTP-only cookies
  const response = NextResponse.json({ success: true, redirect: "/dashboard" });
  response.cookies.set("bastion_auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400, // 24 hours
  });
  // CSRF token cookie (readable by JS, used to compute X-CSRF-Token header)
  response.cookies.set("bastion_csrf", csrfToken, {
    httpOnly: false, // JS must read this to set X-CSRF-Token header
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
  });

  return response;
}
