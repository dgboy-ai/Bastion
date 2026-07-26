import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/graph", "/logs", "/health", "/compliance", "/flight-recorder"];

/**
 * Validate auth token using Web Crypto API (works in Edge Runtime).
 * Token format: base64url(session_data).base64url(hmac_signature)
 */
async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  try {
    const [dataB64, sigB64] = parts;
    const data = Uint8Array.from(atob(dataB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const sig = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

    if (sig.length !== 32) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, data));

    if (expected.length !== sig.length) return false;
    // Constant-time comparison
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected[i] ^ sig[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get("bastion_auth_token")?.value;

  if (await isValidToken(authToken)) {
    return NextResponse.next();
  }

  // Explicit mock mode: only bypass auth when BASTION_MOCK is explicitly set
  if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {
    return NextResponse.next();
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"],
};
