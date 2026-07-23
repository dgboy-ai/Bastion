import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery, isMockMode } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";

const INJECTION_PATTERNS = [
  { pattern: "ignore all previous instructions", severity: "critical", label: "Prompt Injection" },
  { pattern: "system override", severity: "critical", label: "System Override" },
  { pattern: "admin override", severity: "critical", label: "Admin Override" },
  { pattern: "forget all previous", severity: "high", label: "Memory Wipe" },
  { pattern: "role-play as", severity: "medium", label: "Role-Play Injection" },
];

const SECRET_PATTERNS = [
  { pattern: /-----BEGIN\s+(RSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/, severity: "critical", label: "Private Key" },
  { pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/, severity: "critical", label: "GitHub Token" },
  { pattern: /(?:sk|pk|api)[-_]?[a-z0-9]{20,}/i, severity: "high", label: "API Key" },
];

function scanContent(content: string) {
  const findings: { detector: string; severity: string; detail: string }[] = [];

  for (const { pattern, severity, label } of INJECTION_PATTERNS) {
    if (content.toLowerCase().includes(pattern)) {
      findings.push({ detector: "prompt_injection", severity, detail: label });
    }
  }

  for (const { pattern, severity, label } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      findings.push({ detector: "secret_detection", severity, detail: label });
    }
  }

  return findings;
}

function getMockReport() {
  return {
    summary: {
      totalChecks: 28471,
      blockedCount: 187,
      blockedPct: 0.66,
      avgTrustScore: 0.87,
      poisoningRiskDistribution: { NONE: 26200, LOW: 1800, MEDIUM: 420, HIGH: 51 },
    },
    recentFindings: [
      { detector: "prompt_injection", threatType: "ASI06: Memory Poisoning", severity: "critical", detail: "Prompt injection: ignore previous instructions", confidence: 0.85, timestamp: new Date(Date.now() - 300000).toISOString() },
      { detector: "secret_detection", threatType: "ASI06: Secret Leakage", severity: "high", detail: "GitHub token: 1 match(es)", confidence: 0.90, timestamp: new Date(Date.now() - 1800000).toISOString() },
      { detector: "hash_chain", threatType: "ASI06: Tampered Memory", severity: "critical", detail: "Hash chain integrity violation", confidence: 1.0, timestamp: new Date(Date.now() - 7200000).toISOString() },
      { detector: "content_size", threatType: "ASI06: Size Anomaly", severity: "medium", detail: "Content length exceeds threshold", confidence: 0.95, timestamp: new Date(Date.now() - 14400000).toISOString() },
      { detector: "prompt_injection", threatType: "ASI06: Memory Poisoning", severity: "high", detail: "Memory wipe instruction", confidence: 0.85, timestamp: new Date(Date.now() - 28800000).toISOString() },
    ],
    checkEndpoint: "/api/asi06/check",
    mock: true,
  };
}

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  if (isMockMode()) {
    return apiSuccess(getMockReport(), 'short', { mock: true });
  }

  try {
    // Query real audit data for security events
    const totalChecksRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_audit"
    );
    const blockedRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_audit WHERE action LIKE '%block%' OR action LIKE '%security%'"
    );
    const trustRes = await safeQuery(
      "SELECT AVG(importance_score) as avg_trust FROM agent_memory"
    );

    // Get recent security-related audit entries
    const recentRes = await safeQuery(
      `SELECT action, recorded_at, details 
       FROM agent_audit 
       WHERE action LIKE '%guard%' OR action LIKE '%block%' OR action LIKE '%security%' OR action LIKE '%inject%'
       ORDER BY recorded_at DESC 
       LIMIT 10`
    );

    const totalChecks = parseInt(totalChecksRes.rows[0]?.count || "0", 10);
    const blockedCount = parseInt(blockedRes.rows[0]?.count || "0", 10);
    const avgTrust = parseFloat(trustRes.rows[0]?.avg_trust || "0.87");
    const blockedPct = totalChecks > 0 ? Math.round((blockedCount / totalChecks) * 10000) / 100 : 0;

    const recentFindings = recentRes.rows.map((row) => ({
      detector: row.action || "unknown",
      threatType: `ASI06: ${row.action || "Security Event"}`,
      severity: row.action?.includes("block") ? "critical" : "medium",
      detail: typeof row.details === "object" ? JSON.stringify(row.details) : String(row.details || ""),
      confidence: 0.85,
      timestamp: row.recorded_at,
    }));

    return apiSuccess({
      summary: {
        totalChecks,
        blockedCount,
        blockedPct,
        avgTrustScore: Math.round(avgTrust * 100) / 100,
        poisoningRiskDistribution: { NONE: totalChecks - blockedCount, LOW: 0, MEDIUM: 0, HIGH: blockedCount },
      },
      recentFindings: recentFindings.length > 0 ? recentFindings : [
        { detector: "system", threatType: "ASI06: System Active", severity: "info", detail: "Guard operational — no threats detected", confidence: 1.0, timestamp: new Date().toISOString() },
      ],
      checkEndpoint: "/api/asi06",
      mock: false,
    }, 'short');
  } catch (error) {
    console.error("[api/asi06] Query failed:", error);
    if (process.env.BASTION_MOCK === "true" || process.env.BASTION_MOCK === "1") {

      return apiSuccess(getMockReport(), "short", { mock: true });

    }

    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    // Limit request body size to 100KB to prevent DoS
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 100_000) {
      return apiError("Request body too large (max 100KB)", 413);
    }
    const { content } = await request.json();
    if (!content || typeof content !== "string") {
      return apiError("Missing 'content' field", 400);
    }
    if (content.length > 50_000) {
      return apiError("Content too large (max 50,000 characters)", 413);
    }
    const findings = scanContent(content);
    const isSafe = findings.filter(f => f.severity === "critical" || f.severity === "high").length === 0;
    return apiSuccess({ content, isSafe, findings }, 'short');
  } catch {
    return apiError("Invalid request body", 400);
  }
}
