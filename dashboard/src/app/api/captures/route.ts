import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

const CAPTURE_TYPES = ["tool_execution", "error_log", "conversation", "episodic", "session_lifecycle"];

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const agentId = (searchParams.get("agent_id") || "").slice(0, 255);
  const type = (searchParams.get("type") || "").slice(0, 255);

  try {
    let sql = `
      SELECT memory_id, agent_id, memory_type, left(content, 1000) AS content,
             metadata::varchar(500) AS metadata, trust_level, importance_score,
             source_provenance, is_pinned, cryptographic_hash, previous_hash,
             created_at
      FROM agent_memory
      WHERE memory_type = ANY($1::text[])
    `;
    const params: unknown[] = [CAPTURE_TYPES];

    if (agentId) {
      sql += ` AND agent_id = $2`;
      params.push(agentId);
    }
    if (type) {
      sql += agentId ? ` AND memory_type = $3` : ` AND memory_type = $2`;
      params.push(type);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await safeQuery(sql, params);

    const captures = result.rows.map((row: Record<string, unknown>) => {
      let metadata: Record<string, unknown> = {};
      if (typeof row.metadata === "string") {
        try { metadata = JSON.parse(row.metadata); } catch {}
      } else if (row.metadata && typeof row.metadata === "object") {
        metadata = row.metadata as Record<string, unknown>;
      }
      return {
        id: String(row.memory_id),
        agent_id: row.agent_id as string,
        type: row.memory_type as string,
        content: row.content as string,
        tool: (metadata.tool_name as string) || (metadata.tool as string) || undefined,
        args_keys: Array.isArray(metadata.arguments_keys) ? metadata.arguments_keys : undefined,
        error_type: (metadata.error_type as string) || undefined,
        role: (metadata.role as string) || undefined,
        trust_level: row.trust_level as number,
        importance_score: row.importance_score as number,
        provenance: (row.source_provenance as string) || "agent_direct",
        is_pinned: Boolean(row.is_pinned),
        hash: (row.cryptographic_hash as string) || undefined,
        previous_hash: (row.previous_hash as string) || undefined,
        created_at: row.created_at as string,
      };
    });

    return apiSuccess({ captures, total: captures.length, capture_types: CAPTURE_TYPES }, "short");
  } catch (error) {
    console.error("[api/captures] Query failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}
