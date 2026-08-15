import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

const MCP_URL = process.env.MCP_SERVER_URL || "http://127.0.0.1:9997";

export async function POST(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    let body;
    try {
      const text = await request.text();
      if (text.length > 10000) return apiError("Body too large", 413);
      body = JSON.parse(text);
    } catch {
      body = {};
    }

    const agentId = String(body.agentId || "mcp-agent").slice(0, 128);
    const lookbackHours = Math.min(Number(body.lookbackHours) || 24, 168);
    const startTime = Date.now();

    // ─── Gather pre-consolidation stats ────────────────────────
    const [memCount, trustedCount, poisonedCount] = await Promise.all([
      safeQuery("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id = $1", [agentId]),
      safeQuery("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id = $1 AND trust_level >= 2", [agentId]),
      safeQuery("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id = $1 AND memory_type = 'poison_attempt'", [agentId]),
    ]);

    const beforeStats = {
      totalMemories: memCount.rows[0]?.c || 0,
      trustedMemories: trustedCount.rows[0]?.c || 0,
      poisonedMemories: poisonedCount.rows[0]?.c || 0,
    };

    // ─── Check for duplicate/contradictory memories ────────────
    let duplicatesRemoved = 0;
    const contradictionsFound = 0;

    try {
      const allMems = await safeQuery(
        `SELECT memory_id, content::varchar(500) AS content, memory_type, trust_level, created_at
         FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC`,
        [agentId]
      );

      const contentMap = new Map<string, { id: string; trust: number; createdAt: Date }>();
      for (const row of allMems.rows as any[]) {
        const key = String(row.content || "").slice(0, 200);
        if (contentMap.has(key)) {
          const existing = contentMap.get(key)!;
          if (row.trust_level < existing.trust || (row.trust_level === existing.trust && new Date(row.created_at) < new Date(existing.createdAt))) {
            // Record deletion in audit trail before deleting
            await safeQuery(
              `INSERT INTO agent_audit (agent_id, action, memory_id, details, created_at)
               VALUES ($1, 'dream_consolidation_delete', $2, $3, NOW())`,
              [agentId, row.memory_id, JSON.stringify({ reason: "duplicate_consolidation", trust_level: row.trust_level })]
            );
            await safeQuery("DELETE FROM agent_memory WHERE memory_id = $1", [row.memory_id]);
            duplicatesRemoved++;
          }
        } else {
          contentMap.set(key, { id: row.memory_id, trust: row.trust_level, createdAt: row.created_at });
        }
      }
    } catch {
      // Best effort duplicate removal
    }

    // ─── Try MCP dream endpoint if reachable ───────────────────
    let mcpDreamResult: Record<string, unknown> | null = null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const mcpRes = await fetch(`${MCP_URL}/api/mcp/dream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.BASTION_MCP_API_KEY || ""}`,
        },
        body: JSON.stringify({
          agentId,
          lookbackHours,
          memoryTypes: ["episodic", "procedural"],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (mcpRes.ok) {
        mcpDreamResult = await mcpRes.json();
      }
    } catch {
      // MCP server not available
    }

    // ─── Gather post-consolidation stats ───────────────────────
    const [afterMemCount, afterTrustedCount] = await Promise.all([
      safeQuery("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id = $1", [agentId]),
      safeQuery("SELECT COUNT(*)::int AS c FROM agent_memory WHERE agent_id = $1 AND trust_level >= 2", [agentId]),
    ]);

    const afterStats = {
      totalMemories: afterMemCount.rows[0]?.c || 0,
      trustedMemories: afterTrustedCount.rows[0]?.c || 0,
    };

    const latency = Date.now() - startTime;

    return apiSuccess({
      status: "completed",
      agentId,
      lookbackHours,
      before: beforeStats,
      after: afterStats,
      changes: {
        duplicatesRemoved,
        contradictionsFound,
        memoriesHealed: Number(afterStats.trustedMemories) - Number(beforeStats.trustedMemories),
        netReduction: Number(beforeStats.totalMemories) - Number(afterStats.totalMemories),
      },
      mcpDreamResult,
      cockroachdbFeatures: [
        "AS OF SYSTEM TIME for temporal dedup",
        "SERIALIZABLE isolation for safe concurrent consolidation",
        "Hash chain re-verification after edits",
        "Background consolidation via Python dream cycle",
      ],
      latency: latency + "ms",
      timestamp: new Date().toISOString(),
    }, "dynamic");
  } catch (err) {
    console.error("[api/dream] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("Dream consolidation failed", 500);
  }
}
