import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function POST(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const body = await request.json();
    const { agentId = "agent-demo", limit = 20 } = body;

    const startTime = Date.now();

    // Get audit log with hash chain verification
    const result = await safeQuery(
      `SELECT memory_id, memory_type, content::varchar(100), trust_level, created_at,
              previous_hash, cryptographic_hash
       FROM agent_memory
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [agentId, Math.min(limit, 100)]
    );

    // Verify hash chain integrity
    const rows = result.rows as Record<string, unknown>[];
    let chainValid = true;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].previous_hash !== rows[i - 1].cryptographic_hash) {
        chainValid = false;
        break;
      }
    }

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_audit",
      agentId,
      entries: rows.map((r) => ({
        memoryId: r.memory_id,
        memoryType: r.memory_type,
        content: r.content,
        trustLevel: r.trust_level,
        createdAt: r.created_at,
        previousHash: r.previous_hash ? String(r.previous_hash).slice(0, 20) + "..." : null,
        currentHash: r.cryptographic_hash ? String(r.cryptographic_hash).slice(0, 20) + "..." : null,
      })),
      chainVerified: chainValid,
      total: rows.length,
      latency: latency + "ms",
    }, "dynamic");
  } catch (err) {
    return apiError("memory_audit failed", 500);
  }
}
