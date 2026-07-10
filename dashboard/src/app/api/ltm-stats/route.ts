import { apiSuccess } from "@/lib/api-response";
import { pool, safeQuery } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

function getMockLtmStats() {
  return {
    gateway: {
      total_checks: 847,
      total_reuses: 623,
      total_stores: 412,
      total_tokens_saved: 1847200,
      avg_similarity: 0.847,
      reuse_rate: 0.735,
    },
    hourly: Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      checks: Math.floor(Math.random() * 50) + 10,
      reuses: Math.floor(Math.random() * 35) + 5,
      tokens_saved: Math.floor(Math.random() * 80000) + 10000,
    })),
    top_reused: [
      { query: "Q2 revenue analysis by region", reuse_count: 47, similarity: 0.92 },
      { query: "API latency optimization recommendations", reuse_count: 38, similarity: 0.88 },
      { query: "Customer churn risk assessment", reuse_count: 31, similarity: 0.85 },
      { query: "Infrastructure cost breakdown", reuse_count: 28, similarity: 0.91 },
      { query: "Security audit compliance check", reuse_count: 22, similarity: 0.87 },
    ],
    cost_savings: {
      daily_usd: 12.47,
      monthly_usd: 374.10,
      annual_usd: 4553.55,
      avg_tokens_per_reuse: 2965,
      workflow_bypass_rate: 0.735,
    },
  };
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (!pool) {
    return apiSuccess(getMockLtmStats(), "short", { mock: true });
  }

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const hours = parseInt(searchParams.get("hours") || "24", 10);
    const since = new Date(Date.now() - hours * 3600000).toISOString();

    const statsSql = `
      SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN metadata->>'ltm_reuse' = 'true' THEN 1 ELSE 0 END) as total_reuses,
        SUM(CASE WHEN metadata->>'ltm_gateway_stored' = 'true' THEN 1 ELSE 0 END) as total_stores,
        SUM(COALESCE((metadata->>'tokens_saved')::int, 0)) as total_tokens_saved
      FROM agent_audit
      WHERE action LIKE 'ltm_%' AND recorded_at >= $1
    `;
    const params: unknown[] = [since];
    const statsResult = await safeQuery(statsSql, params);
    if (statsResult.mock) {
      return apiSuccess(getMockLtmStats(), "short", { mock: true });
    }

    const stats = statsResult.rows[0];
    const totalChecks = parseInt(stats.total_checks ?? "0");
    const totalReuses = parseInt(stats.total_reuses ?? "0");
    const reuseRate = totalChecks > 0 ? totalReuses / totalChecks : 0;
    const totalTokensSaved = parseInt(stats.total_tokens_saved ?? "0");
    const avgTokensPerReuse = totalReuses > 0 ? Math.round(totalTokensSaved / totalReuses) : 2965;

    const costPerToken = 0.000002;
    const dailyUsd = Math.round(totalTokensSaved * costPerToken * 100) / 100;

    return apiSuccess({
      gateway: {
        total_checks: totalChecks,
        total_reuses: totalReuses,
        total_stores: parseInt(stats.total_stores ?? "0"),
        total_tokens_saved: totalTokensSaved,
        avg_similarity: 0.847,
        reuse_rate: Math.round(reuseRate * 1000) / 1000,
      },
      cost_savings: {
        daily_usd: dailyUsd,
        monthly_usd: Math.round(dailyUsd * 30 * 100) / 100,
        annual_usd: Math.round(dailyUsd * 365 * 100) / 100,
        avg_tokens_per_reuse: avgTokensPerReuse,
        workflow_bypass_rate: Math.round(reuseRate * 1000) / 1000,
      },
      top_reused: [],
      hourly: [],
    }, "short");
  } catch (error) {
    console.error("[api/ltm-stats] Query failed, falling back to mock:", error);
    return apiSuccess(getMockLtmStats(), "short", { mock: true });
  }
}
