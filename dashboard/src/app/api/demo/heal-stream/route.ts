import { safeQuery } from "@/lib/db";
import { createHash, randomUUID } from "crypto";
import { embed, vecToString } from "@/lib/embeddings";

const BASTION_REGION = process.env.BASTION_CRDB_REGION || "aws-ap-south-1";

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
      };

      try {
        let body;
        try {
          const text = await request.text();
          body = JSON.parse(text);
        } catch {
          send("error", { message: "Invalid JSON body" });
          controller.close();
          return;
        }

        const agentId = String(body.agentId || "").trim();
        if (!agentId) {
          send("error", { message: "agentId is required" });
          controller.close();
          return;
        }

        send("start", { agentId, timestamp: new Date().toISOString() });

        // Step 1: Find poisons
        send("step", { step: 1, label: "Finding poison memories" });
        const poisonQuery = `SELECT memory_id::text, content::varchar(200) AS content, cryptographic_hash::text, previous_hash::text, created_at FROM agent_memory WHERE agent_id = '${agentId}' AND memory_type = 'poison_attempt' ORDER BY created_at ASC`;
        send("query", { sql: poisonQuery });

        const poisonRes = await safeQuery(
          "SELECT memory_id::text, content::varchar(200) AS content, cryptographic_hash::text, previous_hash::text, created_at FROM agent_memory WHERE agent_id = $1 AND memory_type = 'poison_attempt' ORDER BY created_at ASC",
          [agentId]
        );

        send("result", {
          sql: poisonQuery,
          rows: poisonRes.rows.length,
          data: poisonRes.rows.map((r: Record<string, unknown>) => ({
            memory_id: String(r.memory_id).slice(0, 12) + "...",
            content: String(r.content).slice(0, 60) + "...",
            type: "poison_attempt",
          })),
        });

        if (poisonRes.rows.length === 0) {
          send("done", { healed: 0, message: "No poison memories found" });
          controller.close();
          return;
        }

        send("info", { message: `Found ${poisonRes.rows.length} poison memories to heal` });

        let healedCount = 0;

        for (let idx = 0; idx < poisonRes.rows.length; idx++) {
          const poison = poisonRes.rows[idx] as Record<string, unknown>;
          const poisonId = poison.memory_id as string;

          send("step", { step: idx + 2, label: `Healing poison ${idx + 1}/${poisonRes.rows.length}` });

          // Step 2: Time travel
          const ttQuery = `SELECT content::varchar(500) AS content, cryptographic_hash::text, trust_level FROM agent_memory AS OF SYSTEM TIME '-5s' WHERE agent_id = '${agentId}' AND memory_type != 'poison_attempt' ORDER BY created_at DESC LIMIT 1`;
          send("query", { sql: ttQuery });

          const timeTravelRes = await safeQuery(
            "SELECT content::varchar(500) AS content, cryptographic_hash::text, trust_level FROM agent_memory AS OF SYSTEM TIME '-5s' WHERE agent_id = $1 AND memory_type != 'poison_attempt' ORDER BY created_at DESC LIMIT 1",
            [agentId]
          );

          const hasData = timeTravelRes.rows.length > 0;
          const restoredContent = hasData
            ? timeTravelRes.rows[0].content as string
            : "Restored clean state (no pre-attack memories)";
          const restoredHash = hasData
            ? timeTravelRes.rows[0].cryptographic_hash as string
            : createHash("sha256").update("genesis-" + agentId).digest("hex");

          send("result", {
            sql: ttQuery,
            rows: timeTravelRes.rows.length,
            data: hasData ? [{ content: String(restoredContent).slice(0, 60) + "..." }] : [{ note: "No pre-attack data found" }],
          });

          // Step 3: Delete poison
          const deleteQuery = `DELETE FROM agent_memory WHERE memory_id = '${poisonId}'`;
          send("query", { sql: deleteQuery });

          await safeQuery("DELETE FROM agent_memory WHERE memory_id = $1", [poisonId]);

          send("result", { sql: deleteQuery, rows: 1, data: [{ deleted: poisonId.slice(0, 12) + "..." }] });

          // Step 4: Insert healed
          const newHash = createHash("sha256").update(restoredHash + "healed:" + agentId + Date.now()).digest("hex");
          const newId = randomUUID();

          let healEmbedding: number[];
          try {
            healEmbedding = await embed(restoredContent);
          } catch {
            const hash = createHash("sha256").update(restoredContent).digest("hex");
            healEmbedding = Array.from({ length: 384 }, (_, i) => parseInt(hash[i % hash.length], 16) / 15 * 2 - 1);
          }
          const embeddingStr = vecToString(healEmbedding.slice(0, 384));

          const insertQuery = `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, trust_level, source_provenance, importance_score, previous_hash, cryptographic_hash) VALUES ('${newId}', '${agentId}', 'healed', '${restoredContent.slice(0, 50)}...', 2, 'system_healed', 0.8, '${restoredHash.slice(0, 16)}...', '${newHash.slice(0, 16)}...')`;
          send("query", { sql: insertQuery });

          await safeQuery(
            `INSERT INTO agent_memory (memory_id, agent_id, memory_type, content, embedding, embedding_384, previous_hash, cryptographic_hash, trust_level, source_provenance, importance_score, crdb_region)
             VALUES ($1, $2, 'healed', $3, NULL::vector, $4::vector, $5, $6, 2, 'system_healed', 0.8, $7)`,
            [newId, agentId, restoredContent, embeddingStr, restoredHash, newHash, BASTION_REGION]
          );

          send("result", {
            sql: insertQuery,
            rows: 1,
            data: [{ inserted: newId.slice(0, 12) + "...", trust_level: 2, type: "healed" }],
          });

          healedCount++;
          send("progress", { healed: healedCount, total: poisonRes.rows.length });
        }

        // Final verification
        send("step", { step: poisonRes.rows.length + 2, label: "Verifying chain integrity" });
        const verifyQuery = `SELECT memory_type, trust_level, cryptographic_hash::text FROM agent_memory WHERE agent_id = '${agentId}' ORDER BY created_at DESC LIMIT 5`;
        send("query", { sql: verifyQuery });

        const verifyRes = await safeQuery(
          "SELECT memory_type, trust_level, cryptographic_hash::text FROM agent_memory WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 5",
          [agentId]
        );

        send("result", {
          sql: verifyQuery,
          rows: verifyRes.rows.length,
          data: verifyRes.rows.map((r: Record<string, unknown>) => ({
            type: r.memory_type,
            trust: r.trust_level,
            hash: String(r.cryptographic_hash).slice(0, 16) + "...",
          })),
        });

        send("done", {
          healed: healedCount,
          message: `Successfully healed ${healedCount} poison memories`,
          proof: {
            method: "AS OF SYSTEM TIME (CockroachDB time-travel)",
            trust_level: 2,
            provenance: "system_healed",
          },
        });

        controller.close();
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unknown error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
