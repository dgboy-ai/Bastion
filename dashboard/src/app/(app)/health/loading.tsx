import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import NeoSkeleton from "@/components/NeoSkeleton";

export default function HealthLoading() {
  return (
    <DashboardLayoutWrapper>
      <div style={{ padding: "20px" }}>
        {/* Header Area */}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
           <NeoSkeleton style={{ height: "40px", width: "200px" }} />
           <div style={{ display: "flex", gap: "10px" }}>
              <NeoSkeleton style={{ height: "40px", width: "100px", borderRadius: "20px" }} />
              <NeoSkeleton style={{ height: "40px", width: "100px", borderRadius: "20px" }} />
           </div>
        </div>

        {/* Macro Telemetry Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
          {[...Array(4)].map((_, i) => (
            <NeoSkeleton key={i} style={{ height: "120px" }} />
          ))}
        </div>

        {/* List of blocks */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[...Array(5)].map((_, i) => (
            <NeoSkeleton key={i} style={{ height: "80px" }} />
          ))}
        </div>
      </div>
    </DashboardLayoutWrapper>
  );
}
