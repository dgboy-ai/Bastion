import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { createHmac, createHash, randomUUID } from "crypto";

function computeHmacHash(
  content: string, 
  metadata: Record<string, unknown>, 
  previousHash: string | null
): string {
  const secret = process.env.BASTION_HMAC_SECRET || "";
  // Match Python: json.dumps(metadata, sort_keys=True)
  const metaStr = Object.keys(metadata).length > 0
    ? JSON.stringify(metadata, Object.keys(metadata).sort())
    : "";
  const prev = previousHash || "";
  
  // Length-prefix each field (matches Python's to_bytes(4, 'big'))
  const contentBytes = Buffer.from(content, "utf8");
  const metaBytes = Buffer.from(metaStr, "utf8");
  const prevBytes = Buffer.from(prev, "utf8");
  
  const buf = Buffer.alloc(
    4 + contentBytes.length + 4 + metaBytes.length + 4 + prevBytes.length
  );
  
  let offset = 0;
  buf.writeUInt32BE(contentBytes.length, offset); offset += 4;
  contentBytes.copy(buf, offset); offset += contentBytes.length;
  buf.writeUInt32BE(metaBytes.length, offset); offset += 4;
  metaBytes.copy(buf, offset); offset += metaBytes.length;
  buf.writeUInt32BE(prevBytes.length, offset); offset += 4;
  prevBytes.copy(buf, offset);
  
  return createHmac("sha256", secret).update(buf).digest("hex");
}

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
    const previousHash = lastMem.rows[0]?.cryptographic_hash as string || "";

    // Generate new hash using HMAC to match Python exactly
    const memoryId = randomUUID();
    const cryptographicHash = computeHmacHash(content, {}, previousHash);

    // Get embedding
    const embeddingStr = await getEmbeddingString(content);

    // Insert with hash chain
    await safeQuery(
      `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, previous_hash, cryptographic_hash, trust_level, source_provenance, importance_score, crdb_region)
       VALUES ($1, $2, $3, $4, $5::vector(1024), $6, $7, 3, 'agent_direct', 0.5, 'aws-ap-south-1')`,
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
    // 1024-dim hash fallback (matches Python's _hash_fallback_embed)
    const digest = Array.from(text).reduce((acc, c, i) => 
      acc ^ (c.charCodeAt(0) * 31 + i), 0);
    const mock = Array.from({ length: 1024 }, (_, i) => 
      Math.sin(digest * 31 + i) * 0.1);
    // L2 normalize
    const norm = Math.sqrt(mock.reduce((s, v) => s + v * v, 0)) || 1;
    return `[${mock.map(v => v / norm).join(",")}]`;
  }
}
