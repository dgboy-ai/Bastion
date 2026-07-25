import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, agentId = "agent-demo", k = 5 } = body;

    if (!query) return apiError("query is required", 400);

    const startTime = Date.now();

    // Search memories using embedding_384 column
    const result = await safeQuery(
      `SELECT memory_id, agent_id, memory_type, content::varchar(200), trust_level, created_at,
              embedding_384 <=> $1::vector AS distance
       FROM agent_memory
       WHERE agent_id = $2
       ORDER BY embedding_384 <=> $1::vector
       LIMIT $3`,
      [await getEmbedding(query), agentId, Math.min(k, 20)]
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
      sql: `SELECT memory_id, content, embedding_384 <=> $1::vector AS distance FROM agent_memory WHERE agent_id = $2 ORDER BY embedding_384 <=> $1::vector LIMIT $3`,
    }, "dynamic");
  } catch (err) {
    return apiError("memory_search failed: " + (err instanceof Error ? err.message : "Unknown"), 500);
  }
}

async function getEmbedding(text: string): Promise<string> {
  // Use sentence-transformers compatible embedding via API or fallback to mock
  try {
    const res = await fetch(process.env.EMBEDDING_URL || "http://localhost:8080/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return `[${data.embedding.join(",")}]`;
  } catch {
    // Fallback: generate a deterministic mock embedding
    const hash = Array.from(text).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
    const mock = Array.from({ length: 384 }, (_, i) => Math.sin(hash + i) * 0.1);
    return `[${mock.join(",")}]`;
  }
}
