import type { Metadata } from "next";
import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import PlaygroundContent from "./Content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bastion — Live CockroachDB Demo",
  description: "Interactive demo running real SQL against CockroachDB: poison detection, time-travel recovery, and semantic vector search.",
  openGraph: {
    title: "Bastion — Live CockroachDB Demo",
    description: "Interactive CockroachDB demo: poison detection, time-travel recovery, vector search.",
  },
};

export default function PlaygroundPage() {
  return (
    <DashboardLayoutWrapper>
      <PlaygroundContent />
    </DashboardLayoutWrapper>
  );
}
