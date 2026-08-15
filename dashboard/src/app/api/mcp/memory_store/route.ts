import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
import { randomUUID } from "crypto";
import { computeHmacHash } from "@/lib/hash-chain";
import { embedToVectorString } from "@/lib/embeddings";

/* ── OWASP ASI06 Guard (simplified) ─────────────────────── */
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /system\s*:\s*/i,
  /act\s+as\s+(a|an)\s+/i,
  /pretend\s+(you|that|to)\s+/i,
  /disregard\s+(all|any|the)\s+/i,
  /override\s+(your|the|all)\s+/i,
  /new\s+instructions?\s*:/i,
  /forget\s+(everything|all|the)\s+/i,
  /admin\s*mode\s*(on|enabled|activate)/i,
  /\bDAN\b.*\bmode\b/i,
  /jailbreak/i,
  /\b(hack|exploit|bypass)\b.*\b(system|security|guard)\b/i,
];

const SECRET_PATTERNS = [
  /(?:ghp|gho|ghu|ghs|ghr)[A-Za-z0-9]{36}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /sk-[A-Za-z0-9]{32,}/,
  /xox[bpas]-[A-Za-z0-9-]+/,
  /(?:password|passwd|pwd)\s*[:=]\s*\S+/i,
];

function guardCheck(content: string): { passed: boolean; reason?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return { passed: false, reason: `Prompt injection detected: ${pattern.source}` };
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return { passed: false, reason: `Secret/credential detected: ${pattern.source}` };
    }
  }
  return { passed: true };
}

export async function POST(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  try {
    const body = await request.json();
    const { content, agentId = "mcp-agent", memoryType = "fact" } = body;

    if (!content) return apiError("content is required", 400);

    const MAX_CONTENT_BYTES = 100_000;
    if (typeof content !== "string" || content.length > MAX_CONTENT_BYTES) {
      return apiError(`content exceeds maximum size of ${MAX_CONTENT_BYTES} bytes`, 400);
    }

    // Guard check — OWASP ASI06
    const guard = guardCheck(content);
    if (!guard.passed) {
      return apiError(`Guard blocked: ${guard.reason}`, 403);
    }

    const startTime = Date.now();

    // Get previous hash for chain integrity
    const lastMem = await safeQuery(
      "SELECT cryptographic_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1",
      [agentId]
    );
    const previousHash = lastMem.rows[0]?.cryptographic_hash as string || "";

    // Generate new hash using HMAC to match Python exactly. The INSERT below
    // omits the metadata column (stores NULL), so pass null here: Python reads
    // NULL back as None and computes hash with "" (not "{}").
    const memoryId = randomUUID();
    const cryptographicHash = computeHmacHash(content, null, previousHash);

    // Get embedding (real model, deterministic hash fallback)
    const embeddingStr = await embedToVectorString(content);

    // Insert with hash chain
    await safeQuery(
      `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, previous_hash, cryptographic_hash, trust_level, source_provenance, importance_score, crdb_region)
       VALUES ($1, $2, $3, $4, $5::vector(1024), $6, $7, 3, 'agent_direct', 0.5, 'aws-ap-south-1')`,
      [memoryId, agentId, memoryType, content, embeddingStr, previousHash, cryptographicHash]
    );

    // Audit log (matches agent_audit schema: audit_id, agent_id, workflow_id, action, details, recorded_at)
    await safeQuery(
      `INSERT INTO agent_audit (audit_id, agent_id, workflow_id, action, details, recorded_at)
       VALUES ($1, $2, $3, 'store', $4, now())`,
      [randomUUID(), agentId, randomUUID(), JSON.stringify({ memoryId, memoryType, contentPreview: content.slice(0, 100), previousHash, cryptographicHash })]
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
