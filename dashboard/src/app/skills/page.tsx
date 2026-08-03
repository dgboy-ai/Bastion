import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import SkillsContent from "./Content";

export const dynamic = "force-dynamic";

export default function SkillsPage() {
  return (
    <DashboardLayoutWrapper>
      <SkillsContent />
    </DashboardLayoutWrapper>
  );
}
