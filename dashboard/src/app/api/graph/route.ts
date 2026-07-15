import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { getMockGraph } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return apiSuccess(getMockGraph(), 'short', { mock: true });
  }

  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("as_of");

    let entitiesSql = "SELECT entity_id, name, entity_type, attributes FROM agent_entities";
    let relationsSql = "SELECT relation_id, source_entity_id, target_entity_id, relation_type, confidence FROM agent_relations";
    const params: unknown[] = [];

    if (asOf) {
      entitiesSql += " AS OF SYSTEM TIME $1";
      relationsSql += " AS OF SYSTEM TIME $1";
      params.push(asOf);
    }

    const entitiesRes = await safeQuery(entitiesSql, params);
    if (entitiesRes.mock) {
      return apiSuccess(getMockGraph(), 'short', { mock: true });
    }
    const relationsRes = await safeQuery(relationsSql, params);

    type EntityRow = Record<string, unknown>;
    type RelationRow = Record<string, unknown>;
    const nodes = entitiesRes.rows.map((row: EntityRow) => ({
      id: row.entity_id as string,
      name: row.name as string,
      type: row.entity_type as string,
      attributes: (row.attributes as Record<string, unknown>) || {},
    }));

    const links = relationsRes.rows.map((row: RelationRow) => ({
      id: row.relation_id as string,
      source: row.source_entity_id as string,
      target: row.target_entity_id as string,
      type: row.relation_type as string,
      confidence: (row.confidence as number) || 1.0,
    }));

    return apiSuccess({ nodes, links }, 'short');
  } catch (error) {
    console.error("[api/graph] Query failed:", error);
    return apiError("Database unavailable — try again later or enable BASTION_MOCK=true", 503, "DB_UNAVAILABLE");
  }
}
