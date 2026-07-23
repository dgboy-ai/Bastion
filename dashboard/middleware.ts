import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

const PROTECTED_ROUTES = ["/dashboard", "/graph", "/logs", "/health", "/compliance", "/flight-recorder"];

/**
 * Validate auth token against server-side HMAC secret.
 * Token format: base64url(session_data).base64url(hmac_signature)
 * The HMAC is computed over session_data using BASTION_SESSION_SECRET.
 */
function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  
  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) {
    // No secret configured — fall back to format check (dev mode only)
    if (process.env.NODE_ENV === "production") return false;
    return token.length >= 16 && token.includes(".");
  }

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  try {
    const [dataB64, sigB64] = parts;
    const data = Buffer.from(dataB64, "base64url");
    const sig = Buffer.from(sigB64, "base64url");
    
    if (sig.length !== 32) return false; // HMAC-SHA256 = 32 bytes

    const expected = createHmac("sha256", secret).update(data).digest();
    return timingSafeEqual(sig, expected);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get("bastion_auth_token")?.value;

  if (isValidToken(authToken)) {
    return NextResponse.next();
  }

  // Mock mode bypass — development only, never in production
  if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.next();
    }
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("redirect", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"],
};
