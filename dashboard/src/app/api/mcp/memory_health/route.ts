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
    const startTime = Date.now();

    // Check cluster health
    const pingResult = await safeQuery("SELECT 1 as ping");
    const pingLatency = Date.now() - startTime;

    // Get stats
    const statsResult = await safeQuery(
      `SELECT COUNT(*) as total_memories,
              COUNT(DISTINCT agent_id) as total_agents,
              COUNT(DISTINCT memory_type) as memory_types,
              AVG(trust_level) as avg_trust,
              MIN(created_at) as oldest_memory,
              MAX(created_at) as newest_memory
       FROM agent_memory`
    );

    const stats = statsResult.rows[0] as Record<string, unknown>;

    // Get region info
    const regionResult = await safeQuery(
      `SELECT crdb_region, COUNT(*) as count
       FROM agent_memory
       GROUP BY crdb_region`
    );

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_health",
      status: "healthy",
      cluster: {
        reachable: true,
        pingLatency: pingLatency + "ms",
        totalQueries: pingResult.rowCount,
      },
      memory: {
        total: Number(stats.total_memories) || 0,
        agents: Number(stats.total_agents) || 0,
        types: Number(stats.memory_types) || 0,
        avgTrust: stats.avg_trust ? Math.round(Number(stats.avg_trust) * 100) / 100 : null,
        oldest: stats.oldest_memory,
        newest: stats.newest_memory,
      },
      regions: regionResult.rows.map((r: Record<string, unknown>) => ({
        region: r.crdb_region,
        memories: Number(r.count),
      })),
      latency: latency + "ms",
    }, "dynamic");
  } catch (err) {
    return apiSuccess({
      tool: "memory_health",
      status: "unhealthy",
      cluster: { reachable: false },
    }, "dynamic");
  }
}
