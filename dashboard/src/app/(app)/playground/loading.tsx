import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import NeoSkeleton from "@/components/NeoSkeleton";

export default function PlaygroundLoading() {
  return (
    <DashboardLayoutWrapper>
      <div style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
          {[...Array(4)].map((_, i) => (
            <NeoSkeleton key={i} style={{ height: "80px" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          <NeoSkeleton style={{ height: "400px" }} />
          <NeoSkeleton style={{ height: "400px" }} />
        </div>
      </div>
    </DashboardLayoutWrapper>
  );
}
