import { safeQuery, isMockMode } from "@/lib/db";
import { getMockMemories } from "@/lib/mock-data";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const search = (searchParams.get("search") || "").slice(0, 500);
  const offset = (page - 1) * limit;

  const getPaginatedMemories = () => {
    const allMemories = getMockMemories();
    const filtered = search
      ? allMemories.filter(m =>
          m.content.toLowerCase().includes(search.toLowerCase()) ||
          m.memoryType.toLowerCase().includes(search.toLowerCase())
        )
      : allMemories;
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const memories = filtered.slice(offset, offset + limit);
    return { memories, total, page, limit, totalPages };
  };

  if (isMockMode()) {
    return apiSuccess(getPaginatedMemories(), "short", { mock: true });
  }

  try {
    const dataParams: unknown[] = [];
    const whereClause = search ? ` WHERE content ILIKE $${dataParams.length + 1}::text OR memory_type ILIKE $${dataParams.length + 1}::text` : "";
    if (search) dataParams.push(`%${search}%`);

    const countSql = `SELECT COUNT(*) as cnt FROM agent_memory${search ? " WHERE content ILIKE $1::text OR memory_type ILIKE $1::text" : ""}`;
    const countParams = search ? [`%${search}%`] : [];

    dataParams.push(limit, offset);
    const dataSql = `SELECT memory_id, agent_id, memory_type, content, metadata, previous_hash, cryptographic_hash, importance_score, trust_level, created_at, expires_at, access_count FROM agent_memory${whereClause} ORDER BY created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;

    const [countRes, dataRes] = await Promise.all([
      safeQuery(countSql, countParams),
      safeQuery(dataSql, dataParams),
    ]);

    if (countRes.mock || dataRes.mock) {
      return apiSuccess(getPaginatedMemories(), "short", { mock: true });
    }

    const total = parseInt(String(countRes.rows[0]?.cnt ?? "0"), 10);
    const totalPages = Math.ceil(total / limit);
    type MemoryRow = Record<string, unknown>;
    const memories = dataRes.rows.map((row: MemoryRow) => ({
      memoryId: row.memory_id as string,
      agentId: row.agent_id as string,
      memoryType: row.memory_type as string,
      content: row.content as string,
      metadata: (row.metadata as Record<string, unknown>) || {},
      previousHash: row.previous_hash as string,
      cryptographicHash: row.cryptographic_hash as string,
      importanceScore: (row.importance_score as number) ?? 5.0,
      trustLevel: (row.trust_level as number) ?? null,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      accessCount: (row.access_count as number) ?? 0,
    }));

    return apiSuccess({ memories, total, page, limit, totalPages }, "short");
  } catch (error) {
    console.error("[api/memories] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    const fallbackMemories = getMockMemories();
    if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {

      return apiSuccess({ memories: fallbackMemories, total: fallbackMemories.length, page: 1, limit: 20, totalPages: 1 }, "short", { mock: true });

    }

    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
