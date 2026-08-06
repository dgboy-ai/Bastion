import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// All pages accessible — API routes handle their own auth via x-bastion-conn header
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/graph/:path*", "/logs/:path*", "/health/:path*", "/compliance/:path*", "/flight-recorder/:path*"],
};
