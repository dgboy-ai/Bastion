import { type QueryResult, Pool } from "pg";
import { headers } from "next/headers";

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

// Map cache for dynamic connections (judges pasting CockroachDB URIs)
const poolCache = new Map<string, Pool>();

async function getDynamicConnectionString(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-bastion-conn") || null;
  } catch {
    return null;
  }
}

async function getActivePool(): Promise<Pool | null> {
  const dynamicConn = await getDynamicConnectionString();
  const activeConn = dynamicConn || connectionString;

  if (!activeConn || isMockForced) {
    return null;
  }

  // If using default static pool, return it directly to avoid extra instantiation
  if (activeConn === connectionString) {
    return staticPool;
  }

  let pool = poolCache.get(activeConn);
  if (!pool) {
    console.log("[Dynamic Pool] Initializing new CockroachDB connection pool...");
    pool = new Pool({
      connectionString: activeConn,
      ssl: { rejectUnauthorized: false }, // Allow verify-full override for convenience
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 20000,
      max: 3,
    });
    poolCache.set(activeConn, pool);
  }
  return pool;
}

/** Check if mock mode is explicitly enabled via environment variable. */
export function isMockMode(): boolean {
  return isMockForced;
}

/** Whether a real database pool is available. */
export async function hasDbPool(): Promise<boolean> {
  const pool = await getActivePool();
  return pool !== null;
}

export async function query(text: string, params?: unknown[]) {
  const pool = await getActivePool();
  if (!pool) {
    throw new Error("Database not available (BASTION_CONN not configured)");
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
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
  const pool = await getActivePool();
  if (!pool) {
    const dynamicConn = await getDynamicConnectionString();
    if (isMockForced || dynamicConn) {
      return mockResult();
    }
    throw new Error("Database not available (BASTION_CONN not configured and BASTION_MOCK not enabled)");
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`[DB Query] failed after ${duration}ms:`, err instanceof Error ? err.message : "Unknown error");
    throw err;
  }
}
