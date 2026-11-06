import { cookies } from "next/headers";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import {
  CONNECTION_COOKIE,
  connectionCookieOptions,
  maskConnection,
  openConnection,
  sealConnection,
} from "@/lib/connection-cookie";

export const dynamic = "force-dynamic";

const ALLOWED_PROTOCOLS = ["postgresql:", "postgres:", "cockroachdb:"];

function validateConnectionString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096) return null;
  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) return null;
    if (!parsed.hostname) return null;
    return trimmed;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const store = await cookies();
  const binding = store.get("bastion_auth_token")?.value || "";
  const token = store.get(CONNECTION_COOKIE)?.value;
  const connectionString = token ? openConnection(token, binding) : null;
  return apiSuccess({
    connected: Boolean(connectionString),
    label: connectionString ? maskConnection(connectionString) : "",
  }, "dynamic");
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const connectionString = validateConnectionString(
    (body as { connectionString?: unknown })?.connectionString,
  );
  if (!connectionString) {
    return apiError(
      "Invalid connection string. Use postgresql://, postgres://, or cockroachdb://",
      400,
    );
  }

  const store = await cookies();
  const binding = store.get("bastion_auth_token")?.value || "";
  const sealed = sealConnection(connectionString, binding);
  if (!sealed) {
    return apiError(
      "Connection persistence is not configured (set BASTION_SESSION_SECRET)",
      503,
      "CONNECTION_COOKIE_UNAVAILABLE",
    );
  }

  store.set(CONNECTION_COOKIE, sealed, connectionCookieOptions());

  return apiSuccess({
    connected: true,
    label: maskConnection(connectionString),
  }, "dynamic");
}

export async function DELETE(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const store = await cookies();
  store.delete(CONNECTION_COOKIE);
  return apiSuccess({ connected: false }, "dynamic");
}
