export function getMockMemories() {
  return Array.from({ length: 20 }, (_, i) => ({
    memoryId: `mock-mem-${i + 1}`,
    agentId: `agent-${(i % 3) + 1}`,
    memoryType: i % 2 === 0 ? "fact" : "conversation",
    content: [
      "User prefers Python for data science tasks",
      "Deployment pipeline configured for staging environment",
      "Customer reported API latency issues in us-east-1",
      "Team decided to use CockroachDB Serverless for production",
      "Schema migration v3 applied successfully",
      "Agent memory retention policy set to 90 days",
      "AWS KMS encrypted memory storage configured for sensitive records",
      "C-SPANN vector index created on agent_memory table",
      "CDC changefeed enabled for real-time audit streaming",
      "Multi-agent coordination tested with CRDT merge semantics",
      "Hash chain integrity verified — no tampering detected",
      "EU AI Act Article 12 compliance report generated",
      "Memory drift detection baseline established",
      "Trust scoring model calibrated for production",
      "A2A protocol handshake validated between agent-1 and agent-2",
      "MCP server health check passed — 6 tools registered",
      "Saga transaction rolled back after timeout on node failure",
      "Circuit breaker tripped on HuggingFace API — recovering",
      "Namespace isolation verified — agent-3 cannot see agent-1 data",
      "Connection pool statistics: 4 active / 10 max connections",
    ][i % 20],
    metadata: { source: "system", confidence: 0.95 - i * 0.02 },
    previousHash: i === 0 ? null : `${(i).toString(16).padStart(68, "0")}`,
    cryptographicHash: `${(i + 1).toString(16).padStart(68, "0")}`,
    importanceScore: Math.round((5 + Math.random() * 5) * 10) / 10,
    createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    expiresAt: i % 5 === 0 ? null : new Date(Date.now() + 86400000 * 30).toISOString(),
    accessCount: Math.floor(Math.random() * 100),
  }));
}

export function getMockStats() {
  return {
    memories: 969,
    entities: 16,
    relations: 8,
    auditLogs: 8923,
    conflicts: 3,
    avgImportance: "5.04",
    decayCurve: [
      { label: "24h ago", value: 4.5 },
      { label: "18h ago", value: 6.2 },
      { label: "12h ago", value: 3.8 },
      { label: "6h ago", value: 7.5 },
      { label: "Now", value: 5.04 },
    ],
    hourlyGrowth: [35, 60, 45, 80, 50, 95, 75, 100],
    topRecalls: [
      { rank: 1, text: "User prefers Python over TypeScript for AI pipelines", count: 50 },
      { rank: 2, text: "Always verify cryptographic signatures before accepting messages", count: 39 },
      { rank: 3, text: "CockroachDB multi-region follower reads enabled in us-east-1", count: 31 },
    ],
    cacheHitPct: "84.6",
    recentAudits: [
      { id: "a1", action: "memory_store", recordedAt: new Date(Date.now() - 1000).toISOString(), details: { content_preview: "[LTM] Stored Agent Memory: MCP tool ltm_store_analysis initialized" } },
      { id: "a2", action: "dream_consolidation", recordedAt: new Date(Date.now() - 5000).toISOString(), details: { content_preview: "Background consolidation sweep merged 4 entity duplicates" } },
      { id: "a3", action: "hash_seal", recordedAt: new Date(Date.now() - 12000).toISOString(), details: { content_preview: "Merkle hash chain block #9410 sealed on CockroachDB" } },
      { id: "a4", action: "guard_scan_passed", recordedAt: new Date(Date.now() - 25000).toISOString(), details: { content_preview: "ASI06 MemoryGuard scanned 12 incoming vectors — 0 threats" } },
      { id: "a5", action: "memory_search", recordedAt: new Date(Date.now() - 40000).toISOString(), details: { content_preview: "Hybrid Vector Search query: 'CockroachDB connection pooling'" } },
    ],
    mock: true,
  };
}

export function getMockAnomalies() {
  return {
    alerts: [
      {
        type: "hash_chain_break",
        severity: "high",
        message: "Memory hash chain integrity violation detected — potential tampering",
        timestamp: new Date(Date.now() - 300000).toISOString(),
        memoryId: "mem-0042",
        agentId: "agent-2",
      },
      {
        type: "fact_turnover",
        severity: "medium",
        message: "Entity 'deployment-config' updated 12 times in 1 hour — possible drift",
        timestamp: new Date(Date.now() - 1800000).toISOString(),
        agentId: "agent-1",
      },
      {
        type: "memory_poisoning",
        severity: "critical",
        message: "Prompt injection payload detected in memory content — blocked by MemoryGuard",
        timestamp: new Date(Date.now() - 7200000).toISOString(),
        memoryId: "mem-0089",
        agentId: "agent-3",
      },
      {
        type: "size_spike",
        severity: "low",
        message: "Memory size exceeded 3σ threshold — possible data quality issue",
        timestamp: new Date(Date.now() - 14400000).toISOString(),
        agentId: "agent-1",
      },
      {
        type: "trust_degradation",
        severity: "medium",
        message: "Trust score dropped below 0.6 for agent-2 — manual review recommended",
        timestamp: new Date(Date.now() - 28800000).toISOString(),
        agentId: "agent-2",
      },
    ],
    mock: true,
  };
}

