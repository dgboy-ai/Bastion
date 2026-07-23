import { type QueryResult, Pool } from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeQueryResult = QueryResult<any> & { mock?: boolean };

const mockResult = (): SafeQueryResult => ({
  rows: [],
  rowCount: 0,
  command: "",
  oid: 0,
  fields: [],
  mock: true,
});

const connectionString = process.env.BASTION_CONN || process.env.BASTION_DB_URL;
const isMockForced = process.env.BASTION_MOCK?.toLowerCase() === "true";

// Static pool from environment variable — rejects self-signed certs in production
const staticPool = connectionString && !isMockForced
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: true }
        : { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 5,
    })
  : null;

if (staticPool) {
  staticPool.query("SELECT 1 as ping")
    .then(() => console.log("[Bastion] Static CockroachDB connection OK"))
    .catch((err: Error) => console.error("[Bastion] Static CockroachDB connection FAILED:", err.message));
}

/** Check if mock mode is explicitly enabled via environment variable. */
export function isMockMode(): boolean {
  return isMockForced;
}

/** Whether a real database pool is available. */
export function hasDbPool(): boolean {
  return staticPool !== null;
}

export async function query(text: string, params?: unknown[]) {
  if (!staticPool) {
    throw new Error("Database not available (BASTION_CONN not configured)");
  }
  const start = Date.now();
  try {
    const res = await staticPool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    console.error("[DB Query] error:", err instanceof Error ? err.message : "Unknown error");
    throw err;
  }
}

/**
 * Execute a query. Returns mock data ONLY when BASTION_MOCK=true is set.
 * When DB is unavailable and mock mode is off, throws instead of silently returning empty data.
 * This prevents security dashboards from lying during database outages.
 */
export async function safeQuery(text: string, params?: unknown[]): Promise<SafeQueryResult> {
  if (!staticPool) {
    if (isMockForced) {
      return mockResult();
    }
    throw new Error("Database not available (BASTION_CONN not configured and BASTION_MOCK not enabled)");
  }
  const start = Date.now();
  try {
    const res = await staticPool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[DB Query] failed after ${duration}ms:`, err instanceof Error ? err.message : "Unknown error");
    throw err;
  }
}

