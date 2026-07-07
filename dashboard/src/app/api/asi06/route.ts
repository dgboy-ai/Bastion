import { NextResponse } from "next/server";
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
  return NextResponse.json(getMockReport());
}

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    const { content } = await request.json();
    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Missing 'content' field" }, { status: 400 });
    }
    const findings = scanContent(content);
    const isSafe = findings.filter(f => f.severity === "critical" || f.severity === "high").length === 0;
    return NextResponse.json({ content, isSafe, findings });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
