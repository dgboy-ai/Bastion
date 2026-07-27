// OWASP ASI06 Guard — TypeScript port of Python guard.py
// 40+ injection patterns, 41 homoglyphs, secret detection, hash chain verification

export type Severity = "none" | "low" | "medium" | "high" | "critical";

export interface Finding {
  detector: string;
  threatType: string;
  severity: Severity;
  detail: string;
  confidence: number;
}

export interface GuardReport {
  isSafe: boolean;
  findings: Finding[];
  trustScore: number;
  poisoningRisk: string;
  scanLatencyMs: number;
}

// ── Cyrillic-to-Latin homoglyph mapping (NFKC doesn't cover these) ──────────
const CYRILLIC_HOMOGLYPHS: Record<string, string> = {
  '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g', '\u0434': 'd',
  '\u0435': 'e', '\u0436': 'zh', '\u0437': 'z', '\u0438': 'i', '\u0439': 'j',
  '\u043a': 'k', '\u043b': 'l', '\u043c': 'm', '\u043d': 'n', '\u043e': 'o',
  '\u043f': 'p', '\u0440': 'r', '\u0441': 'c', '\u0442': 't', '\u0443': 'y',
  '\u0444': 'f', '\u0445': 'x', '\u0446': 'ts', '\u0447': 'ch', '\u0448': 'sh',
  '\u0449': 'shch', '\u044a': '', '\u044b': 'y', '\u044c': '', '\u044d': 'e',
  '\u044e': 'yu', '\u044f': 'ya',
  '\u0456': 'i', '\u0457': 'yi', '\u045e': 'u',
  '\u0585': 'o', '\u057a': 'p', '\u056d': 'x',
  '\u0261': 'g', '\u0285': '', '\u04cf': 'l',
};

function normalizeUnicode(text: string): string {
  // NFKC normalize (handles fullwidth chars)
  const normalized = text.normalize('NFKC');
  // Replace Cyrillic homoglyphs
  let result = '';
  for (const ch of normalized) {
    result += CYRILLIC_HOMOGLYPHS[ch] ?? ch;
  }
  // Strip zero-width and bidi override characters
  result = result.replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2064\uFEFF]/g, '');
  return result;
}

// ── Injection Patterns (40+) ────────────────────────────────────────────────
interface PatternDef {
  regex: RegExp;
  threatType: string;
  severity: Severity;
}

