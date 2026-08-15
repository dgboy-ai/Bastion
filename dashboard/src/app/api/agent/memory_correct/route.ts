import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { computeHmacHash } from "@/lib/hash-chain";

export async function POST(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

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

    // Get the existing memory
    const existing = await safeQuery(
      "SELECT memory_id, content, cryptographic_hash FROM agent_memory WHERE memory_id = $1 AND agent_id = $2",
      [memoryId, agentId]
    );

    if (existing.rows.length === 0) {
      return apiError("Memory not found", 404);
    }

    const prevHash = existing.rows[0].cryptographic_hash as string;

    // Compute new hash chain entry
    const newHash = computeHmacHash(newContent, {}, prevHash);

    // Update the memory content and hash
    await safeQuery(
      "UPDATE agent_memory SET content = $1, cryptographic_hash = $2, previous_hash = $3 WHERE memory_id = $4 AND agent_id = $5",
      [newContent, newHash, prevHash, memoryId, agentId]
    );

    // Create audit entry
    await safeQuery(
      `INSERT INTO agent_audit (agent_id, action, memory_id, previous_hash, cryptographic_hash, details)
       VALUES ($1, 'correct', $2, $3, $4, $5)`,
      [agentId, memoryId, prevHash, newHash, JSON.stringify({
        old_content_preview: (existing.rows[0].content as string).slice(0, 100),
        new_content_preview: newContent.slice(0, 100),
      })]
    );

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_correct",
      memoryId,
      previousHash: prevHash.slice(0, 20) + "...",
      newHash: newHash.slice(0, 20) + "...",
      latency: latency + "ms",
    }, "dynamic");
  } catch (err) {
    return apiError("memory_correct failed: " + (err instanceof Error ? err.message : String(err)), 500);
  }
}
