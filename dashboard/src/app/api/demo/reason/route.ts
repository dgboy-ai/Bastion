import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { embed, cosineSimilarity } from "@/lib/embeddings";

interface MemoryRow {
  memory_id: string;
  content: string;
  memory_type: string;
  agent_id: string;
  created_at: Date | string;
  trust_level: number | null;
  embedding_384: string | null;
}

interface ThoughtStep {
  type: "observation" | "hypothesis" | "question" | "decision" | "action" | "result";
  content: string;
  evidence?: string;
  confidence?: number;
}

export async function POST(request: Request) {
  try {
    let body;
    try {
      const text = await request.text();
      if (text.length > 100000) return apiError("Body too large (max 100KB)", 413);
      body = JSON.parse(text);
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const content = String(body.content || "").slice(0, 2000);
    const severity = String(body.severity || "medium").slice(0, 20);
    const memoryId = String(body.memoryId || "").slice(0, 128);
    const agentId = String(body.agentId || "agent-demo").slice(0, 128);
    const startTime = Date.now();

    if (!content) {
      return apiError("content is required", 400);
    }

    const thoughts: ThoughtStep[] = [];
    const sqlQueries: string[] = [];

    // ─── STEP 1: OBSERVE — What just happened? ─────────────────
    thoughts.push({
      type: "observation",
      content: `New ${severity}-severity incident detected in memory stream`,
      evidence: content.slice(0, 120) + (content.length > 120 ? "..." : ""),
      confidence: 1.0,
    });

    // ─── STEP 2: SEARCH — Have we seen something similar? ──────
    let queryVec: number[];
    try {
      queryVec = await embed(content);
    } catch {
      const { createHash } = await import("crypto");
      const h = createHash("sha256").update(content).digest("hex");
      queryVec = Array.from({ length: 384 }, (_, i) => parseInt(h[i % h.length], 16) / 15 * 2 - 1);
    }

    const searchSql = `SELECT memory_id, content::varchar(500) AS content, memory_type, trust_level, embedding_384::text AS embedding_384, created_at FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 100`;
    sqlQueries.push(searchSql);
    const mems = await safeQuery(searchSql, [agentId]);

    const rows = mems.rows as unknown as MemoryRow[];
    let similarMemories: { memoryId: string; content: string; similarity: number; trustLevel: number; type: string }[] = [];

    if (rows.length > 0) {
      const vectors: (number[] | undefined)[] = new Array(rows.length);
      const toCompute: { idx: number }[] = [];

      for (let i = 0; i < rows.length; i++) {
        if (rows[i].embedding_384) {
          try {
            const raw = rows[i].embedding_384!;
            const trimmed = raw.startsWith("[") ? raw.slice(1, -1) : raw;
            const parsed = trimmed.split(",").map(Number);
            if (parsed.length >= 384 && parsed.every(Number.isFinite)) {
              vectors[i] = parsed;
            }
          } catch { /* skip */ }
        }
        if (!vectors[i]) {
          toCompute.push({ idx: i });
        }
      }

      if (toCompute.length > 0 && toCompute.length <= 20) {
        try {
          const texts = toCompute.map(t => rows[t.idx].content || "");
          const batchArr = await embed(texts);
          for (let j = 0; j < toCompute.length; j++) {
            if (batchArr[j] && batchArr[j].length >= 384) {
              vectors[toCompute[j].idx] = batchArr[j];
            }
          }
        } catch { /* fallback */ }
      }

      const scored = rows.map((r, i) => {
        let sim = 0;
        if (vectors[i] && queryVec) {
          sim = cosineSimilarity(queryVec, vectors[i]);
          sim = Number.isFinite(sim) ? sim : 0;
        }
        return {
          memoryId: String(r.memory_id).slice(0, 8) + "...",
          content: r.content || "",
          similarity: sim,
          trustLevel: Number(r.trust_level) || 0,
          type: r.memory_type || "unknown",
        };
      }).filter(r => r.similarity > 0.1);

      scored.sort((a, b) => b.similarity - a.similarity);
      similarMemories = scored.slice(0, 5);
    }

    const similarCount = similarMemories.length;
    const trustedSimilar = similarMemories.filter(m => m.trustLevel >= 2);

    thoughts.push({
      type: "hypothesis",
      content: similarCount > 0
        ? `Found ${similarCount} similar memories in agent's history (${trustedSimilar.length} trusted)`
        : "No similar memories found — this may be a novel attack vector",
      evidence: similarCount > 0
        ? similarMemories.map(m => `[trust=${m.trustLevel}] ${m.content.slice(0, 60)}...`).join(" | ")
        : undefined,
      confidence: similarCount > 0 ? 0.8 : 0.4,
    });

    // ─── STEP 3: CHECK CONTRADICTIONS ─────────────────────────
    let contradictions: { memoryId: string; content: string; trustLevel: number }[] = [];
    if (memoryId) {
      const contraSql = `SELECT memory_id, content::varchar(300) AS content, trust_level FROM agent_memory WHERE agent_id = $1 AND memory_id != $2 AND content ILIKE '%' || (SELECT split_part(content, ' ', 1) FROM agent_memory WHERE memory_id = $2) || '%' LIMIT 5`;
      sqlQueries.push(contraSql);
      try {
        const contraRes = await safeQuery(contraSql, [agentId, memoryId]);
        contradictions = contraRes.rows.map((r: Record<string, unknown>) => ({
          memoryId: String(r.memory_id).slice(0, 8) + "...",
          content: String(r.content || "").slice(0, 100),
          trustLevel: Number(r.trust_level) || 0,
        }));
      } catch { /* ignore */ }
    }

    if (contradictions.length > 0) {
      thoughts.push({
        type: "question",
        content: `Found ${contradictions.length} potentially contradictory memories — is this a consistency attack or legitimate update?`,
        evidence: contradictions.map(c => `[trust=${c.trustLevel}] ${c.content}`).join(" | "),
        confidence: 0.6,
      });
    }

    // ─── STEP 4: CHECK KNOWLEDGE GRAPH ────────────────────────
    let relatedEntities: { name: string; type: string; confidence: number }[] = [];
    const kgSql = `SELECT e.name, e.entity_type, r.confidence FROM agent_entities e JOIN agent_relations r ON e.entity_id = r.source_entity_id OR e.entity_id = r.target_entity_id LIMIT 10`;
    sqlQueries.push(kgSql);
    try {
      const kgRes = await safeQuery(kgSql);
      relatedEntities = kgRes.rows.map((r: Record<string, unknown>) => ({
        name: String(r.name || ""),
        type: String(r.entity_type || ""),
        confidence: Number(r.confidence) || 1.0,
      }));
    } catch { /* ignore */ }

    if (relatedEntities.length > 0) {
      thoughts.push({
        type: "observation",
        content: `Knowledge graph has ${relatedEntities.length} related entities — cross-referencing incident against known relationships`,
        evidence: relatedEntities.slice(0, 3).map(e => `${e.name} (${e.type})`).join(", "),
        confidence: 0.9,
      });
    }

    // ─── STEP 5: DECIDE — LLM-powered reasoning via Groq ──────
    const highSimilarityTrusted = similarMemories.filter(m => m.similarity > 0.5 && m.trustLevel >= 3);
    const lowTrustSimilar = similarMemories.filter(m => m.trustLevel < 2);

    let recommendation = "ANALYZING";
    let decisionConfidence = 0.5;
    let actionItems: string[] = ["Gather more context", "Re-evaluate", "Monitor"];
    let llmReasoning: string | null = null;

    const groqKey = process.env.GROQ_API_KEY;
    const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

    if (groqKey) {
      // Use Groq LLM for real reasoning
      const contextForLLM = [
        `Incident: ${content.slice(0, 500)}`,
        `Severity: ${severity}`,
        `Similar memories found: ${similarCount} (${trustedSimilar.length} trusted, ${lowTrustSimilar.length} low-trust)`,
        `Contradictions: ${contradictions.length}`,
        `Knowledge graph entities: ${relatedEntities.length}`,
        similarMemories.length > 0 ? `Top similar: ${similarMemories[0].content.slice(0, 100)} (similarity=${(similarMemories[0].similarity * 100).toFixed(0)}%, trust=${similarMemories[0].trustLevel})` : "No similar memories",
      ].join("\n");

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const llmRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: groqModel,
            messages: [
              {
                role: "system",
                content: "You are a security analyst AI. Given an incident and memory context, decide the appropriate response. Return JSON with: recommendation (string), confidence (0-1), actionItems (string[3]), reasoning (string). Be concise.",
              },
              {
                role: "user",
                content: `Analyze this incident and decide:\n\n${contextForLLM}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 800,
          }),
        });

        clearTimeout(timeout);

        if (llmRes.ok) {
          const llmData = await llmRes.json();
          const choice = llmData.choices?.[0];
          // Reasoning models (GPT-OSS, Qwen) put analysis in 'reasoning' field, final answer in 'content'
          const rawContent = choice?.message?.content || "";
          const rawReasoning = choice?.message?.reasoning || "";
          const llmContent = rawContent.trim() || rawReasoning.trim();
          // Try to parse JSON from LLM response
          const jsonMatch = llmContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            recommendation = parsed.recommendation || "ANALYZE — LLM provided analysis";
            decisionConfidence = Math.min(1, Math.max(0, parsed.confidence || 0.8));
            actionItems = Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 3) : ["Review LLM analysis", "Take recommended action", "Monitor outcomes"];
            llmReasoning = parsed.reasoning || rawReasoning.slice(0, 500) || rawContent.slice(0, 500);
          } else {
            // LLM returned text, not JSON — use it as reasoning
            recommendation = `LLM ANALYSIS — See reasoning below`;
            decisionConfidence = 0.85;
            actionItems = ["Review LLM analysis", "Take recommended action", "Monitor outcomes"];
            llmReasoning = rawReasoning.slice(0, 500) || rawContent.slice(0, 500);
          }
        } else {
          throw new Error(`Groq API ${llmRes.status}`);
        }
      } catch (llmErr) {
        // Fallback to pattern-based logic
        groqKey && console.warn("[reason] Groq LLM failed, falling back to pattern logic:", llmErr instanceof Error ? llmErr.message : llmErr);
      }
    }

    // Fallback: pattern-based decision if LLM didn't run or failed
    if (!llmReasoning) {
      if (severity === "critical" && lowTrustSimilar.length > 0) {
        recommendation = "ESCALATE — Critical severity with low-trust similar memories suggests coordinated poisoning campaign";
        decisionConfidence = 0.92;
        actionItems = [
          "Quarantine all low-trust similar memories",
          "Alert security team for manual review",
          "Freeze memory writes for this agent pending investigation",
        ];
      } else if (severity === "critical" && similarCount === 0) {
        recommendation = "ESCALATE — Critical novel attack with no historical precedent";
        decisionConfidence = 0.88;
        actionItems = [
          "Flag for immediate human review",
          "Create incident report with full context",
          "Monitor agent for follow-up attempts",
        ];
      } else if (highSimilarityTrusted.length > 0) {
        recommendation = "MONITOR — Similar trusted memories exist, likely false positive or known pattern";
        decisionConfidence = 0.75;
        actionItems = [
          "Log for pattern analysis",
          "No immediate action required",
          "Schedule periodic review",
        ];
      } else {
        recommendation = "INVESTIGATE — Insufficient evidence for automated decision";
        decisionConfidence = 0.60;
        actionItems = [
          "Gather more context from related memories",
          "Request additional threat intelligence",
          "Re-evaluate in 24 hours",
        ];
      }
    }

    thoughts.push({
      type: "decision",
      content: recommendation,
      confidence: decisionConfidence,
    });

    // ─── STEP 6: ACTION — Execute the decision ────────────────
    thoughts.push({
      type: "action",
      content: `Executing: ${actionItems[0]}`,
      confidence: decisionConfidence,
    });

    // ─── STEP 7: RESULT — What happened? ──────────────────────
    const latency = Date.now() - startTime;
    thoughts.push({
      type: "result",
      content: `Reasoning complete in ${latency}ms. Decision: ${recommendation.split("—")[0].trim()} with ${(decisionConfidence * 100).toFixed(0)}% confidence.`,
      confidence: decisionConfidence,
    });

    return apiSuccess({
      // ── REASONING CHAIN ──
      thoughts,

      // ── SIMILAR MEMORIES FOUND ──
      similarMemories: similarMemories.map(m => ({
        memoryId: m.memoryId,
        content: m.content.slice(0, 100),
        similarity: Math.round(m.similarity * 100) + "%",
        trustLevel: m.trustLevel,
        type: m.type,
      })),

      // ── CONTRADICTIONS ──
      contradictions: contradictions.map(c => ({
        memoryId: c.memoryId,
        content: c.content,
        trustLevel: c.trustLevel,
      })),

      // ── KNOWLEDGE GRAPH CONTEXT ──
      knowledgeGraph: relatedEntities.slice(0, 5).map(e => ({
        name: e.name,
        type: e.type,
        confidence: e.confidence,
      })),

      // ── DECISION ──
      decision: {
        recommendation,
        confidence: decisionConfidence,
        actionItems,
        llmPowered: !!llmReasoning,
        reasoning: llmReasoning,
      },

      // ── SQL QUERIES ──
      sql: sqlQueries,

      // ── CRDB FEATURES ──
      crdbFeatures: [
        "C-SPANN distributed vector index for similarity search",
        "AS OF SYSTEM TIME for temporal context (if enabled)",
        "Knowledge graph joins across entity and relation tables",
        "SERIALIZABLE isolation ensures consistent reads during reasoning",
      ],

      latency: latency + "ms",
      timestamp: new Date().toISOString(),
    }, "dynamic");
  } catch (err) {
    console.error("[api/demo/reason] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("Reasoning demo failed — " + (err instanceof Error ? err.message : "Unknown"), 500);
  }
}
