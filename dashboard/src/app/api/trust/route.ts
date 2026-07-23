import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { getMockTrust } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

function computeTrustScore(row: Record<string, unknown>) {
  const trustLevel = (row.trust_level ?? 2) as number;
  const sourceProv = (row.source_provenance ?? "agent_direct") as string;
  const overwriteCount = (row.overwrite_count ?? 0) as number;
  const createdAt = row.created_at ? new Date(row.created_at as string) : null;

  const sourceMap: Record<string, number> = { external_web: 0.3, tool_unverified: 0.5, tool_verified: 0.7, agent_direct: 0.9, system: 1.0 };
  const levelMap: Record<number, number> = { 0: 0.0, 1: 0.4, 2: 0.7, 3: 0.9, 4: 1.0 };

  let score = 1.0;
  score *= sourceMap[sourceProv] ?? 0.5;
  score *= levelMap[trustLevel] ?? 0.5;

  const flags: string[] = [];
  if (overwriteCount > 3) flags.push("RAPID_OVERWRITE");
  if (overwriteCount > 5) score *= 0.5;
  else if (overwriteCount > 3) score *= 0.8;

  let agePenalty = 0;
  if (createdAt) {
    const ageHours = (Date.now() - createdAt.getTime()) / 3600000;
    if (ageHours > 2160) { agePenalty = 0.5; score *= 0.5; }
    else if (ageHours > 720) { agePenalty = 0.3; score *= 0.7; }
  }

  let poisoningRisk = "NONE";
  if (score >= 0.8) poisoningRisk = "NONE";
  else if (score >= 0.5) poisoningRisk = "LOW";
  else if (score >= 0.2) poisoningRisk = "MEDIUM";
  else poisoningRisk = "HIGH";

  if (flags.includes("RAPID_OVERWRITE") && score < 0.5) poisoningRisk = "HIGH";

  return {
    trustScore: Math.round(score * 10000) / 10000,
    trustLevel,
    sourceProvenance: sourceProv,
    overwriteCount,
    poisoningRisk,
    conflictRate: Math.min(overwriteCount / 10.0, 1.0),
    agePenalty,
    flags,
  };
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return apiSuccess(getMockTrust(), 'short', { mock: true });
  }

  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entity_id");
    const limit = Math.max(1, Math.min(500, parseInt(searchParams.get("limit") || "100", 10) || 100));

    let sql = `
      SELECT m.memory_id, m.agent_id, m.memory_type, m.content,
             COALESCE(m.trust_level, 2) AS trust_level,
             COALESCE(m.source_provenance, 'agent_direct') AS source_provenance,
             COALESCE(m.overwrite_count, 0) AS overwrite_count,
             m.created_at, m.cryptographic_hash, m.previous_hash,
             m.importance_score
      FROM agent_memory m
    `;
    const params: unknown[] = [];

    if (entityId) {
      sql += ` JOIN agent_relations r ON r.source_memory_id = m.memory_id
               WHERE (r.source_entity_id = $1 OR r.target_entity_id = $1)`;
      params.push(entityId);
    }

    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await safeQuery(sql, params);
    if (res.mock) {
      return apiSuccess(getMockTrust(), 'short', { mock: true });
    }

    const trustLevelCounts: Record<number, number> = {};
    const poisoningCounts: Record<string, number> = {};
    let avgTrustScore = 0;
    let processed = 0;
    const memories: unknown[] = [];

    for (const row of res.rows) {
      const trust = computeTrustScore(row);
      trustLevelCounts[trust.trustLevel] = (trustLevelCounts[trust.trustLevel] ?? 0) + 1;
      poisoningCounts[trust.poisoningRisk] = (poisoningCounts[trust.poisoningRisk] ?? 0) + 1;
      avgTrustScore += trust.trustScore;
      processed++;
      memories.push({ memoryId: row.memory_id, content: (row.content ?? "").toString().slice(0, 120), ...trust });
    }

    if (processed > 0) avgTrustScore /= processed;

    const alerts: { severity: string; risk: string; count: number }[] = [];
    for (const risk of ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const) {
      const count = poisoningCounts[risk] ?? 0;
      if (count > 0) {
        alerts.push({ severity: risk === "CRITICAL" || risk === "HIGH" ? "high" : risk === "MEDIUM" ? "medium" : "low", risk, count });
      }
    }

    return apiSuccess({
      summary: {
        totalMemories: processed,
        avgTrustScore: Math.round(avgTrustScore * 10000) / 10000,
        trustLevelDistribution: trustLevelCounts,
        poisoningDistribution: poisoningCounts,
        dangerousMemories: (poisoningCounts["HIGH"] ?? 0) + (poisoningCounts["CRITICAL"] ?? 0),
      },
      alerts,
      memories,
    }, 'short');
  } catch (error) {
    console.error("[api/trust] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {

      return apiSuccess(getMockTrust(), "short", { mock: true });

    }

    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}

