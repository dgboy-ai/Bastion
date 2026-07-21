import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/dashboard", "/graph", "/logs", "/health", "/compliance", "/flight-recorder"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  if (!isProtected) {
    return NextResponse.next();
  }

  const authToken = request.cookies.get("bastion_auth_token")?.value;
  const dbConn = request.cookies.get("bastion_db_conn")?.value;

  if (authToken || dbConn) {
    return NextResponse.next();
  }

  if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"],
};
