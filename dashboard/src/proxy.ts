import { NextRequest, NextResponse } from "next/server";
import { checkApiKey, unauthorizedResponse } from "@/lib/api-auth";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  if (!WRITE_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  const result = checkApiKey(request);
  if (!result.valid) {
    return unauthorizedResponse(result.error!);
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