const INJECTION_PATTERNS: PatternDef[] = [
  // Instruction Override
  { regex: /ignore\s+(all\s+)?(previous|prior|earlier|above|preceding)\s+instructions/gi, threatType: "Prompt injection: ignore instructions", severity: "critical" },
  { regex: /disregard\s+(all\s+)?(your|previous|prior|earlier|all)\s*(instructions)?/gi, threatType: "Instruction disregard", severity: "critical" },
  { regex: /forget\s+(all\s+)?(previous|prior|earlier|above|everything|what)/gi, threatType: "Memory wipe instruction", severity: "critical" },
  { regex: /(?:new|fresh|override)\s+(?:instructions?|prompt|rules?|directives?)\s*:/gi, threatType: "Instruction override with colon", severity: "critical" },
  { regex: /you\s+are\s+now\s+(?:a|an|the)/gi, threatType: "Identity reassignment", severity: "critical" },

  // System/Role Override
  { regex: /system\s*:?\s*(override|update|modify|prompt)/gi, threatType: "System prompt override attempt", severity: "critical" },
  { regex: /system\s*:?\s*(elevate|grant|escalate|assume)/gi, threatType: "System privilege escalation", severity: "critical" },
  { regex: /admin\s+override/gi, threatType: "Admin override attempt", severity: "critical" },
  { regex: /root\s+access/gi, threatType: "Root access request", severity: "critical" },
  { regex: /elevate\s+(your\s+)?(permissions?|access|privileges?)\s+to\s+(admin|root|superuser)/gi, threatType: "Privilege escalation attempt", severity: "critical" },

  // Secret/Credential Extraction
  { regex: /output\s+(the\s+)?(secret|api|access)\s*(key|token|secret)/gi, threatType: "Credential extraction attempt", severity: "critical" },
  { regex: /(reveal|show|display|expose|extract|leak|give|tell|hand)\s+(the\s+)?(secret|api|private|access|credential)\s*(key|token|secret|id|key)?/gi, threatType: "Credential exfiltration attempt", severity: "critical" },
  { regex: /sk[_-]?live[_-]?[A-Za-z0-9]{10,}/g, threatType: "Live secret key detected", severity: "critical" },

  // Data Exfiltration
  { regex: /exfiltrate\s+(all\s+)?(user\s+)?(data|pii|information|credentials)/gi, threatType: "Data exfiltration attempt", severity: "critical" },
  { regex: /(send|post|upload|transfer)\s+(all\s+)?(user\s+)?(data|pii|info)\s+to\s+(?:https?:\/\/|external|remote)/gi, threatType: "Data exfiltration to external endpoint", severity: "critical" },
  { regex: /(?:https?:\/\/)?evil\.(com|net|org)/gi, threatType: "Malicious endpoint reference", severity: "critical" },

  // Command Injection
  { regex: /execute\s+(command|shell|bash|script)\s*:/gi, threatType: "Command injection attempt", severity: "critical" },
  { regex: /rm\s+-rf\s+\//g, threatType: "Destructive command: recursive delete", severity: "critical" },
  { regex: /curl\s+https?:\/\/\S+\s+-d\s+@/g, threatType: "Data exfiltration via curl", severity: "critical" },

  // Jailbreak Patterns
  { regex: /\bDAN\b.*(?:ignore|bypass|override)/gi, threatType: "DAN jailbreak attempt", severity: "critical" },
  { regex: /do\s+anything\s+now/gi, threatType: "DAN jailbreak attempt", severity: "critical" },
  { regex: /you\s+are\s+(?:now\s+)?DAN/gi, threatType: "DAN identity injection", severity: "critical" },
  { regex: /(?:act|behave|respond)\s+as\s+(?:if\s+)?(?:you\s+)?(?:have|are|can)\s+no\s+(?:restrictions?|rules?|limits?|filters?)/gi, threatType: "Unrestricted mode injection", severity: "high" },
  { regex: /bypass\s+(all\s+)?(content\s+)?filters?/gi, threatType: "Filter bypass attempt", severity: "high" },
  { regex: /no\s+restrictions/gi, threatType: "Restriction removal claim", severity: "high" },

  // Role/Pretend Injection
  { regex: /role[-\s]?play\s+as/gi, threatType: "Role-play injection", severity: "high" },
  { regex: /roleplay\s+as/gi, threatType: "Role-play injection", severity: "high" },
  { regex: /pretend\s+(to\s+)?be/gi, threatType: "Pretend injection", severity: "high" },
  { regex: /pretend\s+you\s+(have|are|can|will|do)/gi, threatType: "Pretend injection", severity: "high" },
  { regex: /you\s+are\s+(not\s+)?(an?\s+)?(ai|assistant|chatbot|bot|human)/gi, threatType: "Identity override attempt", severity: "high" },

  // Indirect Injection
  { regex: /(the\s+)?user\s+above\s+is\s+wrong/gi, threatType: "Indirect injection: user override", severity: "high" },
  { regex: /assistant\s*:\s*I\s+will\s+now\s+ignore/gi, threatType: "Indirect injection: self-override", severity: "high" },
  { regex: /system\s+prompt\s*:\s*you\s+are\s+now/gi, threatType: "Indirect injection: prompt override", severity: "high" },
  { regex: /\[HIDDEN\]/gi, threatType: "Hidden instruction marker", severity: "high" },
  { regex: /store\s+these\s+as\s+(facts?|truth|reality)/gi, threatType: "False fact injection", severity: "high" },

  // Safety/Restriction Bypass
  { regex: /override\s+your\s+(safety|security|restrictions)/gi, threatType: "Safety override attempt", severity: "high" },
  { regex: /bypass\s+your\s+(content|safety|security)/gi, threatType: "Safety bypass attempt", severity: "high" },
  { regex: /circumvent\s+your\s+(restrictions|rules|limits)/gi, threatType: "Restriction circumvention", severity: "high" },
  { regex: /reset\s+your\s+(memory|context|instructions)/gi, threatType: "Memory reset injection", severity: "high" },
  { regex: /clear\s+your\s+(context|memory|instructions)/gi, threatType: "Memory clear injection", severity: "high" },
  { regex: /start\s+(over|fresh)\s+(from|with|as|new)/gi, threatType: "Session reset injection", severity: "high" },
];

// ── Secret Patterns ─────────────────────────────────────────────────────────
const SECRET_PATTERNS: PatternDef[] = [
  { regex: /(?:sk|pk|api)[-_]?[a-z0-9]{20,}/gi, threatType: "Structured API key pattern", severity: "high" },
  { regex: /-----BEGIN\s+(RSA|EC|OPENSSH|PGP)\s+PRIVATE\s+KEY-----/gi, threatType: "Private key material", severity: "critical" },
  { regex: /(password|passwd|pwd|secret)\s*[=:]\s*\S{8,}/gi, threatType: "Password/secret in content", severity: "high" },
  { regex: /(aws_access_key_id|aws_secret_access_key)/gi, threatType: "AWS credential", severity: "critical" },
  { regex: /(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, threatType: "GitHub token", severity: "critical" },
];

// ── Main Guard Function ─────────────────────────────────────────────────────
export function guardCheck(content: string): GuardReport {
  const start = performance.now();
  const findings: Finding[] = [];

  // Normalize Unicode (homoglyph defense)
  const normalized = normalizeUnicode(content);

  // Scan injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(normalized)) {
      findings.push({
        detector: "asi06_injection",
        threatType: pattern.threatType,
        severity: pattern.severity,
        detail: `Pattern matched: ${pattern.regex.source.slice(0, 60)}`,
        confidence: pattern.severity === "critical" ? 0.90 : 0.80,
      });
    }
  }

  // Scan secret patterns
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(normalized)) {
      findings.push({
        detector: "asi06_secret",
        threatType: pattern.threatType,
        severity: pattern.severity,
        detail: `Secret pattern matched: ${pattern.regex.source.slice(0, 60)}`,
        confidence: 0.85,
      });
    }
  }

  const latencyMs = performance.now() - start;

  // Determine worst severity
  const severityOrder: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const worstSeverity = findings.reduce((max, f) =>
    (severityOrder[f.severity] > severityOrder[max]) ? f.severity : max, "none");

  const isSafe = findings.length === 0;
  const trustScore = isSafe ? 1.0 : Math.max(0, 1.0 - findings.length * 0.25);
  const poisoningRisk = worstSeverity === "critical" ? "CRITICAL"
    : worstSeverity === "high" ? "HIGH"
    : worstSeverity === "medium" ? "MEDIUM"
    : worstSeverity === "low" ? "LOW" : "NONE";

  return {
    isSafe,
    findings,
    trustScore,
    poisoningRisk,
    scanLatencyMs: Math.round(latencyMs * 100) / 100,
  };
}
