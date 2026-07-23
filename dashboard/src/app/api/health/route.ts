import { safeQuery, isMockMode } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";

const defaultHealth = {
  total_memories: 0,
  pinned_memories: 0,
  memories_last_7_days: 0,
  memories_last_30_days: 0,
  freshness_ratio: 0,
  avg_access_count: 0,
  avg_importance_score: 0,
};

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  if (isMockMode()) {
    return apiSuccess(defaultHealth, "short", { mock: true });
  }

  try {
    const res = await safeQuery(`
      SELECT
        COUNT(*) as total_memories,
        COUNT(*) FILTER (WHERE is_pinned) as pinned_memories,
        COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') as memories_last_7_days,
        COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '30 days') as memories_last_30_days,
        AVG(access_count) as avg_access_count,
        AVG(importance_score) as avg_importance_score
      FROM agent_memory
    `);

    if (res.mock) {
      return apiSuccess(defaultHealth, "short", { mock: true });
    }

    const row = res.rows[0];
    const total = Number(row.total_memories) || 0;
    const week = Number(row.memories_last_7_days) || 0;
    return apiSuccess({
      total_memories: total,
      pinned_memories: Number(row.pinned_memories) || 0,
      memories_last_7_days: week,
      memories_last_30_days: Number(row.memories_last_30_days) || 0,
      freshness_ratio: total > 0 ? Number((week / total).toFixed(4)) : 0,
      avg_access_count: Number(Number(row.avg_access_count || 0).toFixed(2)),
      avg_importance_score: Number(Number(row.avg_importance_score || 0).toFixed(2)),
    });
  } catch (error) {
    console.error("[api/health] Query failed:", error);
    if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {

      return apiSuccess(defaultHealth, "short", { mock: true });

    }

    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
