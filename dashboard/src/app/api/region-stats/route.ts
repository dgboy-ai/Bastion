import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

function getMockRegionStats() {
  return {
    regions: [
      { region: "us-east1", label: "US East (Virginia)", memories: 1247, latency_ms: 12, status: "healthy", utilization: 0.72 },
      { region: "us-west1", label: "US West (Oregon)", memories: 893, latency_ms: 18, status: "healthy", utilization: 0.58 },
      { region: "eu-west1", label: "EU West (Ireland)", memories: 634, latency_ms: 24, status: "healthy", utilization: 0.45 },
      { region: "eu-central1", label: "EU Central (Frankfurt)", memories: 421, latency_ms: 28, status: "healthy", utilization: 0.38 },
      { region: "ap-south1", label: "AP South (Mumbai)", memories: 312, latency_ms: 35, status: "healthy", utilization: 0.31 },
      { region: "ap-northeast1", label: "AP NE (Tokyo)", memories: 198, latency_ms: 42, status: "healthy", utilization: 0.24 },
    ],
    total_memories: 3705,
    cross_region_syncs: 142,
    avg_global_latency_ms: 26,
    compliance: {
      soc2: ["us-east1", "us-west1", "eu-west1"],
      hipaa: ["us-east1", "eu-west1"],
      gdpr: ["eu-west1", "eu-central1"],
      pdpa: ["ap-south1", "ap-northeast1"],
    },
  };
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return apiSuccess(getMockRegionStats(), "short", { mock: true });
  }

  try {
    const regionSql = `
      SELECT
        crdb_region as region,
        COUNT(*) as memories,
        AVG(EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::int as avg_latency_ms
      FROM agent_memory
      GROUP BY crdb_region
      ORDER BY memories DESC
    `;
    const regionResult = await safeQuery(regionSql);
    if (regionResult.mock) {
      return apiSuccess(getMockRegionStats(), "short", { mock: true });
    }

    const regionLabels: Record<string, string> = {
      "us-east1": "US East (Virginia)",
      "us-west1": "US West (Oregon)",
      "eu-west1": "EU West (Ireland)",
      "eu-central1": "EU Central (Frankfurt)",
      "ap-south1": "AP South (Mumbai)",
      "ap-northeast1": "AP NE (Tokyo)",
    };

    const regions = regionResult.rows.map((row) => ({
      region: row.region,
      label: regionLabels[row.region] ?? row.region,
      memories: parseInt(row.memories ?? "0"),
      latency_ms: parseInt(row.avg_latency_ms ?? "25"),
      status: "healthy" as const,
      utilization: Math.min(1, parseInt(row.memories ?? "0") / 2000),
    }));

    const totalMemories = regions.reduce((sum, r) => sum + r.memories, 0);
    const avgLatency = regions.length > 0
      ? Math.round(regions.reduce((sum, r) => sum + r.latency_ms, 0) / regions.length)
      : 26;

    return apiSuccess({
      regions,
      total_memories: totalMemories,
      cross_region_syncs: 0,
      avg_global_latency_ms: avgLatency,
      compliance: {
        soc2: regions.filter((r) => r.region.startsWith("us") || r.region === "eu-west1").map((r) => r.region),
        hipaa: regions.filter((r) => r.region === "us-east1" || r.region === "eu-west1").map((r) => r.region),
        gdpr: regions.filter((r) => r.region.startsWith("eu")).map((r) => r.region),
        pdpa: regions.filter((r) => r.region.startsWith("ap")).map((r) => r.region),
      },
    }, "short");
  } catch (error) {
    console.error("[api/region-stats] Query failed:", error);
    // Fall back to mock data instead of returning 503
    return apiSuccess(getMockRegionStats(), "short", { mock: true, fallback: true });
  }
}

