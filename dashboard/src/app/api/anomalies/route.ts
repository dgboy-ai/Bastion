import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { getMockAnomalies } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return apiSuccess(getMockAnomalies(), 'short', { mock: true });
  }

  try {
    const alerts: Record<string, unknown>[] = [];
    
    const countRes = await safeQuery("SELECT COUNT(*) as count FROM agent_memory");
    if (countRes.mock) {
      return apiSuccess(getMockAnomalies(), 'short', { mock: true });
    }
    const total = parseInt((countRes.rows[0]?.count as string) || "0", 10);
    
    if (total > 100) {
      alerts.push({
        id: "alert-size-spike",
        type: "size_spike",
        severity: "info",
        detail: `Cognitive load warning: Total memory count (${total}) exceeds 100 records. Recommend pruning or merging.`,
        timestamp: new Date().toISOString(),
      });
    }

    const recentRes = await safeQuery(
      "SELECT content, created_at FROM agent_memory ORDER BY created_at DESC LIMIT 50"
    );
    if (!recentRes.mock) {
      const contents = recentRes.rows.map((r: Record<string, unknown>) => r.content as string);
      const uniqueContents = new Set(contents);
      if (contents.length !== uniqueContents.size) {
        alerts.push({
          id: "alert-fact-turnover",
          type: "fact_turnover",
          severity: "medium",
          detail: "Memory turnover alert: Duplicate content detected in recent operations, indicating redundant reinforcement loops.",
          timestamp: new Date().toISOString(),
        });
      }
    }

    return apiSuccess({ alerts }, 'short');
  } catch (error) {
    console.error("[api/anomalies] Query failed:", error);
    return apiSuccess({}, "short", { mock: true, fallback: true });
  }
}

