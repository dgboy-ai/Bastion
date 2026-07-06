import { NextResponse } from "next/server";
import { pool, query } from "@/lib/db";

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
  // If no database connection, return mock data
  if (!pool) {
    return NextResponse.json({
      latest: null,
      timeSeries: [],
      mock: true,
    });
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

    const res = await query(sql, params);

    const scores: DriftRow[] = res.rows.map((row: Record<string, unknown>) => ({
      score_id: String(row.score_id),
      overall_drift_score: Number(row.overall_drift_score),
      dimensions: typeof row.dimensions === "string"
        ? JSON.parse(row.dimensions as string)
        : (row.dimensions as Record<string, number>),
      baseline_sessions: Number(row.baseline_sessions),
      alert_threshold: Number(row.alert_threshold),
      status: String(row.status),
      top_drift_signals: typeof row.top_drift_signals === "string"
        ? JSON.parse(row.top_drift_signals as string)
        : (row.top_drift_signals as string[]),
      recommendation: String(row.recommendation),
      scorable_at: String(row.scorable_at),
    }));

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

    return NextResponse.json({
      latest,
      timeSeries,
      dimensionAverages,
      totalScores: scores.length,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch drift data:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
