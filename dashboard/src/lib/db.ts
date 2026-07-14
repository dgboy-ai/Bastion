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

// Standard static pool from environment variable
const staticPool = connectionString && !isMockForced
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
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

// Caching map for dynamic connection strings
const dynamicPools = new Map<string, Pool>();

async function getConnectionStringOverride(): Promise<string | null> {
  try {
    const list = await headers();
    return list.get("x-bastion-conn") || null;
  } catch (e) {
    return null;
  }
}

export async function getActivePool(): Promise<Pool | null> {
  if (isMockForced) return null;
  const override = await getConnectionStringOverride();
  if (override) {
    let p = dynamicPools.get(override);
    if (!p) {
      try {
        p = new Pool({
          connectionString: override,
          ssl: { rejectUnauthorized: false },
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 20000,
          max: 3,
        });
        dynamicPools.set(override, p);
        console.log(`[Bastion] Dynamic Pool created for connection string: ${override.slice(0, 30)}...`);
      } catch (err) {
        console.error("[Bastion] Failed to create dynamic pool:", err);
        return null;
      }
    }
    return p;
  }
  return staticPool;
}

// Export pool as a truthy dummy object so `if (!pool)` is always false,
// allowing dynamic connections even when the environment variable is unset.
export const pool = {} as Pool;

export async function query(text: string, params?: unknown[]) {
  const activePool = await getActivePool();
  if (!activePool) {
    throw new Error("BASTION_CONN not configured — running in mock mode");
  }
  const start = Date.now();
  try {
    const res = await activePool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    console.error("[DB Query] error:", err);
    throw err;
  }
}

export async function safeQuery(text: string, params?: unknown[]): Promise<SafeQueryResult> {
  try {
    const activePool = await getActivePool();
    if (!activePool) {
      return mockResult();
    }
    const start = Date.now();
    const res = await activePool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    console.warn("[DB Query] failed, falling back to mock:", err);
    return mockResult();
  }
}

