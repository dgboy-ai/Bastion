import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("as_of");

    let entitiesSql = "SELECT entity_id, name, entity_type, attributes FROM agent_entities";
    let relationsSql = "SELECT relation_id, source_entity_id, target_entity_id, relation_type, confidence FROM agent_relations";
    const params: unknown[] = [];

    if (asOf) {
      // Validate that asOf looks like a timestamp or relative interval
      entitiesSql += " AS OF SYSTEM TIME $1";
      relationsSql += " AS OF SYSTEM TIME $1";
      params.push(asOf);
    }

    const entitiesRes = await query(entitiesSql, params);
    const relationsRes = await query(relationsSql, params);

    const nodes = entitiesRes.rows.map((row) => ({
      id: row.entity_id,
      name: row.name,
      type: row.entity_type,
      attributes: row.attributes || {},
    }));

    const links = relationsRes.rows.map((row) => ({
      id: row.relation_id,
      source: row.source_entity_id,
      target: row.target_entity_id,
      type: row.relation_type,
      confidence: row.confidence || 1.0,
    }));

    return NextResponse.json({ nodes, links });
  } catch (error: unknown) {
    console.error("Failed to fetch graph data:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
