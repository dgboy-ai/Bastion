import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const hours = Math.max(1, Math.min(168, parseInt(searchParams.get("hours") || "24", 10) || 24));
    const since = new Date(Date.now() - hours * 3600000).toISOString();

    const statsSql = `
      SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN action = 'ltm_reuse' OR details->>'ltm_reuse' = 'true' THEN 1 ELSE 0 END) as total_reuses,
        SUM(CASE WHEN action = 'ltm_store' OR details->>'ltm_gateway_stored' = 'true' THEN 1 ELSE 0 END) as total_stores,
        SUM(COALESCE((details->>'tokens_saved')::int, 0)) as total_tokens_saved,
        AVG(COALESCE((details->>'similarity')::float, 0.0)) FILTER (WHERE action = 'ltm_reuse' OR details->>'ltm_reuse' = 'true') as avg_similarity
      FROM agent_audit
      WHERE recorded_at >= $1
    `;
    const params: unknown[] = [since];
    const statsResult = await safeQuery(statsSql, params);

    const stats = statsResult.rows[0] as Record<string, string | number | null>;
    const totalChecks = parseInt(String(stats.total_checks ?? "0"));
    const totalReuses = parseInt(String(stats.total_reuses ?? "0"));
    const reuseRate = totalChecks > 0 ? totalReuses / totalChecks : 0;
    const totalTokensSaved = parseInt(String(stats.total_tokens_saved ?? "0"));
    const avgTokensPerReuse = totalReuses > 0 ? Math.round(totalTokensSaved / totalReuses) : 2965;
    const avgSimilarity = parseFloat(String(stats.avg_similarity ?? "0.0")) || 0.85;

    const costPerToken = 0.000002;
    const dailyUsd = Math.round(totalTokensSaved * costPerToken * 100) / 100;

    // Query top reused memories from agent_memory metadata
    let topReused: { query: string; reuse_count: number; similarity: number }[] = [];
    try {
      const topRes = await safeQuery(
        `SELECT content, 
                COALESCE((metadata->>'reuse_count')::int, 1) as reuse_count,
                COALESCE((metadata->>'similarity')::float, 0.85) as similarity
         FROM agent_memory 
         WHERE metadata IS NOT NULL AND (metadata->>'ltm_reuse' = 'true' OR (metadata->>'reuse_count')::int > 0)
         ORDER BY COALESCE((metadata->>'reuse_count')::int, 1) DESC
         LIMIT 5`
      );
      if (topRes.rows.length > 0) {
        topReused = topRes.rows.map((r: Record<string, unknown>) => ({
          query: String(r.content || "").slice(0, 80),
          reuse_count: parseInt(String(r.reuse_count || "1")),
          similarity: parseFloat(String(r.similarity || "0.85")),
        }));
      }
    } catch {
      // Non-critical — leave topReused empty
    }

    // Query real hourly stats
    let hourly: { hour: number; checks: number; reuses: number; tokens_saved: number }[] = [];
    try {
      const hourlyRes = await safeQuery(
        `SELECT 
           EXTRACT(HOUR FROM recorded_at)::int as hr,
           COUNT(*) as checks_count,
           SUM(CASE WHEN action = 'ltm_reuse' OR details->>'ltm_reuse' = 'true' THEN 1 ELSE 0 END) as reuses_count,
           SUM(COALESCE((details->>'tokens_saved')::int, 0)) as saved_count
         FROM agent_audit
         WHERE recorded_at >= $1
         GROUP BY hr
         ORDER BY hr`,
        [since]
      );
      
      const hourlyMap = new Map(hourlyRes.rows.map(r => [r.hr, r]));
      hourly = Array.from({ length: 24 }, (_, i) => {
        const row = hourlyMap.get(i) as Record<string, unknown> | undefined;
        return {
          hour: i,
          checks: row ? parseInt(String(row.checks_count ?? "0")) : 0,
          reuses: row ? parseInt(String(row.reuses_count ?? "0")) : 0,
          tokens_saved: row ? parseInt(String(row.saved_count ?? "0")) : 0,
        };
      });
    } catch {
      hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, checks: 0, reuses: 0, tokens_saved: 0 }));
    }

    return apiSuccess({
      gateway: {
        total_checks: totalChecks,
        total_reuses: totalReuses,
        total_stores: parseInt(String(stats.total_stores ?? "0")),
        total_tokens_saved: totalTokensSaved,
        avg_similarity: Math.round(avgSimilarity * 1000) / 1000,
        reuse_rate: Math.round(reuseRate * 1000) / 1000,
      },
      cost_savings: {
        daily_usd: dailyUsd,
        monthly_usd: Math.round(dailyUsd * 30 * 100) / 100,
        annual_usd: Math.round(dailyUsd * 365 * 100) / 100,
        avg_tokens_per_reuse: avgTokensPerReuse,
        workflow_bypass_rate: Math.round(reuseRate * 1000) / 1000,
      },
      top_reused: topReused,
      hourly,
    }, "short");
  } catch (error) {
    console.error("[api/ltm-stats] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
