import { safeQuery } from "@/lib/db";
import { apiSuccess, apiError } from "@/lib/api-response";
import { requireAuth } from "@/lib/api-auth";
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

export async function POST(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  try {
    let body;
    try {
      const text = await request.text();
      if (text.length > 100000) return apiError("Body too large (max 100KB)", 413);
      body = JSON.parse(text);
    } catch {
      return apiError("Invalid JSON body", 400);
    }
    const query = String(body.query || "What do I know about deployments?").slice(0, 500);
    const agentId = String(body.agentId || "agent-demo").slice(0, 128);

    const startTime = Date.now();

    const queryVec = await embed(query);

    const mems = await safeQuery(
      `SELECT memory_id, content::varchar(500) AS content, memory_type, agent_id, created_at, trust_level, embedding_384::text AS embedding_384
       FROM agent_memory
       WHERE (agent_id = $1 OR $1 IS NULL)
       ORDER BY created_at DESC LIMIT 100`,
      [agentId !== "agent-demo" ? agentId : null]
    );

    if (mems.rows.length === 0) {
      return apiSuccess({
        query,
        response: "No memories found in the database.",
        vectorSearch: { results: [], totalResults: 0, latency: (Date.now() - startTime) + "ms" },
      }, "dynamic");
    }

    const rows = mems.rows as MemoryRow[];

    const toCompute: { row: MemoryRow; idx: number }[] = [];
    const vectors: number[][] = new Array(rows.length);

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].embedding_384) {
        const raw = rows[i].embedding_384!;
        const trimmed = raw.startsWith("[") ? raw.slice(1, -1) : raw;
        vectors[i] = trimmed.split(",").map(Number);
      } else {
        toCompute.push({ row: rows[i], idx: i });
      }
    }

    if (toCompute.length > 0) {
      const texts = toCompute.map(t => t.row.content || "");
      const batchArr = await embed(texts);
      for (let j = 0; j < toCompute.length; j++) {
        vectors[toCompute[j].idx] = batchArr[j];
      }
    }

    const scored = rows.map((r, i) => ({
      content: r.content || "",
      memoryType: r.memory_type || "unknown",
      agentId: r.agent_id || "",
      similarity: cosineSimilarity(queryVec, vectors[i]),
    }));

    scored.sort((a, b) => b.similarity - a.similarity);
    const top5 = scored.slice(0, 5);

    const latency = Date.now() - startTime;

    const contexts = top5.map(c => c.content).filter(Boolean).join("\n");

    const groqApiKey = process.env.GROQ_API_KEY;
    const groqEnabled = process.env.BASTION_ENABLE_GROQ === "true" || process.env.BASTION_ENABLE_GROQ === "1";
    let response = "Found " + top5.length + " relevant memories via sentence-transformers semantic search.";

    if (groqApiKey && groqEnabled && contexts) {
      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + groqApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: "Answer based on the retrieved memory context only." },
              { role: "user", content: "Context:\n" + contexts + "\n\nQuestion: " + query },
            ],
            max_tokens: 256,
          }),
        });
        const groqJson = await groqRes.json();
        if (groqJson.choices?.[0]?.message?.content) {
          response = groqJson.choices[0].message.content;
        }
      } catch {
        response = "Semantic search completed. Groq enrichment unavailable.";
      }
    }

    return apiSuccess({
      query,
      agentId: agentId || "all agents",
      response,
      vectorSearch: {
        results: top5.map(r => ({
          content: r.content,
          memoryType: r.memoryType,
          agentId: r.agentId,
          similarity: Math.round(r.similarity * 1000) / 1000,
        })),
        totalResults: top5.length,
        memsScanned: rows.length,
        latency: latency + "ms",
        model: "all-MiniLM-L6-v2",
        dimensions: 384,
        distanceMetric: "cosine similarity (in-memory JS)",
        tenantPartitioned: agentId !== "agent-demo",
      },
      sql: [
        "SELECT content, memory_type, embedding_384 FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 100",
        "In-memory cosine similarity via sentence-transformers (384-dim, normalized)",
      ],
      crdbFeatures: [
        "sentence-transformers for real query embedding (all-MiniLM-L6-v2)",
        "In-memory cosine similarity ranking",
        "384-dim semantic vectors stored in agent_memory.embedding_384",
      ],
    }, "dynamic");
  } catch (err) {
    console.error("[api/demo/chat] failed:", err instanceof Error ? err.message : "Unknown error");
    return apiError("Chat demo failed — " + (err instanceof Error ? err.message : "Unknown"), 500);
  }
}
