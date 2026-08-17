import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import ComplianceContent from "./Content";

export const dynamic = "force-dynamic";

export default function CompliancePage() {
  return (
    <DashboardLayoutWrapper>
      <ComplianceContent />
    </DashboardLayoutWrapper>
  );
}
