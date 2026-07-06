import { Pool } from "pg";

const connectionString = process.env.BASTION_CONN || process.env.BASTION_DB_URL;

if (!connectionString) {
  console.warn("WARNING: BASTION_CONN environment variable is not defined");
}

const isDev = process.env.NODE_ENV === "development";

export const pool = new Pool({
  connectionString,
  ssl: isDev
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true },
});

export async function query(text: string, params?: unknown[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
  return res;
}
