import { NextResponse } from "next/server";
import { pool, safeQuery } from "@/lib/db";
import { getMockGraph } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (!pool) {
    return NextResponse.json(getMockGraph());
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
      return NextResponse.json(getMockGraph());
    }
    const relationsRes = await safeQuery(relationsSql, params);

    const nodes = entitiesRes.rows.map((row: any) => ({
      id: row.entity_id,
      name: row.name,
      type: row.entity_type,
      attributes: row.attributes || {},
    }));

    const links = relationsRes.rows.map((row: any) => ({
      id: row.relation_id,
      source: row.source_entity_id,
      target: row.target_entity_id,
      type: row.relation_type,
      confidence: row.confidence || 1.0,
    }));

    return NextResponse.json({ nodes, links });
  } catch {
    return NextResponse.json(getMockGraph());
  }
}
