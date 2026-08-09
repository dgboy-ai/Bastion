import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const { searchParams } = new URL(request.url);
    const asOf = searchParams.get("as_of");

    let entitiesSql = "SELECT entity_id, name, entity_type, attributes, created_at FROM agent_entities WHERE valid_until IS NULL";
    let relationsSql = "SELECT relation_id, source_entity_id, target_entity_id, relation_type, confidence, source_memory_id FROM agent_relations WHERE valid_until IS NULL";
    const params: unknown[] = [];

    if (asOf) {
      if (asOf.length > 50) {
        return apiError("as_of parameter too long (max 50 chars)", 400, "INVALID_AS_OF");
      }
      const validTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(asOf);
      const validInterval = /^-\d+[smhd]$/.test(asOf);
      if (!validTimestamp && !validInterval) {
        return apiError("Invalid 'as_of' format — use ISO timestamp or relative interval (e.g., -5s, -1h)", 400, "INVALID_AS_OF");
      }
      entitiesSql = entitiesSql.replace("WHERE valid_until IS NULL", "AS OF SYSTEM TIME $1 WHERE valid_until IS NULL");
      relationsSql = relationsSql.replace("WHERE valid_until IS NULL", "AS OF SYSTEM TIME $1 WHERE valid_until IS NULL");
      params.push(asOf);
    }

    const entitiesRes = await safeQuery(entitiesSql, params);
    const relationsRes = await safeQuery(relationsSql, params);

    type EntityRow = Record<string, unknown>;
    type RelationRow = Record<string, unknown>;
    const nodes = entitiesRes.rows.map((row: EntityRow) => ({
      id: row.entity_id as string,
      name: row.name as string,
      type: row.entity_type as string,
      attributes: (row.attributes as Record<string, unknown>) || {},
      createdAt: row.created_at as string,
    }));

    const links = relationsRes.rows.map((row: RelationRow) => ({
      id: row.relation_id as string,
      source: row.source_entity_id as string,
      target: row.target_entity_id as string,
      type: row.relation_type as string,
      confidence: (row.confidence as number) || 1.0,
      sourceMemoryId: row.source_memory_id as string | null,
    }));

    return apiSuccess({ nodes, links }, 'short');
  } catch (error) {
    console.error("[api/graph] Query failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}

export async function POST(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create_entity") {
      const { name, entityType, attributes } = body;
      if (!name || !entityType) {
        return apiError("Missing name or entityType", 400);
      }
      const sanitizedName = String(name).trim().slice(0, 255);
      const sanitizedType = String(entityType).trim().slice(0, 100);
      const attrs = attributes && typeof attributes === "object" ? JSON.stringify(attributes) : null;

      const res = await safeQuery(
        `INSERT INTO agent_entities (agent_id, entity_type, name, attributes)
         VALUES ('dashboard-user', $1, $2, ${attrs ? "$3" : "NULL"})
         RETURNING entity_id, name, entity_type, attributes, created_at`,
        attrs ? [sanitizedType, sanitizedName, attrs] : [sanitizedType, sanitizedName]
      );

      const row = res.rows[0] as Record<string, unknown>;
      return apiSuccess({
        id: row.entity_id,
        name: row.name,
        type: row.entity_type,
        attributes: row.attributes || {},
        createdAt: row.created_at,
      });
    }

    if (action === "update_entity") {
      const { entityId, name, entityType, attributes } = body;
      if (!entityId) return apiError("Missing entityId", 400);

      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (name) { sets.push(`name = $${idx++}`); params.push(String(name).trim().slice(0, 255)); }
      if (entityType) { sets.push(`entity_type = $${idx++}`); params.push(String(entityType).trim().slice(0, 100)); }
      if (attributes && typeof attributes === "object") { sets.push(`attributes = $${idx++}`); params.push(JSON.stringify(attributes)); }

      if (sets.length === 0) return apiError("No fields to update", 400);

      params.push(entityId);
      const res = await safeQuery(
        `UPDATE agent_entities SET ${sets.join(", ")} WHERE entity_id = $${idx} RETURNING entity_id, name, entity_type, attributes, created_at`,
        params
      );

      if (res.rows.length === 0) return apiError("Entity not found", 404);
      const row = res.rows[0] as Record<string, unknown>;
      return apiSuccess({
        id: row.entity_id,
        name: row.name,
        type: row.entity_type,
        attributes: row.attributes || {},
        createdAt: row.created_at,
      });
    }

    if (action === "delete_entity") {
      const { entityId } = body;
      if (!entityId) return apiError("Missing entityId", 400);

      // Soft-delete: set valid_until, and cascade to relations
      await safeQuery(
        `UPDATE agent_relations SET valid_until = now() WHERE source_entity_id = $1 OR target_entity_id = $1`,
        [entityId]
      );
      const res = await safeQuery(
        `UPDATE agent_entities SET valid_until = now() WHERE entity_id = $1 RETURNING entity_id`,
        [entityId]
      );

      if (res.rows.length === 0) return apiError("Entity not found", 404);
      return apiSuccess({ deleted: true, entityId });
    }

    if (action === "create_relation") {
      const { sourceEntityId, targetEntityId, relationType, confidence } = body;
      if (!sourceEntityId || !targetEntityId || !relationType) {
        return apiError("Missing sourceEntityId, targetEntityId, or relationType", 400);
      }
      const relType = String(relationType).trim().slice(0, 100);
      const conf = Math.min(1, Math.max(0, Number(confidence) || 0.7));

      const res = await safeQuery(
        `INSERT INTO agent_relations (agent_id, source_entity_id, target_entity_id, relation_type, confidence)
         VALUES ('dashboard-user', $1, $2, $3, $4)
         RETURNING relation_id, source_entity_id, target_entity_id, relation_type, confidence`,
        [sourceEntityId, targetEntityId, relType, conf]
      );

      const row = res.rows[0] as Record<string, unknown>;
      return apiSuccess({
        id: row.relation_id,
        source: row.source_entity_id,
        target: row.target_entity_id,
        type: row.relation_type,
        confidence: row.confidence,
      });
    }

    if (action === "delete_relation") {
      const { relationId } = body;
      if (!relationId) return apiError("Missing relationId", 400);

      const res = await safeQuery(
        `UPDATE agent_relations SET valid_until = now() WHERE relation_id = $1 RETURNING relation_id`,
        [relationId]
      );

      if (res.rows.length === 0) return apiError("Relation not found", 404);
      return apiSuccess({ deleted: true, relationId });
    }

    if (action === "purge_and_rebuild") {
      // Delete all existing entities and relations
      await safeQuery(`DELETE FROM agent_relations`);
      await safeQuery(`DELETE FROM agent_entities`);

      // Curated real entities from actual system knowledge
      const curatedEntities = [
        { name: "CockroachDB", type: "database", attrs: { role: "Primary database", deployment: "Serverless" } },
        { name: "SERIALIZABLE Isolation", type: "feature", attrs: { description: "Default isolation level for all transactions" } },
        { name: "AS OF SYSTEM TIME", type: "feature", attrs: { description: "Time-travel queries for historical snapshots" } },
        { name: "C-SPANN Vector Index", type: "feature", attrs: { description: "Sub-linear vector similarity search" } },
        { name: "Row-Level TTL", type: "feature", attrs: { description: "Automatic memory expiration without manual cleanup" } },
        { name: "Hash Chain", type: "feature", attrs: { description: "SHA-256 cryptographic integrity verification" } },
        { name: "CDC Feed", type: "component", attrs: { description: "Change data capture live dashboard" } },
        { name: "Knowledge Graph", type: "component", attrs: { description: "Entity-relationship graph from agent memory" } },
        { name: "Audit Trail", type: "component", attrs: { description: "Append-only log with hash chain" } },
        { name: "Dream Consolidation", type: "component", attrs: { description: "Background memory consolidation and analysis" } },
        { name: "Poisoning Guard", type: "component", attrs: { description: "OWASP ASI06 injection detection" } },
        { name: "Time-Travel Audit", type: "component", attrs: { description: "Historical state verification" } },
        { name: "Multi-Region", type: "deployment", attrs: { description: "Tested across 3 regions, 42ms latency" } },
        { name: "OpenTelemetry", type: "tool", attrs: { description: "Tracing for payments microservice" } },
        { name: "Grafana", type: "tool", attrs: { description: "Error rate, latency, and saturation dashboards" } },
        { name: "GitHub Actions", type: "tool", attrs: { description: "Staging deployment pipeline" } },
        { name: "OAuth 2.1 + PKCE", type: "security", attrs: { description: "MCP server authentication" } },
        { name: "JWT Tokens", type: "security", attrs: { description: "Short-lived, 15 minute expiry" } },
        { name: "mcp-agent", type: "agent", attrs: { memories: 468, role: "Primary memory agent" } },
        { name: "groq-db-agent", type: "agent", attrs: { memories: 257, role: "Database operations agent" } },
        { name: "Bastion", type: "system", attrs: { description: "Forensic memory system with hash chain integrity" } },
      ];

      const entityIds: Record<string, string> = {};
      for (const e of curatedEntities) {
        const res = await safeQuery(
          `INSERT INTO agent_entities (agent_id, entity_type, name, attributes)
           VALUES ('system', $1, $2, $3)
           RETURNING entity_id`,
          [e.type, e.name, JSON.stringify(e.attrs)]
        );
        entityIds[e.name] = String(res.rows[0].entity_id);
      }

      // Curated real relationships
      const curatedRelations = [
        { from: "CockroachDB", to: "SERIALIZABLE Isolation", type: "provides", conf: 1.0 },
        { from: "CockroachDB", to: "AS OF SYSTEM TIME", type: "provides", conf: 1.0 },
        { from: "CockroachDB", to: "C-SPANN Vector Index", type: "provides", conf: 1.0 },
        { from: "CockroachDB", to: "Row-Level TTL", type: "provides", conf: 1.0 },
        { from: "CockroachDB", to: "Multi-Region", type: "supports", conf: 1.0 },
        { from: "Bastion", to: "CockroachDB", type: "uses", conf: 1.0 },
        { from: "Bastion", to: "Hash Chain", type: "implements", conf: 1.0 },
        { from: "Bastion", to: "Audit Trail", type: "implements", conf: 1.0 },
        { from: "Bastion", to: "Knowledge Graph", type: "implements", conf: 1.0 },
        { from: "Bastion", to: "Dream Consolidation", type: "implements", conf: 1.0 },
        { from: "Bastion", to: "Poisoning Guard", type: "implements", conf: 1.0 },
        { from: "Bastion", to: "Time-Travel Audit", type: "implements", conf: 1.0 },
        { from: "Bastion", to: "CDC Feed", type: "implements", conf: 1.0 },
        { from: "CDC Feed", to: "CockroachDB", type: "reads_from", conf: 1.0 },
        { from: "Knowledge Graph", to: "C-SPANN Vector Index", type: "powered_by", conf: 1.0 },
        { from: "Audit Trail", to: "Hash Chain", type: "secured_by", conf: 1.0 },
        { from: "Time-Travel Audit", to: "AS OF SYSTEM TIME", type: "powered_by", conf: 1.0 },
        { from: "Dream Consolidation", to: "SERIALIZABLE Isolation", type: "uses", conf: 0.9 },
        { from: "mcp-agent", to: "Bastion", type: "instance_of", conf: 1.0 },
        { from: "groq-db-agent", to: "Bastion", type: "instance_of", conf: 1.0 },
        { from: "mcp-agent", to: "CockroachDB", type: "writes_to", conf: 1.0 },
        { from: "groq-db-agent", to: "CockroachDB", type: "writes_to", conf: 1.0 },
        { from: "Bastion", to: "OpenTelemetry", type: "instrumented_by", conf: 1.0 },
        { from: "Bastion", to: "Grafana", type: "monitored_by", conf: 1.0 },
        { from: "Bastion", to: "GitHub Actions", type: "deployed_via", conf: 1.0 },
        { from: "Bastion", to: "OAuth 2.1 + PKCE", type: "authenticated_by", conf: 1.0 },
        { from: "Bastion", to: "JWT Tokens", type: "uses", conf: 1.0 },
        { from: "Poisoning Guard", to: "Hash Chain", type: "verifies", conf: 1.0 },
      ];

      for (const r of curatedRelations) {
        await safeQuery(
          `INSERT INTO agent_relations (agent_id, source_entity_id, target_entity_id, relation_type, confidence)
           VALUES ('system', $1, $2, $3, $4)`,
          [entityIds[r.from], entityIds[r.to], r.type, r.conf]
        );
      }

      return apiSuccess({
        purged: true,
        entitiesCreated: curatedEntities.length,
        relationsCreated: curatedRelations.length,
        source: "curated_real_data",
      });
    }

    return apiError("Unknown action", 400);
  } catch (error) {
    console.error("[api/graph] Mutation failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("Mutation failed — try again later", 503, "DB_ERROR");
  }
}