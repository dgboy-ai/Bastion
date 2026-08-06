import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { getMockCacheStats } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
    if (isMockMode()) {
      return apiSuccess(getMockCacheStats(), 'short', { mock: true });
    }
  }

  try {
    const { searchParams } = new URL(request.url);
    const agentId = (searchParams.get("agent_id") || "").slice(0, 255);
    const hours = Math.max(1, Math.min(168, parseInt(searchParams.get("hours") || "24", 10) || 24));

    const since = new Date(Date.now() - hours * 3600000).toISOString();

    let statsSql = `
      SELECT 
        COUNT(*) as total_queries,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
        SUM(CASE WHEN NOT cache_hit THEN 1 ELSE 0 END) as cache_misses,
        SUM(tokens_saved) as total_tokens_saved,
        SUM(cost_saved_usd) as total_cost_saved,
        AVG(response_latency_ms) as avg_latency_ms,
        AVG(CASE WHEN cache_hit THEN response_latency_ms END) as avg_hit_latency_ms,
        AVG(CASE WHEN NOT cache_hit THEN response_latency_ms END) as avg_miss_latency_ms
      FROM cache_stats
      WHERE timestamp >= $1
    `;
    const params: unknown[] = [since];

    if (agentId) {
      statsSql += ` AND agent_id = $${params.length + 1}`;
      params.push(agentId);
    }

    const statsResult = await safeQuery(statsSql, params);
    if (statsResult.mock) {
      return apiSuccess(getMockCacheStats(), 'short', { mock: true });
    }
    const stats = statsResult.rows[0] as Record<string, string | number | null>;

    const totalQueries = parseInt((stats.total_queries ?? "0") as string);
    const cacheHits = parseInt((stats.cache_hits ?? "0") as string);
    const hitRate = totalQueries > 0 ? Math.round((cacheHits / totalQueries) * 100) : 0;

    let hourlySql = `
      SELECT 
        EXTRACT(HOUR FROM timestamp) as hour,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as hits,
        SUM(CASE WHEN NOT cache_hit THEN 1 ELSE 0 END) as misses,
        SUM(cost_saved_usd) as cost_saved
      FROM cache_stats
      WHERE timestamp >= $1
    `;
    const hourlyParams: unknown[] = [since];
    if (agentId) {
      hourlySql += ` AND agent_id = $${hourlyParams.length + 1}`;
      hourlyParams.push(agentId);
    }
    hourlySql += `
      GROUP BY EXTRACT(HOUR FROM timestamp)
      ORDER BY hour
    `;
    const hourlyResult = await safeQuery(hourlySql, hourlyParams);

    const dailyCost = parseFloat(String(stats.total_cost_saved ?? "0"));
    const monthlyProjection = dailyCost * 30;
    const annualProjection = dailyCost * 365;

    const competitorCosts = {
      bastion: 0,
      mem0: 249,
      zep: 125,
      letta: 99,
    };

    return apiSuccess({
      summary: {
        total_queries: totalQueries,
        cache_hits: cacheHits,
        cache_misses: parseInt(String(stats.cache_misses ?? "0")),
        hit_rate_percent: hitRate,
        total_tokens_saved: parseInt(String(stats.total_tokens_saved ?? "0")),
        total_cost_saved_usd: Math.round(dailyCost * 100) / 100,
        avg_latency_ms: Math.round(parseFloat(String(stats.avg_latency_ms ?? "0"))),
        avg_hit_latency_ms: Math.round(parseFloat(String(stats.avg_hit_latency_ms ?? "0"))),
        avg_miss_latency_ms: Math.round(parseFloat(String(stats.avg_miss_latency_ms ?? "0"))),
      },
      projections: {
        daily: Math.round(dailyCost * 100) / 100,
        monthly: Math.round(monthlyProjection * 100) / 100,
        annual: Math.round(annualProjection * 100) / 100,
      },
      competitor_comparison: {
        bastion_monthly: 0,
        mem0_monthly: competitorCosts.mem0,
        zep_monthly: competitorCosts.zep,
        letta_monthly: competitorCosts.letta,
        annual_savings_vs_mem0: (competitorCosts.mem0 * 12),
        annual_savings_vs_zep: (competitorCosts.zep * 12),
      },
      hourly_breakdown: hourlyResult.rows?.map((row: Record<string, unknown>) => ({
        hour: parseInt(row.hour as string),
        hits: parseInt(row.hits as string ?? "0"),
        misses: parseInt(row.misses as string ?? "0"),
        cost_saved: parseFloat(row.cost_saved as string ?? "0"),
      })) ?? [],
      period_hours: hours,
    }, 'short');
  } catch (error) {
    console.error("[api/cache-stats] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {

      return apiSuccess(getMockCacheStats(), "short", { mock: true });

    }

    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
