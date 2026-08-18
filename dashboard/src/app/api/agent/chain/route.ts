import { safeQuery, isMockMode } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isMockMode()) {
    return NextResponse.json({ hashes: [], chainValid: true });
  }
  try {
    const result = await safeQuery(
      `SELECT memory_id, cryptographic_hash, previous_hash, content, created_at, importance_score
       FROM agent_memory
       ORDER BY created_at DESC
       LIMIT 20`
    );

    if (result.mock || result.rows.length === 0) {
      return NextResponse.json({ hashes: [], chainValid: true });
    }

    const rows = result.rows;
    // Verify chain integrity — array is [newest, ..., oldest] from ORDER BY created_at DESC
    // Each entry's previous_hash should match the cryptographic_hash of the next-older entry
    let chainValid = true;
    let brokenIndex = -1;
    for (let i = 0; i < rows.length - 1; i++) {
      const currentPrevHash = rows[i]?.previous_hash as string;
      const nextCryptHash = rows[i + 1]?.cryptographic_hash as string;
      if (currentPrevHash && nextCryptHash && currentPrevHash !== nextCryptHash) {
        chainValid = false;
        brokenIndex = i;
        break;
      }
    }

    // Return hashes oldest → newest (reversed from DB order)
    const hashes = rows.reverse().map((row) => ({
      hash: row.cryptographic_hash as string,
      prevHash: row.previous_hash as string,
      content: (row.content as string) || "",
      createdAt: row.created_at as string,
    }));

    return NextResponse.json({
      hashes,
      chainValid,
      brokenIndex,
      total: hashes.length,
    });
  } catch {
    return NextResponse.json({ hashes: [], chainValid: false });
  }
}
