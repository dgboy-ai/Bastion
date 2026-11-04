import { safeQuery, isMockMode } from "@/lib/db";
import { getMockStats } from "@/lib/mock-data";
import { apiSuccess, apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

/**
 * Minimal, unauthenticated counters for the public landing page.
 * Deliberately returns aggregate counts only — never memory content,
 * hashes, agents or audit details.
 */
export async function GET() {
  if (isMockMode()) {
    const s = getMockStats();
    return apiSuccess(
      {
        memories: s.memories ?? 0,
        auditLogs: s.auditLogs ?? 0,
        entities: s.entities ?? 0,
        mcpTools: s.mcpTools ?? 35,
        resources: s.resources ?? 3,
      },
      "short",
      { mock: true },
    );
  }

  try {
    const [memRes, auditRes, entityRes, anchorRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as count FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as count FROM agent_audit"),
      safeQuery("SELECT COUNT(*) as count FROM agent_entities"),
      safeQuery(`
        SELECT left(cryptographic_hash::text, 16) as anchor
        FROM agent_memory
        WHERE cryptographic_hash IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
      `),
    ]);

    return apiSuccess(
      {
        memories: parseInt(String(memRes.rows[0]?.count || "0"), 10),
        auditLogs: parseInt(String(auditRes.rows[0]?.count || "0"), 10),
        entities: parseInt(String(entityRes.rows[0]?.count || "0"), 10),
        chainAnchor: String(anchorRes.rows[0]?.anchor || ""),
        mcpTools: 35,
        resources: 3,
      },
      "short",
    );
  } catch (error) {
    console.error("[api/public-stats] Query failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
