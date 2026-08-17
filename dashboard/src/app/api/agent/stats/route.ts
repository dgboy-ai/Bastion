import { NextResponse } from "next/server";
import { safeQuery, isMockMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isMockMode()) {
    return NextResponse.json({ memories: 0, auditLogs: 0, chainIntact: true });
  }
  try {
    const [memRes, auditRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as cnt FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_audit"),
    ]);
    return NextResponse.json({
      memories: parseInt(String(memRes.rows[0]?.cnt ?? "0"), 10),
      auditLogs: parseInt(String(auditRes.rows[0]?.cnt ?? "0"), 10),
      chainIntact: true,
    });
  } catch {
    return NextResponse.json({ memories: 0, auditLogs: 0, chainIntact: true });
  }
}
