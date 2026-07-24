import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import FlightRecorderContent from "./Content";

export const dynamic = "force-dynamic";

export default function FlightRecorderPage() {
  return (
    <DashboardLayoutWrapper>
      <FlightRecorderContent />
    </DashboardLayoutWrapper>
  );
}
