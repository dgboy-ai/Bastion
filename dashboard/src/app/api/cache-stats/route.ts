import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";

export async function GET(request: Request) {
  // If no database connection, return mock data
  if (!pool) {
    return NextResponse.json({
      summary: { total_queries: 0, cache_hits: 0, cache_misses: 0, hit_rate_percent: 0, total_tokens_saved: 0, total_cost_saved_usd: 0, avg_latency_ms: 0, avg_hit_latency_ms: 0, avg_miss_latency_ms: 0 },
      projections: { daily: 0, monthly: 0, annual: 0 },
      competitor_comparison: { bastion_monthly: 0, mem0_monthly: 249, zep_monthly: 125, letta_monthly: 99, annual_savings_vs_mem0: 2988, annual_savings_vs_zep: 1500 },
      hourly_breakdown: [],
      period_hours: 24,
      mock: true,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const hours = parseInt(searchParams.get("hours") || "24", 10);

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

    const statsResult = await query(statsSql, params);
    const stats = statsResult.rows[0];

    const totalQueries = parseInt(stats.total_queries ?? "0");
    const cacheHits = parseInt(stats.cache_hits ?? "0");
    const hitRate = totalQueries > 0 ? Math.round((cacheHits / totalQueries) * 100) : 0;

    const hourlySql = `
      SELECT 
        EXTRACT(HOUR FROM timestamp) as hour,
        SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as hits,
        SUM(CASE WHEN NOT cache_hit THEN 1 ELSE 0 END) as misses,
        SUM(cost_saved_usd) as cost_saved
      FROM cache_stats
      WHERE timestamp >= $1
      ${agentId ? `AND agent_id = $2` : ""}
      GROUP BY EXTRACT(HOUR FROM timestamp)
      ORDER BY hour
    `;
    const hourlyResult = await query(hourlySql, params);

    const dailyCost = parseFloat(stats.total_cost_saved ?? "0");
    const monthlyProjection = dailyCost * 30;
    const annualProjection = dailyCost * 365;

    const competitorCosts = {
      bastion: 0,
      mem0: 249,
      zep: 125,
      letta: 99,
    };

    return NextResponse.json({
      summary: {
        total_queries: totalQueries,
        cache_hits: cacheHits,
        cache_misses: parseInt(stats.cache_misses ?? "0"),
        hit_rate_percent: hitRate,
        total_tokens_saved: parseInt(stats.total_tokens_saved ?? "0"),
        total_cost_saved_usd: Math.round(dailyCost * 100) / 100,
        avg_latency_ms: Math.round(parseFloat(stats.avg_latency_ms ?? "0")),
        avg_hit_latency_ms: Math.round(parseFloat(stats.avg_hit_latency_ms ?? "0")),
        avg_miss_latency_ms: Math.round(parseFloat(stats.avg_miss_latency_ms ?? "0")),
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
      hourly_breakdown: hourlyResult.rows.map((row: Record<string, unknown>) => ({
        hour: parseInt(row.hour as string),
        hits: parseInt(row.hits as string ?? "0"),
        misses: parseInt(row.misses as string ?? "0"),
        cost_saved: parseFloat(row.cost_saved as string ?? "0"),
      })),
      period_hours: hours,
    });
  } catch (error: unknown) {
    console.error("Cache stats failed:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
