import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "30", 10)));

  try {
    const [usageRes, breakdownRes, a2aRes, crdbRes, clientNameRes, agentIdRes, crdbToolRes] = await Promise.all([
      safeQuery(
        `SELECT agent_id, tool_name, args_summary, result_summary, duration_ms, client_name, sub_tool, created_at
         FROM tool_usage_log
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      ),
      safeQuery(
        `SELECT tool_name, COUNT(*) as calls, AVG(duration_ms) as avg_ms,
                MAX(created_at) as last_called
         FROM tool_usage_log
         GROUP BY tool_name
         ORDER BY calls DESC
         LIMIT 25`
      ),
      safeQuery(
        `SELECT from_agent, to_agent, skill_used, message_preview, status, created_at
         FROM a2a_handoffs
         ORDER BY created_at DESC
         LIMIT 15`
      ),
      safeQuery(
        `SELECT
           COUNT(*) FILTER (WHERE tool_name LIKE 'memory_search%' OR tool_name LIKE 'memory_store%' OR tool_name LIKE 'memory_%' OR tool_name = 'multi_signal_search') as memory_tools,
           COUNT(*) FILTER (WHERE tool_name = 'ccloud_exec') as ccloud_tools,
           COUNT(*) FILTER (WHERE tool_name = 'invoke_agent_skill' OR tool_name = 'list_agent_skills') as skill_tools,
           COUNT(*) FILTER (WHERE tool_name = 'managed_mcp_call') as managed_mcp_tools,
           COUNT(*) as total
         FROM tool_usage_log`
      ),
      safeQuery(
        `SELECT client_name, COUNT(*) as calls
         FROM tool_usage_log
         WHERE client_name IS NOT NULL
         GROUP BY client_name
         ORDER BY calls DESC
         LIMIT 15`
      ),
      safeQuery(
        `SELECT agent_id, COUNT(*) as calls
         FROM tool_usage_log
         GROUP BY agent_id
         ORDER BY calls DESC
         LIMIT 15`
      ),
      safeQuery(
        `SELECT COALESCE(sub_tool, tool_name) as tool, COUNT(*) as calls
         FROM tool_usage_log
         GROUP BY COALESCE(sub_tool, tool_name)
         ORDER BY calls DESC
          LIMIT 50`
      ),
    ]);

    const usage = usageRes.rows.map((row: Record<string, unknown>) => ({
      agent_id: row.agent_id as string,
      tool_name: row.tool_name as string,
      args_summary: (row.args_summary as string) || "",
      result_summary: (row.result_summary as string) || "",
      duration_ms: row.duration_ms as number,
      client_name: (row.client_name as string) || "",
      sub_tool: (row.sub_tool as string) || "",
      created_at: row.created_at as string,
    }));

    const breakdown = breakdownRes.rows.map((row: Record<string, unknown>) => ({
      tool_name: row.tool_name as string,
      calls: Number(row.calls || 0),
      avg_ms: Math.round(Number(row.avg_ms || 0)),
      last_called: row.last_called as string,
    }));

    const a2a = a2aRes.rows.map((row: Record<string, unknown>) => ({
      from_agent: row.from_agent as string,
      to_agent: row.to_agent as string,
      skill_used: (row.skill_used as string) || "",
      message_preview: (row.message_preview as string) || "",
      status: row.status as string,
      created_at: row.created_at as string,
    }));

    const crdb = crdbRes.rows[0] as Record<string, unknown> | undefined;
    const byClient = clientNameRes.rows.map((row: Record<string, unknown>) => ({
      client_name: (row.client_name as string) || "unknown",
      calls: Number(row.calls || 0),
    }));
    const byAgent = agentIdRes.rows.map((row: Record<string, unknown>) => ({
      agent_id: row.agent_id as string,
      calls: Number(row.calls || 0),
    }));
    const crdbTools = crdbToolRes.rows.map((row: Record<string, unknown>) => ({
      tool: row.tool as string,
      calls: Number(row.calls || 0),
    }));

    return apiSuccess({
      usage,
      breakdown,
      a2a_handoffs: a2a,
      crdb: {
        memory_tools: Number(crdb?.memory_tools || 0),
        ccloud_tools: Number(crdb?.ccloud_tools || 0),
        skill_tools: Number(crdb?.skill_tools || 0),
        managed_mcp_tools: Number(crdb?.managed_mcp_tools || 0),
        total: Number(crdb?.total || 0),
      },
      by_client: byClient,
      by_agent: byAgent,
      crdb_tool_breakdown: crdbTools,
    }, "short");
  } catch (error) {
    console.error("[api/tool-usage] Query failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("Tool usage query failed", 503, "DB_ERROR");
  }
}
