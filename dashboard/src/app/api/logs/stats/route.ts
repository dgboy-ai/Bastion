import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    const res = await safeQuery(
      "SELECT COUNT(*)::int as total, COUNT(CASE WHEN memory_type = 'poison_attempt' THEN 1 END) as poisoned, COUNT(CASE WHEN memory_type = 'healed' THEN 1 END) as healed FROM agent_memory"
    );
    const row = res.rows[0] || {};
    return apiSuccess({
      totalCount: (row.total as number) ?? 0,
      poisonedCount: (row.poisoned as number) ?? 0,
      healedCount: (row.healed as number) ?? 0,
    }, "short");
  } catch (err) {
    console.error("[api/logs/stats] failed:", err);
    return apiError("Failed to fetch stats", 500, "DB_ERROR");
  }
}
