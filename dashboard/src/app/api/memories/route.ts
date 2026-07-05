import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    let sql = `
      SELECT memory_id, agent_id, memory_type, content, metadata, previous_hash, cryptographic_hash, importance_score, created_at, expires_at, access_count
      FROM agent_memory
    `;
    let params: any[] = [];

    if (search) {
      sql += " WHERE content ILIKE $1 OR memory_type ILIKE $1";
      params.push(`%${search}%`);
    }

    sql += " ORDER BY created_at DESC LIMIT 100";

    const res = await query(sql, params);

    const memories = res.rows.map((row) => ({
      memoryId: row.memory_id,
      agentId: row.agent_id,
      memoryType: row.memory_type,
      content: row.content,
      metadata: row.metadata || {},
      previousHash: row.previous_hash,
      cryptographicHash: row.cryptographic_hash,
      importanceScore: row.importance_score ?? 5.0,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      accessCount: row.access_count ?? 0,
    }));

    return NextResponse.json({ memories });
  } catch (error: any) {
    console.error("Failed to fetch memories:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
