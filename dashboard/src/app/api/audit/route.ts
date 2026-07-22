import { safeQuery, isMockMode } from "@/lib/db";
import { getMockMemories } from "@/lib/mock-data";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const type = searchParams.get("type") || "";

  if (isMockMode()) {
    return apiSuccess(getMockAuditEvents(limit), "short", { mock: true });
  }

  try {
    let sql = `
      SELECT audit_id, agent_id, workflow_id, action, details, recorded_at
      FROM agent_audit
      ORDER BY recorded_at DESC
      LIMIT $1
    `;
    const params: unknown[] = [limit];

    if (type) {
      sql = `
        SELECT audit_id, agent_id, workflow_id, action, details, recorded_at
        FROM agent_audit
        WHERE action ILIKE $1
        ORDER BY recorded_at DESC
        LIMIT $2
      `;
      params.unshift(`%${type}%`);
    }

    const result = await safeQuery(sql, params);

    if (result.mock) {
      return apiSuccess(getMockAuditEvents(limit), "short", { mock: true });
    }

    const events = result.rows.map((row: Record<string, unknown>) => ({
      id: row.audit_id as string,
      timestamp: row.recorded_at as string,
      type: mapActionToType(row.action as string),
      agent_id: row.agent_id as string,
      content_preview: extractContentPreview(row.details),
      hash: extractHash(row.details),
      previous_hash: extractPreviousHash(row.details),
      trust_score: extractTrustScore(row.details),
      status: mapActionToStatus(row.action as string),
      details: typeof row.details === "object" ? JSON.stringify(row.details) : String(row.details || ""),
    }));

    return apiSuccess({ events }, "short");
  } catch (error) {
    console.error("[api/audit] Query failed:", error);
    const fallbackEvents = getMockAuditEvents(10);
    return apiSuccess({ events: fallbackEvents }, "short", { mock: true, fallback: true });
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

function extractContentPreview(details: unknown): string {
  if (!details || typeof details !== "object") return "N/A";
  const d = details as Record<string, unknown>;
  if (d.content_preview) return String(d.content_preview);
  if (d.content) return String(d.content).substring(0, 100);
  if (d.memory_type) return `[${d.memory_type}] memory operation`;
  return "Audit entry";
}

function extractHash(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const d = details as Record<string, unknown>;
  if (d.cryptographic_hash) return String(d.cryptographic_hash);
  if (d.hash) return String(d.hash);
  return undefined;
}

function extractPreviousHash(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const d = details as Record<string, unknown>;
  if (d.previous_hash) return String(d.previous_hash);
  return undefined;
}

function extractTrustScore(details: unknown): number | undefined {
  if (!details || typeof details !== "object") return undefined;
  const d = details as Record<string, unknown>;
  if (typeof d.trust_score === "number") return d.trust_score;
  if (typeof d.importance_score === "number") return d.importance_score / 10;
  return 0.85;
}

function getMockAuditEvents(limit: number) {
  const memories = getMockMemories();
  const events = [];
  const actions = ["memory_store", "memory_search", "guard_scan", "hash_verify", "memory_heal"];

  for (let i = 0; i < Math.min(limit, 20); i++) {
    const mem = memories[i % memories.length];
    const action = actions[i % actions.length];
    events.push({
      id: `audit-${i}`,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      type: mapActionToType(action),
      agent_id: mem.agentId,
      content_preview: mem.content.substring(0, 100),
      hash: mem.cryptographicHash || `hash-${i}`,
      previous_hash: i > 0 ? `hash-${i - 1}` : null,
      trust_score: 0.7 + Math.random() * 0.3,
      status: i % 5 === 0 ? "blocked" : "success",
      details: JSON.stringify({ memory_type: mem.memoryType }),
    });
  }
  return { events };
}

