import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

interface DriftRow {
  overall_drift_score: number;
  status: string;
  dimensions: string | Record<string, number>;
  top_drift_signals: string | string[];
  recommendation: string;
  scorable_at: string;
}

export async function GET(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const entity_id = (searchParams.get("entity_id") || "").slice(0, 255);

    let sql = `
      SELECT 
        overall_drift_score,
        status,
        dimensions,
        top_drift_signals,
        recommendation,
        scorable_at
      FROM agent_drift_scores
    `;
    const params: unknown[] = [];

    if (entity_id) {
      sql += ` WHERE entity_id = $1`;
      params.push(entity_id);
    }

    sql += ` ORDER BY scorable_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await safeQuery(sql, params);

    // Return real empty state when table has no data
    if (res.rows.length === 0) {
      return apiSuccess({
        latest: { overall_drift_score: 0, status: "HEALTHY", top_drift_signals: [], recommendation: "No drift data collected yet", dimensions: {} },
        timeSeries: [],
        dimensionAverages: {},
        totalScores: 0,
      }, 'short');
    }

    const scoreRows = res.rows as Record<string, unknown>[];
    const scores: DriftRow[] = [];
    for (const row of scoreRows) {
      let dimensions: Record<string, number> = {};
      if (typeof row.dimensions === "string") {
        try { dimensions = JSON.parse(row.dimensions); }
        catch { dimensions = {}; }
      } else if (row.dimensions && typeof row.dimensions === "object") {
        dimensions = row.dimensions as Record<string, number>;
      }

      let top_drift_signals: string[] = [];
      if (typeof row.top_drift_signals === "string") {
        try { top_drift_signals = JSON.parse(row.top_drift_signals); }
        catch { top_drift_signals = []; }
      } else if (Array.isArray(row.top_drift_signals)) {
        top_drift_signals = row.top_drift_signals as string[];
      }

      const overall = Number(row.overall_drift_score);
      let status = String(row.status || "HEALTHY");
      if (status === "HEALTHY" && overall > 0.3) status = "DRIFTING";
      if (status === "HEALTHY" && overall > 0.6) status = "CRITICAL";

      scores.push({
        overall_drift_score: overall,
        status,
        dimensions,
        top_drift_signals,
        recommendation: String(row.recommendation || ""),
        scorable_at: String(row.scorable_at),
      });
    }

    const latest = scores[0];
    const timeSeries = scores.map(s => ({
      score: s.overall_drift_score,
      timestamp: s.scorable_at,
      status: s.status,
    }));

    // Compute dimension averages
    const dimensionAverages: Record<string, number> = {};
    const dimCounts: Record<string, number> = {};
    for (const s of scores) {
      for (const [dim, val] of Object.entries(s.dimensions)) {
        dimensionAverages[dim] = (dimensionAverages[dim] || 0) + val;
        dimCounts[dim] = (dimCounts[dim] || 0) + 1;
      }
    }
    for (const dim of Object.keys(dimensionAverages)) {
      dimensionAverages[dim] = Math.round((dimensionAverages[dim] / dimCounts[dim]) * 1000) / 1000;
    }

    return apiSuccess({
      latest,
      timeSeries,
      dimensionAverages,
      totalScores: scores.length,
    }, 'short');
  } catch (error) {
    console.error("[api/drift] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
