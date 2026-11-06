import { safeQuery, isMockMode } from "@/lib/db";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { computeHmacHash } from "@/lib/hash-chain";

export const dynamic = "force-dynamic";

function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return NextResponse.json({ hashes: [], chainValid: true });
  }
  try {
    const result = await safeQuery(
      `SELECT memory_id, cryptographic_hash, previous_hash, content, metadata, created_at, importance_score
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
    // Recompute each HMAC (not just the prev-hash links) so a forged row with
    // a self-consistent link cannot appear valid.
    const hashesNewestFirst = rows.map((row) => {
      const content = String(row.content ?? "");
      const previousHash = row.previous_hash ? String(row.previous_hash) : null;
      const expected = computeHmacHash(content, parseMetadata(row.metadata), previousHash);
      const verified = expected === String(row.cryptographic_hash ?? "");
      if (!verified) {
        chainValid = false;
        if (brokenIndex === -1) brokenIndex = rows.indexOf(row);
      }
      return {
        memoryId: row.memory_id as string,
        hash: row.cryptographic_hash as string,
        prevHash: row.previous_hash as string,
        content,
        createdAt: row.created_at as string,
        importanceScore: row.importance_score,
        verified,
      };
    });

    const hashes = hashesNewestFirst.reverse();

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
