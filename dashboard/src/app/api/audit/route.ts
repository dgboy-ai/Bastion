import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const type = (searchParams.get("type") || "").slice(0, 255);

  try {
    let sql = `
      SELECT audit_id, agent_id, action, details, recorded_at
      FROM agent_audit
      ORDER BY recorded_at DESC
      LIMIT $1
    `;
    const params: unknown[] = [limit];

    if (type) {
      sql = `
        SELECT audit_id, agent_id, action, details, recorded_at
        FROM agent_audit
        WHERE action ILIKE $1::text
        ORDER BY recorded_at DESC
        LIMIT $2
      `;
      params.unshift(`%${type}%`);
    }

    const result = await safeQuery(sql, params);

    const events = result.rows.map((row: Record<string, unknown>) => {
      const det = (row.details || {}) as Record<string, unknown>;
      const hash = (det.current_hash || det.hash || "") as string;
      return {
        id: String(row.audit_id),
        timestamp: row.recorded_at as string,
        type: mapActionToType(row.action as string),
        agent_id: row.agent_id as string,
        content_preview: det.content_preview
          ? String(det.content_preview).substring(0, 80)
          : `${row.action}`,
        hash: hash || undefined,
        previous_hash: (det.previous_hash as string) || undefined,
        trust_score: 0.95,
        status: mapActionToStatus(row.action as string),
        details: JSON.stringify(det),
        action: row.action as string
      };
    });

    return apiSuccess({ events }, "short");
  } catch (error) {
    console.error("[api/audit] Query failed:", error instanceof Error ? error.message : 'Unknown error');
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}

function mapActionToType(action: string): string {
  if (action.includes("store")) return "store";
  if (action.includes("search")) return "search";
  if (action.includes("delete")) return "delete";
  if (action.includes("guard") || action.includes("block")) return "guard_block";
  if (action.includes("time") || action.includes("travel")) return "time_travel";
  if (action.includes("heal") || action.includes("recover")) return "recovery";
  if (action.includes("audit") || action.includes("log")) return "audit";
  if (action.includes("hash") || action.includes("verify")) return "hash_verify";
  return "store";
}

function mapActionToStatus(action: string): string {
  if (action.includes("block") || action.includes("reject")) return "blocked";
  if (action.includes("heal") || action.includes("recover")) return "recovered";
  if (action.includes("fail") || action.includes("error")) return "failed";
  return "success";
}
