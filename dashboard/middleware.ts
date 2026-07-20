import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/graph", "/logs", "/health", "/compliance", "/flight-recorder"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect dashboard sub-routes
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // In mock mode, allow unauthenticated access
  if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {
    return NextResponse.next();
  }

  // Check for API key in Authorization header or query param
  const authHeader = request.headers.get("authorization") || "";
  const apiKey = process.env.BASTION_API_KEY;

  if (!apiKey) {
    // No API key configured — allow access (dev mode)
    return NextResponse.next();
  }

  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const urlKey = request.nextUrl.searchParams.get("key");

  if (token === apiKey || urlKey === apiKey) {
    return NextResponse.next();
  }

  // Redirect to landing page with return URL
  const loginUrl = new URL("/", request.url);
  loginUrl.searchParams.set("returnTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"],
};
