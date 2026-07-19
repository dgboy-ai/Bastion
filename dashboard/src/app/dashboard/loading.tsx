export default function DashboardLoading() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", padding: "32px" }}>
      {/* Skeleton KPI cards */}
      <div className="metrics-kpi-grid">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="kpi-card">
            <div className="skeleton" style={{ width: "60px", height: "12px" }} />
            <div className="skeleton" style={{ width: "80px", height: "32px" }} />
          </div>
        ))}
      </div>
      {/* Skeleton panels */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "24px" }}>
        <div className="skeleton" style={{ height: "300px", borderRadius: "16px" }} />
        <div className="skeleton" style={{ height: "300px", borderRadius: "16px" }} />
      </div>
    </div>
  );
}
