import { Pool } from "pg";

const connectionString = process.env.BASTION_CONN || process.env.BASTION_DB_URL;

if (!connectionString) {
  console.warn("WARNING: BASTION_CONN environment variable is not defined");
}

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Let's keep it simple for the client, since root.crt is local
  },
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log(`[DB Query] duration: ${duration}ms, rows: ${res.rowCount}`);
  return res;
}
