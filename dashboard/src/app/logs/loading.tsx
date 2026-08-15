import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";

export default function LogsLoading() {
  return (
    <DashboardLayoutWrapper>
      <div style={{ padding: "20px" }}>
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center" }}>
          <div style={{ height: "40px", width: "200px", background: "#e5e7eb", borderRadius: "8px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
          <div style={{ height: "40px", width: "120px", background: "#e5e7eb", borderRadius: "8px", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 480px", gap: "20px" }}>
          {/* Timeline Skeleton */}
          <div style={{ height: "600px", background: "#e5e7eb", borderRadius: "8px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
          {/* Detail Panel Skeleton */}
          <div style={{ height: "600px", background: "#e5e7eb", borderRadius: "8px", border: "2.5px solid #000000", boxShadow: "3px 3px 0px #000000", animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" }} />
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }`}</style>
    </DashboardLayoutWrapper>
  );
}
