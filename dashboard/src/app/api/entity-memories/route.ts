import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const entityId = searchParams.get("entity_id");

    if (!entityId) {
      return NextResponse.json({ error: "Missing entity_id parameter" }, { status: 400 });
    }

    // Query memories that generated relations connected to this entity
    const memoriesRes = await query(
      `SELECT DISTINCT m.memory_id, m.content, m.cryptographic_hash, m.previous_hash, m.created_at, m.importance_score
       FROM agent_memory m
       JOIN agent_relations r ON r.source_memory_id = m.memory_id
       WHERE r.source_entity_id = $1 OR r.target_entity_id = $1
       ORDER BY m.created_at DESC`,
      [entityId]
    );

    const memories = memoriesRes.rows.map((row) => ({
      memoryId: row.memory_id,
      content: row.content,
      cryptographicHash: row.cryptographic_hash,
      previousHash: row.previous_hash,
      createdAt: row.created_at,
      importanceScore: row.importance_score ?? 5.0,
    }));

    return NextResponse.json({ memories });
  } catch (error: unknown) {
    console.error("Failed to fetch entity memories:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
