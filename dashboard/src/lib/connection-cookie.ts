import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { cookies } from "next/headers";

export const CONNECTION_COOKIE = "bastion_db_conn";
export const CONNECTION_COOKIE_MAX_AGE = 8 * 60 * 60;
const AUTH_COOKIE = "bastion_auth_token";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function sessionBinding(store: CookieStore): string {
  return store.get(AUTH_COOKIE)?.value || "";
}

function cookieKey(): Buffer | null {
  const secret =
    process.env.BASTION_CONN_COOKIE_SECRET ||
    process.env.BASTION_SESSION_SECRET;
  if (secret) return createHash("sha256").update(secret).digest();
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256").update("bastion-dev-connection-cookie").digest();
  }
  return null;
}

export function sealConnection(connectionString: string, binding: string): string | null {
  const key = cookieKey();
  if (!key) return null;

  const payload = JSON.stringify({
    v: 1,
    c: connectionString,
    b: createHash("sha256").update(binding).digest("hex"),
  });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(payload, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function openConnection(token: string, binding: string): string | null {
  const key = cookieKey();
  if (!key) return null;

  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 16 + 1) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    const payload = JSON.parse(plaintext) as { v?: number; c?: string; b?: string };
    const expected = createHash("sha256").update(binding).digest("hex");
    if (payload.v !== 1 || typeof payload.c !== "string" || payload.b !== expected) {
      return null;
    }
    return payload.c;
  } catch {
    return null;
  }
}

export function maskConnection(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const database = url.pathname.replace(/^\//, "") || "defaultdb";
    return `${url.hostname}/${database}`;
  } catch {
    return "Connected database";
  }
}

export async function readConnectionCookie(): Promise<string | null> {
  try {
    const store = await cookies();
    const token = store.get(CONNECTION_COOKIE)?.value;
    return token ? openConnection(token, sessionBinding(store)) : null;
  } catch {
    return null;
  }
}

export function connectionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CONNECTION_COOKIE_MAX_AGE,
  };
}
