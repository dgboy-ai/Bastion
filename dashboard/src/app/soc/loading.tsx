import NeoSkeleton from "@/components/NeoSkeleton";

export default function SOCLoading() {
  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", padding: "32px 40px" }}>
      <NeoSkeleton style={{ height: "40px", width: "320px", marginBottom: "24px" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[...Array(4)].map((_, i) => (
          <NeoSkeleton key={i} style={{ height: "96px" }} />
        ))}
      </div>
      <NeoSkeleton style={{ height: "420px" }} />
    </div>
  );
}
