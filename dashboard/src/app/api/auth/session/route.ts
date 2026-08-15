import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

// GET /api/auth/session — returns whether the caller holds a valid session
// cookie. Used by the /login page to decide whether to bounce straight to the
// dashboard. This route is intentionally unauthenticated.
export async function GET(request: NextRequest) {
  const token = request.cookies.get("bastion_auth_token")?.value;
  const secret = process.env.BASTION_SESSION_SECRET;

  let authenticated = false;
  if (token && secret) {
    const parts = token.split(".");
    if (parts.length === 2) {
      const [dataB64, sigB64] = parts;
      try {
        const sig = Buffer.from(sigB64, "base64url");
        if (sig.length === 32) {
          const expectedOverB64 = createHmac("sha256", secret).update(dataB64).digest();
          const expectedOverData = createHmac("sha256", secret).update(Buffer.from(dataB64, "base64url")).digest();
          const matchB64 = timingSafeEqual(sig, expectedOverB64);
          const matchData = timingSafeEqual(sig, expectedOverData);
          if (matchB64 || matchData) {
            const payload = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8"));
            authenticated =
              typeof payload.exp === "number" &&
              Date.now() / 1000 <= payload.exp &&
              payload.sub === "dashboard-user";
          }
        }
      } catch {
        authenticated = false;
      }
    }
  }

  return NextResponse.json({ authenticated });
}