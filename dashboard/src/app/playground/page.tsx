import type { Metadata } from "next";
import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import PlaygroundContent from "./Content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bastion Playground — Agentic Memory Demos",
  description: "Interactive demos showing CockroachDB as an agentic memory layer: C-SPANN vector search, AS OF SYSTEM TIME recovery, hash chain integrity, and trust scoring.",
  openGraph: {
    title: "Bastion Playground — Agentic Memory Demos",
    description: "Interactive CockroachDB demos: vector search, time-travel recovery, hash chain integrity.",
  },
};

export default function PlaygroundPage() {
  return (
    <DashboardLayoutWrapper>
      <PlaygroundContent />
    </DashboardLayoutWrapper>
  );
}
