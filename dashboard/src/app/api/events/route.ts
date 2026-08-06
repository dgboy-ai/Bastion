import { getMockMemories } from "@/lib/mock-data";
import { safeQuery, isMockMode, hasDbPool } from "@/lib/db";
import { requireAuth } from "@/lib/api-auth";
import { apiSuccess, apiError } from "@/lib/api-response";

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

function mapAuditToEvent(audit: Record<string, unknown>) {
  const action = String(audit.action || "");
  let event = "memory_stored";
  if (action.includes("search")) event = "memory_searched";
  else if (action.includes("conflict")) event = "conflict_detected";
  else if (action.includes("hash") || action.includes("verify")) event = "hash_chain_verified";
  else if (action.includes("guard") || action.includes("block")) event = "guard_scan_passed";
  else if (action.includes("heal")) event = "memory_healed";
  else if (action.includes("drift")) event = "drift_detected";

  const details = audit.details as Record<string, unknown> | null;
  return {
    event,
    agentId: audit.agent_id || "unknown",
    memoryId: audit.audit_id || "",
    content: String(details?.content_preview || details?.memory_type || "audit entry").substring(0, 80),
    timestamp: String(audit.recorded_at || new Date().toISOString()),
    importanceScore: 5.0,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/events — SSE stream (default) or one-shot snapshot.
 *
 * ?mode=snapshot  → Returns a finite JSON response with recent audit entries.
 *                    Does NOT hang. Safe for curl, fetch, tests.
 * (no param)      → Long-lived SSE stream for EventSource (dashboard UI).
 */
export async function GET(request: Request) {
  const hasUserConn = !!request.headers.get("x-bastion-conn");
  if (!hasUserConn) {
    const authError = requireAuth(request);
    if (authError) return authError;
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  // ── SNAPSHOT MODE: one-shot JSON response (non-hanging) ─────────────
  if (mode === "snapshot") {
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    if (isMockMode()) {
      const events = Array.from({ length: Math.min(limit, 10) }, () => randomEvent());
      return apiSuccess({ events, total: events.length, mode: "snapshot" }, "dynamic");
    }

    try {
      const result = await safeQuery(
        "SELECT audit_id, agent_id, action, details, recorded_at FROM agent_audit ORDER BY recorded_at DESC LIMIT $1",
        [limit]
      );
      const events = result.rows.map(mapAuditToEvent);
      return apiSuccess({ events, total: events.length, mode: "snapshot" }, "dynamic");
    } catch (err) {
      console.error("[Events] Snapshot query failed:", err);
      if (isMockMode()) {
        const events = Array.from({ length: Math.min(limit, 10) }, () => randomEvent());
        return apiSuccess({ events, total: events.length, mode: "snapshot", mock: true }, "dynamic");
      }
      return apiError("Failed to fetch events", 500);
    }
  }

  // ── SSE MODE: long-lived stream for EventSource ─────────────────────
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

      // Enforce max SSE lifetime (30 minutes) to prevent resource exhaustion
      const maxLifetime = setTimeout(() => {
        send(JSON.stringify({ type: "max_lifetime_reached", message: "SSE connection expired after 30 minutes" }));
        clearInterval(heartbeat);
        clearInterval(eventInterval);
        controller.close();
      }, 30 * 60 * 1000);

      // Track watermark and seen IDs for deduplication
      let lastChecked = new Date(Date.now() - 5000).toISOString();
      const seenIds = new Set<string>();

      const eventInterval = setInterval(async () => {
        if (isMockMode()) {
          // Mock mode: generate random events
          if (!send(JSON.stringify({ type: "event", data: randomEvent() }))) {
            closedPromise.then(() => {
              clearInterval(heartbeat);
              clearInterval(eventInterval);
            });
          }
        } else {
          // Live mode: poll agent_audit for new entries every 1 second
          try {
            const result = await safeQuery(
              "SELECT audit_id, agent_id, action, details, recorded_at FROM agent_audit WHERE recorded_at > $1 ORDER BY recorded_at ASC LIMIT 10",
              [lastChecked]
            );
            if (result.rows && result.rows.length > 0) {
              let maxTimestamp = lastChecked;
              for (const row of result.rows) {
                const auditId = String(row.audit_id);
                // Skip already-processed entries
                if (seenIds.has(auditId)) continue;
                seenIds.add(auditId);

                const event = mapAuditToEvent(row);
                if (!send(JSON.stringify({ type: "event", data: event }))) {
                  closedPromise.then(() => {
                    clearInterval(heartbeat);
                    clearInterval(eventInterval);
                  });
                  return;
                }
                // Track max timestamp
                const rowTime = row.recorded_at instanceof Date
                  ? row.recorded_at.toISOString()
                  : String(row.recorded_at);
                if (rowTime > maxTimestamp) {
                  maxTimestamp = rowTime;
                }
              }
              // Advance watermark past all processed entries
              if (maxTimestamp > lastChecked) {
                const dt = new Date(maxTimestamp);
                dt.setMilliseconds(dt.getMilliseconds() + 1);
                lastChecked = dt.toISOString();
              }
            }
          } catch (err) {
            console.error("[Events SSE] Poll error:", err);
          }
        }
      }, 1000); // Poll every 1 second for near-real-time

      await closedPromise;
      clearTimeout(maxLifetime);
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

