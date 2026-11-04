import NeoSkeleton from "@/components/NeoSkeleton";

export default function SkillsLoading() {
  return (
    
      <div style={{ padding: "20px" }}>
        <NeoSkeleton style={{ height: "48px", width: "260px", marginBottom: "20px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
          {[...Array(6)].map((_, i) => (
            <NeoSkeleton key={i} style={{ height: "160px" }} />
          ))}
        </div>
      </div>
    
  );
}
