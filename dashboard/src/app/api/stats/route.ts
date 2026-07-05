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

    // Fetch dynamic averages grouped by 6-hour historical time intervals
    const curveRes = await query(`
      SELECT 
        AVG(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' AND created_at < NOW() - INTERVAL '18 hours' THEN importance_score END) as val_24,
        AVG(CASE WHEN created_at >= NOW() - INTERVAL '18 hours' AND created_at < NOW() - INTERVAL '12 hours' THEN importance_score END) as val_18,
        AVG(CASE WHEN created_at >= NOW() - INTERVAL '12 hours' AND created_at < NOW() - INTERVAL '6 hours' THEN importance_score END) as val_12,
        AVG(CASE WHEN created_at >= NOW() - INTERVAL '6 hours' THEN importance_score END) as val_6
      FROM agent_memory
    `);

    const recentAuditRes = await query(
      "SELECT audit_id, action, recorded_at, details FROM agent_audit ORDER BY recorded_at DESC LIMIT 10"
    );

    const val24 = parseFloat(curveRes.rows[0]?.val_24 || "8.5");
    const val18 = parseFloat(curveRes.rows[0]?.val_18 || "6.2");
    const val12 = parseFloat(curveRes.rows[0]?.val_12 || "3.8");
    const val6 = parseFloat(curveRes.rows[0]?.val_6 || "7.5");
    const valNow = parseFloat(avgImportanceRes.rows[0]?.avg || "5.0");

    return NextResponse.json({
      memories: parseInt(memoryCountRes.rows[0]?.count || "0", 10),
      entities: parseInt(entityCountRes.rows[0]?.count || "0", 10),
      relations: parseInt(relationCountRes.rows[0]?.count || "0", 10),
      auditLogs: parseInt(auditCountRes.rows[0]?.count || "0", 10),
      conflicts: parseInt(conflictCountRes.rows[0]?.count || "0", 10),
      avgImportance: valNow.toFixed(2),
      decayCurve: [
        { label: "24h ago", value: val24 },
        { label: "18h ago", value: val18 },
        { label: "12h ago", value: val12 },
        { label: "6h ago", value: val6 },
        { label: "Now", value: valNow }
      ],
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
