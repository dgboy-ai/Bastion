import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import NeoSkeleton from "@/components/NeoSkeleton";

export default function FlightRecorderLoading() {
  return (
    <DashboardLayoutWrapper>
      <div style={{ padding: "20px" }}>
        {/* Header Skeleton */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px", alignItems: "center" }}>
          <NeoSkeleton style={{ height: "40px", width: "240px" }} />
          <NeoSkeleton style={{ height: "40px", width: "120px", borderRadius: "100px" }} />
        </div>
        
        {/* Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[...Array(4)].map((_, i) => (
            <NeoSkeleton key={i} style={{ height: "100px" }} />
          ))}
        </div>

        {/* Feed Skeleton */}
        <NeoSkeleton style={{ height: "400px" }} />
      </div>
    </DashboardLayoutWrapper>
  );
}
