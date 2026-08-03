import { safeQueryStatic } from "@/lib/db";
import { exportAgentMemory } from "@/lib/s3";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    let body: { agentId?: string } = {};
    try {
      const text = await request.text();
      if (text.length > 10000) return apiError("Body too large", 413);
      if (text) body = JSON.parse(text);
    } catch { /* empty body OK */ }

    const agentId = String(body.agentId || "agent-demo").slice(0, 128);

    const [memoriesRes, trustRes, auditRes, entitiesRes] = await Promise.all([
      safeQueryStatic(
        "SELECT memory_id, agent_id, memory_type, content::varchar(1000) AS content, metadata::varchar(500) AS metadata, trust_level, importance_score, source_provenance, is_pinned, cryptographic_hash, previous_hash, created_at, expires_at, crdb_region FROM agent_memory WHERE agent_id = $1 ORDER BY created_at ASC",
        [agentId]
      ),
      safeQueryStatic(
        "SELECT AVG(trust_level)::float AS avg_trust, COUNT(*) AS total_memories FROM agent_memory WHERE agent_id = $1",
        [agentId]
      ),
      safeQueryStatic(
        "SELECT action, details::varchar(500) AS details, recorded_at FROM agent_audit WHERE agent_id = $1 ORDER BY recorded_at ASC",
        [agentId]
      ),
      safeQueryStatic(
        "SELECT entity_id, entity_type, name FROM agent_entities WHERE agent_id = $1 ORDER BY created_at ASC",
        [agentId]
      ),
    ]);

    const payload = {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      sourceSystem: "Bastion / CockroachDB Cloud",
      agentId,
      summary: {
        memoryCount: memoriesRes.rowCount,
        avgTrust: trustRes.rows[0]?.avg_trust,
        auditEntries: auditRes && auditRes.rowCount,
        entityCount: entitiesRes.rowCount,
      },
      memories: memoriesRes.rows,
      auditTrail: auditRes.rows,
      entities: entitiesRes.rows,
    };

    const exported = await exportAgentMemory(agentId, payload);

    return apiSuccess({
      ...exported,
      snapshot: payload,
    }, "dynamic");
  } catch (err) {
    console.error("[api/demo/export] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("S3 export failed", 500, "S3_EXPORT_ERROR");
  }
}