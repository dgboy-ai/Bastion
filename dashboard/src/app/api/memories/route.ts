import { NextResponse } from "next/server";
import { pool, safeQuery } from "@/lib/db";
import { getMockMemories } from "@/lib/mock-data";
import { apiSuccess } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const search = searchParams.get("search") || "";
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

  if (!pool) {
    return apiSuccess(getPaginatedMemories(), "short", { mock: true });
  }

  try {
    let countSql = "SELECT COUNT(*) as cnt FROM agent_memory";
    let dataSql = `
      SELECT memory_id, agent_id, memory_type, content, metadata, previous_hash, cryptographic_hash, importance_score, created_at, expires_at, access_count
      FROM agent_memory
    `;
    const params: unknown[] = [];
    const whereParams: unknown[] = [];

    if (search) {
      const whereClause = " WHERE content ILIKE $1 OR memory_type ILIKE $1";
      countSql += whereClause;
      dataSql += whereClause;
      params.push(`%${search}%`);
      whereParams.push(`%${search}%`);
    }

    dataSql += " ORDER BY created_at DESC LIMIT $2 OFFSET $3";
    params.push(limit, offset);

    const [countRes, dataRes] = await Promise.all([
      safeQuery(countSql, whereParams.length > 0 ? [`%${search}%`] : undefined),
      safeQuery(dataSql, params),
    ]);

    if (countRes.mock || dataRes.mock) {
      return apiSuccess(getPaginatedMemories(), "short", { mock: true });
    }

    const total = parseInt(countRes.rows[0]?.cnt ?? "0", 10);
    const totalPages = Math.ceil(total / limit);
    const memories = dataRes.rows.map((row: any) => ({
      memoryId: row.memory_id,
      agentId: row.agent_id,
      memoryType: row.memory_type,
      content: row.content,
      metadata: row.metadata || {},
      previousHash: row.previous_hash,
      cryptographicHash: row.cryptographic_hash,
      importanceScore: row.importance_score ?? 5.0,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      accessCount: row.access_count ?? 0,
    }));

    return apiSuccess({ memories, total, page, limit, totalPages }, "short");
  } catch {
    return apiSuccess(getPaginatedMemories(), "short", { mock: true });
  }
}
