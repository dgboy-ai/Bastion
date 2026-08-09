import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import { safeQuery, isMockMode } from "@/lib/db";
import LogsContent from "./Content";

export const dynamic = "force-dynamic";

async function getMemories() {
  if (isMockMode()) {
    return { memories: [], total: 0 };
  }
  try {
    const [memoriesRes, statsRes] = await Promise.all([
      safeQuery(
        "SELECT memory_id, agent_id, memory_type, content, metadata, previous_hash, cryptographic_hash, importance_score, trust_level, created_at, expires_at, access_count FROM agent_memory ORDER BY created_at DESC LIMIT 100"
      ),
      safeQuery(
        "SELECT COUNT(*)::int as total, COUNT(CASE WHEN memory_type = 'poison_attempt' THEN 1 END) as poisoned, COUNT(CASE WHEN memory_type = 'healed' THEN 1 END) as healed FROM agent_memory"
      ),
    ]);
    const memories = memoriesRes.rows.map((row: Record<string, unknown>) => ({
      memoryId: row.memory_id as string,
      agentId: row.agent_id as string,
      memoryType: row.memory_type as string,
      content: row.content as string,
      metadata: (row.metadata as Record<string, unknown>) || {},
      previousHash: row.previous_hash as string,
      cryptographicHash: row.cryptographic_hash as string,
      importanceScore: (row.importance_score as number) ?? 5.0,
      trustLevel: (row.trust_level as number) ?? null,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      accessCount: (row.access_count as number) ?? 0,
    }));
    const stats = statsRes.rows[0] || {};
    return {
      memories,
      total: memories.length,
      totalCount: (stats.total as number) ?? memories.length,
      poisonedCount: (stats.poisoned as number) ?? 0,
      healedCount: (stats.healed as number) ?? 0,
    };
  } catch (err) {
    console.error("[LogsPage] Failed to fetch memories:", err instanceof Error ? err.message : err);
    return { memories: [], total: 0, totalCount: 0, poisonedCount: 0, healedCount: 0 };
  }
}

export default async function LogsPage() {
  const { memories, total, totalCount, poisonedCount, healedCount } = await getMemories();

  return (
    <DashboardLayoutWrapper>
      <LogsContent initialMemories={memories} initialTotal={total} totalCount={totalCount} poisonedCount={poisonedCount} healedCount={healedCount} />
    </DashboardLayoutWrapper>
  );
}
