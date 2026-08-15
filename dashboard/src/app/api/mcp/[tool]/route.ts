import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { randomUUID } from "crypto";
import { computeHmacHash } from "@/lib/hash-chain";
import { embedToVectorString } from "@/lib/embeddings";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tool: string }> }
) {
  // Skip auth when user provides their own connection string via the playground dialog
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  const { tool } = await params;

  const ALLOWED_TOOLS = ["memory_pin", "memory_get_pinned", "memory_list", "memory_delete", "memory_correct"];
  if (!ALLOWED_TOOLS.includes(tool)) {
    return apiError(`Unknown tool: ${tool}. Allowed: ${ALLOWED_TOOLS.join(", ")}`, 400);
  }

  try {
    const body = await request.json();
    const {
      content,
      agentId = "agent-demo",
      memoryType = "safety_rule",
      pinPriority = 2,
      memoryId,
      query,
      interval,
      limit,
    } = body;

    const startTime = Date.now();

    // 1. memory_pin tool: Insert a pinned record with the same hash-chain and
    //    embedding pipeline as the Python engine's mem.pin()/store path.
    if (tool === "memory_pin") {
      const pinContent = content || body.query || "Critical security override rule";
      if (!pinContent || !pinContent.trim()) {
        return apiError("content is required", 400);
      }
      if (pinPriority !== 0 && pinPriority !== 1 && pinPriority !== 2) {
        return apiError("pin_priority must be 0 (normal), 1 (important), or 2 (CRITICAL)", 400);
      }

      const lastMem = await safeQuery(
        "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1",
        [agentId]
      );
      const previousHash = (lastMem.rows[0]?.cryptographic_hash as string) || "";

      const newMemoryId = randomUUID();
      const cryptographicHash = computeHmacHash(pinContent, {}, previousHash);

      const embeddingStr = await embedToVectorString(pinContent);

      await safeQuery(
        `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, metadata, previous_hash, cryptographic_hash, trust_level, source_provenance, importance_score, crdb_region, is_pinned, pin_priority)
         VALUES ($1, $2, $3, $4, $5::vector(1024), '{}', $6, $7, 4, 'agent_direct', 0.9, 'aws-ap-south-1', true, $8)`,
        [newMemoryId, agentId, memoryType, pinContent, embeddingStr, previousHash, cryptographicHash, pinPriority]
      );

      return apiSuccess({
        tool: "memory_pin",
        memoryId: newMemoryId,
        agentId,
        content: pinContent,
        isPinned: true,
        pinPriority,
        previousHash: previousHash.slice(0, 20) + "...",
        cryptographicHash: cryptographicHash.slice(0, 20) + "...",
        latency: (Date.now() - startTime) + "ms",
        sql: `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, is_pinned, pin_priority) VALUES ($1, $2, $3, $4, true, $5)`,
      }, "dynamic");
    }

    // 2. memory_get_pinned tool: Retrieve all pinned records
    if (tool === "memory_get_pinned") {
      const result = await safeQuery(
        `SELECT memory_id, memory_type, content::varchar(200), trust_level, created_at, pin_priority, is_pinned
         FROM agent_memory
         WHERE agent_id = $1 AND is_pinned = true
         ORDER BY created_at DESC`,
        [agentId]
      );
      return apiSuccess({
        tool: "memory_get_pinned",
        agentId,
        results: result.rows.map((r: any) => ({
          memoryId: r.memory_id,
          content: r.content,
          memoryType: r.memory_type,
          trustLevel: r.trust_level,
          pinPriority: r.pin_priority,
          isPinned: r.is_pinned,
          createdAt: r.created_at,
        })),
        total: result.rows.length,
        latency: (Date.now() - startTime) + "ms",
        sql: `SELECT memory_id, content, pin_priority FROM agent_memory WHERE agent_id = $1 AND is_pinned = true ORDER BY created_at DESC`,
      }, "dynamic");
    }

    // 3. memory_list: List all memories
    if (tool === "memory_list") {
      const result = await safeQuery(
        `SELECT memory_id, memory_type, content::varchar(200), trust_level, created_at, is_pinned, pin_priority
         FROM agent_memory
         WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [agentId, Math.min(limit || 20, 100)]
      );
      return apiSuccess({
        tool: "memory_list",
        agentId,
        results: result.rows.map((r: any) => ({
          memoryId: r.memory_id,
          content: r.content,
          memoryType: r.memory_type,
          trustLevel: r.trust_level,
          isPinned: r.is_pinned,
          pinPriority: r.pin_priority,
          createdAt: r.created_at,
        })),
        total: result.rows.length,
        latency: (Date.now() - startTime) + "ms",
        sql: `SELECT memory_id, memory_type, content, trust_level FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`,
      }, "dynamic");
    }

    // 4. memory_delete: Delete a memory (requires confirmation, matches engine)
    if (tool === "memory_delete") {
      const targetId = memoryId || query || body.query;
      if (!targetId) return apiError("memoryId is required for deletion", 400);
      if (!body.confirmed) {
        return apiError("Deletion requires confirmed=true", 400);
      }
      const deleteRes = await safeQuery(
        "DELETE FROM agent_memory WHERE memory_id = $1 AND agent_id = $2",
        [targetId, agentId]
      );
      return apiSuccess({
        tool: "memory_delete",
        deletedId: targetId,
        rowsAffected: deleteRes.rowCount,
        latency: (Date.now() - startTime) + "ms",
        sql: `DELETE FROM agent_memory WHERE memory_id = $1 AND agent_id = $2`,
      }, "dynamic");
    }

    // 5. memory_correct: Correct content of a memory
    if (tool === "memory_correct") {
      const targetId = memoryId || body.id;
      const newContent = content || body.newContent || query;
      if (!targetId || !newContent) return apiError("memoryId and content/newContent are required", 400);

      // Recompute the hash over the NEW content (metadata preserved from the
      // stored row so the chain remains verifiable).
      const existingRow = await safeQuery(
        "SELECT previous_hash, metadata::text AS meta, cryptographic_hash FROM agent_memory WHERE memory_id = $1 AND agent_id = $2",
        [targetId, agentId]
      );
      if (existingRow.rows.length === 0) {
        return apiError(`Memory ${targetId} not found`, 404);
      }
      const prevHash = existingRow.rows[0].previous_hash as string | null;
      let metaJson: Record<string, unknown> | null = null;
      try {
        metaJson = JSON.parse((existingRow.rows[0].meta as string) || "null");
      } catch {
        metaJson = null;
      }
      const newHash = computeHmacHash(newContent, metaJson, prevHash);

      const updateRes = await safeQuery(
        "UPDATE agent_memory SET content = $1, cryptographic_hash = $2, overwrite_count = overwrite_count + 1 WHERE memory_id = $3 AND agent_id = $4",
        [newContent, newHash, targetId, agentId]
      );

      if (updateRes.rowCount === 0) {
        return apiError(`Memory ${targetId} not found`, 404);
      }

      return apiSuccess({
        tool: "memory_correct",
        memoryId: targetId,
        newContent,
        previousHash: (prevHash || "").slice(0, 20) + "...",
        cryptographicHash: newHash.slice(0, 20) + "...",
        rowsAffected: updateRes.rowCount,
        latency: (Date.now() - startTime) + "ms",
        sql: `UPDATE agent_memory SET content = $1, cryptographic_hash = $2, overwrite_count = overwrite_count + 1 WHERE memory_id = $3 AND agent_id = $4`,
      }, "dynamic");
    }

    // 6. Generic mock execution for any other tool to prevent next/parse crash
    return apiSuccess({
      tool,
      agentId,
      status: "executed",
      payloadReceived: body,
      results: [
        {
          info: `Simulated response for MCP tool`,
          timestamp: new Date().toISOString(),
          details: "Successfully executed in agent context",
        }
      ],
      latency: (Date.now() - startTime) + "ms",
    }, "dynamic");

  } catch (err) {
    return apiError("Tool execution failed", 500);
  }
}
