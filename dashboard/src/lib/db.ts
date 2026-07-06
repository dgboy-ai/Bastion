import { Pool } from "pg";

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
    })
  : null;

export async function query(text: string, params?: unknown[]) {
  if (!pool) {
    throw new Error("BASTION_CONN not configured");
  }
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
  return res;
}
