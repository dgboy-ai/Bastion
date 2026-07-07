import { apiSuccess } from "@/lib/api-response";
import { pool, safeQuery } from "@/lib/db";
import { getMockDrift } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

const DRIFT_DIMENSIONS = [
  "memory_access_pattern",
  "semantic_similarity",
  "conflict_resolution_rate",
  "hash_chain_gap_ratio",
  "retrieval_to_store_ratio",
  "namespace_isolation",
];

interface DriftRow {
  score_id: string;
  overall_drift_score: number;
  dimensions: Record<string, number>;
  baseline_sessions: number;
  alert_threshold: number;
  status: string;
  top_drift_signals: string[];
  recommendation: string;
  scorable_at: string;
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (!pool) {
    return apiSuccess(getMockDrift(), 'short', { mock: true });
  }

  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    let sql = `
      SELECT score_id, overall_drift_score, dimensions, baseline_sessions,
             alert_threshold, status, top_drift_signals, recommendation,
             scorable_at
      FROM agent_drift_scores
    `;
    const params: unknown[] = [];

    if (agentId) {
      sql += ` WHERE agent_id = $1`;
      params.push(agentId);
    }

    sql += ` ORDER BY scorable_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await safeQuery(sql, params);
    if (res.mock || res.rows.length === 0) {
      return apiSuccess(getMockDrift(), 'short', { mock: true });
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
      const alertThresh = Number(row.alert_threshold);

      scores.push({
        score_id: String(row.score_id ?? ""),
        overall_drift_score: Number.isFinite(overall) ? overall : 0,
        dimensions,
        baseline_sessions: Math.max(0, Number(row.baseline_sessions) || 0),
        alert_threshold: Number.isFinite(alertThresh) ? alertThresh : 0,
        status: String(row.status ?? "unknown"),
        top_drift_signals,
        recommendation: String(row.recommendation ?? ""),
        scorable_at: String(row.scorable_at ?? ""),
      });
    }

    const latest = scores[0] ?? null;

    const timeSeries = scores
      .slice()
      .reverse()
      .map((s) => ({
        score: s.overall_drift_score,
        timestamp: s.scorable_at,
        status: s.status,
      }));

    const dimensionAverages: Record<string, number> = {};
    for (const dim of DRIFT_DIMENSIONS) {
      const vals = scores
        .map((s) => s.dimensions[dim])
        .filter((v): v is number => v !== undefined);
      dimensionAverages[dim] = vals.length > 0
        ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000
        : 0;
    }

    return apiSuccess({
      latest,
      timeSeries,
      dimensionAverages,
      totalScores: scores.length,
    }, 'short');
  } catch {
    return apiSuccess(getMockDrift(), 'short', { mock: true });
  }
}
