import { safeQuery, isMockMode } from "@/lib/db";
import { apiSuccess } from "@/lib/api-response";

export async function GET() {
  if (isMockMode()) {
    return apiSuccess({ memories: 0, entities: 0, relations: 0, auditLogs: 0, regions: 1, mock: true }, "dynamic");
  }
  try {
    const [memRes, entRes, relRes, auditRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as cnt FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_entities"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_relations"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_audit"),
    ]);
    return apiSuccess({
      memories: parseInt(String(memRes.rows[0]?.cnt ?? "0"), 10),
      entities: parseInt(String(entRes.rows[0]?.cnt ?? "0"), 10),
      relations: parseInt(String(relRes.rows[0]?.cnt ?? "0"), 10),
      auditLogs: parseInt(String(auditRes.rows[0]?.cnt ?? "0"), 10),
      regions: 1,
    }, "dynamic");
  } catch {
    return apiSuccess({ memories: 0, entities: 0, relations: 0, auditLogs: 0, regions: 1, error: true }, "dynamic");
  }
}
