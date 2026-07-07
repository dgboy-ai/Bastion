import { getMockMemories } from "@/lib/mock-data";
import { requireAuth } from "@/lib/api-auth";

const EVENTS = [
  "memory_stored",
  "memory_searched",
  "conflict_detected",
  "conflict_resolved",
  "hash_chain_verified",
  "drift_detected",
  "anomaly_flagged",
  "memory_healed",
  "trust_score_updated",
  "guard_scan_passed",
];

const AGENTS = ["agent-1", "agent-2", "agent-3"];

function randomEvent() {
  const memories = getMockMemories();
  const mem = memories[Math.floor(Math.random() * memories.length)];
  return {
    event: EVENTS[Math.floor(Math.random() * EVENTS.length)],
    agentId: AGENTS[Math.floor(Math.random() * AGENTS.length)],
    memoryId: mem.memoryId,
    content: mem.content.substring(0, 80),
    timestamp: new Date().toISOString(),
    importanceScore: Math.round((5 + Math.random() * 5) * 10) / 10,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authError = requireAuth(request);
  if (authError) return authError;
  const closedPromise = new Promise<void>((resolve) => {
    if (request.signal.aborted) {
      resolve();
      return;
    }
    request.signal.addEventListener("abort", () => resolve(), { once: true });
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string): boolean => {
        try {
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            return false;
          }
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          return true;
        } catch {
          return false;
        }
      };

      send(JSON.stringify({ type: "connected", message: "SSE stream established" }));

      const heartbeat = setInterval(() => {
        send(JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() }));
      }, 15000);

      const eventInterval = setInterval(() => {
        if (!send(JSON.stringify({ type: "event", data: randomEvent() }))) {
          closedPromise.then(() => {
            clearInterval(heartbeat);
            clearInterval(eventInterval);
          });
        }
      }, 5000);

      await closedPromise;
      clearInterval(heartbeat);
      clearInterval(eventInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