export function getMockGraph() {
  return {
    nodes: [
      { id: "ent-001", name: "production-db", type: "infrastructure" },
      { id: "ent-002", name: "embedding-service", type: "service" },
      { id: "ent-003", name: "deploy-pipeline", type: "workflow" },
      { id: "ent-004", name: "memory-store", type: "component" },
      { id: "ent-005", name: "auth-service", type: "service" },
    ],
    links: [
      { source: "production-db", target: "memory-store", relation: "depends_on", confidence: 0.95 },
      { source: "deploy-pipeline", target: "production-db", relation: "deploys_to", confidence: 0.90 },
      { source: "embedding-service", target: "memory-store", relation: "embeds_for", confidence: 0.85 },
      { source: "auth-service", target: "production-db", relation: "reads_from", confidence: 0.92 },
      { source: "deploy-pipeline", target: "auth-service", relation: "configures", confidence: 0.78 },
    ],
    mock: true,
  };
}

export function getMockDrift() {
  return {
    latest: {
      overall_drift_score: 0.23,
      status: "HEALTHY",
      dimensions: {
        memory_access_pattern: 0.12,
        semantic_similarity: 0.08,
        retrieval_to_store_ratio: 0.31,
        conflict_resolution_rate: 0.05,
        hash_chain_gap_ratio: 0.15,
        namespace_isolation: 0.0,
      },
      top_drift_signals: ["retrieval_to_store_ratio"],
      baseline_sessions: 847,
      alert_threshold: 0.3,
      recommendation: "Monitor retrieval patterns — slight upward trend detected.",
      timestamp: new Date().toISOString(),
    },
    timeSeries: Array.from({ length: 30 }, (_, i) => ({
      timestamp: new Date(Date.now() - i * 86400000).toISOString(),
      overall_score: Math.round((0.15 + Math.random() * 0.25) * 100) / 100,
    })),
    mock: true,
  };
}

export function getMockCompliance() {
  return {
    reportId: `mock-report-${Date.now()}`,
    agentId: "bastion-system",
    status: "COMPLIANT",
    generatedAt: new Date().toISOString(),
    article12: {
      humanOversight: true,
      auditTrailEnabled: true,
      tamperEvidentLogging: true,
      pointInTimeSnapshots: true,
      dataRetentionPolicy: "90d",
    },
    recentAuditTrail: Array.from({ length: 10 }, (_, i) => ({
      action: ["memory_store", "memory_search", "conflict_resolve", "entity_create", "graph_query"][i % 5],
      agentId: `agent-${(i % 3) + 1}`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString(),
      details: { memoryType: "fact", status: "success" },
    })),
    mock: true,
  };
}

export function getMockTrust() {
  return {
    summary: {
      totalMemories: 1247,
      avgTrustScore: 0.87,
      trustLevelDistribution: { 0: 75, 1: 180, 2: 320, 3: 450, 4: 222 },
      highTrust: 892,
      mediumTrust: 298,
      lowTrust: 57,
    },
    alerts: [
      { severity: "warning", message: "3 memories have unverified provenance", count: 3 },
      { severity: "info", message: "Trust scoring model v2.1 running", count: 1 },
    ],
    memories: Array.from({ length: 10 }, (_, i) => ({
      memoryId: `mock-mem-${i + 1}`,
      trustScore: Math.round((0.65 + Math.random() * 0.35) * 100) / 100,
      provenance: i < 7 ? "verified" : "unverified",
      content: `Sample memory content ${i + 1}`,
      createdAt: new Date(Date.now() - i * 3600000).toISOString(),
    })),
    mock: true,
  };
}

export function getMockCacheStats() {
  return {
    summary: {
      totalQueries: 28471,
      cacheHits: 19362,
      cacheMisses: 9109,
      hitRate: 0.68,
      estimatedTokensSaved: 1458200,
      estimatedCostSaved: 2.92,
    },
    projections: {
      monthlyTokens: 6200000,
      monthlyCost: 12.40,
    },
    hourlyBreakdown: Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      hits: Math.floor(Math.random() * 80 + 10),
      misses: Math.floor(Math.random() * 30 + 5),
    })),
    competitorComparison: [
      { name: "Bastion", costPer10KQueries: 0.42, cacheHitRate: 0.68 },
      { name: "Mem0", costPer10KQueries: 1.80, cacheHitRate: 0.45 },
      { name: "Zep", costPer10KQueries: 2.40, cacheHitRate: 0.38 },
      { name: "Letta", costPer10KQueries: 3.10, cacheHitRate: 0.32 },
    ],
    mock: true,
  };
}