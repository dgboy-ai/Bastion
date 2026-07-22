import { safeQuery, isMockMode } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return apiSuccess({
      scan: { total: 965, types: { fact: 883, preference: 34, instruction: 26 }, agentCount: 3 },
      dedup: { duplicates: 12, similarityPairs: [{ a: "User prefers Python", b: "User likes Python", score: 0.92 }, { a: "CockroachDB uses Raft", b: "CRDB uses Raft consensus", score: 0.87 }] },
      conflicts: { detected: 3, resolved: 3 },
      seal: { latestBlock: "#965", chainIntact: true, totalAudits: 1247 },
    });
  }

  try {
    // Stage 1: Scan — memory type distribution and counts
    const memoryCountRes = await safeQuery("SELECT COUNT(*) as count FROM agent_memory");
    const typeDistRes = await safeQuery(
      "SELECT memory_type, COUNT(*) as count FROM agent_memory GROUP BY memory_type ORDER BY count DESC LIMIT 5"
    );
    const agentCountRes = await safeQuery("SELECT COUNT(DISTINCT agent_id) as count FROM agent_memory");
    const recentCountRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_memory WHERE created_at >= NOW() - INTERVAL '1 hour'"
    );

    // Stage 2: Dedup — find near-duplicate content pairs
    const dupeRes = await safeQuery(`
      SELECT a.content as content_a, b.content as content_b, a.memory_id as id_a, b.memory_id as id_b
      FROM agent_memory a
      JOIN agent_memory b ON a.memory_id < b.memory_id
        AND a.agent_id = b.agent_id
        AND a.content = b.content
      LIMIT 5
    `);

    // Stage 3: Conflicts — contradiction detection from audit trail
    const conflictRes = await safeQuery(`
      SELECT COUNT(*) as count FROM agent_audit
      WHERE action IN ('contradiction_detected', 'memory_corrected', 'conflict_resolved')
    `);
    const recentConflictsRes = await safeQuery(`
      SELECT details FROM agent_audit
      WHERE action IN ('contradiction_detected', 'conflict_resolved')
      ORDER BY recorded_at DESC LIMIT 3
    `);

    // Stage 4: Seal — latest audit entries showing hash chain
    const sealRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_audit"
    );
    const latestAuditRes = await safeQuery(
      "SELECT action, recorded_at FROM agent_audit ORDER BY recorded_at DESC LIMIT 5"
    );
    const hashCheckRes = await safeQuery(`
      SELECT COUNT(*) as total,
        COUNT(CASE WHEN details->>'chain_valid' = 'true' THEN 1 END) as valid
      FROM agent_audit WHERE action = 'hash_chain_verify'
    `);

    return apiSuccess({
      scan: {
        total: parseInt(memoryCountRes.rows[0]?.count || "0", 10),
        types: Object.fromEntries(typeDistRes.rows.map((r) => [r.memory_type, parseInt(r.count, 10)])),
        agentCount: parseInt(agentCountRes.rows[0]?.count || "0", 10),
        recentHour: parseInt(recentCountRes.rows[0]?.count || "0", 10),
      },
      dedup: {
        duplicates: dupeRes.rows.length,
        pairs: dupeRes.rows.map((r) => ({ a: r.content_a?.substring(0, 60), b: r.content_b?.substring(0, 60) })),
      },
      conflicts: {
        detected: parseInt(conflictRes.rows[0]?.count || "0", 10),
        recent: recentConflictsRes.rows.map((r) => r.details),
      },
      seal: {
        totalAudits: parseInt(sealRes.rows[0]?.count || "0", 10),
        latest: latestAuditRes.rows.map((r) => ({ action: r.action, at: r.recorded_at })),
        chainValid: parseInt(hashCheckRes.rows[0]?.valid || "0", 10),
        chainTotal: parseInt(hashCheckRes.rows[0]?.total || "0", 10),
      },
    });
  } catch (error) {
    console.error("[api/consolidation] Query failed:", error);
    return apiSuccess({
      memories_reviewed: 47,
      memories_consolidated: 12,
      memories_promoted: 5,
      memories_pruned: 8,
      hash_chain: { chainValid: 1, chainTotal: 10 },
    }, "short", { mock: true, fallback: true });
  }
}

