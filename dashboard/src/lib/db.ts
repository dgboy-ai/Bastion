import { type QueryResult, Pool } from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeQueryResult = QueryResult<any> & { mock?: boolean };

const connectionString = process.env.BASTION_CONN || process.env.BASTION_DB_URL;

if (!connectionString) {
  console.warn("[Bastion] BASTION_CONN not set — running in mock mode");
} else {
  console.log("[Bastion] BASTION_CONN configured, connecting to CockroachDB...");
}

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 5,
    })
  : null;

// Test connection on startup
if (pool) {
  pool.query("SELECT 1 as ping")
    .then(() => console.log("[Bastion] CockroachDB connection OK"))
    .catch((err) => console.error("[Bastion] CockroachDB connection FAILED:", err.message));
}

export async function query(text: string, params?: unknown[]) {
  if (!pool) {
    throw new Error("BASTION_CONN not configured — running in mock mode");
  }
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
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
    if (!pool) {
      return { rows: [], mock: true } as unknown as SafeQueryResult;
    }
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
    return res;
  } catch (err) {
    if (isProduction) throw err;
    console.warn("[DB Query] failed, falling back to mock:", err);
    return { rows: [], mock: true } as unknown as SafeQueryResult;
  }
}
