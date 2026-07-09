import { NextResponse } from "next/server";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function checkApiKey(request: Request): { valid: boolean; key?: string; error?: string } {
  const authHeader = request.headers.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const providedKey = match ? match[1] : "";
  const expectedKey = process.env.BASTION_API_KEY;

  if (!expectedKey) {
    return { valid: true, key: undefined };
  }

  if (!providedKey) {
    return { valid: false, error: "Missing Authorization header with Bearer token" };
  }

  if (!timingSafeEqual(providedKey, expectedKey)) {
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
  const auth = checkApiKey(request);
  if (!auth.valid) {
    return unauthorizedResponse(auth.error || "Authentication required");
  }
  return null;
}
