import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayoutWrapper>{children}</DashboardLayoutWrapper>;
}
