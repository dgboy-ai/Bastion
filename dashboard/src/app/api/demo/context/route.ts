import { safeQuery } from "@/lib/db";
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

    const [memoriesRes, entitiesRes, relationsRes, auditRes, hashChainRes, trustRes] = await Promise.all([
      safeQuery(
        "SELECT memory_id, memory_type, content::varchar(200) AS content, trust_level, source_provenance, created_at, cryptographic_hash, previous_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 20",
        [agentId]
      ),
      safeQuery(
        "SELECT entity_id, entity_type, name, attributes FROM agent_entities WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10",
        [agentId]
      ),
      safeQuery(
        "SELECT r.relation_type, r.confidence, e1.name AS source, e2.name AS target FROM agent_relations r JOIN agent_entities e1 ON r.source_entity_id = e1.entity_id JOIN agent_entities e2 ON r.target_entity_id = e2.entity_id WHERE r.agent_id = $1 LIMIT 10",
        [agentId]
      ),
      safeQuery(
        "SELECT action, details::varchar(200) AS details, recorded_at FROM agent_audit WHERE agent_id = $1 ORDER BY recorded_at DESC LIMIT 10",
        [agentId]
      ),
      safeQuery(
        "SELECT memory_id, cryptographic_hash, previous_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10",
        [agentId]
      ),
      safeQuery(
        "SELECT AVG(trust_level)::float AS avg_trust, MIN(trust_level)::int AS min_trust, MAX(trust_level)::int AS max_trust, COUNT(*) AS total_memories FROM agent_memory WHERE agent_id = $1",
        [agentId]
      ),
    ]);

    const trustRow = trustRes.rows[0] || {};
    const avgTrust = trustRow.avg_trust !== null ? ((Number(trustRow.avg_trust) + 1) / 5 * 100).toFixed(0) : "—";
    const totalMemories = trustRow.total_memories || 0;

    const hashChain = hashChainRes.rows.map((r: Record<string, unknown>, i: number) => ({
      step: i,
      memoryId: String(r.memory_id).slice(0, 8) + "...",
      hash: String(r.cryptographic_hash || "").slice(0, 16) + "...",
      prevHash: r.previous_hash ? String(r.previous_hash).slice(0, 16) + "..." : "genesis",
      valid: i === hashChainRes.rows.length - 1
        ? true // newest entry — no next to check
        : (r.cryptographic_hash === hashChainRes.rows[i + 1]?.previous_hash),
    }));

    return apiSuccess({
      agentId,
      summary: {
        totalMemories,
        avgTrust: avgTrust + "%",
        minTrust: trustRow.min_trust !== null ? ((Number(trustRow.min_trust) + 1) / 5 * 100) + "%" : "—",
        entityCount: entitiesRes.rowCount,
        relationCount: relationsRes.rowCount,
        auditEntries: auditRes.rowCount,
      },
      memories: memoriesRes.rows.map((r: Record<string, unknown>) => ({
        id: String(r.memory_id).slice(0, 8) + "...",
        type: r.memory_type,
        content: r.content,
        trustLevel: r.trust_level,
        provenance: r.source_provenance,
        hash: String(r.cryptographic_hash || "").slice(0, 12) + "...",
        createdAt: r.created_at,
      })),
      entities: entitiesRes.rows.map((r: Record<string, unknown>) => ({
        name: r.name,
        type: r.entity_type,
      })),
      relations: relationsRes.rows.map((r: Record<string, unknown>) => ({
        source: r.source,
        target: r.target,
        type: r.relation_type,
      })),
      auditTrail: auditRes.rows.map((r: Record<string, unknown>) => ({
        action: r.action,
        details: r.details,
        at: r.recorded_at,
      })),
      hashChain,
    }, "dynamic");
  } catch (err) {
    console.error("[api/demo/context] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("Context fetch failed", 500);
  }
}
