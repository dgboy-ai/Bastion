import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { getMockMemories } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const entityId = (searchParams.get("entity_id") || "").slice(0, 255);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;

    if (!entityId) {
      return apiError("Missing entity_id parameter", 400);
    }

    const countRes = await safeQuery(
      `SELECT COUNT(*) as cnt FROM (
        SELECT DISTINCT m.memory_id
        FROM agent_memory m
        JOIN agent_relations r ON r.source_memory_id = m.memory_id
        WHERE r.source_entity_id = $1 OR r.target_entity_id = $1
      ) sub`,
      [entityId]
    );

    const memoriesRes = await safeQuery(
      `SELECT DISTINCT m.memory_id, m.content, m.cryptographic_hash, m.previous_hash, m.created_at, m.importance_score
       FROM agent_memory m
       JOIN agent_relations r ON r.source_memory_id = m.memory_id
       WHERE r.source_entity_id = $1 OR r.target_entity_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [entityId, limit, offset]
    );

    if (isMockMode() || countRes.mock || memoriesRes.mock) {
      const allMemories = getMockMemories().filter((_, i) => i % 2 === 0);
      const total = allMemories.length;
      const totalPages = Math.ceil(total / limit);
      const memories = allMemories.slice(offset, offset + limit);
      return apiSuccess({ memories, total, page, limit, totalPages }, 'short', { mock: true });
    }

    const total = parseInt(countRes.rows[0]?.cnt ?? "0", 10);
    const totalPages = Math.ceil(total / limit);
    type MemoryRow = Record<string, unknown>;
    const memories = memoriesRes.rows.map((row: MemoryRow) => ({
      memoryId: row.memory_id as string,
      content: row.content as string,
      cryptographicHash: row.cryptographic_hash as string,
      previousHash: row.previous_hash as string,
      createdAt: row.created_at as string,
      importanceScore: (row.importance_score as number) ?? 5.0,
    }));

    return apiSuccess({ memories, total, page, limit, totalPages }, 'short');
  } catch (error) {
    console.error("[api/entity-memories] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    const fallbackMemories = getMockMemories().slice(0, 5);
    if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {

      return apiSuccess({ memories: fallbackMemories, total: fallbackMemories.length, page: 1, limit: 20, totalPages: 1 }, "short", { mock: true });

    }

    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}

