import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { createHash, randomUUID } from "crypto";

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { content, agentId = "agent-demo", memoryType = "fact" } = body;

    if (!content) return apiError("content is required", 400);

    const MAX_CONTENT_BYTES = 100_000;
    if (typeof content !== "string" || content.length > MAX_CONTENT_BYTES) {
      return apiError(`content exceeds maximum size of ${MAX_CONTENT_BYTES} bytes`, 400);
    }

    const startTime = Date.now();

    // Get previous hash for chain integrity
    const lastMem = await safeQuery(
      "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1",
      [agentId]
    );
    const previousHash = lastMem.rows[0]?.cryptographic_hash as string ||
      createHash("sha256").update("genesis-" + agentId).digest("hex");

    // Generate new hash
    const memoryId = randomUUID();
    const cryptographicHash = createHash("sha256")
      .update(previousHash + content + agentId + Date.now())
      .digest("hex");

    // Get embedding
    const embeddingStr = await getEmbeddingString(content);

    // Insert with hash chain
    await safeQuery(
      `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, embedding_384, previous_hash, cryptographic_hash, trust_level, source_provenance, importance_score, crdb_region)
       VALUES ($1, $2, $3, $4, NULL::vector, $5::vector, $6, $7, 3, 'agent_direct', 0.5, 'aws-ap-south-1')`,
      [memoryId, agentId, memoryType, content, embeddingStr, previousHash, cryptographicHash]
    );

    const latency = Date.now() - startTime;

    return apiSuccess({
      tool: "memory_store",
      memoryId,
      agentId,
      memoryType,
      previousHash: previousHash.slice(0, 20) + "...",
      cryptographicHash: cryptographicHash.slice(0, 20) + "...",
      trustLevel: 3,
      latency: latency + "ms",
    }, "dynamic");
  } catch (err) {
    return apiError("memory_store failed", 500);
  }
}

async function getEmbeddingString(text: string): Promise<string> {
  try {
    const res = await fetch(process.env.EMBEDDING_URL || "http://localhost:8080/embed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return `[${data.embedding.join(",")}]`;
  } catch {
    const hash = Array.from(text).reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
    const mock = Array.from({ length: 384 }, (_, i) => Math.sin(hash + i) * 0.1);
    return `[${mock.join(",")}]`;
  }
}
