import { NextResponse } from "next/server";
import { safeQuery, isMockMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isMockMode()) {
    return NextResponse.json({ memories: 0, auditLogs: 0, chainIntact: true });
  }
  try {
    const [memRes, auditRes, chainRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as cnt FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_audit"),
      safeQuery(
        `SELECT cryptographic_hash, previous_hash
         FROM agent_memory
         ORDER BY created_at DESC
         LIMIT 5`
      ),
    ]);

    let chainIntact = true;
    const rows = chainRes.rows;
    // Array is [newest, ..., oldest] from ORDER BY created_at DESC
    // Each entry's previous_hash should match the cryptographic_hash of the next-older entry
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i]?.previous_hash && rows[i + 1]?.cryptographic_hash &&
          rows[i].previous_hash !== rows[i + 1].cryptographic_hash) {
        chainIntact = false;
        break;
      }
    }

    return NextResponse.json({
      memories: parseInt(String(memRes.rows[0]?.cnt ?? "0"), 10),
      auditLogs: parseInt(String(auditRes.rows[0]?.cnt ?? "0"), 10),
      chainIntact,
    });
  } catch {
    return NextResponse.json({ memories: 0, auditLogs: 0, chainIntact: false });
  }
}
