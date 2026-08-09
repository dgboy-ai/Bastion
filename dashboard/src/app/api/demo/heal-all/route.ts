import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { embed, vecToString } from "@/lib/embeddings";
import { createHash, randomUUID } from "crypto";

const BASTION_REGION = process.env.BASTION_CRDB_REGION || "aws-ap-south-1";

export async function POST() {
  const startTime = Date.now();

  try {
    // ─── 1. FIND ALL AGENTS WITH UNHEALED POISONS ────────────
    const agentsRes = await safeQuery(
      `SELECT agent_id, COUNT(*)::int as poison_count
       FROM agent_memory
       WHERE memory_type = 'poison_attempt'
       GROUP BY agent_id`
    );

    if (agentsRes.rows.length === 0) {
      return apiSuccess({ healed: 0, message: "No poison memories found" });
    }

    let totalHealed = 0;
    const results: { agentId: string; healed: number; errors: string[] }[] = [];

    for (const agentRow of agentsRes.rows) {
      const agentId = agentRow.agent_id as string;
      const errors: string[] = [];

      // ─── 2. GET ALL POISONS FOR THIS AGENT ──────────────────
      const poisonsRes = await safeQuery(
        `SELECT memory_id, content::varchar(500) AS content, cryptographic_hash, previous_hash, created_at
         FROM agent_memory
         WHERE agent_id = $1 AND memory_type = 'poison_attempt'
         ORDER BY created_at ASC`,
        [agentId]
      );

      for (const poisonRow of poisonsRes.rows) {
        const poison = poisonRow as Record<string, unknown>;
        const poisonId = poison.memory_id;

        try {
          // ─── 3. TIME TRAVEL: GET CLEAN STATE ─────────────────
          const timeTravelRes = await safeQuery(
            `SELECT content::varchar(500) AS content, cryptographic_hash, trust_level
             FROM agent_memory AS OF SYSTEM TIME '-5s'
             WHERE agent_id = $1 AND memory_type != 'poison_attempt'
             ORDER BY created_at DESC LIMIT 1`,
            [agentId]
          );

          const hasData = timeTravelRes.rows.length > 0;
          const restoredContent = hasData
            ? timeTravelRes.rows[0].content as string
            : "Restored clean state (no pre-attack memories)";
          const restoredHash = hasData
            ? timeTravelRes.rows[0].cryptographic_hash as string
            : createHash("sha256").update("genesis-" + agentId).digest("hex");

          // ─── 4. DELETE POISON + INSERT HEALED ────────────────
          const newHash = createHash("sha256").update(restoredHash + "healed:" + agentId + Date.now()).digest("hex");
          const newId = randomUUID();

          let healEmbedding: number[];
          try {
            healEmbedding = await embed(restoredContent);
          } catch {
            const hash = createHash("sha256").update(restoredContent).digest("hex");
            healEmbedding = Array.from({ length: 384 }, (_, i) => parseInt(hash[i % hash.length], 16) / 15 * 2 - 1);
          }
          const embeddingStr = vecToString(healEmbedding.slice(0, 384));

          await safeQuery("DELETE FROM agent_memory WHERE memory_id = $1", [poisonId]);

          await safeQuery(
            `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, embedding_384, previous_hash, cryptographic_hash, trust_level, source_provenance, importance_score, crdb_region)
             VALUES ($1, $2, 'healed', $3, NULL::vector, $4::vector, $5, $6, 2, 'system_healed', 0.8, $7)`,
            [newId, agentId, restoredContent, embeddingStr, restoredHash, newHash, BASTION_REGION]
          );

          totalHealed++;
        } catch (err) {
          errors.push(`Failed to heal ${poisonId}: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      results.push({ agentId, healed: poisonsRes.rows.length - errors.length, errors });
    }

    const latency = Date.now() - startTime;
    return apiSuccess({
      healed: totalHealed,
      agents: results.length,
      latency,
      details: results,
    });
  } catch (err) {
    console.error("[HealAll] Error:", err);
    return apiError(err instanceof Error ? err.message : "Heal all failed", 500);
  }
}
