import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const memoryCountRes = await query("SELECT COUNT(*) as count FROM agent_memory");
    const entityCountRes = await query("SELECT COUNT(*) as count FROM agent_entities");
    const relationCountRes = await query("SELECT COUNT(*) as count FROM agent_relations");
    const auditCountRes = await query("SELECT COUNT(*) as count FROM agent_audit");
    const conflictCountRes = await query("SELECT COUNT(*) as count FROM agent_coordination");
    const avgImportanceRes = await query("SELECT AVG(importance_score) as avg FROM agent_memory");

    const recentAuditRes = await query(
      "SELECT audit_id, action, recorded_at, details FROM agent_audit ORDER BY recorded_at DESC LIMIT 5"
    );

    return NextResponse.json({
      memories: parseInt(memoryCountRes.rows[0]?.count || "0", 10),
      entities: parseInt(entityCountRes.rows[0]?.count || "0", 10),
      relations: parseInt(relationCountRes.rows[0]?.count || "0", 10),
      auditLogs: parseInt(auditCountRes.rows[0]?.count || "0", 10),
      conflicts: parseInt(conflictCountRes.rows[0]?.count || "0", 10),
      avgImportance: parseFloat(avgImportanceRes.rows[0]?.avg || "0").toFixed(2),
      recentAudits: recentAuditRes.rows.map((row) => ({
        id: row.audit_id,
        action: row.action,
        recordedAt: row.recorded_at,
        details: row.details || {},
      })),
    });
  } catch (error: any) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
