import { type QueryResult, Pool } from "pg";
import { headers } from "next/headers";
import fs from "fs";
import path from "path";

type QueryResultRow = Record<string, unknown>;

export type SafeQueryResult = QueryResult<QueryResultRow> & { mock?: boolean };

const mockResult = (): SafeQueryResult => ({
  rows: [],
  rowCount: 0,
  command: "",
  oid: 0,
  fields: [],
  mock: true,
});

const connectionString = process.env.BASTION_CONN || process.env.BASTION_DB_URL;
const isMockForced = false;

async function ensureSchema(pool: any) {
  if (pool.schemaEnsured) return;
  pool.schemaEnsured = true;
  try {
    // 1. Ensure migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        id INT PRIMARY KEY DEFAULT unique_rowid(),
        version VARCHAR(255) NOT NULL UNIQUE,
        filename VARCHAR(500) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        checksum VARCHAR(64) NOT NULL DEFAULT '',
        execution_ms INT NOT NULL DEFAULT 0
      )
    `);

    // 2. Fetch already applied migration versions
    const appliedRes = await pool.query("SELECT version FROM _schema_migrations");
    const appliedVersions = new Set(appliedRes.rows.map((r: QueryResultRow) => r.version));

    // 3. Locate schema directory
    const schemaDir = path.resolve(process.cwd(), "../schema");
    if (!fs.existsSync(schemaDir)) {
      console.warn("[DB Bootstrap] Schema directory not found at " + schemaDir);
      return;
    }

    // 4. Discover and sort migration files
    const files = fs.readdirSync(schemaDir)
      .filter(f => f.endsWith(".sql") && !f.startsWith("down_"))
      .sort();

    let appliedCount = 0;
    for (const file of files) {
      // Extract version: e.g. "001_agent_checkpoints.sql" -> "001"
      const parts = file.split("_");
      if (parts.length < 2 || isNaN(Number(parts[0]))) {
        continue;
      }
      const version = parts[0];

      // If version is already applied, skip it
      if (appliedVersions.has(version)) {
        continue;
      }

      console.log(`[DB Bootstrap] Applying pending migration ${version}: ${file}`);
      const sqlPath = path.join(schemaDir, file);
      const sql = fs.readFileSync(sqlPath, "utf8");

      // Execute SQL statements
      const statements = sql.split(";").map(s => s.trim()).filter(Boolean);
      const start = Date.now();
      for (const stmt of statements) {
        try {
          await pool.query(stmt);
} catch (err: unknown) {
            if (err instanceof Error && (err.message.includes("already exists") || err.message.includes("duplicate"))) {
              // Ignore expected idempotent duplicates
            } else {
              console.warn(`[DB Bootstrap] Statement warning in ${file}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
      }
      const elapsed = Date.now() - start;

      // Record migration version as applied
      await pool.query(
        "INSERT INTO _schema_migrations (version, filename, checksum, execution_ms) VALUES ($1, $2, $3, $4) ON CONFLICT (version) DO NOTHING",
        [version, file, "", elapsed]
      );
      appliedCount++;
    }

    if (appliedCount > 0) {
      console.log(`[DB Bootstrap] Successfully applied ${appliedCount} schema migration(s).`);
    }
} catch (err) {
    console.error("[DB Bootstrap] Failed to check or apply migrations:", err instanceof Error ? err.message : String(err));
  }
}

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
    .then(() => {
      console.log("[Bastion] Static CockroachDB connection OK");
      ensureSchema(staticPool).catch(err => console.error("Static pool schema bootstrap failed:", err));
    })
    .catch((err: Error) => console.error("[Bastion] Static CockroachDB connection FAILED:", err.message));
}

// Map cache for dynamic connections (judges pasting CockroachDB URIs)
const poolCache = new Map<string, Pool>();
const POOL_CACHE_MAX = 10;

async function getDynamicConnectionString(): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  try {
    const h = await headers();
    return h.get("x-bastion-conn") || null;
} catch (err: unknown) {
    return null;
  }
}

async function getActivePool(): Promise<Pool | null> {
  const dynamicConn = await getDynamicConnectionString();

  // Dynamic connection (from Connect DB modal) always honored — bypasses mock mode
  if (dynamicConn) {
    let pool = poolCache.get(dynamicConn);
    if (!pool) {
      if (poolCache.size >= POOL_CACHE_MAX) {
        const oldest = poolCache.keys().next().value;
        if (oldest) {
          const oldPool = poolCache.get(oldest);
          if (oldPool) oldPool.end().catch(() => {});
          poolCache.delete(oldest);
        }
      }
      console.log("[Dynamic Pool] Initializing new CockroachDB connection pool...");
      pool = new Pool({
        connectionString: dynamicConn,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 30000,
        max: 3,
      });
      poolCache.set(dynamicConn, pool);
    }
    ensureSchema(pool).catch(err => console.error("Dynamic pool schema bootstrap failed:", err));
    return pool;
  }

  if (!connectionString || isMockForced) {
    return null;
  }

  if (staticPool) {
    ensureSchema(staticPool).catch(err => console.error("Static pool schema bootstrap failed:", err));
  }
  return staticPool;
}

/** Check if mock mode is enabled (either explicitly or as a safe default when no DB is configured). */
export function isMockMode(): boolean {
  return isMockForced;
}

/** Check if mock is only the default (nothing configured by user), not explicit BASTION_MOCK=true. */
export function isMockDefault(): boolean {
  return isMockForced && !(process.env.BASTION_MOCK?.toLowerCase() === "true");
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
    if (isMockForced) {
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
