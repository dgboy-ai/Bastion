import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import GraphContent from "./Content";

export const dynamic = "force-dynamic";

export default function GraphPage() {
  return (
    <DashboardLayoutWrapper>
      <GraphContent />
    </DashboardLayoutWrapper>
  );
}
