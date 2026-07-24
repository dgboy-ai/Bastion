import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import HealthContent from "./Content";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  return (
    <DashboardLayoutWrapper>
      <HealthContent />
    </DashboardLayoutWrapper>
  );
}
