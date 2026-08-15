import NeoSkeleton from "@/components/NeoSkeleton";

export default function DashboardLoading() {
  return (
    <div style={{ padding: "40px", minHeight: "100vh", background: "#f4f3ef", display: "flex", flexDirection: "column", gap: "20px" }}>
      <NeoSkeleton style={{ height: "60px", width: "100%", borderRadius: "12px" }} />
      <div style={{ display: "grid", gridTemplateColumns: "250px 1fr", gap: "20px", flex: 1 }}>
        <NeoSkeleton style={{ height: "100%", borderRadius: "12px" }} />
        <NeoSkeleton style={{ height: "100%", borderRadius: "12px" }} />
      </div>
    </div>
  );
}
