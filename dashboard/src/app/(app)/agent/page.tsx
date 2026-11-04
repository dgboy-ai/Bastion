import type { Metadata } from "next";
import { safeQuery, isMockMode } from "@/lib/db";
import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import AgentContent from "./Content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bastion — Agentic Memory Agent",
  description: "Watch an autonomous agent think, act, and remember — with cryptographic proof. Powered by CockroachDB and Groq.",
};

async function getStats() {
  if (isMockMode()) {
    return { memories: 0, auditLogs: 0, chainIntact: true, initialHashes: [] as { hash: string; prevHash: string; content: string; createdAt: string }[] };
  }
  try {
    const [memRes, auditRes, chainRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as cnt FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_audit"),
      safeQuery(
        `SELECT cryptographic_hash, previous_hash, content, created_at
         FROM agent_memory
         ORDER BY created_at DESC
         LIMIT 20`
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

    const initialHashes = rows.reverse().map((row) => ({
      hash: row.cryptographic_hash as string,
      prevHash: row.previous_hash as string,
      content: (row.content as string) || "",
      createdAt: row.created_at as string,
    }));

    return {
      memories: parseInt(String(memRes.rows[0]?.cnt ?? "0"), 10),
      auditLogs: parseInt(String(auditRes.rows[0]?.cnt ?? "0"), 10),
      chainIntact,
      initialHashes,
    };
  } catch {
    return { memories: 0, auditLogs: 0, chainIntact: true, initialHashes: [] };
  }
}

export default async function AgentPage() {
  const stats = await getStats();

  return (
    <DashboardLayoutWrapper>
      <AgentContent initialStats={stats} />
    </DashboardLayoutWrapper>
  );
}
