import type { Metadata } from "next";
import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import { safeQuery, isMockMode } from "@/lib/db";
import AgentContent from "./Content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bastion — Agentic Memory Agent",
  description: "Watch an autonomous agent think, act, and remember — with cryptographic proof. Powered by CockroachDB and Groq.",
};

async function getStats() {
  if (isMockMode()) {
    return { memories: 0, auditLogs: 0, chainIntact: true };
  }
  try {
    const [memRes, auditRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as cnt FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_audit"),
    ]);
    return {
      memories: parseInt(String(memRes.rows[0]?.cnt ?? "0"), 10),
      auditLogs: parseInt(String(auditRes.rows[0]?.cnt ?? "0"), 10),
      chainIntact: true,
    };
  } catch {
    return { memories: 0, auditLogs: 0, chainIntact: true };
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
