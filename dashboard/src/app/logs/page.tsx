import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import { safeQuery, isMockMode } from "@/lib/db";
import LogsContent from "./Content";

export const dynamic = "force-dynamic";

async function getMemories() {
  if (isMockMode()) {
    return { memories: [], total: 0 };
  }
  try {
    const res = await safeQuery(
      "SELECT memory_id, agent_id, memory_type, content, metadata, previous_hash, cryptographic_hash, importance_score, created_at, expires_at, access_count FROM agent_memory ORDER BY created_at DESC LIMIT 100"
    );
    const memories = res.rows.map((row: Record<string, unknown>) => ({
      memoryId: row.memory_id as string,
      agentId: row.agent_id as string,
      memoryType: row.memory_type as string,
      content: row.content as string,
      metadata: (row.metadata as Record<string, unknown>) || {},
      previousHash: row.previous_hash as string,
      cryptographicHash: row.cryptographic_hash as string,
      importanceScore: (row.importance_score as number) ?? 5.0,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      accessCount: (row.access_count as number) ?? 0,
    }));
    return { memories, total: memories.length };
  } catch (err) {
    console.error("[LogsPage] Failed to fetch memories:", err instanceof Error ? err.message : err);
    return { memories: [], total: 0 };
  }
}

export default async function LogsPage() {
  const { memories, total } = await getMemories();

  return (
    <DashboardLayoutWrapper>
      <LogsContent initialMemories={memories} initialTotal={total} />
    </DashboardLayoutWrapper>
  );
}
