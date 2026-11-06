import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { computeHmacHash } from "@/lib/hash-chain";

function normalizeMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const meta = { ...(parsed as Record<string, unknown>) };
  delete meta._precomputed_embedding;
  delete meta._trust_level;
  delete meta._source_provenance;
  return meta;
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { memoryId, newContent, agentId = "mcp-agent" } = body;

    if (!memoryId) return apiError("memoryId is required", 400);
    if (!newContent) return apiError("newContent is required", 400);

    const MAX_CONTENT_BYTES = 100_000;
    if (typeof newContent !== "string" || newContent.length > MAX_CONTENT_BYTES) {
      return apiError(`newContent exceeds maximum size of ${MAX_CONTENT_BYTES} bytes`, 400);
    }

    const startTime = Date.now();

    const existing = await safeQuery(
      `SELECT memory_id, content, metadata, previous_hash, created_at
       FROM agent_memory WHERE memory_id = $1 AND agent_id = $2`,
      [memoryId, agentId],
    );

    if (existing.rows.length === 0) {
      return apiError("Memory not found", 404);
    }

    const row = existing.rows[0];
    const prevHash = row.previous_hash ? String(row.previous_hash) : null;
    const createdAt = row.created_at;
    const newHash = computeHmacHash(newContent, normalizeMetadata(row.metadata), prevHash);

    await safeQuery(
      `UPDATE agent_memory
       SET content = $1, cryptographic_hash = $2, needs_verification = FALSE
       WHERE memory_id = $3 AND agent_id = $4`,
      [newContent, newHash, memoryId, agentId],
    );

    // Correcting a row changes its hash, so every later row must be re-sealed.
    const successors = await safeQuery(
      `SELECT memory_id, content, metadata FROM agent_memory
       WHERE agent_id = $1 AND (created_at > $2 OR (created_at = $2 AND memory_id > $3))
       ORDER BY created_at ASC, memory_id ASC`,
      [agentId, createdAt, memoryId],
    );

    let nextPrev = newHash;
    for (const successor of successors.rows) {
      const successorHash = computeHmacHash(
        String(successor.content ?? ""),
        normalizeMetadata(successor.metadata),
        nextPrev,
      );
      await safeQuery(
        `UPDATE agent_memory
         SET previous_hash = $1, cryptographic_hash = $2, needs_verification = FALSE
         WHERE memory_id = $3 AND agent_id = $4`,
        [nextPrev, successorHash, successor.memory_id, agentId],
      );
      nextPrev = successorHash;
    }

    await safeQuery(
      `INSERT INTO agent_audit (agent_id, action, memory_id, previous_hash, cryptographic_hash, details)
       VALUES ($1, 'correct', $2, $3, $4, $5)`,
      [
        agentId,
        memoryId,
        prevHash,
        newHash,
        JSON.stringify({
          old_content_preview: String(row.content ?? "").slice(0, 100),
          new_content_preview: newContent.slice(0, 100),
          resealed_successors: successors.rows.length,
        }),
      ],
    );

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_correct",
      memoryId,
      previousHash: (prevHash ?? "").slice(0, 20) + "...",
      newHash: newHash.slice(0, 20) + "...",
      latency: latency + "ms",
    }, "dynamic");
  } catch {
    return apiError("memory_correct failed - try again later", 500);
  }
}
