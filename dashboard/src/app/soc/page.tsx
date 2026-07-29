import SOCContent from "./Content";
import { safeQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SOCPage() {
  // Fetch initial stats — separate from playground
  const stats = { memories: 0, entities: 0, relations: 0, auditLogs: 0, regions: 0 };
  try {
    const [memRes, auditRes] = await Promise.all([
      safeQuery(`SELECT COUNT(*)::int AS cnt FROM agent_memory WHERE agent_id IN ('soc-analyst', 'soc-responder')`),
      safeQuery(`SELECT COUNT(*)::int AS cnt FROM agent_audit WHERE agent_id IN ('soc-analyst', 'soc-responder')`),
    ]);
    stats.memories = Number(memRes.rows[0]?.cnt ?? 0);
    stats.auditLogs = Number(auditRes.rows[0]?.cnt ?? 0);
  } catch {
    // Stats unavailable — page still works
  }

  return <SOCContent initialStats={stats} />;
}
