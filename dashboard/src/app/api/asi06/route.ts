import { apiSuccess, apiError } from "@/lib/api-response";
import { safeQuery } from "@/lib/db";
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

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const totalChecksRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_audit"
    );
    // Count OWASP defended attacks from poison_attempt memories (actual blocked attacks)
    const blockedRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_memory WHERE memory_type = 'poison_attempt'"
    );
    // Count healed memories (attacks that were healed by the system)
    const healedRes = await safeQuery(
      "SELECT COUNT(*) as count FROM agent_memory WHERE memory_type = 'healed'"
    );
    const trustRes = await safeQuery(
      "SELECT AVG(importance_score) as avg_trust FROM agent_memory"
    );

    const recentRes = await safeQuery(
      `SELECT action, recorded_at, details
       FROM agent_audit
       WHERE action LIKE '%guard%' OR action LIKE '%block%' OR action LIKE '%security%' OR action LIKE '%inject%'
       ORDER BY recorded_at DESC
       LIMIT 10`
    );

    const totalChecks = parseInt(String(totalChecksRes.rows[0]?.count || "0"), 10);
    const blockedCount = parseInt(String(blockedRes.rows[0]?.count || "0"), 10);
    const healedCount = parseInt(String(healedRes.rows[0]?.count || "0"), 10);
    const avgTrust = parseFloat(String(trustRes.rows[0]?.avg_trust || "0.87"));
    const blockedPct = totalChecks > 0 ? Math.round((blockedCount / totalChecks) * 10000) / 100 : 0;

    const recentFindings = recentRes.rows.map((row: Record<string, unknown>) => ({
      detector: String(row.action || "unknown"),
      threatType: "ASI06: " + String(row.action || "Security Event"),
      severity: String(row.action).includes("block") ? "critical" : "medium",
      detail: typeof row.details === "object" ? JSON.stringify(row.details) : String(row.details || ""),
      confidence: 0.85,
      timestamp: row.recorded_at,
    }));

    return apiSuccess({
      summary: {
        totalChecks,
        blockedCount,
        healedCount,
        blockedPct,
        avgTrustScore: Math.round(avgTrust * 100) / 100,
        poisoningRiskDistribution: { NONE: totalChecks - blockedCount, LOW: 0, MEDIUM: 0, HIGH: blockedCount },
      },
      recentFindings: recentFindings.length > 0 ? recentFindings : [
        { detector: "system", threatType: "ASI06: System Active", severity: "info", detail: "Guard operational — no threats detected", confidence: 1.0, timestamp: new Date().toISOString() },
      ],
      checkEndpoint: "/api/asi06",
      mock: false,
    }, "short");
  } catch (error) {
    console.error("[api/asi06] Query failed:", error instanceof Error ? error.message : "Unknown error");
    return apiError("Query failed — try again later", 503, "DB_ERROR");
  }
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
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
    return apiSuccess({ content, isSafe, findings }, "short");
  } catch {
    return apiError("Invalid request body", 400);
  }
}
