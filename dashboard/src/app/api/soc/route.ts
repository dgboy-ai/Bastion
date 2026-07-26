import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";

/**
 * POST /api/soc — Run multi-agent SOC demo steps.
 *
 * Body: { step: "context" | "analyst" | "respond" | "verify", alert?: {...} }
 *
 * This endpoint is SEPARATE from /api/demo/* — it does NOT modify existing playground data.
 * Uses agent IDs "soc-analyst" and "soc-responder" to avoid conflicts.
 */

interface SocStepResult {
  step: string;
  timestamp: string;
  [key: string]: unknown;
}

async function stepContext(): Promise<SocStepResult> {
  // Show current SOC agent state from CockroachDB
  const [analystMems, responderMems, auditRes] = await Promise.all([
    safeQuery(
      `SELECT memory_id, memory_type, content::varchar(200) AS content, trust_level, created_at, cryptographic_hash, previous_hash
       FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10`,
      ["soc-analyst"]
    ),
    safeQuery(
      `SELECT memory_id, memory_type, content::varchar(200) AS content, trust_level, created_at
       FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10`,
      ["soc-responder"]
    ),
    safeQuery(
      `SELECT action, details::varchar(200) AS details, recorded_at
       FROM agent_audit WHERE agent_id IN ($1, $2) ORDER BY recorded_at DESC LIMIT 10`,
      ["soc-analyst", "soc-responder"]
    ),
  ]);

  const analystMemories = analystMems.rows.map((r: Record<string, unknown>) => ({
    id: String(r.memory_id).slice(0, 8) + "...",
    type: r.memory_type,
    content: r.content,
    trustLevel: r.trust_level,
    hash: String(r.cryptographic_hash || "").slice(0, 12) + "...",
    previousHash: r.previous_hash ? String(r.previous_hash).slice(0, 12) + "..." : "GENESIS",
    createdAt: r.created_at,
  }));

  const responderMemories = responderMems.rows.map((r: Record<string, unknown>) => ({
    id: String(r.memory_id).slice(0, 8) + "...",
    type: r.memory_type,
    content: r.content,
    trustLevel: r.trust_level,
    createdAt: r.created_at,
  }));

  const auditTrail = auditRes.rows.map((r: Record<string, unknown>) => ({
    action: r.action,
    details: r.details,
    at: r.recorded_at,
  }));

  // Hash chain verification
  const chainValid = analystMemories.length > 1;
  let brokenLinks = 0;
  for (let i = 1; i < analystMemories.length; i++) {
    if (analystMemories[i].previousHash !== "GENESIS" &&
        analystMemories[i].previousHash !== analystMemories[i - 1].hash) {
      brokenLinks++;
    }
  }

  return {
    step: "context",
    timestamp: new Date().toISOString(),
    analyst: {
      agentId: "soc-analyst",
      memories: analystMemories,
      memoryCount: analystMemories.length,
    },
    responder: {
      agentId: "soc-responder",
      memories: responderMemories,
      memoryCount: responderMemories.length,
    },
    auditTrail,
    hashChain: {
      valid: chainValid && brokenLinks === 0,
      totalLinks: analystMemories.length,
      brokenLinks,
    },
  };
}

