import type { Metadata } from "next";
import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import { safeQuery, isMockMode } from "@/lib/db";
import PlaygroundContent from "./Content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bastion — Live CockroachDB Demo",
  description: "Interactive demo running real SQL against CockroachDB: poison detection, time-travel recovery, and semantic vector search.",
};

async function getStats() {
  if (isMockMode()) {
    return { memories: 0, entities: 0, relations: 0, auditLogs: 0, regions: 0 };
  }
  try {
    const [memRes, entRes, relRes, auditRes] = await Promise.all([
      safeQuery("SELECT COUNT(*) as cnt FROM agent_memory"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_entities"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_relations"),
      safeQuery("SELECT COUNT(*) as cnt FROM agent_audit"),
    ]);
    return {
      memories: parseInt(String(memRes.rows[0]?.cnt ?? "0"), 10),
      entities: parseInt(String(entRes.rows[0]?.cnt ?? "0"), 10),
      relations: parseInt(String(relRes.rows[0]?.cnt ?? "0"), 10),
      auditLogs: parseInt(String(auditRes.rows[0]?.cnt ?? "0"), 10),
      regions: 1,
    };
  } catch {
    return { memories: 0, entities: 0, relations: 0, auditLogs: 0, regions: 0 };
  }
}

export default async function PlaygroundPage() {
  const stats = await getStats();

  return (
    <DashboardLayoutWrapper>
      <PlaygroundContent initialStats={stats} />
    </DashboardLayoutWrapper>
  );
}
