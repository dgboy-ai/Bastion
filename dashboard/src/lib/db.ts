import { type QueryResult, Pool } from "pg";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SafeQueryResult = QueryResult<any> & { mock?: boolean };

const connectionString = process.env.BASTION_CONN || process.env.BASTION_DB_URL;

if (!connectionString) {
  console.warn("WARNING: BASTION_CONN environment variable is not defined — running in mock mode");
}

const isDev = process.env.NODE_ENV === "development";

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: isDev
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      max: 20,
    })
  : null;

export async function query(text: string, params?: unknown[]) {
  if (!pool) {
    throw new Error("BASTION_CONN not configured");
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
    console.warn("[DB Query] failed, falling back to mock:", err);
    return { rows: [], mock: true } as unknown as SafeQueryResult;
  }
}