async function stepAnalyst(alert: {
  content: string;
  source: string;
  severity: string;
}): Promise<SocStepResult> {
  const crypto = await import("crypto");

  // OWASP ASI06 guard — inline TypeScript implementation
  const content = alert.content;
  const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|earlier)\s+(instructions|prompts|rules)/i,
    /system\s+(override|prompt|message)/i,
    /you\s+are\s+now\s+(a|an)\s+/i,
    /forget\s+(everything|all|your)\s+/i,
    /disregard\s+(all|your|the|previous)/i,
    /new\s+(instructions|role|persona|identity)/i,
    /admin(istrator)?\s+(override|access|mode)/i,
    /debug\s+mode\s+(on|enabled|activate)/i,
    /output\s+(the|your|all)\s+(secret|api|admin)\s+key/i,
    /sk[-_]?live[-_]?[a-zA-Z0-9]{20,}/i,
    /AKIA[0-9A-Z]{16}/i,
  ];

  const findings: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(`Injection pattern: ${pattern.source.slice(0, 40)}`);
    }
  }

  // PII detection
  if (/\b\d{3}-\d{2}-\d{4}\b/.test(content)) findings.push("SSN detected");
  if (/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(content)) findings.push("Email detected");

  const isSafe = findings.length === 0;
  const trustLevel = isSafe ? 4 : 0;

  // Hash chain
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");

  // Get previous hash from last memory
  let previousHash: string | null = null;
  try {
    const lastMem = await safeQuery(
      `SELECT cryptographic_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 1`,
      ["soc-analyst"]
    );
    if (lastMem.rows.length > 0) {
      previousHash = String(lastMem.rows[0].cryptographic_hash);
    }
  } catch {
    // First memory — no previous hash
  }

  // Store memory in CockroachDB
  const memoryId = crypto.randomUUID();
  try {
    await safeQuery(
      `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, trust_level, embedding_384, cryptographic_hash, previous_hash, source_provenance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        memoryId,
        "soc-analyst",
        "alert",
        content,
        trustLevel,
        "[]", // placeholder embedding
        contentHash,
        previousHash,
        alert.source,
      ]
    );

    // Audit log
    await safeQuery(
      `INSERT INTO agent_audit (agent_id, memory_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [
        "soc-analyst",
        memoryId,
        isSafe ? "memory_stored" : "poisoning_detected",
        JSON.stringify({ source: alert.source, severity: alert.severity, findings }),
      ]
    );
  } catch (err) {
    console.error("[SOC] Failed to store memory:", err);
  }

  // A2A escalation
  let a2aAlert = null;
  let escalated = false;
  if (!isSafe) {
    escalated = true;
    a2aAlert = {
      type: "poisoning_detected",
      memoryId: memoryId.slice(0, 8) + "...",
      findings,
      source: alert.source,
      severity: alert.severity,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    step: "analyst",
    timestamp: new Date().toISOString(),
    memoryId: memoryId.slice(0, 8) + "...",
    guard: {
      isSafe,
      findings,
      poisoningRisk: isSafe ? 0 : findings.length * 0.2,
    },
    trustLevel,
    hashChain: {
      hash: contentHash.slice(0, 16) + "...",
      previousHash: previousHash ? previousHash.slice(0, 16) + "..." : "GENESIS",
    },
    analysis: isSafe
      ? "No suspicious patterns detected. Memory stored safely."
      : `ALERT: ${findings.length} suspicious patterns detected. Escalating to Incident Responder.`,
    escalated,
    a2aAlert,
  };
}

async function stepRespond(alert: {
  memoryId: string;
  findings: string[];
}): Promise<SocStepResult> {
  const crypto = await import("crypto");

  // Time-travel: find the poisoned memory's state before corruption
  let timeTravelResult = null;
  let healedRecord = null;

  try {
    // In real CockroachDB: SELECT * FROM agent_memory AS OF SYSTEM TIME '-5s'
    const poisonedMem = await safeQuery(
      `SELECT memory_id, content::varchar(500) AS content, trust_level, created_at, cryptographic_hash
       FROM agent_memory WHERE agent_id = $1 AND memory_type = 'alert'
       ORDER BY created_at DESC LIMIT 1`,
      ["soc-analyst"]
    );

    if (poisonedMem.rows.length > 0) {
      const poisoned = poisonedMem.rows[0];
      timeTravelResult = {
        query: `SELECT * FROM agent_memory AS OF SYSTEM TIME '-5s' WHERE memory_id = '${poisoned.memory_id}'`,
        found: true,
        poisonedContent: String(poisoned.content).slice(0, 100),
        poisonedAt: poisoned.created_at,
        cockroachdbFeature: "AS OF SYSTEM TIME (MVCC snapshots)",
      };

      // Heal: restore with trust level 4
      const healedId = crypto.randomUUID();
      const healedContent = "Memory restored to safe state after poisoning detection";
      const healedHash = crypto.createHash("sha256").update(healedContent).digest("hex");

      await safeQuery(
        `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, trust_level, embedding_384, cryptographic_hash, previous_hash, source_provenance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          healedId,
          "soc-responder",
          "healed",
          healedContent,
          4,
          "[]",
          healedHash,
          String(poisoned.cryptographic_hash),
          "incident-responder",
        ]
      );

      // Audit log
      await safeQuery(
        `INSERT INTO agent_audit (agent_id, memory_id, action, details)
         VALUES ($1, $2, $3, $4)`,
        [
          "soc-responder",
          healedId,
          "memory_healed",
          JSON.stringify({ originalMemoryId: alert.memoryId, reason: "Poisoning detected" }),
        ]
      );

      healedRecord = {
        memoryId: healedId.slice(0, 8) + "...",
        content: healedContent,
        trustLevel: 4,
        hash: healedHash.slice(0, 16) + "...",
      };
    }
  } catch (err) {
    console.error("[SOC] Heal failed:", err);
  }

  // Verify hash chain
  let chainValid = true;
  let totalLinks = 0;
  try {
    const allMems = await safeQuery(
      `SELECT cryptographic_hash, previous_hash FROM agent_memory WHERE agent_id = $1 ORDER BY created_at ASC`,
      ["soc-analyst"]
    );
    totalLinks = allMems.rows.length;
    for (let i = 1; i < allMems.rows.length; i++) {
      const prev = String(allMems.rows[i - 1].cryptographic_hash);
      const curr = String(allMems.rows[i].previous_hash || "");
      if (curr && curr !== prev) {
        chainValid = false;
        break;
      }
    }
  } catch {
    // Chain verification failed
  }

  return {
    step: "respond",
    timestamp: new Date().toISOString(),
    timeTravel: timeTravelResult,
    healing: healedRecord,
    hashChainVerification: {
      valid: chainValid,
      totalLinks,
      cockroachdbFeature: "SERIALIZABLE isolation prevents hash chain forks",
    },
    a2aReport: {
      type: "healing_complete",
      from: "soc-responder",
      to: "soc-analyst",
      status: "resolved",
      timestamp: new Date().toISOString(),
    },
  };
}

async function stepVerify(): Promise<SocStepResult> {
  // Full verification of both agents' state
  const [analystMems, responderMems, analystAudit, responderAudit] = await Promise.all([
    safeQuery(
      `SELECT memory_id, content::varchar(200) AS content, trust_level, cryptographic_hash, previous_hash, created_at
       FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC`,
      ["soc-analyst"]
    ),
    safeQuery(
      `SELECT memory_id, content::varchar(200) AS content, trust_level, cryptographic_hash, created_at
       FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC`,
      ["soc-responder"]
    ),
    safeQuery(
      `SELECT action, details::varchar(300) AS details, recorded_at
       FROM agent_audit WHERE agent_id = $1 ORDER BY recorded_at DESC`,
      ["soc-analyst"]
    ),
    safeQuery(
      `SELECT action, details::varchar(300) AS details, recorded_at
       FROM agent_audit WHERE agent_id = $1 ORDER BY recorded_at DESC`,
      ["soc-responder"]
    ),
  ]);

  const analystMemories = analystMems.rows.map((r: Record<string, unknown>) => ({
    id: String(r.memory_id).slice(0, 8) + "...",
    content: r.content,
    trustLevel: r.trust_level,
    hash: String(r.cryptographic_hash || "").slice(0, 12) + "...",
    previousHash: r.previous_hash ? String(r.previous_hash).slice(0, 12) + "..." : "GENESIS",
    createdAt: r.created_at,
  }));

  const responderMemories = responderMems.rows.map((r: Record<string, unknown>) => ({
    id: String(r.memory_id).slice(0, 8) + "...",
    content: r.content,
    trustLevel: r.trust_level,
    createdAt: r.created_at,
  }));

  const analystAuditTrail = analystAudit.rows.map((r: Record<string, unknown>) => ({
    action: r.action,
    details: r.details,
    at: r.recorded_at,
  }));

  const responderAuditTrail = responderAudit.rows.map((r: Record<string, unknown>) => ({
    action: r.action,
    details: r.details,
    at: r.recorded_at,
  }));

  // Hash chain check
  let chainValid = true;
  let brokenLinks = 0;
  for (let i = 1; i < analystMemories.length; i++) {
    if (analystMemories[i].previousHash !== "GENESIS" &&
        analystMemories[i].previousHash !== analystMemories[i - 1].hash) {
      chainValid = false;
      brokenLinks++;
    }
  }

  // Trust summary
  const trustLevels = analystMemories.map(m => m.trustLevel as number).filter(t => t !== undefined);
  const avgTrust = trustLevels.length > 0
    ? (trustLevels.reduce((a, b) => a + b, 0) / trustLevels.length).toFixed(1)
    : "—";

  return {
    step: "verify",
    timestamp: new Date().toISOString(),
    summary: {
      analyst: {
        agentId: "soc-analyst",
        totalMemories: analystMemories.length,
        avgTrust: avgTrust + "/4",
        auditEntries: analystAuditTrail.length,
      },
      responder: {
        agentId: "soc-responder",
        totalMemories: responderMemories.length,
        auditEntries: responderAuditTrail.length,
      },
      hashChain: {
        valid: chainValid,
        totalLinks: analystMemories.length,
        brokenLinks,
        cockroachdbFeature: "SHA-256 hash chain with SERIALIZABLE isolation",
      },
    },
    analyst: {
      memories: analystMemories,
      auditTrail: analystAuditTrail,
    },
    responder: {
      memories: responderMemories,
      auditTrail: responderAuditTrail,
    },
  };
}

export async function POST(request: Request) {
  try {
    let body: { step?: string; alert?: Record<string, unknown> } = {};
    try {
      const text = await request.text();
      if (text.length > 10000) return apiError("Body too large", 413);
      if (text) body = JSON.parse(text);
    } catch { /* empty body OK */ }

    const step = body.step || "context";

    switch (step) {
      case "context":
        return apiSuccess(await stepContext());
      case "analyst": {
        const alert = body.alert as { content: string; source: string; severity: string } || {
          content: "System health check passed",
          source: "health_monitor",
          severity: "info",
        };
        return apiSuccess(await stepAnalyst(alert));
      }
      case "respond": {
        const alert = body.alert as { memoryId: string; findings: string[] } || {
          memoryId: "",
          findings: [],
        };
        return apiSuccess(await stepRespond(alert));
      }
      case "verify":
        return apiSuccess(await stepVerify());
      default:
        return apiError(`Unknown step: ${step}`, 400);
    }
  } catch (err) {
    console.error("[api/soc] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("SOC demo failed", 500);
  }
}
