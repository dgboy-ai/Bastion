import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET() {
  try {
    const res = await safeQuery(
      "SELECT COUNT(*)::int as total, COUNT(CASE WHEN memory_type = 'poison_attempt' THEN 1 END) as poisoned, COUNT(CASE WHEN memory_type = 'healed' THEN 1 END) as healed FROM agent_memory"
    );
    const row = res.rows[0] || {};
    return apiSuccess({
      totalCount: (row.total as number) ?? 0,
      poisonedCount: (row.poisoned as number) ?? 0,
      healedCount: (row.healed as number) ?? 0,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : "Failed to fetch stats", 500);
  }
}
