import DashboardLayoutWrapper from "@/components/DashboardLayoutWrapper";
import NeoSkeleton from "@/components/NeoSkeleton";

export default function AgentLoading() {
  return (
    <DashboardLayoutWrapper>
      <div style={{ padding: "20px", display: "flex", gap: "24px", height: "calc(100vh - 80px)" }}>
        
        {/* Main Chat Area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Top Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <NeoSkeleton style={{ width: "24px", height: "24px", borderRadius: "4px" }} />
            <NeoSkeleton style={{ width: "160px", height: "32px", borderRadius: "4px" }} />
            <NeoSkeleton style={{ width: "80px", height: "24px", borderRadius: "12px" }} />
            <NeoSkeleton style={{ width: "120px", height: "24px", borderRadius: "12px" }} />
          </div>

          {/* Chat History Area */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* User message skeleton */}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <NeoSkeleton style={{ width: "40%", height: "60px", borderRadius: "12px", borderBottomRightRadius: "0px" }} />
            </div>
            
            {/* Assistant message skeleton */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "80%" }}>
              <NeoSkeleton style={{ width: "100%", height: "120px", borderRadius: "12px", borderBottomLeftRadius: "0px" }} />
              <NeoSkeleton style={{ width: "60%", height: "40px", borderRadius: "8px" }} />
            </div>
          </div>

          {/* Input Box Skeleton */}
          <NeoSkeleton style={{ width: "100%", height: "60px", borderRadius: "8px" }} />
        </div>

        {/* Right Sidebar */}
        <div style={{ width: "320px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Hash Chain Panel */}
          <NeoSkeleton style={{ width: "100%", height: "120px", borderRadius: "8px" }} />
          
          {/* Cluster Panel */}
          <NeoSkeleton style={{ width: "100%", height: "180px", borderRadius: "8px" }} />
          
          {/* AWS Services Panel */}
          <NeoSkeleton style={{ width: "100%", height: "160px", borderRadius: "8px" }} />
          
          {/* Activity Log Panel */}
          <NeoSkeleton style={{ width: "100%", height: "200px", borderRadius: "8px" }} />
        </div>

      </div>
    </DashboardLayoutWrapper>
  );
}
