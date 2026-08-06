import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { embedToVectorString } from "@/lib/embeddings";

export async function POST(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const body = await request.json();
    const { query, agentId = "agent-demo", k = 5 } = body;

    if (!query) return apiError("query is required", 400);

    const startTime = Date.now();

    // Search memories using embedding column
    const result = await safeQuery(
      `SELECT memory_id, agent_id, memory_type, content::varchar(200), trust_level, created_at,
              embedding <=> $1::vector(1024) AS distance
       FROM agent_memory
       WHERE agent_id = $2
       ORDER BY embedding <=> $1::vector(1024)
       LIMIT $3`,
      [await embedToVectorString(query), agentId, Math.min(k, 20)]
    );

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_search",
      query,
      agentId,
      results: result.rows.map((r: Record<string, unknown>) => ({
        memoryId: r.memory_id,
        content: r.content,
        memoryType: r.memory_type,
        trustLevel: r.trust_level,
        similarity: r.distance ? Math.round((1 - Number(r.distance)) * 100) / 100 : null,
        createdAt: r.created_at,
      })),
      total: result.rows.length,
      latency: latency + "ms",
    }, "dynamic");
  } catch (err) {
    return apiError("memory_search failed", 500);
  }
}
