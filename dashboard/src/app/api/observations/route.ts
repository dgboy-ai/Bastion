import { apiSuccess } from "@/lib/api-response";
import { pool, safeQuery } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

function getMockObservations() {
  return {
    total_memories_scanned: 3705,
    observations: [
      {
        observation_id: "obs-001",
        pattern_type: "recurring_theme",
        description: "Recurring theme: \"CockroachDB vector\" appears in 47 memories",
        confidence: 0.89,
        frequency: 47,
        supporting_memories: ["mem-001", "mem-015", "mem-032"],
        metadata: { theme: "cockroachdb vector" },
      },
      {
        observation_id: "obs-002",
        pattern_type: "co_occurrence",
        description: "\"Bedrock\" and \"embeddings\" co-occur in 38 memories",
        confidence: 0.82,
        frequency: 38,
        supporting_memories: ["mem-005", "mem-012"],
        metadata: { entity_a: "Bedrock", entity_b: "embeddings" },
      },
      {
        observation_id: "obs-003",
        pattern_type: "temporal_trend",
        description: "Emerging trend: \"MCP server\" increased from 3 to 22 occurrences in last 24h",
        confidence: 0.78,
        frequency: 22,
        metadata: { theme: "mcp server", recent_count: 22, old_count: 3 },
      },
      {
        observation_id: "obs-004",
        pattern_type: "entity_cluster",
        description: "Entity \"CockroachDB\" appears across 89 memories",
        confidence: 0.92,
        frequency: 89,
        metadata: { entity: "CockroachDB" },
      },
    ],
    detected_at: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (!pool) {
    return apiSuccess(getMockObservations(), "short", { mock: true });
  }

  try {
    const memoriesSql = "SELECT memory_id, content, memory_type, created_at FROM agent_memory ORDER BY created_at DESC LIMIT 500";
    const memoriesResult = await safeQuery(memoriesSql);
    if (memoriesResult.mock) {
      return apiSuccess(getMockObservations(), "short", { mock: true });
    }

    const memories = memoriesResult.rows;
    const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "and", "but", "or", "if", "that", "this", "it", "its"]);

    // Bigram frequency
    const bigramCounts: Record<string, { count: number; ids: string[] }> = {};
    const entityCounts: Record<string, { count: number; ids: string[] }> = {};

    for (const mem of memories) {
      const words = (mem.content || "").toLowerCase().split(/\W+/).filter((w: string) => w.length > 2 && !stopWords.has(w));
      // Bigrams
      for (let i = 0; i < words.length - 1; i++) {
        const bg = `${words[i]} ${words[i + 1]}`;
        if (!bigramCounts[bg]) bigramCounts[bg] = { count: 0, ids: [] };
        bigramCounts[bg].count++;
        if (bigramCounts[bg].ids.length < 5) bigramCounts[bg].ids.push(mem.memory_id);
      }
      // Entities (capitalized words)
      const entities = (mem.content || "").match(/\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g) || [];
      for (const e of entities) {
        if (!entityCounts[e]) entityCounts[e] = { count: 0, ids: [] };
        entityCounts[e].count++;
        if (entityCounts[e].ids.length < 5) entityCounts[e].ids.push(mem.memory_id);
      }
    }

    const observations = [];
    // Top recurring themes
    const topThemes = Object.entries(bigramCounts)
      .filter(([_, v]) => v.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    for (const [theme, data] of topThemes) {
      observations.push({
        observation_id: `theme-${Buffer.from(theme).toString("base64").slice(0, 8)}`,
        pattern_type: "recurring_theme",
        description: `Recurring theme: "${theme}" appears in ${data.count} memories`,
        confidence: Math.min(0.95, 0.5 + data.count * 0.03),
        frequency: data.count,
        supporting_memories: data.ids,
        metadata: { theme },
      });
    }

    // Top entities
    const topEntities = Object.entries(entityCounts)
      .filter(([_, v]) => v.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);
    for (const [entity, data] of topEntities) {
      observations.push({
        observation_id: `entity-${Buffer.from(entity).toString("base64").slice(0, 8)}`,
        pattern_type: "entity_cluster",
        description: `Entity "${entity}" appears across ${data.count} memories`,
        confidence: Math.min(0.92, 0.5 + data.count * 0.02),
        frequency: data.count,
        supporting_memories: data.ids,
        metadata: { entity },
      });
    }

    return apiSuccess({
      total_memories_scanned: memories.length,
      observations: observations.slice(0, 10),
      detected_at: new Date().toISOString(),
    }, "short");
  } catch (error) {
    console.error("[api/observations] Query failed, falling back to mock:", error);
    return apiSuccess(getMockObservations(), "short", { mock: true });
  }
}
