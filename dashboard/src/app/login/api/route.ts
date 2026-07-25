import { NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

export async function POST(request: Request) {
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

  // In mock mode, accept any passphrase
  // In production, validate against BASTION_LOGIN_PASSPHRASE or BASTION_API_KEY
  const isMock = !process.env.BASTION_CONN || process.env.BASTION_MOCK === "true";
  const expectedPassphrase = process.env.BASTION_LOGIN_PASSPHRASE || process.env.BASTION_API_KEY;

  if (!isMock && expectedPassphrase) {
    const { timingSafeEqual } = await import("crypto");
    const bufA = Buffer.alloc(256, 0);
    const bufB = Buffer.alloc(256, 0);
    bufA.write(passphrase);
    bufB.write(expectedPassphrase);
    if (!timingSafeEqual(bufA, bufB)) {
      return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
    }
  }

  const secret = process.env.BASTION_SESSION_SECRET;
  if (!secret) {
    // No session secret configured — generate a temporary one for dev
    // In production, BASTION_SESSION_SECRET must be set
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }
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

  // Set HTTP-only cookie
  const response = NextResponse.json({ success: true, redirect: "/dashboard" });
  response.cookies.set("bastion_auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400, // 24 hours
  });

  return response;
}
