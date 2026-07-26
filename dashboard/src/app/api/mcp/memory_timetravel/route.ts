import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { agentId = "agent-demo", interval = "-5s" } = body;

    const startTime = Date.now();

    // Query using AS OF SYSTEM TIME
    const result = await safeQuery(
      `SELECT memory_id, memory_type, content::varchar(500), trust_level, created_at, cryptographic_hash
       FROM agent_memory AS OF SYSTEM TIME $1
       WHERE agent_id = $2
       ORDER BY created_at DESC
       LIMIT 10`,
      [interval, agentId]
    );

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_timetravel",
      agentId,
      interval,
      mechanism: "AS OF SYSTEM TIME (MVCC)",
      results: result.rows.map((r: Record<string, unknown>) => ({
        memoryId: r.memory_id,
        memoryType: r.memory_type,
        content: r.content,
        trustLevel: r.trust_level,
        createdAt: r.created_at,
        hash: r.cryptographic_hash ? String(r.cryptographic_hash).slice(0, 20) + "..." : null,
      })),
      total: result.rows.length,
      latency: latency + "ms",
    }, "dynamic");
  } catch (err) {
    return apiError("memory_timetravel failed", 500);
  }
}
