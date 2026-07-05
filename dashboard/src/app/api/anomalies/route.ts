import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET() {
  try {
    const alerts: any[] = [];
    
    // Check total memory size
    const countRes = await query("SELECT COUNT(*) as count FROM agent_memory");
    const total = parseInt(countRes.rows[0]?.count || "0", 10);
    
    if (total > 100) {
      alerts.push({
        id: "alert-size-spike",
        type: "size_spike",
        severity: "info",
        detail: `Cognitive load warning: Total memory count (${total}) exceeds 100 records. Recommend pruning or merging.`,
        timestamp: new Date().toISOString(),
      });
    }

    // Check duplicate content in recent 50 memories
    const recentRes = await query(
      "SELECT content, created_at FROM agent_memory ORDER BY created_at DESC LIMIT 50"
    );
    const contents = recentRes.rows.map((r) => r.content);
    const uniqueContents = new Set(contents);

    if (contents.length !== uniqueContents.size) {
      alerts.push({
        id: "alert-fact-turnover",
        type: "fact_turnover",
        severity: "medium",
        detail: "Memory turnover alert: Duplicate content detected in recent operations, indicating redundant reinforcement loops.",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ alerts });
  } catch (error: any) {
    console.error("Failed to detect anomalies:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
